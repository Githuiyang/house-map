'use client';

import { useSyncExternalStore, useCallback, useEffect } from 'react';
import styles from './ThemeToggle.module.css';

type Theme = 'minimal' | 'pixel';

// localStorage 订阅器
function subscribe(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

// 获取当前主题
function getTheme(): Theme {
  if (typeof window === 'undefined') return 'minimal';
  return (localStorage.getItem('theme') as Theme) || 'minimal';
}

// 服务端快照
function getServerSnapshot(): Theme {
  return 'minimal';
}

export default function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, getTheme, getServerSnapshot);

  const toggleTheme = useCallback(() => {
    const newTheme: Theme = theme === 'minimal' ? 'pixel' : 'minimal';
    localStorage.setItem('theme', newTheme);
    document.documentElement.setAttribute('data-theme', newTheme);
    // 触发 storage 事件以通知其他组件
    window.dispatchEvent(new StorageEvent('storage'));
  }, [theme]);

  // 同步 DOM 到 document.documentElement
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  return (
    <button
      className={styles.button}
      onClick={toggleTheme}
      title={theme === 'minimal' ? '切换到像素风格' : '切换到简约风格'}
    >
      <span className={styles.icon}>
        {theme === 'minimal' ? '🎮' : '📝'}
      </span>
      <span className={styles.label}>
        {theme === 'minimal' ? '像素' : '简约'}
      </span>
    </button>
  );
}
