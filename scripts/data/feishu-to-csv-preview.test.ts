/**
 * feishu-to-csv-preview.js 单元测试（Vitest）
 *
 * 覆盖：
 *   - contact_info 不会进入 CSV 行
 *   - multi_select 不使用英文逗号
 *   - elevator 正确转换
 *   - decoration 会进入特色标签（兼容 sync-csv.js）
 *   - derivePriceType 映射
 *   - extractSelect 处理
 *   - CSV 输出列数匹配表头
 *   - parseRecordListResult / parseRecordGetResult 解析
 *   - parseCliError 多行 JSON 解析
 *   - sanitizeCsvCell / validateCsvRow CSV 安全校验
 */
import { afterEach, describe, expect, it } from 'vitest';

// Source is CommonJS — vitest handles interop
const {
  mapToCsvRow,
  extractSelect,
  derivePriceType,
  csvRowToString,
  containsForbiddenField,
  CSV_HEADERS,
  parseRecordListResult,
  parseRecordGetResult,
  parseCliError,
  sanitizeCsvCell,
  validateCsvRow,
  normalizeCliError,
  validateFeishuEnv,
} = require('./feishu-to-csv-preview');

// ─── contact_info 不进入 CSV ───────────────────────────
describe('contact_info exclusion', () => {
  it('does not include phone number in CSV string', () => {
    const pq = { community_name: '测试小区' };
    const pc = {
      community_name: '测试小区',
      price: 3000,
      price_type: ['整租'],
      layout: '1室1厅',
      contact_info: '13800000000 张先生',
    };
    const row = mapToCsvRow(pq, pc);
    const csvLine = csvRowToString(row);
    expect(csvLine).not.toContain('13800000000');
    expect(csvLine).not.toContain('张先生');
  });
});

// ─── multi_select 使用中文顿号 ───────────────────────────
describe('multi_select uses Chinese separator', () => {
  it('joins highlights with 、 not comma', () => {
    const pq = { community_name: '测试小区' };
    const pc = {
      community_name: '测试小区',
      price: 5000,
      price_type: ['整租'],
      highlights: ['近地铁', '采光好', '拎包入住'],
      warnings: ['临街噪音', '无阳台'],
    };
    const row = mapToCsvRow(pq, pc);

    expect(row['特色标签']).toContain('、');
    expect(row['特色标签']).not.toContain(',');
    expect(row['特色标签']).toBe('近地铁、采光好、拎包入住');
    expect(row['备注']).toBe('临街噪音、无阳台');
  });
});

// ─── elevator 映射 ──────────────────────────────────────
describe('elevator mapping', () => {
  const pq = { community_name: '测试小区' };
  const base = { community_name: '测试小区', price: 3000, price_type: ['整租'] };

  it('maps true to 有电梯', () => {
    expect(mapToCsvRow(pq, { ...base, elevator: true })['电梯']).toBe('有电梯');
  });

  it('maps false to 无电梯', () => {
    expect(mapToCsvRow(pq, { ...base, elevator: false })['电梯']).toBe('无电梯');
  });

  it('maps null to empty string', () => {
    expect(mapToCsvRow(pq, { ...base, elevator: null })['电梯']).toBe('');
  });

  it('maps undefined to empty string', () => {
    expect(mapToCsvRow(pq, { ...base })['电梯']).toBe('');
  });
});

// ─── decoration 进入特色标签 ──────────────────────────────
describe('decoration merged into highlights', () => {
  const pq = { community_name: '测试小区' };
  const base = { community_name: '测试小区', price: 3000, price_type: ['整租'] };

  it('decoration-only fills both columns', () => {
    const row = mapToCsvRow(pq, { ...base, decoration: ['精装'] });
    expect(row['装修']).toBe('精装');
    expect(row['特色标签']).toBe('精装');
  });

  it('merges decoration into existing highlights', () => {
    const row = mapToCsvRow(pq, { ...base, decoration: ['精装'], highlights: ['近地铁'] });
    expect(row['装修']).toBe('精装');
    expect(row['特色标签']).toBe('近地铁、精装');
  });

  it('does not duplicate decoration already in highlights', () => {
    const row = mapToCsvRow(pq, { ...base, decoration: ['精装'], highlights: ['精装', '近地铁'] });
    expect(row['特色标签']).toBe('精装、近地铁');
  });
});

// ─── derivePriceType ─────────────────────────────────────
describe('derivePriceType', () => {
  it('maps 整租 → 总价', () => expect(derivePriceType(['整租'])).toBe('总价'));
  it('maps 合租 → 月付', () => expect(derivePriceType(['合租'])).toBe('月付'));
  it('maps 参考价 → 参考', () => expect(derivePriceType(['参考价'])).toBe('参考'));
  it('returns empty for null', () => expect(derivePriceType(null)).toBe(''));
  it('returns empty for undefined', () => expect(derivePriceType(undefined)).toBe(''));
});

// ─── extractSelect ──────────────────────────────────────
describe('extractSelect', () => {
  it('extracts value from array', () => expect(extractSelect(['选项A'])).toBe('选项A'));
  it('returns null for empty string in array', () => expect(extractSelect([''])).toBeNull());
  it('returns null for null', () => expect(extractSelect(null)).toBeNull());
  it('returns null for undefined', () => expect(extractSelect(undefined)).toBeNull());
});

// ─── CSV 输出格式匹配表头 ────────────────────────────────
describe('CSV output format', () => {
  it('column count matches headers', () => {
    const pq = { community_name: '测试小区' };
    const pc = { community_name: '测试小区', price: 3000, price_type: ['整租'], layout: '1室1厅' };
    const row = mapToCsvRow(pq, pc);
    const line = csvRowToString(row);
    const cols = line.split(',');
    expect(cols.length).toBe(CSV_HEADERS.length);
    expect(cols[0]).toBe('测试小区');
  });
});

// ─── containsForbiddenField ──────────────────────────────
describe('containsForbiddenField', () => {
  it('detects contact_info in row', () => {
    expect(containsForbiddenField({ a: 'contact_info: 123' })).toBe(true);
  });

  it('passes clean row', () => {
    expect(containsForbiddenField({ 小区名称: '测试', 价格: '3000' })).toBe(false);
  });
});

// ─── parseRecordListResult / parseRecordGetResult ─────────
describe('parseRecordListResult', () => {
  it('parses list-format response into named objects', () => {
    const listResult = {
      data: {
        fields: ['community_name', 'price', 'layout'],
        field_id_list: ['fld1', 'fld2', 'fld3'],
        data: [['测试小区', 3000, '1室1厅'], ['其他小区', 2500, '2室1厅']],
        record_id_list: ['rec1', 'rec2'],
      },
    };
    const records = parseRecordListResult(listResult);
    expect(records).toHaveLength(2);
    expect(records[0]).toEqual({
      _record_id: 'rec1',
      community_name: '测试小区',
      price: 3000,
      layout: '1室1厅',
    });
    expect(records[1]._record_id).toBe('rec2');
  });

  it('handles empty data', () => {
    const result = parseRecordListResult({
      data: { fields: [], field_id_list: [], data: [], record_id_list: [] },
    });
    expect(result).toEqual([]);
  });
});

describe('parseRecordGetResult', () => {
  it('parses single-record-get response (named-object format)', () => {
    // record-get returns data.record as a named object (not array-of-arrays)
    const getResult = {
      data: {
        record: {
          community_name: '测试小区',
          price: 3000,
          layout: '1室1厅',
          decoration: ['精装'],
          price_type: ['整租'],
        },
      },
    };
    const records = parseRecordGetResult(getResult, 'recABC');
    expect(records).toHaveLength(1);
    expect(records[0]).toEqual({
      _record_id: 'recABC',
      community_name: '测试小区',
      price: 3000,
      layout: '1室1厅',
      decoration: ['精装'],
      price_type: ['整租'],
    });
  });

  it('works without recordId parameter', () => {
    const getResult = {
      data: {
        record: { community_name: '测试小区' },
      },
    };
    const records = parseRecordGetResult(getResult);
    expect(records[0]).not.toHaveProperty('_record_id');
    expect(records[0].community_name).toBe('测试小区');
  });
});

// ─── parseCliError ──────────────────────────────────────
describe('parseCliError', () => {
  it('parses single-line JSON error', () => {
    const output = '{"error":"auth_failed","code":401,"message":"token expired"}';
    const result = parseCliError(output);
    expect(result).not.toBeNull();
    expect(result!.error).toBe('auth_failed');
    expect(result!.message).toBe('token expired');
  });

  it('parses multi-line pretty JSON error', () => {
    const output = `{
  "error": "keychain_error",
  "code": 500,
  "message": "keychain not initialized",
  "hint": "run lark-cli config init"
}`;
    const result = parseCliError(output);
    expect(result).not.toBeNull();
    expect(result!.error).toBe('keychain_error');
    expect(result!.message).toBe('keychain not initialized');
    expect(result!.hint).toBe('run lark-cli config init');
  });

  it('extracts JSON from mixed log output', () => {
    const output = `[INFO] starting command...
[DEBUG] sending request
{"code": 1254045, "message": "field not found"}
[INFO] done`;
    const result = parseCliError(output);
    expect(result).not.toBeNull();
    expect(result!.code).toBe(1254045);
  });

  it('returns null for non-JSON text', () => {
    expect(parseCliError('just some random text')).toBeNull();
    expect(parseCliError('')).toBeNull();
    expect(parseCliError(null as unknown as string)).toBeNull();
    expect(parseCliError(undefined as unknown as string)).toBeNull();
  });

  it('returns null for JSON without error/code fields', () => {
    expect(parseCliError('{"ok":true,"data":[]}')).toBeNull();
  });
});

// ─── sanitizeCsvCell ────────────────────────────────────
describe('sanitizeCsvCell', () => {
  it('allows safe Chinese text', () => {
    expect(sanitizeCsvCell('近地铁、采光好')).toEqual({ safe: true });
    expect(sanitizeCsvCell('精装')).toEqual({ safe: true });
    expect(sanitizeCsvCell('')).toEqual({ safe: true });
  });

  it('allows Chinese comma (，)', () => {
    expect(sanitizeCsvCell('近地铁，采光好')).toEqual({ safe: true });
  });

  it('allows Chinese pause mark (、)', () => {
    expect(sanitizeCsvCell('近地铁、采光好')).toEqual({ safe: true });
  });

  it('blocks English comma', () => {
    const result = sanitizeCsvCell('near subway, bright');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('英文逗号');
  });

  it('blocks newline', () => {
    const result = sanitizeCsvCell('line1\nline2');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('换行');
  });

  it('blocks carriage return', () => {
    const result = sanitizeCsvCell('line1\r\nline2');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('回车');
  });

  it('blocks double quote', () => {
    const result = sanitizeCsvCell('he said "hello"');
    expect(result.safe).toBe(false);
    expect(result.reason).toContain('双引号');
  });

  it('handles non-string input safely', () => {
    expect(sanitizeCsvCell(null as unknown as string)).toEqual({ safe: true });
    expect(sanitizeCsvCell(undefined as unknown as string)).toEqual({ safe: true });
  });
});

// ─── validateCsvRow ─────────────────────────────────────
describe('validateCsvRow', () => {
  it('passes a clean row', () => {
    const row = mapToCsvRow(
      { community_name: '测试小区' },
      { community_name: '测试小区', price: 3000, price_type: ['整租'], layout: '1室1厅', highlights: ['近地铁'] },
    );
    const result = validateCsvRow(row);
    expect(result.valid).toBe(true);
    expect(result.blocked).toHaveLength(0);
  });

  it('blocks row with English comma in a field', () => {
    const row = mapToCsvRow(
      { community_name: '测试小区' },
      { community_name: '测试小区', price: 3000, price_type: ['整租'], highlights: ['near, subway'] },
    );
    const result = validateCsvRow(row);
    expect(result.valid).toBe(false);
    expect(result.blocked.length).toBeGreaterThan(0);
    expect(result.blocked[0].reason).toContain('英文逗号');
  });

  it('blocks row with newline in a field', () => {
    const row = {
      ...mapToCsvRow(
        { community_name: '测试小区' },
        { community_name: '测试小区', price: 3000, price_type: ['整租'] },
      ),
      '特色标签': '近地铁\n采光好',
    };
    const result = validateCsvRow(row);
    expect(result.valid).toBe(false);
    expect(result.blocked.some((b: { reason: string }) => b.reason.includes('换行'))).toBe(true);
  });

  it('blocks row with double quote in a field', () => {
    const row = {
      ...mapToCsvRow(
        { community_name: '测试小区' },
        { community_name: '测试小区', price: 3000, price_type: ['整租'] },
      ),
      '备注': '有"特殊情况"',
    };
    const result = validateCsvRow(row);
    expect(result.valid).toBe(false);
    expect(result.blocked.some((b: { reason: string }) => b.reason.includes('双引号'))).toBe(true);
  });

  it('safe Chinese punctuation rows pass validation', () => {
    const row = mapToCsvRow(
      { community_name: '测试小区' },
      {
        community_name: '测试小区', price: 3000, price_type: ['整租'],
        highlights: ['近地铁', '采光好', '拎包入住'],
        warnings: ['临街噪音', '无阳台'],
        decoration: ['精装'],
      },
    );
    const result = validateCsvRow(row);
    expect(result.valid).toBe(true);
  });
});

// ─── csvRowToString does not quote commas ─────────────────
describe('csvRowToString no-quote behavior', () => {
  it('does not wrap values in double quotes', () => {
    const row: Record<string, string> = {};
    CSV_HEADERS.forEach((h: string) => { row[h] = 'test'; });
    const line = csvRowToString(row);
    expect(line).not.toContain('"');
  });
});

// ─── normalizeCliError ─────────────────────────────────
describe('normalizeCliError', () => {
  it('handles flat error string', () => {
    const result = normalizeCliError({
      error: 'auth_failed',
      message: 'token expired',
      hint: 'run lark-cli auth login',
    });
    expect(result.type).toBe('auth_failed');
    expect(result.message).toBe('token expired');
    expect(result.hint).toBe('run lark-cli auth login');
    expect(result.isKeychainError).toBe(false);
  });

  it('handles code/message structure', () => {
    const result = normalizeCliError({
      code: 1254045,
      message: 'field not found',
    });
    expect(result.type).toBe('1254045');
    expect(result.message).toBe('field not found');
    expect(result.hint).toBeUndefined();
    expect(result.isKeychainError).toBe(false);
  });

  it('handles nested error object (keychain scenario)', () => {
    const result = normalizeCliError({
      ok: false,
      identity: 'bot',
      error: {
        type: 'config',
        message: 'keychain Get failed: keychain not initialized',
        hint: 'run lark-cli config init',
      },
    });
    expect(result.type).toBe('config');
    expect(result.message).toBe('keychain Get failed: keychain not initialized');
    expect(result.hint).toBe('run lark-cli config init');
    expect(result.isKeychainError).toBe(true);
  });

  it('handles nested error without top-level message', () => {
    // When error is nested, top-level message may be undefined
    const result = normalizeCliError({
      ok: false,
      error: {
        type: 'network',
        message: 'connection refused',
      },
    });
    expect(result.type).toBe('network');
    expect(result.message).toBe('connection refused');
    expect(result.isKeychainError).toBe(false);
  });

  it('handles code-only structure (no error field)', () => {
    const result = normalizeCliError({
      code: 500,
    });
    expect(result.type).toBe('500');
    expect(result.message).toBe('错误码 500');
  });

  it('returns fallback for null input', () => {
    const result = normalizeCliError(null);
    expect(result.type).toBe('(unknown)');
    expect(result.message).toContain('无法解析');
    expect(result.isKeychainError).toBe(false);
  });

  it('returns fallback for undefined input', () => {
    const result = normalizeCliError(undefined);
    expect(result.type).toBe('(unknown)');
  });

  it('detects keychain in flat error string', () => {
    const result = normalizeCliError({
      error: 'keychain_error',
      message: 'keychain not initialized',
    });
    expect(result.isKeychainError).toBe(true);
  });
});

// ─── validateFeishuEnv ────────────────────────────────
describe('validateFeishuEnv', () => {
  const requiredKeys = [
    'FEISHU_BASE_TOKEN',
    'FEISHU_PUBLISH_QUEUE_TABLE_ID',
    'FEISHU_PARSED_CANDIDATES_TABLE_ID',
  ];

  afterEach(() => {
    // Clean up env vars after each test
    for (const k of requiredKeys) {
      delete process.env[k];
    }
  });

  it('returns valid when all required env vars are set', () => {
    for (const k of requiredKeys) {
      process.env[k] = 'test-value';
    }
    const result = validateFeishuEnv();
    expect(result.valid).toBe(true);
    expect(result.missing).toEqual([]);
  });

  it('returns invalid when all env vars are missing', () => {
    const result = validateFeishuEnv();
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(3);
    expect(result.missing).toContain('FEISHU_BASE_TOKEN');
    expect(result.missing).toContain('FEISHU_PUBLISH_QUEUE_TABLE_ID');
    expect(result.missing).toContain('FEISHU_PARSED_CANDIDATES_TABLE_ID');
  });

  it('returns invalid with specific missing keys when partially set', () => {
    process.env.FEISHU_BASE_TOKEN = 'test-value';
    const result = validateFeishuEnv();
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(2);
    expect(result.missing).toContain('FEISHU_PUBLISH_QUEUE_TABLE_ID');
    expect(result.missing).toContain('FEISHU_PARSED_CANDIDATES_TABLE_ID');
  });

  it('treats empty string as missing', () => {
    for (const k of requiredKeys) {
      process.env[k] = '';
    }
    const result = validateFeishuEnv();
    expect(result.valid).toBe(false);
    expect(result.missing).toHaveLength(3);
  });
});
