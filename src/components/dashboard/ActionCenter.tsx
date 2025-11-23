import { useState, useMemo } from 'react';
import { useAppStore } from '../../store/appStore';
import { useShallow } from 'zustand/react/shallow';
import {
    Play, Zap, Activity, CheckCircle, Flame, Target,
    Brain, GraduationCap, Layers, Clock
} from 'lucide-react';
import { motion } from 'framer-motion';
import { QueueItem } from '../../lib/storage/types';
import { CardHeader } from './Shared';

const containerVariants = {
    hidden: { opacity: 0 },
    visible: {
        opacity: 1,
        transition: { staggerChildren: 0.1 }
    }
};

const itemVariants = {
    hidden: { opacity: 0, y: 20 },
    visible: { 
        opacity: 1, 
        y: 0,
        transition: { type: "spring" as const, stiffness: 300, damping: 24 }
    }
};

export const ActionCenter = ({
    dueItems,
    newItems,
    overdueItems,
    sessionInProgress,
    onResume,
    onStart,
    streak
}: {
    dueItems: QueueItem[],
    newItems: QueueItem[],
    overdueItems: QueueItem[],
    sessionInProgress: boolean,
    onResume: () => void,
    onStart: (items: QueueItem[], mode: 'all' | 'today' | 'new') => void,
    streak: number
}) => {
    const { queue, sessionIndex, reviewHistory } = useAppStore(
        useShallow((state) => ({
            queue: state.queue,
            sessionIndex: state.sessionIndex,
            reviewHistory: state.reviewHistory,
        })),
    );
    const [sessionSize, setSessionSize] = useState(20);

    const passRate = useMemo(() => {
        const totalReviews = reviewHistory.length;
        const passedReviews = reviewHistory.filter(log => log.rating >= 3).length;
        return totalReviews > 0 ? (passedReviews / totalReviews) * 100 : 0;
    }, [reviewHistory]);

    // Determine the "Hero" action based on user state
    const primaryAction = useMemo(() => {
        if (dueItems.length > 0) return 'review';
        if (newItems.length > 0) return 'learn';
        return 'chill';
    }, [dueItems.length, newItems.length]);

    // Calculate estimated time (assuming 10s per card)
    const estReviewTime = Math.ceil(Math.min(dueItems.length, sessionSize) * 10 / 60);
    const estLearnTime = Math.ceil(Math.min(newItems.length, sessionSize) * 30 / 60); // New cards take longer

    if (sessionInProgress) {
        const progress = queue.length > 0 ? (sessionIndex / queue.length) * 100 : 0;

        return (
            <motion.div
                key="session-active"
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card bg-gradient-to-r from-primary/10 via-base-100 to-base-100 shadow-xl border-l-4 border-primary overflow-hidden relative"
            >
                <div className="absolute top-0 right-0 p-4 opacity-5">
                    <Zap size={120} />
                </div>
                <div className="card-body relative z-10">
                    <div className="flex justify-between items-start mb-2">
                        <div>
                            <div className="badge badge-primary badge-outline mb-2 gap-1 font-bold">
                                <Activity size={12} /> Session Active
                            </div>
                            <h2 className="card-title text-2xl mb-1">Focus Mode Engaged</h2>
                            <p className="text-base-content/60 text-sm">You are locked in. Keep the momentum going!</p>
                        </div>
                        <div className="text-right">
                            <div className="text-4xl font-black text-primary font-mono">{sessionIndex} <span className="text-lg text-base-content/30">/ {queue.length}</span></div>
                        </div>
                    </div>

                    <div className="w-full bg-base-200/50 rounded-full h-3 mb-6 overflow-hidden border border-base-200/50">
                        <motion.div
                            className="bg-primary h-full rounded-full shadow-[0_0_15px_rgba(var(--p),0.6)]"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ type: "spring", stiffness: 50, damping: 20 }}
                        />
                    </div>

                    <div className="flex gap-3">
                        <button onClick={onResume} className="btn btn-primary btn-lg flex-1 gap-3 shadow-lg shadow-primary/20 group border-0 bg-gradient-to-r from-primary to-primary/80">
                            <Play size={20} className="group-hover:scale-110 transition-transform fill-current" />
                            Resume Session
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    if (primaryAction === 'chill' && overdueItems.length === 0) {
        return (
            <motion.div
                key="chill-mode"
                initial={{ scale: 0.95, opacity: 0, y: 10 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                transition={{ type: "spring", duration: 0.6 }}
                className="card bg-gradient-to-br from-success/5 via-base-100 to-base-100 border border-success/10 shadow-lg relative overflow-hidden"
            >
                <div className="absolute -right-10 -top-10 text-success/5 rotate-12">
                    <CheckCircle size={300} />
                </div>
                <div className="card-body items-center text-center py-12 relative z-10">
                    <motion.div
                        initial={{ scale: 0 }} animate={{ scale: 1 }}
                        transition={{ type: "spring", duration: 0.6, delay: 0.2 }}
                        className="w-20 h-20 bg-gradient-to-br from-success/20 to-success/5 rounded-full flex items-center justify-center mb-6 text-success ring-4 ring-success/10"
                    >
                        <CheckCircle size={40} className="drop-shadow-md" />
                    </motion.div>
                    <h2 className="text-3xl font-bold text-base-content mb-2">All Caught Up!</h2>
                    <p className="text-base-content/60 max-w-md mx-auto text-lg mb-6">
                        You've completed all your reviews for now. Excellent work maintaining your knowledge base.
                    </p>

                    <div className="flex gap-4">
                        {streak > 0 && (
                            <div className="badge badge-lg badge-ghost gap-2 p-4 text-warning bg-warning/10 border-warning/20">
                                <Flame size={16} className="fill-current" /> {streak} Day Streak
                            </div>
                        )}
                        <div className="badge badge-lg badge-ghost gap-2 p-4 text-success bg-success/10 border-success/20">
                            <Target size={16} /> {passRate.toFixed(0)}% Accuracy
                        </div>
                    </div>
                </div>
            </motion.div>
        );
    }

    return (
        <motion.div 
            key="action-grid"
            variants={containerVariants}
            initial="hidden"
            animate="visible"
            className="grid grid-cols-1 lg:grid-cols-3 gap-6"
        >
            {/* Main Action Card - Takes 2/3 width */}
            <motion.div variants={itemVariants} className="card bg-base-100 shadow-xl border border-base-200 col-span-1 lg:col-span-2 relative overflow-hidden group">
                {/* Background decoration */}
                <div className="absolute top-0 right-0 w-80 h-80 bg-gradient-to-bl from-primary/5 via-primary/2 to-transparent rounded-bl-[100px] -mr-10 -mt-10 transition-all group-hover:scale-105 duration-700" />

                <div className="card-body relative z-10 p-6 sm:p-8">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-8">
                        <div>
                            <h2 className="text-3xl font-bold flex items-center gap-3">
                                {primaryAction === 'review' ? (
                                    <span className="flex items-center gap-3">
                                        <Brain className="text-primary fill-primary/20" size={32} />
                                        <span>Ready to Review</span>
                                    </span>
                                ) : (
                                    <span className="flex items-center gap-3">
                                        <GraduationCap className="text-info fill-info/20" size={32} />
                                        <span>Time to Learn</span>
                                    </span>
                                )}
                            </h2>
                            <p className="text-base-content/60 mt-2 text-lg max-w-md leading-relaxed">
                                {primaryAction === 'review'
                                    ? `You have ${dueItems.length} cards waiting. Consistency is key to long-term retention.`
                                    : `No reviews due. Perfect time to introduce ${newItems.length} new concepts to your brain.`}
                            </p>
                        </div>

                        <div className="flex items-center gap-2 bg-base-200/50 p-1.5 rounded-xl backdrop-blur-sm border border-base-200">
                            <span className="text-[10px] font-bold px-2 opacity-40 uppercase tracking-wider">Batch Size</span>
                            <div className="join">
                                {[10, 20, 50].map(size => (
                                    <button
                                        key={size}
                                        onClick={() => setSessionSize(size)}
                                        className={`btn btn-xs sm:btn-sm join-item px-4 ${sessionSize === size ? 'btn-primary' : 'btn-ghost hover:bg-base-300'}`}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {/* Primary Smart Button */}
                        <button
                            onClick={() => onStart(dueItems.slice(0, sessionSize), 'all')}
                            className={`btn h-auto py-5 flex-col items-start gap-3 border-2 text-left relative overflow-hidden transition-all duration-200 group/btn
                                ${primaryAction === 'review'
                                    ? 'btn-primary text-primary-content border-primary shadow-lg shadow-primary/20 hover:-translate-y-1'
                                    : 'btn-outline border-base-300 hover:border-primary hover:bg-base-100 hover:shadow-md'}`}
                            disabled={dueItems.length === 0}
                        >
                            <div className="flex w-full justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <Layers size={20} />
                                    <span className="font-bold text-lg">Smart Review</span>
                                </div>
                                {primaryAction === 'review' && (
                                    <span className="badge badge-sm bg-primary-content/10 border-0 text-primary-content">
                                        Recommended
                                    </span>
                                )}
                            </div>

                            <div className="w-full space-y-3 mt-1">
                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col">
                                        <span className="text-3xl font-black leading-none">
                                            {Math.min(dueItems.length, sessionSize)}
                                        </span>
                                        <span className="text-xs font-medium opacity-70 mt-1">Cards</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs font-medium opacity-80 bg-primary-content/10 text-primary-content px-2 py-1 rounded">
                                        <Clock size={12} /> ~{estReviewTime} min
                                    </div>
                                </div>

                                {/* Mini bar chart for composition */}
                                <div className="flex h-1.5 w-full bg-base-100/20 rounded-full overflow-hidden">
                                    <div
                                        className="bg-error h-full"
                                        style={{ width: `${dueItems.length > 0 ? (overdueItems.length / dueItems.length) * 100 : 0}%` }}
                                    />
                                    <div
                                        className="bg-success h-full"
                                        style={{ width: `${dueItems.length > 0 ? 100 - (overdueItems.length / dueItems.length) * 100 : 100}%` }}
                                    />
                                </div>
                                <div className="flex justify-between text-[10px] font-medium opacity-70">
                                    <span>{overdueItems.length} Overdue</span>
                                    <span>{dueItems.length - overdueItems.length} Due</span>
                                </div>
                            </div>
                        </button>

                        {/* Learn New Button */}
                        <button
                            onClick={() => onStart(newItems.slice(0, sessionSize), 'new')}
                            className={`btn h-auto py-5 flex-col items-start gap-3 border-2 text-left transition-all duration-200 group/btn
                                ${primaryAction === 'learn'
                                    ? 'btn-info text-info-content border-info shadow-lg shadow-info/20 hover:-translate-y-1'
                                    : 'btn-outline border-base-300 hover:border-info hover:bg-info/5 hover:shadow-md'}`}
                            disabled={newItems.length === 0}
                        >
                            <div className="flex w-full justify-between items-center">
                                <div className="flex items-center gap-2">
                                    <GraduationCap size={20} />
                                    <span className="font-bold text-lg">Learn New</span>
                                </div>
                                {primaryAction === 'learn' && (
                                    <span className="badge badge-sm bg-info-content/10 border-0 text-info-content">
                                        Recommended
                                    </span>
                                )}
                            </div>

                            <div className="w-full space-y-3 mt-1">
                                <div className="flex justify-between items-end">
                                    <div className="flex flex-col">
                                        <span className="text-3xl font-black leading-none">
                                            {Math.min(newItems.length, sessionSize)}
                                        </span>
                                        <span className="text-xs font-medium opacity-70 mt-1">New Concepts</span>
                                    </div>
                                    <div className="flex items-center gap-1 text-xs font-medium opacity-80 bg-info-content/10 text-info-content px-2 py-1 rounded">
                                        <Clock size={12} /> ~{estLearnTime} min
                                    </div>
                                </div>

                                <div className="w-full h-1.5 bg-base-100/20 rounded-full overflow-hidden">
                                    <div className="bg-info-content/80 h-full w-full" />
                                </div>
                                <div className="text-[10px] font-medium opacity-70">
                                    Expand your knowledge graph
                                </div>
                            </div>
                        </button>
                    </div>
                </div>
            </motion.div>

            {/* Side Stats Card */}
            <motion.div variants={itemVariants} className="card bg-base-100 shadow-xl border border-base-200 flex flex-col relative overflow-hidden">
                <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMCwwLDAsMC4wNSkiLz48L3N2Zz4=')] opacity-50" />

                <div className="card-body p-6 flex-1 z-10">
                    <CardHeader
                        icon={Flame}
                        title="Momentum"
                        color="text-warning"
                    />

                    <div className="flex-1 flex flex-col items-center justify-center py-2">
                        <div className="relative group cursor-default">
                            <div className={`w-28 h-28 rounded-full flex items-center justify-center mb-3 transition-all duration-500
                                ${streak > 0
                                    ? 'bg-gradient-to-tr from-warning/20 to-orange-500/10 text-warning ring-4 ring-warning/20 shadow-[0_0_30px_rgba(250,187,21,0.2)]'
                                    : 'bg-base-200 text-base-content/20'}`}
                            >
                                <Flame size={48} className={`${streak > 0 ? 'animate-pulse fill-warning' : 'fill-none'}`} />
                            </div>
                            {streak > 2 && (
                                <motion.div
                                    initial={{ scale: 0 }} animate={{ scale: 1 }}
                                    className="absolute -top-2 -right-2 badge badge-error text-white font-bold border-2 border-base-100 shadow-sm"
                                >
                                    HOT
                                </motion.div>
                            )}
                        </div>
                        <div className="text-center">
                            <div className="text-5xl font-black text-base-content tracking-tight">{streak}</div>
                            <div className="text-xs opacity-50 font-bold uppercase tracking-widest mt-1">Day Streak</div>
                        </div>
                    </div>

                    <div className="divider my-2 opacity-50"></div>

                    <div className="space-y-3">
                        <div>
                            <div className="flex justify-between text-xs mb-1.5">
                                <span className="opacity-60 font-medium">Today's Accuracy</span>
                                <span className="font-bold text-success">{passRate.toFixed(0)}%</span>
                            </div>
                            <div className="w-full bg-base-200 rounded-full h-2 overflow-hidden">
                                <motion.div
                                    initial={{ width: 0 }}
                                    animate={{ width: `${passRate}%` }}
                                    className="bg-success h-full rounded-full"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </motion.div>
        </motion.div>
    );
};
