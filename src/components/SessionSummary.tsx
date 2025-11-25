import { useAppStore } from '../store/appStore';
import { CheckCircle, Home } from 'lucide-react';
import { fireConfetti } from '../lib/confettiService';
import { useEffect, useState } from 'react';

export const SessionSummary = () => {
    const sessionStats = useAppStore((state) => state.sessionStats);
    const setViewMode = useAppStore((state) => state.setViewMode);
    const setQueue = useAppStore((state) => state.setQueue);
    const [isVisible, setIsVisible] = useState(false);

    // PERFORMANCE: Trigger celebration confetti bursts using pre-initialized service
    // Staggered bursts provide celebration effect without blocking UI
    useEffect(() => {
        // Trigger initial visibility for CSS animations
        requestAnimationFrame(() => setIsVisible(true));

        // Fire celebration confetti bursts
        const burstTimes = [0, 300, 600, 900, 1200];
        const timeouts = burstTimes.map((delay, i) => 
            setTimeout(() => {
                fireConfetti({
                    particleCount: 40 - i * 5, // Decreasing particles
                    spread: 70 + i * 10,
                    origin: { x: i % 2 === 0 ? 0.3 : 0.7, y: 0.4 }
                });
            }, delay)
        );

        return () => timeouts.forEach(clearTimeout);
    }, []);

    const now = Date.now();
    const hasValidStart = sessionStats.timeStarted > 0 && sessionStats.timeStarted <= now;
    const totalSeconds = hasValidStart
        ? Math.floor((now - sessionStats.timeStarted) / 1000)
        : 0;
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;

    // PERFORMANCE: Using CSS animations instead of Framer Motion
    // Framer Motion's layout system causes expensive recalculations in Tauri WebView
    return (
        <div className="h-full w-full flex flex-col items-center justify-center bg-base-100 p-8 relative overflow-hidden">
            {/* Subtle background glow */}
            <div className="absolute inset-0 bg-gradient-to-b from-base-200/20 to-base-100 z-0" />
            
            <div
                className={`text-center max-w-lg w-full z-10 flex flex-col items-center transition-all duration-500 ease-out ${
                    isVisible ? 'opacity-100 scale-100 translate-y-0' : 'opacity-0 scale-95 translate-y-5'
                }`}
            >
                <div 
                    className={`flex justify-center mb-8 text-success bg-success/10 p-6 rounded-full ring-1 ring-success/20 transition-transform duration-300 delay-200 ${
                        isVisible ? 'scale-100' : 'scale-0'
                    }`}
                >
                    <CheckCircle size={64} strokeWidth={1.5} />
                </div>

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

                {/* Ratings Breakdown - CSS animations for bar heights */}
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
                                <div
                                    style={{ 
                                        height: isVisible ? `${Math.max(height, 2)}%` : '0%',
                                        transitionDelay: `${400 + rating * 100}ms`
                                    }}
                                    className={`w-full max-w-[60px] rounded-t-lg opacity-80 ${colors[rating]} shadow-sm transition-all duration-700 ease-out`}
                                />
                                <div className="text-[10px] uppercase tracking-wider font-bold opacity-40">{labels[rating]}</div>
                            </div>
                        );
                    })}
                </div>

                <button
                    className="btn btn-primary btn-lg w-full rounded-full shadow-lg hover:shadow-xl transition-all gap-3"
                    onClick={() => {
                        // Clear the queue to reset session state, so ActionCenter shows fresh start options
                        setQueue([]);
                        setViewMode('library');
                    }}
                >
                    <Home size={20} />
                    Back to Library
                </button>
            </div>
        </div>
    );
};
