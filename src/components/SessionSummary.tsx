import { useAppStore } from '../store/appStore';
import { motion } from 'framer-motion';
import { CheckCircle, Home } from 'lucide-react';
import confetti from 'canvas-confetti';
import { useEffect } from 'react';

export const SessionSummary = () => {
    const { sessionStats, setViewMode } = useAppStore();

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

    const totalSeconds = Math.floor((Date.now() - sessionStats.timeStarted) / 1000);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    return (
        <div className="h-full flex flex-col items-center justify-center bg-base-100 p-8">
            <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="text-center max-w-lg w-full"
            >
                <div className="flex justify-center mb-6 text-success">
                    <CheckCircle size={80} strokeWidth={1} />
                </div>

                <h1 className="text-4xl font-bold mb-2">Session Complete!</h1>
                <p className="opacity-60 mb-8">Great job keeping up with your knowledge.</p>

                <div className="stats shadow w-full mb-8 bg-base-200">
                    <div className="stat place-items-center">
                        <div className="stat-title">Reviewed</div>
                        <div className="stat-value text-primary">{sessionStats.reviewedCount}</div>
                        <div className="stat-desc">Cards</div>
                    </div>
                    <div className="stat place-items-center">
                        <div className="stat-title">Time</div>
                        <div className="stat-value text-secondary font-mono">
                            {minutes}:{seconds.toString().padStart(2, '0')}
                        </div>
                        <div className="stat-desc">Duration</div>
                    </div>
                </div>

                {/* Ratings Breakdown */}
                <div className="flex justify-center gap-2 mb-10 h-32 items-end">
                    {[1, 2, 3, 4].map(rating => {
                        const count = sessionStats.ratings[rating] || 0;
                        const height = sessionStats.reviewedCount > 0
                             ? (count / sessionStats.reviewedCount) * 100
                             : 0;
                        const colors: any = { 1: 'bg-error', 2: 'bg-warning', 3: 'bg-info', 4: 'bg-success' };
                        const labels: any = { 1: 'Again', 2: 'Hard', 3: 'Good', 4: 'Easy' };

                        return (
                            <div key={rating} className="flex flex-col items-center gap-1 w-16">
                                <div className="text-xs font-bold">{count}</div>
                                <motion.div
                                    initial={{ height: 0 }}
                                    animate={{ height: `${Math.max(height, 5)}%` }}
                                    className={`w-full rounded-t-md opacity-80 ${colors[rating]}`}
                                />
                                <div className="text-xs opacity-50">{labels[rating]}</div>
                            </div>
                        );
                    })}
                </div>

                <button
                    className="btn btn-primary btn-lg w-full"
                    onClick={() => setViewMode('library')}
                >
                    <Home size={20} />
                    Back to Library
                </button>
            </motion.div>
        </div>
    );
};
