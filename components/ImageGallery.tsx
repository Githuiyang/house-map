'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import styles from './ImageGallery.module.css';

interface GalleryImage {
  id: string;
  url: string;
  caption: string | null;
  uploadedAt: string;
}

interface ImageGalleryProps {
  communityId?: string;
  images?: Array<GalleryImage>;
  isAdmin?: boolean;
  onDelete?: (imageId: string) => void;
  refreshKey?: number;
}

export default function ImageGallery({ communityId, images: imagesProp, isAdmin, onDelete, refreshKey }: ImageGalleryProps) {
  const [fetchedImages, setFetchedImages] = useState<GalleryImage[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  // If images prop is provided, use it directly; otherwise use fetched data
  const images = imagesProp ?? fetchedImages;

  // Fetch images when communityId is provided and no images prop
  useEffect(() => {
    if (!communityId || imagesProp) return;

    let cancelled = false;

    async function fetchImages() {
      try {
        setLoading(true);
        setError(null);
        const res = await fetch(`/api/community/${communityId}`);
        if (!res.ok) {
          throw new Error(`Failed to fetch images: ${res.status}`);
        }
        const data = await res.json();
        if (!cancelled) {
          setFetchedImages(data.images ?? []);
        }
      } catch {
        if (!cancelled) {
          setError('图片加载失败');
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    fetchImages();
    return () => { cancelled = true; };
  }, [communityId, imagesProp, refreshKey]);

  const isOpen = lightboxIndex !== null;

  const openLightbox = (index: number) => {
    setLightboxIndex(index);
  };

  const closeLightbox = useCallback(() => {
    setLightboxIndex(null);
  }, []);

  const goToPrev = useCallback(() => {
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      return prev === 0 ? images.length - 1 : prev - 1;
    });
  }, [images.length]);

  const goToNext = useCallback(() => {
    setLightboxIndex((prev) => {
      if (prev === null) return null;
      return prev === images.length - 1 ? 0 : prev + 1;
    });
  }, [images.length]);

  // Keyboard navigation
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      switch (e.key) {
        case 'Escape':
          closeLightbox();
          break;
        case 'ArrowLeft':
          goToPrev();
          break;
        case 'ArrowRight':
          goToNext();
          break;
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, closeLightbox, goToPrev, goToNext]);

  // Lock body scroll when lightbox is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Scroll to the correct item when lightbox opens or index changes
  useEffect(() => {
    if (lightboxIndex !== null && scrollContainerRef.current) {
      const container = scrollContainerRef.current;
      const children = container.children;
      if (children[lightboxIndex]) {
        children[lightboxIndex].scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'center',
        });
      }
    }
  }, [lightboxIndex]);

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget || e.target === scrollContainerRef.current) {
      closeLightbox();
    }
  };

  const handleDelete = async (e: React.MouseEvent, imageId: string) => {
    e.stopPropagation();

    // If we manage our own data (communityId mode), handle deletion internally
    if (communityId && !onDelete) {
      const adminKey = sessionStorage.getItem('office-map-admin-key');
      if (!adminKey) return;

      // Optimistic delete
      const previousImages = images;
      setFetchedImages(prev => prev.filter(img => img.id !== imageId));

      try {
        const res = await fetch(`/api/images?id=${imageId}`, {
          method: 'DELETE',
          headers: { 'x-admin-key': adminKey },
        });
        if (!res.ok) {
          throw new Error(`Delete failed: ${res.status}`);
        }
      } catch {
        // Rollback
        setFetchedImages(previousImages);
      }
      return;
    }

    onDelete?.(imageId);
  };

  // Loading state
  if (loading) {
    return <div className={styles.emptyState}>图片加载中...</div>;
  }

  // Error state
  if (error) {
    return <div className={styles.emptyState}>{error}</div>;
  }

  // Empty state
  if (images.length === 0) {
    return <div className={styles.emptyState}>暂无图片</div>;
  }

  return (
    <>
      {/* Thumbnail Grid */}
      <div className={styles.grid}>
        {images.map((image, index) => (
          <div
            key={image.id}
            className={styles.thumbnail}
            onClick={() => openLightbox(index)}
          >
            <img src={image.url} alt={image.caption || '小区图片'} loading="lazy" />
            {image.caption && (
              <div className={styles.caption}>{image.caption}</div>
            )}
            {isAdmin && (onDelete || communityId) && (
              <button
                className={styles.deleteBtn}
                onClick={(e) => handleDelete(e, image.id)}
                aria-label="删除图片"
              >
                &times;
              </button>
            )}
          </div>
        ))}
      </div>

      {/* Lightbox */}
      {isOpen && lightboxIndex !== null && (
        <div className={styles.lightbox} onClick={handleOverlayClick}>
          <button
            className={styles.lightboxClose}
            onClick={closeLightbox}
            aria-label="关闭"
          >
            &times;
          </button>

          <button
            className={`${styles.lightboxNav} ${styles.navPrev}`}
            onClick={(e) => {
              e.stopPropagation();
              goToPrev();
            }}
            aria-label="上一张"
          >
            &#8249;
          </button>

          <button
            className={`${styles.lightboxNav} ${styles.navNext}`}
            onClick={(e) => {
              e.stopPropagation();
              goToNext();
            }}
            aria-label="下一张"
          >
            &#8250;
          </button>

          <div className={styles.lightboxScrollContainer} ref={scrollContainerRef}>
            {images.map((image, index) => (
              <div
                key={image.id}
                className={styles.scrollItem}
                onClick={(e) => {
                  if (e.target === e.currentTarget) {
                    closeLightbox();
                  }
                }}
              >
                <img
                  className={styles.lightboxImage}
                  src={image.url}
                  alt={image.caption || '小区图片'}
                />
                {image.caption && (
                  <div className={styles.lightboxCaption}>{image.caption}</div>
                )}
              </div>
            ))}
          </div>

          <div className={styles.lightboxCounter}>
            {lightboxIndex + 1} / {images.length}
          </div>
        </div>
      )}
    </>
  );
}
