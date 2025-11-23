import { useAppStore } from '../store/appStore';
import { motion } from 'framer-motion';
import { CheckCircle, Home } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useEffect } from 'react';

export const SessionSummary = () => {
    const sessionStats = useAppStore((state) => state.sessionStats);
    const setViewMode = useAppStore((state) => state.setViewMode);

    // Trigger big confetti on mount
    useEffect(() => {
        const duration = 3000;
        const animationEnd = Date.now() + duration;
        const defaults = { startVelocity: 30, spread: 360, ticks: 60, zIndex: 0 };

        const randomInRange = (min: number, max: number) => Math.random() * (max - min) + min;

        const interval: any = setInterval(function() {
          const timeLeft = animationEnd - Date.now();

          if (timeLeft <= 0) {
            return clearInterval(interval);
          }

          const particleCount = 50 * (timeLeft / duration);
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.1, 0.3), y: Math.random() - 0.2 } });
          confetti({ ...defaults, particleCount, origin: { x: randomInRange(0.7, 0.9), y: Math.random() - 0.2 } });
        }, 250);

        return () => clearInterval(interval);
    }, []);

    const now = Date.now();
    const hasValidStart = sessionStats.timeStarted > 0 && sessionStats.timeStarted <= now;
    const totalSeconds = hasValidStart
        ? Math.floor((now - sessionStats.timeStarted) / 1000)
        : 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-base-100 p-8 relative overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-base-200/20 to-base-100 z-0" />
            
            <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="text-center max-w-lg w-full z-10 flex flex-col items-center"
            >
                <motion.div 
                    initial={{ scale: 0 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: 0.2, type: "spring", stiffness: 200, damping: 15 }}
                    className="flex justify-center mb-8 text-success bg-success/10 p-6 rounded-full ring-1 ring-success/20"
                >
                    <CheckCircle size={64} strokeWidth={1.5} />
                </motion.div>

                <h1 className="text-4xl font-serif font-bold mb-3 tracking-tight">Session Complete</h1>
                <p className="text-base-content/60 mb-10 text-lg font-light">You've successfully reviewed your cards for now.</p>

                <div className="stats shadow-xl w-full mb-10 bg-base-100/50 backdrop-blur-md border border-base-content/5 overflow-hidden rounded-2xl">
                    <div className="stat place-items-center py-6">
                        <div className="stat-title text-xs font-bold uppercase tracking-widest opacity-50 mb-1">Reviewed</div>
                        <div className="stat-value text-primary text-3xl">{sessionStats.reviewedCount}</div>
                        <div className="stat-desc font-medium opacity-60">Cards</div>
                    </div>
                    <div className="stat place-items-center py-6 border-l border-base-content/5">
                        <div className="stat-title text-xs font-bold uppercase tracking-widest opacity-50 mb-1">Skipped</div>
                        <div className="stat-value text-warning text-3xl">{sessionStats.skippedCount || 0}</div>
                        <div className="stat-desc font-medium opacity-60">Cards</div>
                    </div>
                    <div className="stat place-items-center py-6 border-l border-base-content/5">
                        <div className="stat-title text-xs font-bold uppercase tracking-widest opacity-50 mb-1">Time</div>
                        <div className="stat-value text-secondary font-mono text-3xl">
                            {minutes}:{seconds.toString().padStart(2, '0')}
                        </div>
                        <div className="stat-desc font-medium opacity-60">Duration</div>
                    </div>
                </div>

                {/* Ratings Breakdown */}
                <div className="flex justify-center items-end gap-4 mb-12 h-32 w-full px-4">
                    {[1, 2, 3, 4].map(rating => {
                        const count = sessionStats.ratings[rating] || 0;
                        const height = sessionStats.reviewedCount > 0
                             ? (count / sessionStats.reviewedCount) * 100
                             : 0;
                        const colors: any = { 1: 'bg-error', 2: 'bg-warning', 3: 'bg-info', 4: 'bg-success' };
                        const labels: any = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

                        return (
                            <div key={rating} className="flex flex-col items-center gap-2 flex-1">
                                <div className="text-xs font-bold opacity-80">{count > 0 ? count : ''}</div>
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: `${Math.max(height, 2)}%` }}
                                    transition={{ delay: 0.4 + rating * 0.1, duration: 1, ease: "circOut" }}
                                    className={`w-full max-w-[60px] rounded-t-lg opacity-80 ${colors[rating]} shadow-sm`}
                                />
                                <div className="text-[10px] uppercase tracking-wider font-bold opacity-40">{labels[rating]}</div>
                            </div>
                        );
                    })}
                </div>

                <button
                    className="btn btn-primary btn-lg w-full rounded-full shadow-lg hover:shadow-xl transition-all gap-3"
                    onClick={() => setViewMode('library')}
                >
                    <Home size={20} />
                    Back to Library
                </button>
            </motion.div>
        </div>
    );
};
