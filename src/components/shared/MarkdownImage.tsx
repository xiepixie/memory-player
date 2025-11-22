import { convertFileSrc } from '@tauri-apps/api/core';
import { useAppStore } from '../../store/appStore';
import { join } from '@tauri-apps/api/path';
import { useState, useEffect } from 'react';

// Global cache to ensure images in different layers (e.g. BlurMode) resolve synchronously
// and prevent layout mismatches/shifts.
const imageCache = new Map<string, string>();

// Custom Image Renderer for ReactMarkdown
// It handles relative paths by resolving them against the current root path or note path.
// Note: ReactMarkdown passes `src` as a prop.

export const MarkdownImage = ({ src, alt, title }: React.ImgHTMLAttributes<HTMLImageElement>) => {
  const rootPath = useAppStore((state) => state.rootPath);
  // Initialize from cache if available to prevent flash/layout shift
  const [resolvedSrc, setResolvedSrc] = useState<string | undefined>(() => {
    if (!src) return undefined;
    if (src.startsWith('http')) return src;
    return imageCache.get(src);
  });

  useEffect(() => {
    const resolve = async () => {
      if (!src) return;

      // Return early if we already have it (from cache or state)
      if (resolvedSrc) return;

      if (src.startsWith('http')) {
        setResolvedSrc(src);
        return;
      }

      // Check cache again (in case another component resolved it while we were mounting)
      if (imageCache.has(src)) {
        setResolvedSrc(imageCache.get(src));
        return;
      }

      // Handle local paths
      try {
        if (rootPath) {
             const joined = await join(rootPath, src);
             const assetUrl = convertFileSrc(joined);
             
             // Update cache and state
             imageCache.set(src, assetUrl);
             setResolvedSrc(assetUrl);
        }
      } catch (e) {
        console.error("Failed to resolve image path", e);
        setResolvedSrc(src); // Fallback
      }
    };

    resolve();
  }, [src, rootPath, resolvedSrc]);

  return (
    <img
      src={resolvedSrc}
      alt={alt}
      title={title}
      className="max-w-full rounded-lg shadow-md my-4 mx-auto block"
      loading="eager" // Load eagerly to reduce layout shift in dual-layer modes
    />
  );
};
