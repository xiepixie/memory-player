import { useAppStore } from '../store/appStore';
import { ReviewMode } from './modes/ReviewMode';
import { ClozeMode } from './modes/ClozeMode';
import { BlurMode } from './modes/BlurMode';
import { EditMode } from './modes/EditMode';
import { GradingBar } from './GradingBar';
import { SessionSummary } from './SessionSummary';
import { Eye, MessageSquare, Flashlight, Edit, ArrowLeft } from 'lucide-react';
import { motion } from 'framer-motion';

export const NoteRenderer = () => {
  const { viewMode, setViewMode, sessionStats, sessionTotal, closeNote, currentFilepath } = useAppStore();

  if (viewMode === 'summary') {
      return <SessionSummary />;
  }

  const renderContent = () => {
      switch (viewMode) {
          case 'review': return <ReviewMode />;
          case 'test': return <ClozeMode />;
          case 'master': return <BlurMode />;
          case 'edit': return <EditMode />;
          default: return <ReviewMode />;
      }
  };

  const progressPercentage = sessionTotal > 0
    ? Math.round(((sessionStats.reviewedCount + 1) / sessionTotal) * 100)
    : 0;

  const noteName = currentFilepath?.split('/').pop() || 'Untitled';

  return (
    <div className="h-full flex flex-col bg-base-100 relative">
        {/* Session HUD Progress Bar */}
        {sessionTotal > 0 && (
             <div className="absolute top-0 left-0 right-0 h-1 z-50">
                 <div
                    className="h-full bg-secondary transition-all duration-300 ease-out"
                    style={{ width: `${progressPercentage}%` }}
                 />
             </div>
        )}

        {/* Unified Header */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-base-200 bg-base-100/80 backdrop-blur z-40">
            <div className="flex items-center gap-3 flex-1">
                <motion.button
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.9 }}
                    className="btn btn-circle btn-ghost btn-sm"
                    onClick={closeNote}
                    title="Back to Library"
                >
                    <ArrowLeft size={18} />
                </motion.button>

                <div className="flex flex-col">
                    <span className="font-bold text-sm truncate max-w-[200px]">{noteName}</span>
                    {sessionTotal > 0 && (
                        <span className="text-[10px] opacity-50 font-mono">
                            {sessionStats.reviewedCount + 1} of {sessionTotal}
                        </span>
                    )}
                </div>
            </div>

            <div className="join">
                <button
                    className={`join-item btn btn-sm ${viewMode === 'review' ? 'btn-active btn-primary' : 'btn-ghost'}`}
                    onClick={() => setViewMode('review')}
                    title="Review (Read)"
                >
                    <Eye size={16} />
                </button>
                <button
                    className={`join-item btn btn-sm ${viewMode === 'test' ? 'btn-active btn-secondary' : 'btn-ghost'}`}
                    onClick={() => setViewMode('test')}
                    title="Test (Cloze)"
                >
                    <MessageSquare size={16} />
                </button>
                <button
                    className={`join-item btn btn-sm ${viewMode === 'master' ? 'btn-active btn-accent' : 'btn-ghost'}`}
                    onClick={() => setViewMode('master')}
                    title="Master (Blur)"
                >
                    <Flashlight size={16} />
                </button>
                <button
                    className={`join-item btn btn-sm ${viewMode === 'edit' ? 'btn-active' : 'btn-ghost'}`}
                    onClick={() => setViewMode('edit')}
                    title="Edit (Source)"
                >
                    <Edit size={16} />
                </button>
            </div>

            <div className="flex-1 flex justify-end">
                {/* Space for future actions like 'Info' or 'Settings' */}
            </div>
        </div>

        <div className="flex-1 overflow-y-auto pb-32">
            {renderContent()}
        </div>

        {/* Grading Bar */}
        <div className="absolute bottom-8 left-0 right-0 flex justify-center z-50 pointer-events-none">
             <div className="pointer-events-auto">
                <GradingBar />
             </div>
        </div>
    </div>
  );
};
