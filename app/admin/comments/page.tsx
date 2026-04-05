'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import communitiesData from '@/data/communities.json';
import styles from './page.module.css';

type CommentStatus = 'pending' | 'approved' | 'rejected';

interface AdminComment {
  id: string;
  communityId: string;
  nickname: string;
  content: string;
  status: CommentStatus;
  createdAt: string;
}

const COMMUNITY_MAP = new Map<string, string>(
  communitiesData.map((c) => [c.id, c.name]),
);

const PAGE_SIZE = 20;

function formatTime(dateString: string): string {
  const date = new Date(dateString);
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  const hour = String(date.getHours()).padStart(2, '0');
  const minute = String(date.getMinutes()).padStart(2, '0');
  return `${year}-${month}-${day} ${hour}:${minute}`;
}

const TABS: { label: string; status: CommentStatus }[] = [
  { label: '待审核', status: 'pending' },
  { label: '已通过', status: 'approved' },
  { label: '已拒绝', status: 'rejected' },
];

export default function AdminCommentsPage() {
  const [adminKey, setAdminKey] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<CommentStatus>('pending');
  const [comments, setComments] = useState<AdminComment[]>([]);
  const [loading, setLoading] = useState(false);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [pendingCounts, setPendingCounts] = useState({ pending: 0, approved: 0, rejected: 0 });

  // Load admin key from sessionStorage
  useEffect(() => {
    const key = sessionStorage.getItem('office-map-admin-key');
    setAdminKey(key);
  }, []);

  const showMessage = useCallback((text: string, type: 'success' | 'error' | 'info') => {
    setMessage({ text, type });
    setTimeout(() => setMessage(null), 3000);
  }, []);

  // Fetch comments by status
  const fetchComments = useCallback(async (status: CommentStatus, pageNum: number) => {
    if (!adminKey) return;
    setLoading(true);
    try {
      const res = await fetch(
        `/api/admin/comments?status=${status}&page=${pageNum}&pageSize=${PAGE_SIZE}`,
        { headers: { 'x-admin-key': adminKey } },
      );
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '加载失败');
      }
      const data = await res.json();
      setComments(data.comments);
      setTotalPages(data.totalPages);
    } catch (err) {
      showMessage(err instanceof Error ? err.message : '加载失败', 'error');
    } finally {
      setLoading(false);
    }
  }, [adminKey, showMessage]);

  // Fetch counts for all statuses
  const fetchCounts = useCallback(async () => {
    if (!adminKey) return;
    try {
      const results = await Promise.all([
        fetch(`/api/admin/comments?status=pending&page=1&pageSize=1`, { headers: { 'x-admin-key': adminKey } }),
        fetch(`/api/admin/comments?status=approved&page=1&pageSize=1`, { headers: { 'x-admin-key': adminKey } }),
        fetch(`/api/admin/comments?status=rejected&page=1&pageSize=1`, { headers: { 'x-admin-key': adminKey } }),
      ]);
      const [pending, approved, rejected] = await Promise.all(results.map(r => r.json()));
      setPendingCounts({
        pending: pending.total ?? 0,
        approved: approved.total ?? 0,
        rejected: rejected.total ?? 0,
      });
    } catch {
      // Ignore count errors
    }
  }, [adminKey]);

  // Load data when tab or page changes
  useEffect(() => {
    if (adminKey) {
      fetchComments(activeTab, page);
    }
  }, [adminKey, activeTab, page, fetchComments]);

  // Initial load of counts
  useEffect(() => {
    if (adminKey) {
      fetchCounts();
    }
  }, [adminKey, fetchCounts]);

  const handleStatusChange = async (commentId: string, newStatus: 'approved' | 'rejected') => {
    if (!adminKey) return;
    try {
      const res = await fetch(`/api/admin/comments?id=${commentId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': adminKey },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.message || '操作失败');
      }
      // Remove from current list
      setComments(prev => prev.filter(c => c.id !== commentId));
      showMessage(newStatus === 'approved' ? '已通过' : '已拒绝', 'success');
      // Refresh counts
      fetchCounts();
    } catch (err) {
      showMessage(err instanceof Error ? err.message : '操作失败', 'error');
    }
  };

  const handleTabChange = (status: CommentStatus) => {
    setActiveTab(status);
    setPage(1);
  };

  // Not logged in
  if (!adminKey) {
    return (
      <div className={styles.page}>
        <div className={styles.loginHint}>
          <h2>未授权</h2>
          <p>请先通过管理员入口访问此页面</p>
          <Link href="/admin">返回管理员首页</Link>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.page}>
      <div className={styles.hero}>
        <div>
          <h1>评论审核</h1>
          <p>管理社区评论的审核状态</p>
        </div>
        <div className={styles.actions}>
          <Link href="/admin" style={{ textDecoration: 'none', color: '#155eef', fontWeight: 600 }}>
            返回管理首页
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className={styles.stats}>
        <div className={styles.statCard}>
          <strong>{pendingCounts.pending}</strong>
          <span>待审核</span>
        </div>
        <div className={styles.statCard}>
          <strong>{pendingCounts.approved}</strong>
          <span>已通过</span>
        </div>
        <div className={styles.statCard}>
          <strong>{pendingCounts.rejected}</strong>
          <span>已拒绝</span>
        </div>
      </div>

      {/* Tabs */}
      <div className={styles.tabs}>
        {TABS.map(tab => (
          <button
            key={tab.status}
            className={`${styles.tab} ${activeTab === tab.status ? styles.tabActive : ''}`}
            onClick={() => handleTabChange(tab.status)}
          >
            {tab.label} ({pendingCounts[tab.status]})
          </button>
        ))}
      </div>

      {/* Message */}
      {message && (
        <div className={`${styles.banner} ${message.type === 'success' ? styles.bannerSuccess : message.type === 'error' ? styles.bannerError : ''}`}>
          {message.text}
        </div>
      )}

      {/* Comment list */}
      {loading ? (
        <div className={styles.empty}>加载中...</div>
      ) : comments.length === 0 ? (
        <div className={styles.empty}>暂无{activeTab === 'pending' ? '待审核' : activeTab === 'approved' ? '已通过的' : '已拒绝的'}评论</div>
      ) : (
        <div className={styles.list}>
          {comments.map(comment => (
            <div key={comment.id} className={styles.card}>
              <div className={styles.cardHeader}>
                <div className={styles.cardMeta}>
                  <span><strong>{comment.nickname}</strong></span>
                  <span>{COMMUNITY_MAP.get(comment.communityId) || comment.communityId}</span>
                  <span>{formatTime(comment.createdAt)}</span>
                </div>
              </div>
              <div className={styles.cardContent}>{comment.content}</div>
              {activeTab === 'pending' && (
                <div className={styles.cardActions}>
                  <button className={styles.btnApprove} onClick={() => handleStatusChange(comment.id, 'approved')}>
                    通过
                  </button>
                  <button className={styles.btnReject} onClick={() => handleStatusChange(comment.id, 'rejected')}>
                    拒绝
                  </button>
                </div>
              )}
              {activeTab === 'rejected' && (
                <div className={styles.cardActions}>
                  <button className={styles.btnApprove} onClick={() => handleStatusChange(comment.id, 'approved')}>
                    重新通过
                  </button>
                </div>
              )}
              {activeTab === 'approved' && (
                <div className={styles.cardActions}>
                  <button className={styles.btnReject} onClick={() => handleStatusChange(comment.id, 'rejected')}>
                    撤回通过
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
