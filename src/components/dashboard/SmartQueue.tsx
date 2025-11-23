import React, { useEffect, useState } from 'react';
import { useAppStore } from '../../store/appStore';
import { Play, Clock, CheckCircle, RefreshCw } from 'lucide-react';

export const SmartQueue: React.FC = () => {
    const [isLoading, setIsLoading] = useState(false);
    const { queue, fetchDueCards, startSession, sessionStats } = useAppStore();

    useEffect(() => {
        // Initial fetch if queue is empty
        if (queue.length === 0) {
            handleRefresh();
        }
    }, []);

    const handleRefresh = async () => {
        setIsLoading(true);
        await fetchDueCards(50); // Default limit
        setIsLoading(false);
    };

    const handleStart = () => {
        startSession();
    };

    return (
        <div className="bg-base-100 rounded-2xl p-6 shadow-sm border border-base-200 flex flex-col gap-4">
            <div className="flex justify-between items-center">
                <h2 className="text-xl font-bold flex items-center gap-2">
                    <Clock className="w-5 h-5 text-primary" />
                    Today's Mission
                </h2>
                <button
                    onClick={handleRefresh}
                    className={`btn btn-ghost btn-sm btn-circle ${isLoading ? 'animate-spin' : ''}`}
                    title="Refresh Queue"
                >
                    <RefreshCw className="w-4 h-4" />
                </button>
            </div>

            <div className="stats shadow bg-base-200/50">
                <div className="stat place-items-center">
                    <div className="stat-title">Due Cards</div>
                    <div className="stat-value text-primary">{queue.length}</div>
                    <div className="stat-desc">Ready to review</div>
                </div>

                <div className="stat place-items-center">
                    <div className="stat-title">Reviewed</div>
                    <div className="stat-value text-secondary">{sessionStats.reviewedCount}</div>
                    <div className="stat-desc">This session</div>
                </div>
            </div>

            <div className="flex flex-col gap-2 mt-2">
                {queue.length > 0 ? (
                    <button
                        onClick={handleStart}
                        className="btn btn-primary w-full text-lg shadow-lg hover:shadow-xl transition-all transform hover:-translate-y-0.5"
                    >
                        <Play className="w-5 h-5 mr-2" />
                        Start Session
                    </button>
                ) : (
                    <div className="text-center py-4 text-base-content/60 flex flex-col items-center gap-2">
                        <CheckCircle className="w-12 h-12 text-success/50" />
                        <p>All caught up! Great job.</p>
                    </div>
                )}
            </div>
        </div>
    );
};
