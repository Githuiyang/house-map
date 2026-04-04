'use client';

import { useState, useRef, useCallback } from 'react';
import styles from './ImageUploader.module.css';

interface ImageUploaderProps {
  communityId: string;
  isAdmin?: boolean;
  onUploadComplete?: () => void;
}

interface UploadItem {
  id: string;
  file: File;
  previewUrl: string;
  status: 'uploading' | 'done' | 'error';
  progress: number;
  errorMessage?: string;
}

const MAX_FILES = 6;
const MAX_SIZE_MB = 5;
const COMPRESS_MAX_WIDTH = 1280;
const COMPRESS_QUALITY = 0.85;

function compressImage(file: File): Promise<File> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);

      const canvas = document.createElement('canvas');
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas not supported'));
        return;
      }

      let { width, height } = img;
      if (width > COMPRESS_MAX_WIDTH) {
        height = Math.round((height * COMPRESS_MAX_WIDTH) / width);
        width = COMPRESS_MAX_WIDTH;
      }

      canvas.width = width;
      canvas.height = height;
      ctx.drawImage(img, 0, 0, width, height);

      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error('Compression failed'));
            return;
          }
          const compressedFile = new File([blob], file.name, {
            type: 'image/jpeg',
            lastModified: Date.now(),
          });
          resolve(compressedFile);
        },
        'image/jpeg',
        COMPRESS_QUALITY,
      );
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

function uploadFile(
  file: File,
  communityId: string,
  onProgress: (progress: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('communityId', communityId);

    const xhr = new XMLHttpRequest();

    xhr.upload.addEventListener('progress', (e) => {
      if (e.lengthComputable) {
        const pct = Math.round((e.loaded / e.total) * 100);
        onProgress(pct);
      }
    });

    xhr.addEventListener('load', () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Upload failed: ${xhr.status}`));
      }
    });

    xhr.addEventListener('error', () => {
      reject(new Error('Network error'));
    });

    xhr.open('POST', '/api/images/upload');
    const adminKey = sessionStorage.getItem('office-map-admin-key');
    if (adminKey) {
      xhr.setRequestHeader('x-admin-key', adminKey);
    }
    xhr.send(formData);
  });
}

export default function ImageUploader({
  communityId,
  isAdmin,
  onUploadComplete,
}: ImageUploaderProps) {
  const [items, setItems] = useState<UploadItem[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const updateItem = useCallback((id: string, updates: Partial<UploadItem>) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, ...updates } : item)),
    );
  }, []);

  const processFiles = useCallback(
    async (files: File[]) => {
      if (files.length > MAX_FILES) {
        alert('最多上传6张图片');
        files = files.slice(0, MAX_FILES);
      }

      const validFiles: File[] = [];
      for (const f of files) {
        if (f.size > MAX_SIZE_MB * 1024 * 1024) {
          alert(`文件 ${f.name} 超过5MB限制`);
          continue;
        }
        validFiles.push(f);
      }

      if (validFiles.length === 0) return;

      const newItems: UploadItem[] = validFiles.map((f) => ({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        file: f,
        previewUrl: URL.createObjectURL(f),
        status: 'uploading' as const,
        progress: 0,
      }));

      setItems((prev) => [...prev, ...newItems]);
      setIsProcessing(true);

      for (const item of newItems) {
        try {
          const compressed = await compressImage(item.file);
          await uploadFile(compressed, communityId, (progress) => {
            updateItem(item.id, { progress });
          });
          updateItem(item.id, { status: 'done', progress: 100 });
        } catch {
          updateItem(item.id, {
            status: 'error',
            errorMessage: '上传失败',
          });
        }
      }

      setIsProcessing(false);

      // Check if all items are done (not just this batch, but all items)
      setItems((prev) => {
        const allDone = prev.every((i) => i.status === 'done');
        if (allDone) {
          // Defer callback so state has settled
          setTimeout(() => onUploadComplete?.(), 0);
        }
        return prev;
      });
    },
    [communityId, updateItem, onUploadComplete],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const fileList = e.target.files;
      if (!fileList || fileList.length === 0) return;
      processFiles(Array.from(fileList));
      // Reset input so the same file can be selected again
      e.target.value = '';
    },
    [processFiles],
  );

  const handleRetry = useCallback(
    async (id: string) => {
      const item = items.find((i) => i.id === id);
      if (!item) return;

      updateItem(id, { status: 'uploading', progress: 0, errorMessage: undefined });
      setIsProcessing(true);

      try {
        const compressed = await compressImage(item.file);
        await uploadFile(compressed, communityId, (progress) => {
          updateItem(id, { progress });
        });
        updateItem(id, { status: 'done', progress: 100 });
      } catch {
        updateItem(id, { status: 'error', errorMessage: '上传失败' });
      }

      setIsProcessing(false);

      setItems((current) => {
        const allDone = current.every((i) => i.status === 'done');
        if (allDone) {
          setTimeout(() => onUploadComplete?.(), 0);
        }
        return current;
      });
    },
    [items, communityId, updateItem, onUploadComplete],
  );

  const handleRemove = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }, []);

  if (!isAdmin) return null;

  return (
    <div className={styles.container}>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        className={styles.hiddenInput}
        onChange={handleFileChange}
      />
      <button
        className={styles.uploadBtn}
        onClick={() => inputRef.current?.click()}
        disabled={isProcessing}
        type="button"
      >
        📷 上传图片
      </button>

      {items.length > 0 && (
        <div className={styles.grid}>
          {items.map((item) => (
            <div key={item.id} className={styles.thumbnail}>
              <img
                src={item.previewUrl}
                alt=""
                className={styles.thumbnailImg}
              />

              {item.status === 'uploading' && (
                <div className={styles.progressTrack}>
                  <div
                    className={styles.progressFill}
                    style={{ width: `${item.progress}%` }}
                  />
                </div>
              )}

              {item.status === 'done' && (
                <div className={styles.doneOverlay}>
                  <span className={styles.checkmark}>✓</span>
                </div>
              )}

              {item.status === 'error' && (
                <div className={styles.errorOverlay}>
                  <button
                    className={styles.retryBtn}
                    onClick={() => handleRetry(item.id)}
                    type="button"
                  >
                    重试
                  </button>
                  <button
                    className={styles.removeBtn}
                    onClick={() => handleRemove(item.id)}
                    type="button"
                  >
                    ×
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
