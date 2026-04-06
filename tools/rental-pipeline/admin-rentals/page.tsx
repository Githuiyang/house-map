'use client';

import { useMemo, useState } from 'react';
import type { RentalIngestResult, RentalTrendReport } from '@/types/rental';
import styles from './page.module.css';

const SAMPLE_INPUT = [
  '国定路财大小区，二室一厅，双南，精装修，6500元约看房，4月20号空',
  '国年路25弄，双南两房，5300可谈。',
  '三门路 婚房装修 电梯二房二厅 挂牌7800可谈有钥匙 含地下车位',
  '美岸栖庭二房出租7300一个月。',
].join('\n');

interface ReportResponse {
  report: RentalTrendReport;
  snapshot: {
    totalListings: number;
    activeListings: number;
    communities: Array<{
      communityId: string;
      communityName: string;
      activeListingCount: number;
      avgPrice: number | null;
    }>;
  };
}

interface ErrorResponse {
  message?: string;
}

function toReportData(snapshot: RentalIngestResult['snapshot'], report: RentalTrendReport): ReportResponse {
  return {
    report,
    snapshot: {
      totalListings: snapshot.totalListings,
      activeListings: snapshot.activeListings,
      communities: snapshot.communities.map(item => ({
        communityId: item.communityId,
        communityName: item.communityName,
        activeListingCount: item.activeListingCount,
        avgPrice: item.avgPrice,
      })),
    },
  };
}

async function requestJson<T>(url: string, init: RequestInit | undefined, fallbackMessage: string): Promise<T> {
  const response = await fetch(url, init);
  const data = await response.json() as T & ErrorResponse;
  if (!response.ok) throw new Error(data.message || fallbackMessage);
  return data;
}

function formatPrice(value: number | null) {
  return value === null ? '未知' : `¥${value}`;
}

export default function RentalAdminPage() {
  const [input, setInput] = useState(SAMPLE_INPUT);
  const [reportData, setReportData] = useState<ReportResponse | null>(null);
  const [result, setResult] = useState<RentalIngestResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [feedback, setFeedback] = useState({ rating: 5, message: '', contact: '' });

  const lines = useMemo(() => input.split('\n').map(item => item.trim()).filter(Boolean), [input]);

  const runAction = async (fallbackMessage: string, action: () => Promise<void>) => {
    setLoading(true);
    setMessage('');
    try {
      await action();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : fallbackMessage);
    } finally {
      setLoading(false);
    }
  };

  const loadReport = async () => runAction('加载趋势报告失败', async () => {
    const data = await requestJson<ReportResponse>('/api/rentals/report', { cache: 'no-store' }, '加载趋势报告失败');
    setReportData(data);
  });

  const handleIngest = async () => runAction('批量处理失败', async () => {
    const data = await requestJson<RentalIngestResult>('/api/rentals/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lines }),
      }, '批量处理失败');
    setResult(data);
    setReportData(toReportData(data.snapshot, data.report));
  });

  const handleGenerate = async () => runAction('生成报告失败', async () => {
    const data = await requestJson<ReportResponse>('/api/rentals/report', { method: 'POST' }, '生成报告失败');
    setReportData(data);
  });

  const handleRestore = async () => runAction('恢复失败', async () => {
      await requestJson('/api/rentals/restore', { method: 'POST' }, '恢复失败');
      const report = await requestJson<ReportResponse>('/api/rentals/report', { cache: 'no-store' }, '加载趋势报告失败');
      setReportData(report);
      setMessage('已恢复最近一次备份并重新加载报告');
  });

  const submitFeedback = async () => {
    if (!feedback.message.trim()) {
      setMessage('请先填写反馈内容');
      return;
    }
    await runAction('提交反馈失败', async () => {
      await requestJson('/api/rentals/feedback', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(feedback),
      }, '提交反馈失败');
      setFeedback({ rating: 5, message: '', contact: '' });
      setMessage('反馈已记录，可用于后续解析规则优化');
    });
  };

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <h1>租房向量化处理系统</h1>
          <p>持续接收 Openclaw 文本、结构化抽取、增量入库、趋势分析与质量监控。</p>
        </div>
        <div className={styles.actions}>
          <button onClick={handleIngest} disabled={loading || lines.length === 0}>批量处理</button>
          <button onClick={loadReport} disabled={loading}>读取现状</button>
          <button onClick={handleGenerate} disabled={loading}>生成报告</button>
          <button onClick={handleRestore} disabled={loading}>恢复最近备份</button>
        </div>
      </div>

      {message && <div className={styles.banner}>{message}</div>}

      <div className={styles.grid}>
        <section className={styles.panel}>
          <h2>Openclaw 输入</h2>
          <textarea
            className={styles.textarea}
            value={input}
            onChange={e => setInput(e.target.value)}
            placeholder="每行一条租房描述"
          />
          <div className={styles.meta}>当前待处理 {lines.length} 条</div>
        </section>

        <section className={styles.panel}>
          <h2>处理结果</h2>
          <div className={styles.stats}>
            <div><strong>{result?.processed ?? 0}</strong><span>处理条数</span></div>
            <div><strong>{result?.inserted ?? 0}</strong><span>新增</span></div>
            <div><strong>{result?.merged ?? 0}</strong><span>合并</span></div>
            <div><strong>{result?.invalid ?? 0}</strong><span>无效</span></div>
            <div><strong>{result?.communitySync?.created ?? 0}</strong><span>新建小区</span></div>
            <div><strong>{result?.communitySync?.updated ?? 0}</strong><span>更新小区</span></div>
            <div><strong>{result?.communitySync?.skipped ?? 0}</strong><span>待人工补点</span></div>
            <div><strong>{result?.communitySync?.geocoded ?? 0}</strong><span>成功落图</span></div>
          </div>
          <div className={styles.list}>
            {result?.items.map(item => (
              <article key={item.id} className={styles.card}>
                <div className={styles.cardTitle}>{item.parsed.communityName}</div>
                <div className={styles.cardMeta}>
                  {item.parsed.layout || '未识别户型'} · {formatPrice(item.parsed.price)} · 完整度 {Math.round(item.validation.completeness * 100)}%
                </div>
                <div className={styles.tags}>
                  {item.vector.keywords.map(keyword => <span key={keyword}>{keyword}</span>)}
                </div>
                {(item.validation.errors.length > 0 || item.validation.warnings.length > 0) && (
                  <div className={styles.issues}>
                    {[...item.validation.errors, ...item.validation.warnings].join('；')}
                  </div>
                )}
              </article>
            ))}
          </div>
          {result?.communitySync?.items.length ? (
            <div className={styles.list}>
              {result.communitySync.items.map(item => (
                <article key={`${item.communityId}-${item.action}`} className={styles.card}>
                  <div className={styles.cardTitle}>{item.communityName}</div>
                  <div className={styles.cardMeta}>
                    {item.action === 'created' ? '新建' : item.action === 'updated' ? '更新' : '跳过'} · {item.geocoded ? '已调用地图 API' : '未完成地图落点'}
                  </div>
                  <div className={styles.issues}>{item.message}</div>
                </article>
              ))}
            </div>
          ) : null}
        </section>

        <section className={styles.panel}>
          <h2>趋势概览</h2>
          <div className={styles.stats}>
            <div><strong>{reportData?.snapshot.totalListings ?? 0}</strong><span>总记录</span></div>
            <div><strong>{reportData?.snapshot.activeListings ?? 0}</strong><span>有效记录</span></div>
            <div><strong>{reportData?.report.totals.communities ?? 0}</strong><span>覆盖小区</span></div>
            <div><strong>{reportData?.report.totals.avgPrice ? `¥${reportData.report.totals.avgPrice}` : '未知'}</strong><span>平均租金</span></div>
          </div>
          <div className={styles.list}>
            {reportData?.report.byCommunity.map(item => (
              <article key={item.communityId} className={styles.card}>
                <div className={styles.cardTitle}>{item.communityName}</div>
                <div className={styles.cardMeta}>
                  均价 {formatPrice(item.currentAvgPrice)} · 变化 {item.priceChangeRate === null ? '暂无' : `${item.priceChangeRate}%`}
                </div>
                <div className={styles.cardMeta}>
                  活跃度 {item.activityScore} · 供需压力 {item.demandPressure}
                </div>
                <div className={styles.trend}>
                  {item.trend.map(point => (
                    <span key={`${item.communityId}-${point.date}`}>
                      {point.date}:{point.avgPrice ?? '未知'}
                    </span>
                  ))}
                </div>
              </article>
            ))}
          </div>
        </section>
      </div>

      <div className={styles.bottomGrid}>
        <section className={styles.panel}>
          <h2>异常与质量监控</h2>
          <div className={styles.list}>
            {reportData?.report.anomalies.length ? reportData.report.anomalies.map(item => (
              <article key={`${item.type}-${item.listingId}`} className={styles.card}>
                <div className={styles.cardTitle}>{item.type}</div>
                <div className={styles.cardMeta}>{item.communityId}</div>
                <div className={styles.issues}>{item.message}</div>
              </article>
            )) : <div className={styles.empty}>暂无异常数据</div>}
          </div>
        </section>

        <section className={styles.panel}>
          <h2>用户反馈</h2>
          <div className={styles.feedbackForm}>
            <label>
              评分
              <input
                type="number"
                min={1}
                max={5}
                value={feedback.rating}
                onChange={e => setFeedback(prev => ({ ...prev, rating: Number(e.target.value) || 5 }))}
              />
            </label>
            <label>
              联系方式
              <input
                value={feedback.contact}
                onChange={e => setFeedback(prev => ({ ...prev, contact: e.target.value }))}
                placeholder="可选"
              />
            </label>
            <label>
              反馈内容
              <textarea
                value={feedback.message}
                onChange={e => setFeedback(prev => ({ ...prev, message: e.target.value }))}
                placeholder="例如：某条房源把两房识别成一室"
              />
            </label>
            <button onClick={submitFeedback} disabled={loading}>提交反馈</button>
          </div>
        </section>
      </div>
    </div>
  );
}
