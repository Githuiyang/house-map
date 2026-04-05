'use client';

import { useState, useEffect, useCallback } from 'react';
import styles from './CommentSection.module.css';

interface Comment {
  id: string;
  nickname: string;
  content: string;
  createdAt: string;
}

interface CommentSectionProps {
  communityId: string;
  isAdmin?: boolean;
}

const PAGE_SIZE = 10;
const MAX_CONTENT_LENGTH = 500;
const MAX_NICKNAME_LENGTH = 20;

function formatRelativeTime(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffSeconds = Math.floor(diffMs / 1000);
  const diffMinutes = Math.floor(diffSeconds / 60);
  const diffHours = Math.floor(diffMinutes / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffSeconds < 60) {
    return '刚刚';
  }
  if (diffMinutes < 60) {
    return `${diffMinutes}分钟前`;
  }
  if (diffHours < 24) {
    return `${diffHours}小时前`;
  }
  if (diffDays < 7) {
    return `${diffDays}天前`;
  }

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export default function CommentSection({ communityId, isAdmin }: CommentSectionProps) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [nickname, setNickname] = useState('');
  const [content, setContent] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [toast, setToast] = useState<string | null>(null);

  const showToast = useCallback((message: string) => {
    setToast(message);
    setTimeout(() => setToast(null), 3000);
  }, []);

  const fetchComments = useCallback(async (pageNum: number, append: boolean = false) => {
    try {
      if (!append) {
        setLoading(true);
      }
      setError(null);

      const res = await fetch(`/api/community/${communityId}?page=${pageNum}&pageSize=${PAGE_SIZE}`);
      if (!res.ok) {
        throw new Error(`请求失败: ${res.status}`);
      }

      const data = await res.json();
      const fetchedComments: Comment[] = data.comments ?? [];

      if (append) {
        setComments(prev => [...prev, ...fetchedComments]);
      } else {
        setComments(fetchedComments);
      }
      setHasMore(fetchedComments.length >= PAGE_SIZE);
    } catch {
      if (!append) {
        setError('评论加载失败，请稍后重试');
      }
    } finally {
      if (!append) {
        setLoading(false);
      }
    }
  }, [communityId]);

  useEffect(() => {
    fetchComments(1);
  }, [fetchComments]);

  const handleSubmit = async () => {
    const trimmedContent = content.trim();
    if (!trimmedContent || trimmedContent.length > MAX_CONTENT_LENGTH || submitting) {
      return;
    }

    setSubmitting(true);
    setContent('');

    try {
      const res = await fetch(`/api/comments`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          communityId,
          nickname: nickname.trim() || '匿名用户',
          content: trimmedContent,
        }),
      });

      if (!res.ok) {
        throw new Error(`提交失败: ${res.status}`);
      }

      showToast('评论已提交，将在审核后显示');
    } catch {
      showToast('评论失败，请重试');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (commentId: string) => {
    const adminKey = sessionStorage.getItem('office-map-admin-key');
    if (!adminKey) {
      return;
    }

    const previousComments = comments;
    setComments(prev => prev.filter(c => c.id !== commentId));

    try {
      const res = await fetch(`/api/comments?id=${commentId}`, {
        method: 'DELETE',
        headers: { 'x-admin-key': adminKey },
      });

      if (!res.ok) {
        throw new Error(`删除失败: ${res.status}`);
      }
    } catch {
      setComments(previousComments);
      showToast('删除失败，请重试');
    }
  };

  const handleLoadMore = () => {
    const nextPage = page + 1;
    setPage(nextPage);
    fetchComments(nextPage, true);
  };

  const isContentOverLimit = content.length > MAX_CONTENT_LENGTH;
  const canSubmit = content.trim().length > 0 && !isContentOverLimit && !submitting;

  if (loading) {
    return (
      <div className={styles.container}>
        <div className={styles.loading}>
          <span className={styles.spinner} />
          加载中...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className={styles.container}>
        <div className={styles.error}>
          {error}
          <br />
          <button className={styles.retryBtn} onClick={() => fetchComments(1)}>
            重试
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      {toast && <div className={styles.toast}>{toast}</div>}

      {/* Comment list */}
      {comments.length === 0 ? (
        <div className={styles.empty}>
          <span className={styles.emptyEmoji} role="img" aria-label="speech bubble">💬</span>
          暂无评论，来做第一个
        </div>
      ) : (
        <div className={styles.commentList}>
          {comments.map(comment => (
            <div
              key={comment.id}
              className={styles.commentItem}
            >
              <div className={styles.commentHeader}>
                <div className={styles.commentMeta}>
                  <span className={styles.commentNickname}>{comment.nickname}</span>
                  <span className={styles.commentTime}>
                    {formatRelativeTime(comment.createdAt)}
                  </span>
                </div>
                {isAdmin && (
                  <button
                    className={styles.deleteBtn}
                    onClick={() => handleDelete(comment.id)}
                    aria-label="删除评论"
                    title="删除评论"
                  >
                    &times;
                  </button>
                )}
              </div>
              <div className={styles.commentContent}>{comment.content}</div>
            </div>
          ))}
        </div>
      )}

      {/* Load more */}
      {hasMore && (
        <button className={styles.loadMoreBtn} onClick={handleLoadMore}>
          加载更多
        </button>
      )}

      {/* Composer */}
      <div className={styles.composer}>
        <div className={styles.inputRow}>
          <input
            className={styles.nicknameInput}
            type="text"
            placeholder="昵称（可选）"
            maxLength={MAX_NICKNAME_LENGTH}
            value={nickname}
            onChange={(e) => setNickname(e.target.value)}
          />
        </div>
        <div className={styles.textareaWrapper}>
          <textarea
            className={styles.textarea}
            placeholder="写下你的评论..."
            value={content}
            onChange={(e) => setContent(e.target.value)}
          />
          <span className={`${styles.charCount} ${isContentOverLimit ? styles.charCountOver : ''}`}>
            {content.length}/{MAX_CONTENT_LENGTH}
          </span>
        </div>
        <button
          className={styles.submitBtn}
          onClick={handleSubmit}
          disabled={!canSubmit}
        >
          {submitting ? '提交中...' : '发表评论'}
        </button>
      </div>
    </div>
  );
}
