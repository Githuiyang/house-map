'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import communitiesData from '@/data/communities.json';
import type { Community } from '@/types/community';
import { normalizeCommunities } from '@/utils/communityData';
import styles from './page.module.css';

function parseList(text: string): string[] {
  return text.split('\n').map(v => v.trim()).filter(Boolean);
}

function toListText(list?: string[]): string {
  return (list || []).join('\n');
}

function toNumber(value: string, fallback = 0): number {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

const initialCommunities = normalizeCommunities(communitiesData);

export default function AdminPage() {
  const [communities, setCommunities] = useState<Community[]>(() => initialCommunities);
  const [q, setQ] = useState('');
  const [activeId, setActiveId] = useState<string>(() => initialCommunities[0]?.id || '');
  const [copied, setCopied] = useState(false);
  const [importText, setImportText] = useState('');

  const filtered = useMemo(() => {
    const kw = q.trim().toLowerCase();
    if (!kw) return communities;
    return communities.filter(c => c.name.toLowerCase().includes(kw) || c.id.toLowerCase().includes(kw));
  }, [communities, q]);

  const active = useMemo(
    () => communities.find(c => c.id === activeId) ?? communities[0] ?? null,
    [communities, activeId]
  );

  const updateActive = (updater: (prev: Community) => Community) => {
    if (!active) return;
    setCommunities(prev => prev.map(c => (c.id === active.id ? updater(c) : c)));
  };

  const jsonText = useMemo(() => JSON.stringify(communities, null, 2), [communities]);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(jsonText);
    setCopied(true);
    setTimeout(() => setCopied(false), 1200);
  };

  const handleDownload = () => {
    const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'communities.admin-edited.json';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const handleImport = () => {
    const parsed = JSON.parse(importText);
    const next = normalizeCommunities(parsed);
    if (next.length === 0) return;
    setCommunities(next);
    setActiveId(next[0].id);
    setImportText('');
  };

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <h1 className={styles.title}>管理员模式</h1>
        <div className={styles.actions}>
          {/* 租房向量化系统已移至 tools/rental-pipeline/ */}
          <Link className={styles.actionLink} href="/admin/comments">评论审核</Link>
          <button onClick={handleCopy}>{copied ? '已复制' : '复制 JSON'}</button>
          <button onClick={handleDownload}>下载 JSON</button>
        </div>
      </div>

      <div className={styles.layout}>
        <aside className={styles.sidebar}>
          <input
            className={styles.search}
            placeholder="搜索小区名或ID"
            value={q}
            onChange={e => setQ(e.target.value)}
          />
          <div className={styles.list}>
            {filtered.map(c => (
              <button
                key={c.id}
                className={`${styles.item} ${active?.id === c.id ? styles.itemActive : ''}`}
                onClick={() => setActiveId(c.id)}
              >
                <div>{c.name}</div>
                <div className={styles.sub}>{c.id}</div>
              </button>
            ))}
          </div>
        </aside>

        <main className={styles.main}>
          {active && (
            <div className={styles.form}>
              <div className={styles.grid}>
                <label>ID<input value={active.id} onChange={e => updateActive(v => ({ ...v, id: e.target.value }))} /></label>
                <label>名称<input value={active.name} onChange={e => updateActive(v => ({ ...v, name: e.target.value }))} /></label>
                <label>经度<input value={String(active.coordinates[0])} onChange={e => updateActive(v => ({ ...v, coordinates: [toNumber(e.target.value, v.coordinates[0]), v.coordinates[1]] }))} /></label>
                <label>纬度<input value={String(active.coordinates[1])} onChange={e => updateActive(v => ({ ...v, coordinates: [v.coordinates[0], toNumber(e.target.value, v.coordinates[1])] }))} /></label>
                <label>距离<input value={active.distance} onChange={e => updateActive(v => ({ ...v, distance: e.target.value }))} /></label>
                <label>骑行时间<input value={active.bikeTime} onChange={e => updateActive(v => ({ ...v, bikeTime: e.target.value }))} /></label>
                <label>价格最小<input value={String(active.price.min)} onChange={e => updateActive(v => ({ ...v, price: { ...v.price, min: toNumber(e.target.value, v.price.min) } }))} /></label>
                <label>价格最大<input value={String(active.price.max)} onChange={e => updateActive(v => ({ ...v, price: { ...v.price, max: toNumber(e.target.value, v.price.max) } }))} /></label>
                <label>价格单位<input value={active.price.unit} onChange={e => updateActive(v => ({ ...v, price: { ...v.price, unit: e.target.value } }))} /></label>
                <label>贡献者<input value={active.contributor || ''} onChange={e => updateActive(v => ({ ...v, contributor: e.target.value }))} /></label>
                <label>更新时间<input value={active.updatedAt || ''} onChange={e => updateActive(v => ({ ...v, updatedAt: e.target.value }))} /></label>
                <label className={styles.checkbox}>
                  <input
                    type="checkbox"
                    checked={!!active.elevator}
                    onChange={e => updateActive(v => ({ ...v, elevator: e.target.checked }))}
                  />
                  有电梯
                </label>
              </div>

              <div className={styles.areaGroup}>
                <label>楼型（每行一个）</label>
                <textarea value={toListText(active.floorTypes)} onChange={e => updateActive(v => ({ ...v, floorTypes: parseList(e.target.value) }))} />
              </div>
              <div className={styles.areaGroup}>
                <label>户型（每行一个）</label>
                <textarea value={toListText(active.layouts)} onChange={e => updateActive(v => ({ ...v, layouts: parseList(e.target.value) }))} />
              </div>
              <div className={styles.areaGroup}>
                <label>亮点（每行一个）</label>
                <textarea value={toListText(active.highlights)} onChange={e => updateActive(v => ({ ...v, highlights: parseList(e.target.value) }))} />
              </div>
              <div className={styles.areaGroup}>
                <label>注意事项（每行一个）</label>
                <textarea value={toListText(active.warnings)} onChange={e => updateActive(v => ({ ...v, warnings: parseList(e.target.value) }))} />
              </div>

              <div className={styles.areaGroup}>
                <label>户型价格（合租 / 整租）</label>
                <table className={styles.pricingTable}>
                  <thead>
                    <tr>
                      <th>户型</th>
                      <th>合租（元/月）</th>
                      <th>整租（元/月）</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(active.roomPricing || []).map((rp, idx) => (
                      <tr key={rp.layout}>
                        <td>{rp.layout}</td>
                        <td>
                          <input
                            type="number"
                            value={rp.shared || ''}
                            placeholder="0"
                            onChange={e => {
                              const val = toNumber(e.target.value, 0);
                              updateActive(v => {
                                const pricing = [...(v.roomPricing || [])];
                                pricing[idx] = { ...pricing[idx], shared: val };
                                return { ...v, roomPricing: pricing };
                              });
                            }}
                          />
                        </td>
                        <td>
                          <input
                            type="number"
                            value={rp.whole || ''}
                            placeholder="0"
                            onChange={e => {
                              const val = toNumber(e.target.value, 0);
                              updateActive(v => {
                                const pricing = [...(v.roomPricing || [])];
                                pricing[idx] = { ...pricing[idx], whole: val };
                                return { ...v, roomPricing: pricing };
                              });
                            }}
                          />
                        </td>
                      </tr>
                    ))}
                    {(!active.roomPricing || active.roomPricing.length === 0) && (
                      <tr>
                        <td colSpan={3} className={styles.emptyHint}>暂无户型数据，请先在「户型」中添加</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </main>

        <aside className={styles.preview}>
          <div className={styles.previewTitle}>导入 / 预览</div>
          <textarea
            className={styles.import}
            placeholder="粘贴完整 communities JSON 后点击导入"
            value={importText}
            onChange={e => setImportText(e.target.value)}
          />
          <button onClick={handleImport} disabled={!importText.trim()}>导入 JSON</button>
          <pre className={styles.json}>{jsonText}</pre>
        </aside>
      </div>
    </div>
  );
}
