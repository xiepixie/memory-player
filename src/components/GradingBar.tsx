import { useAppStore, isDemoMode } from '../store/appStore';
import { useCallback, useEffect, useMemo } from 'react';
import { FlaskConical } from 'lucide-react';

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
  const isDemo = useAppStore(state => isDemoMode({ rootPath: state.rootPath, currentFilepath: state.currentFilepath }));
  // ZUSTAND: Use primitive selector for queue.length to avoid re-renders when queue items change
  const queueLength = useAppStore(state => state.queue.length);
  const sessionIndex = useAppStore(state => state.sessionIndex);
  const sessionStats = useAppStore(state => state.sessionStats);
  
  // Check if we're in an active session
  const isInSession = sessionStats.timeStarted > 0 && queueLength > 0;
  
  // Compute previews synchronously to avoid stale data after grading
  // Dependencies: currentMetadata changes when card changes or after grading
  const previews = useMemo(() => {
    if (!currentMetadata) return {};
    return getSchedulingPreview();
  }, [currentMetadata, getSchedulingPreview]);

  const handleRate = useCallback(async (rating: number) => {
    // Prevent double-clicks and ensure clean state
    if (isGrading) return;
    
    // saveReview now awaits loadNote internally, so this provides
    // smooth transition with isGrading=true the whole time
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
      <div
        className="pointer-events-auto animate-in slide-in-from-bottom-4 fade-in duration-300"
      >
        {/* Demo Mode Hint */}
        {isDemo && (
          <div className="flex items-center justify-center gap-1.5 mb-2 text-xs text-warning">
            <FlaskConical size={12} />
            <span>Demo Mode - Progress won't be saved</span>
          </div>
        )}
        
        {/* Session Progress Indicator */}
        {isInSession && (
          <div className="flex items-center justify-center gap-2 mb-2 text-xs text-base-content/60">
            <span className="font-mono font-bold text-base-content">
              {sessionIndex + 1}
              <span className="opacity-40"> / {queueLength}</span>
            </span>
            <div className="w-24 h-1.5 bg-base-200 rounded-full overflow-hidden">
              <div 
                className="h-full bg-primary rounded-full transition-all duration-300"
                style={{ width: `${((sessionIndex + 1) / queueLength) * 100}%` }}
              />
            </div>
          </div>
        )}
        
        {/* Glassmorphism Capsule */}
        <div className={`relative flex items-center p-1.5 gap-1 bg-base-100/90 backdrop-blur-md border border-base-200 shadow-2xl rounded-full transition-opacity duration-150 ${isGrading ? 'opacity-70' : ''}`}>
            {gradeOptions.map((opt) => {
                const preview = previews[opt.rating];
                
                return (
                        <button
                            key={opt.rating}
                            onClick={() => handleRate(opt.rating)}
                            disabled={isGrading}
                            className={`
                                relative group flex flex-col items-center justify-center
                                w-24 h-14 rounded-2xl transition-all duration-100
                                disabled:cursor-wait
                                hover:scale-105 active:scale-90
                                ${isGrading ? 'opacity-60' : ''}
                                ${opt.colorClass}
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
                    </button>
                );
            })}
            
            {/* Central Loading Indicator - shows during card transition */}
            {isGrading && (
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-6 h-6 rounded-full bg-base-100/80 backdrop-blur flex items-center justify-center shadow-lg">
                  <span className="loading loading-spinner loading-xs text-primary"></span>
                </div>
              </div>
            )}
        </div>
      </div>
    </div>
  );
};
