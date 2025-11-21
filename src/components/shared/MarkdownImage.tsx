import { convertFileSrc } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/appStore';
import { join } from '@tauri-apps/api/path';
import { useState, useEffect } from 'react';

// Custom Image Renderer for ReactMarkdown
// It handles relative paths by resolving them against the current root path or note path.
// Note: ReactMarkdown passes `src` as a prop.

export const MarkdownImage = ({ src, alt, title }: React.ImgHTMLAttributes<HTMLImageElement>) => {
  const { rootPath } = useAppStore();
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(undefined);

  useEffect(() => {
    const resolve = async () => {
      if (!src) return;

      if (src.startsWith('http')) {
        setResolvedSrc(src);
        return;
      }

      // Handle local paths
      try {
        if (rootPath) {
             const joined = await join(rootPath, src);
             const assetUrl = convertFileSrc(joined);
             setResolvedSrc(assetUrl);
        }
      } catch (e) {
        console.error("Failed to resolve image path", e);
        setResolvedSrc(src); // Fallback
      }
    };

    resolve();
  }, [src, rootPath]);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      title={title}
      className="max-w-full rounded-lg shadow-md my-4 mx-auto"
      loading="lazy"
    />
  );
};
