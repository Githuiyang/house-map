/**
 * 飞书 Publish Queue → CSV 同步脚本
 *
 * 数据流: 飞书 Publish Queue → (通过 candidate Link) Parsed Candidates → CSV 行
 *
 * 用法:
 *   node scripts/data/feishu-to-csv-preview.js --dry-run   (预览，不写文件)
 *   node scripts/data/feishu-to-csv-preview.js --write     (写入 CSV，需用户确认)
 *   node scripts/data/feishu-to-csv-preview.js             (默认 dry-run)
 *
 * 规则:
 *   1. contact_info、raw_text、source 等字段绝不进入 CSV
 *   2. 多选字段用中文顿号连接，避免破坏 sync-csv.js 的简单 CSV parser
 *   3. CSV cell 不允许含英文逗号、换行、双引号（sync-csv.js 用 line.split(",")）
 *   4. 遇到危险字符的行标记为 BLOCKED，不自动写入
 *   5. --write 必须显式传入，否则只做 dry-run
 */
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");

// ─── 环境变量加载（最小只读，不输出内容） ────────────────
const ENV_LOCAL_PATH = path.join(__dirname, "../../.env.local");
if (fs.existsSync(ENV_LOCAL_PATH)) {
  const raw = fs.readFileSync(ENV_LOCAL_PATH, "utf8");
  for (const line of raw.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const eqIdx = trimmed.indexOf("=");
    if (eqIdx === -1) continue;
    const key = trimmed.slice(0, eqIdx).trim();
    const val = trimmed.slice(eqIdx + 1).trim();
    // 只在 process.env 中尚无该变量时设置（不覆盖已有值）
    if (key && process.env[key] === undefined) {
      process.env[key] = val;
    }
  }
}

// ─── 环境变量校验 ─────────────────────────────────────

/**
 * 校验飞书相关环境变量是否齐全
 * @returns {{ valid: boolean, missing: string[] }}
 */
function validateFeishuEnv() {
  const required = [
    "FEISHU_BASE_TOKEN",
    "FEISHU_PUBLISH_QUEUE_TABLE_ID",
    "FEISHU_PARSED_CANDIDATES_TABLE_ID",
  ];
  const missing = required.filter(k => !process.env[k]);
  return { valid: missing.length === 0, missing };
}

// ─── 常量（从环境变量读取） ─────────────────────────────
const BASE_TOKEN = process.env.FEISHU_BASE_TOKEN || "";
const PUBLISH_QUEUE_TABLE = process.env.FEISHU_PUBLISH_QUEUE_TABLE_ID || "";
const PARSED_CANDIDATES_TABLE = process.env.FEISHU_PARSED_CANDIDATES_TABLE_ID || "";

const CSV_HEADERS = [
  "小区名称", "户型", "面积(平)", "租金类型", "租金价格(元/月)",
  "价格类型", "楼层", "装修", "特色标签", "信息来源",
  "录入时间", "电梯", "备注",
];

const CSV_PATH = path.join(__dirname, "../../data/房源数据存档.csv");

// ─── 纯函数：字段映射（导出供测试） ─────────────────────

/**
 * 将飞书 Parsed Candidates 字段映射为 CSV 行对象
 * @param {Object} pq - Publish Queue 记录（已解析字段名）
 * @param {Object} pc - Parsed Candidates 记录（已解析字段名）
 * @returns {Object} CSV 行对象，key 为 CSV 列名
 */
function mapToCsvRow(pq, pc) {
  const decoration = extractSelect(pc.decoration) || "";
  const highlights = (pc.highlights || []);
  const warnings = (pc.warnings || []);

  // decoration 同时写入"装修"列和"特色标签"，兼容 sync-csv.js 的 cleanHighlights
  const allHighlights = [...highlights];
  if (decoration && !allHighlights.includes(decoration)) {
    allHighlights.push(decoration);
  }

  return {
    "小区名称": pq.community_name || pc.community_name || "",
    "户型": pc.layout || "",
    "面积(平)": pc.area != null ? String(pc.area) : "",
    "租金类型": extractSelect(pc.price_type) || "",
    "租金价格(元/月)": pc.price != null ? String(pc.price) : "",
    "价格类型": derivePriceType(pc.price_type),
    "楼层": extractSelect(pc.floor_type) || "",
    "装修": decoration,
    "特色标签": allHighlights.join("、"),
    "信息来源": "Openclaw",
    "录入时间": new Date().getFullYear().toString(),
    "电梯": pc.elevator === true ? "有电梯" : (pc.elevator === false ? "无电梯" : ""),
    "备注": warnings.join("、"),
  };
}

/**
 * 从飞书 select 字段值中提取选项名
 * 飞书返回 ["选项名"] 或 null
 */
function extractSelect(val) {
  if (!val) return null;
  if (Array.isArray(val)) return val[0] || null;
  return String(val);
}

/**
 * 根据 price_type 推导"价格类型"列
 * sync-csv.js 用 priceType 判断整租/合租/总价
 */
function derivePriceType(priceType) {
  const pt = extractSelect(priceType);
  if (pt === "整租") return "总价";
  if (pt === "合租") return "月付";
  if (pt === "参考价") return "参考";
  return "";
}

/**
 * 将 CSV 行对象转为 CSV 字符串行
 * 注意：sync-csv.js 用 line.split(",") 解析，不支持引号转义
 */
function csvRowToString(row) {
  return CSV_HEADERS.map(h => row[h] || "").join(",");
}

// ─── CSV 安全校验 ─────────────────────────────────────

/**
 * 检查单个 CSV cell 是否包含安全字符
 * sync-csv.js 用 line.split(",") 解析，以下字符会破坏解析：
 *   - 英文逗号 `,`
 *   - 换行 `\n` / 回车 `\r`
 *   - 双引号 `"`
 * 中文逗号、中文顿号是安全的
 * @param {string} value
 * @returns {{ safe: boolean, reason?: string }}
 */
function sanitizeCsvCell(value) {
  if (!value || typeof value !== "string") return { safe: true };
  if (value.includes(",")) return { safe: false, reason: "包含英文逗号" };
  if (value.includes("\r")) return { safe: false, reason: "包含回车符" };
  if (value.includes("\n")) return { safe: false, reason: "包含换行符" };
  if (value.includes('"')) return { safe: false, reason: "包含双引号" };
  return { safe: true };
}

/**
 * 校验整行 CSV 数据是否安全可写
 * @param {Object} row - CSV 行对象
 * @returns {{ valid: boolean, blocked: Array<{field: string, value: string, reason: string}> }}
 */
function validateCsvRow(row) {
  const blocked = [];
  for (const h of CSV_HEADERS) {
    const val = row[h] || "";
    const check = sanitizeCsvCell(val);
    if (!check.safe) {
      blocked.push({ field: h, value: val.slice(0, 40), reason: check.reason });
    }
  }
  return { valid: blocked.length === 0, blocked };
}

/**
 * 检查是否包含禁止进入 CSV 的字段
 */
function containsForbiddenField(csvRow) {
  const forbidden = ["contact_info", "raw_text", "source", "imported_by", "review_note", "dedup_hash", "quality_score"];
  const str = JSON.stringify(csvRow);
  return forbidden.some(f => str.includes(f));
}

// ─── 飞书 API 调用 ────────────────────────────────────

/**
 * 尝试从 lark-cli 输出中解析结构化错误信息
 * 支持单行 JSON、多行 pretty JSON、以及混合日志中的 JSON
 * @param {string} output - stdout 或 stderr 的原始文本
 * @returns {Object|null} 解析出的错误对象，或 null
 */
function parseCliError(output) {
  if (!output || typeof output !== "string") return null;

  // 1. 先尝试直接解析完整输出
  try {
    const obj = JSON.parse(output.trim());
    if (obj && typeof obj === "object" && (obj.error || obj.code !== undefined)) return obj;
  } catch (_) {
    // 不是纯 JSON，继续
  }

  // 2. 提取第一个 { 到最后一个 } 的片段
  const first = output.indexOf("{");
  const last = output.lastIndexOf("}");
  if (first !== -1 && last > first) {
    try {
      const obj = JSON.parse(output.slice(first, last + 1));
      if (obj && typeof obj === "object" && (obj.error || obj.code !== undefined)) return obj;
    } catch (_) {
      // 片段不是有效 JSON
    }
  }

  return null;
}

/**
 * 将 lark-cli 返回的错误对象规范化为统一结构
 *
 * lark-cli 可能返回以下错误格式：
 *   1. { error: "string", message: "yyy", hint: "zzz" }     — 扁平错误
 *   2. { code: 123, message: "yyy" }                         — 数字 code
 *   3. { ok: false, error: { type: "config", message: "...", hint: "..." } }  — 嵌套错误
 *   4. 非 JSON 原始文本                                       — 无法解析
 *
 * @param {Object} parsed - parseCliError 解析出的对象，或 JSON.parse 的 result
 * @returns {{ type: string, message: string, hint?: string, isKeychainError: boolean }}
 */
function normalizeCliError(parsed) {
  if (!parsed || typeof parsed !== "object") {
    return { type: "(unknown)", message: "(无法解析错误对象)", isKeychainError: false };
  }

  // 处理嵌套 error 对象：{ ok: false, error: { type, message, hint } }
  let errorVal = parsed.error;
  let message = parsed.message;
  let hint = parsed.hint;
  let type = parsed.code;

  if (errorVal && typeof errorVal === "object") {
    // 嵌套结构：error 是 { type, message, hint }
    type = errorVal.type || errorVal.code || type;
    message = errorVal.message || message;
    hint = errorVal.hint || hint;
  } else if (errorVal && typeof errorVal === "string") {
    // 扁平结构：error 是字符串
    type = errorVal;
  }

  // 如果 message 仍为空，尝试从 code 或其他字段推断
  if (!message && parsed.code !== undefined) {
    message = `错误码 ${parsed.code}`;
  }

  const rawText = [
    typeof errorVal === "string" ? errorVal : "",
    message || "",
    hint || "",
  ].join(" ");

  return {
    type: String(type || "(unknown)"),
    message: message || "(no message)",
    hint: hint || undefined,
    isKeychainError: rawText.includes("keychain"),
  };
}

/**
 * 格式化并输出 lark-cli 错误信息到 stderr
 * @param {{ type: string, message: string, hint?: string, isKeychainError: boolean }} normalized
 */
function formatCliError(normalized) {
  console.error(`  type:    ${normalized.type}`);
  console.error(`  message: ${normalized.message}`);
  if (normalized.hint) console.error(`  hint:    ${normalized.hint}`);

  if (normalized.isKeychainError) {
    console.error("\n  [HINT] lark-cli 认证状态异常，请尝试：");
    console.error("    1. 执行 lark-cli config init");
    console.error("    2. 执行 lark-cli auth login");
    console.error("    3. 重新运行本脚本");
  }
}

function callLarkCli(args) {
  const cmd = `lark-cli base ${args} 2>&1`;
  let stdout;
  try {
    stdout = execSync(cmd, { encoding: "utf8", timeout: 30000 });
  } catch (err) {
    // execSync 抛出异常：exit code 非 0
    const rawOutput = err.stdout || err.stderr || err.message || "";
    console.error(`[ERROR] lark-cli 调用失败 (exit code ${err.status || "?"}):`);

    const parsed = parseCliError(rawOutput);
    if (parsed) {
      formatCliError(normalizeCliError(parsed));
    } else {
      // 无法解析 JSON，输出原始信息
      console.error(`  ${rawOutput.slice(0, 500)}`);
      // 原始文本中可能包含 keychain 关键字
      if (rawOutput.includes("keychain")) {
        console.error("\n  [HINT] lark-cli 认证状态异常，请尝试：");
        console.error("    1. 执行 lark-cli config init");
        console.error("    2. 执行 lark-cli auth login");
        console.error("    3. 重新运行本脚本");
      }
    }

    process.exit(1);
  }

  // exit code 0 但内容可能是 JSON 错误响应
  let result;
  try {
    result = JSON.parse(stdout);
  } catch (parseErr) {
    console.error("[ERROR] lark-cli 返回了非 JSON 内容：");
    console.error(`  ${stdout.slice(0, 500)}`);
    process.exit(1);
  }

  if (result.ok === false) {
    console.error("[ERROR] lark-cli 返回业务错误：");
    formatCliError(normalizeCliError(result));
    process.exit(1);
  }

  return result;
}

/**
 * 解析 lark-cli +record-list 返回的 arrays 格式为对象数组
 * 输入格式：{ data: { fields: [...], field_id_list: [...], data: [[...], ...], record_id_list: [...] } }
 * @param {Object} listResult - +record-list 的完整返回
 * @returns {Array<Object>} 解析后的记录数组
 */
function parseRecordListResult(listResult) {
  const fields = listResult.data.fields;
  const rows = listResult.data.data;
  const ids = listResult.data.record_id_list || [];

  return rows.map((row, idx) => {
    const obj = { _record_id: ids[idx] };
    fields.forEach((name, i) => {
      obj[name] = row[i];
    });
    return obj;
  });
}

/**
 * 解析 lark-cli +record-get 返回的单条记录为对象数组
 *
 * record-get 返回格式与 record-list 不同：
 *   record-list → data.data = [[val, val, ...], ...]（数组索引）
 *   record-get → data.record = { field_name: val, ... }（已是命名对象）
 *
 * @param {Object} getResult - +record-get 的完整返回
 * @param {string} [recordId] - 记录 ID（record-get 响应不含内部 record_id，需从调用参数传入）
 * @returns {Array<Object>} 解析后的记录数组（只有一个元素）
 */
function parseRecordGetResult(getResult, recordId) {
  const rec = { ...getResult.data.record };
  if (recordId) rec._record_id = recordId;
  return [rec];
}

// ─── 主流程 ──────────────────────────────────────────

function main() {
  const args = process.argv.slice(2);
  const isWrite = args.includes("--write");
  const isDryRun = args.includes("--dry-run") || !isWrite;

  // 环境变量校验
  const envCheck = validateFeishuEnv();
  if (!envCheck.valid) {
    console.error("[ERROR] 缺少必要的环境变量：");
    for (const k of envCheck.missing) {
      console.error(`  - ${k}`);
    }
    console.error("\n请在 .env.local 中配置（或通过系统环境变量传入）：");
    console.error("  FEISHU_BASE_TOKEN=...");
    console.error("  FEISHU_PUBLISH_QUEUE_TABLE_ID=...");
    console.error("  FEISHU_PARSED_CANDIDATES_TABLE_ID=...");
    process.exit(1);
  }

  if (isWrite) {
    console.log("[WRITE] 写入模式：将通过 CSV 安全校验后追加到房源数据存档.csv\n");
  }

  console.log("=== 飞书 Publish Queue → CSV 同步 ===\n");

  // 1. 读取 Publish Queue
  console.log("[1/4] 读取 Publish Queue...");
  const pqResult = callLarkCli(
    `+record-list --base-token ${BASE_TOKEN} --table-id ${PUBLISH_QUEUE_TABLE} --limit 200 --format json`
  );
  const allPqRecords = parseRecordListResult(pqResult);

  // 2. 筛选 publish_status = "待发布"
  const pendingRecords = allPqRecords.filter(r => {
    const status = extractSelect(r.publish_status);
    return status === "待发布";
  });

  console.log(`  Publish Queue 总记录: ${allPqRecords.length}`);
  console.log(`  待发布记录: ${pendingRecords.length}\n`);

  if (pendingRecords.length === 0) {
    console.log("[完成] 当前无待发布记录。Publish Queue 为空或无 publish_status='待发布' 的记录。");
    console.log("\n提示：要测试 dry-run 流程，可在飞书 Base 中手动添加一条 Publish Queue 记录：");
    console.log("  - community_name: 测试小区");
    console.log("  - publish_status: 待发布");
    console.log("  - candidate: 关联一条 Parsed Candidates 记录");
    process.exit(0);
  }

  // 3. 对每条待发布记录，读取关联的 Parsed Candidates
  console.log("[2/4] 读取关联的 Parsed Candidates...");
  const previews = [];
  const blockedRows = [];

  for (const pq of pendingRecords) {
    const candidateIds = (pq.candidate || []);
    if (candidateIds.length === 0) {
      console.log(`  [WARN] ${pq.community_name || pq._record_id}: 无 candidate 关联，跳过`);
      continue;
    }

    const candidateId = candidateIds[0].id;
    const pcResult = callLarkCli(
      `+record-get --base-token ${BASE_TOKEN} --table-id ${PARSED_CANDIDATES_TABLE} --record-id ${candidateId}`
    );

    if (!pcResult.data || !pcResult.data.record) {
      console.log(`  [WARN] ${pq.community_name}: 无法读取 candidate ${candidateId}，跳过`);
      continue;
    }

    const pcRecords = parseRecordGetResult(pcResult, candidateId);
    const pc = pcRecords[0];

    const csvRow = mapToCsvRow(pq, pc);

    // 安全检查：确保禁止字段未进入 CSV
    if (containsForbiddenField(csvRow)) {
      console.log(`  [ERROR] ${pq.community_name}: CSV 行包含禁止字段，跳过`);
      continue;
    }

    // CSV 安全校验
    const validation = validateCsvRow(csvRow);
    if (!validation.valid) {
      blockedRows.push({ pq, csvRow, blocked: validation.blocked });
      console.log(`  [BLOCKED] ${pq.community_name}: ${validation.blocked.map(b => `${b.field}(${b.reason})`).join(", ")}`);
      continue;
    }

    previews.push({ pq, pc, csvRow });
  }

  // 4. 输出预览
  console.log(`\n[3/4] 生成 CSV 行:`);
  console.log(`  可写入: ${previews.length} 条`);
  console.log(`  BLOCKED: ${blockedRows.length} 条（含危险字符，需手动清洗）\n`);

  if (previews.length > 0) {
    console.log(`  CSV 表头: ${CSV_HEADERS.join(",")}\n`);
    for (const { pq, pc, csvRow } of previews) {
      const action = extractSelect(pq.action) || "未知";
      console.log(`  --- ${pq.community_name} (${action}) ---`);
      console.log(`  ${csvRowToString(csvRow)}`);
      console.log();
    }
  }

  if (blockedRows.length > 0) {
    console.log("  --- BLOCKED 行（不写入）---");
    for (const { pq, csvRow, blocked } of blockedRows) {
      console.log(`  ${pq.community_name}: ${blocked.map(b => `"${b.field}" ${b.reason}`).join(", ")}`);
    }
    console.log();
  }

  // 5. 写入或结束
  if (isWrite && previews.length > 0) {
    // ─── Preflight 检查 ──────────────────────────────
    console.log(`[4/4] Preflight 检查...`);
    const preflightErrors = [];

    // P1: CSV 文件路径可写
    const csvDir = path.dirname(CSV_PATH);
    if (!fs.existsSync(csvDir)) {
      preflightErrors.push(`CSV 目录不存在: ${csvDir}`);
    }
    if (fs.existsSync(CSV_PATH)) {
      try {
        fs.accessSync(CSV_PATH, fs.constants.R_OK | fs.constants.W_OK);
      } catch (_) {
        preflightErrors.push(`CSV 文件无读写权限: ${CSV_PATH}`);
      }
    }

    // P2: 所有待写入行通过 CSV 安全校验（双重验证）
    for (const { pq, csvRow } of previews) {
      const revalidation = validateCsvRow(csvRow);
      if (!revalidation.valid) {
        preflightErrors.push(`${pq.community_name}: preflight 安全校验失败 (${revalidation.blocked[0].reason})`);
      }
    }

    // P3: 所有待写入行不包含禁止字段（双重验证）
    for (const { pq, csvRow } of previews) {
      if (containsForbiddenField(csvRow)) {
        preflightErrors.push(`${pq.community_name}: preflight 禁止字段检查失败`);
      }
    }

    if (preflightErrors.length > 0) {
      console.error(`\n[ERROR] Preflight 检查失败，中止写入（共 ${preflightErrors.length} 项）：`);
      for (const e of preflightErrors) {
        console.error(`  - ${e}`);
      }
      console.error(`\n[重要] 未写入任何文件。请修复上述问题后重试。`);
      process.exit(1);
    }

    console.log(`  Preflight 通过: CSV 路径可写, ${previews.length} 行校验通过`);

    console.log(`  写入 CSV...`);
    console.log(`  目标文件: ${CSV_PATH}`);
    console.log(`  追加行数: ${previews.length}`);

    const lines = previews.map(p => csvRowToString(p.csvRow));
    const content = lines.join("\n") + "\n";

    // 读取现有文件确认编码（UTF-8 / BOM）
    let existing = "";
    if (fs.existsSync(CSV_PATH)) {
      existing = fs.readFileSync(CSV_PATH, "utf8");
    }

    // 追加写入（保持 UTF-8，不加 BOM）
    fs.appendFileSync(CSV_PATH, content, "utf8");
    console.log(`  已追加 ${previews.length} 行到 ${CSV_PATH}`);
    console.log(`\n=== 写入完成 ===`);
    console.log(`写入: ${previews.length} 条`);
    console.log(`BLOCKED: ${blockedRows.length} 条`);
    console.log(`\n下一步：运行 node scripts/data/sync-csv.js --dry-run 验证同步结果`);
  } else {
    console.log(`=== ${isWrite ? "无可写入行" : "预览完成"} ===`);
    console.log(`可写入: ${previews.length}`);
    console.log(`BLOCKED: ${blockedRows.length}`);
    if (isDryRun && previews.length > 0) {
      console.log(`\n提示：使用 --write 执行实际写入`);
    }
    if (!isWrite) {
      console.log(`\n[DRY RUN] 未写入任何文件，未回写飞书状态`);
    }
  }
}

// 导出纯函数供测试
module.exports = {
  mapToCsvRow, extractSelect, derivePriceType, csvRowToString,
  containsForbiddenField, CSV_HEADERS, parseRecordListResult, parseRecordGetResult,
  parseCliError, sanitizeCsvCell, validateCsvRow,
  normalizeCliError, validateFeishuEnv,
};

// 仅在直接运行时执行 main
if (require.main === module) {
  main();
}
