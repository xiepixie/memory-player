import { useAppStore } from '../store/appStore';
import { motion } from 'framer-motion';
import { useCallback, useEffect, useState } from 'react';

interface GradeOption {
  label: string;
  rating: 1 | 2 | 3 | 4;
  key: string;
  colorClass: string;
  tooltip: string;
}

const gradeOptions: GradeOption[] = [
  { label: 'Again', rating: 1, key: '1', colorClass: 'text-error hover:bg-error/10', tooltip: 'Forgot completely' },
  { label: 'Hard', rating: 2, key: '2', colorClass: 'text-warning hover:bg-warning/10', tooltip: 'Remembered with effort' },
  { label: 'Good', rating: 3, key: '3', colorClass: 'text-info hover:bg-info/10', tooltip: 'Correct response' },
  { label: 'Easy', rating: 4, key: '4', colorClass: 'text-success hover:bg-success/10', tooltip: 'Perfect recall' },
];

export const GradingBar = () => {
  const saveReview = useAppStore(state => state.saveReview);
  const currentMetadata = useAppStore(state => state.currentMetadata);
  const isGrading = useAppStore(state => state.isGrading);
  const getSchedulingPreview = useAppStore(state => state.getSchedulingPreview);
  
  // Local state to store the preview intervals
  const [previews, setPreviews] = useState<Record<number, { interval: string }>>({});

  // Load previews whenever the card changes
  useEffect(() => {
    if (currentMetadata) {
      setPreviews(getSchedulingPreview());
    }
  }, [currentMetadata, getSchedulingPreview]);

  const handleRate = useCallback(async (rating: number) => {
    if (isGrading) return;
    await saveReview(rating);
  }, [saveReview, isGrading]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (isGrading || !currentMetadata) return;
      
      // Only handle 1-4 keys if no modifier keys are pressed (to avoid conflicts)
      if (e.ctrlKey || e.altKey || e.metaKey || e.shiftKey) return;

      switch (e.key) {
        case '1': handleRate(1); break;
        case '2': handleRate(2); break;
        case '3': handleRate(3); break;
        case '4': handleRate(4); break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleRate, isGrading, currentMetadata]);

  if (!currentMetadata) return null;

  return (
    <div className="fixed bottom-8 left-0 right-0 flex justify-center z-50 pointer-events-none">
      <motion.div
        initial={{ y: 50, opacity: 0, scale: 0.95 }}
        animate={{ y: 0, opacity: 1, scale: 1 }}
        className="pointer-events-auto"
      >
        {/* Glassmorphism Capsule */}
        <div className="flex items-center p-1.5 gap-1 bg-base-100/90 backdrop-blur-md border border-base-200 shadow-2xl rounded-full">
            {gradeOptions.map((opt) => {
                const preview = previews[opt.rating];
                
                return (
                    <button
                        key={opt.rating}
                        onClick={() => handleRate(opt.rating)}
                        disabled={isGrading}
                        className={`
                            relative group flex flex-col items-center justify-center
                            w-24 h-14 rounded-2xl transition-all duration-200
                            disabled:opacity-50 disabled:cursor-not-allowed
                            ${opt.colorClass}
                            ${isGrading ? '' : 'hover:scale-105 active:scale-95'}
                        `}
                        title={`${opt.tooltip} (Press ${opt.key})`}
                    >
                        {/* Rating Label */}
                        <span className="font-bold text-sm uppercase tracking-wider">
                            {opt.label}
                        </span>

                        {/* Interval Preview */}
                        <span className="text-xs opacity-60 font-mono mt-0.5">
                            {preview ? preview.interval : '-'}
                        </span>

                        {/* Key Hint (Top Right) */}
                        <div className="absolute top-1 right-1 w-4 h-4 rounded-full bg-base-200/50 text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                            {opt.key}
                        </div>
                        
                        {/* Loading State Override */}
                        {isGrading && (
                             <div className="absolute inset-0 flex items-center justify-center bg-base-100/50 rounded-2xl">
                                <span className="loading loading-spinner loading-xs"></span>
                             </div>
                        )}
                    </button>
                );
            })}
        </div>
      </motion.div>
    </div>
  );
};
