import { useState, useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { Play, Calendar, Zap, AlertCircle, CheckCircle, Brain, Activity, TrendingUp, Folder, RefreshCw, Cloud, PieChart } from 'lucide-react';
import { motion } from 'framer-motion';
import { QueueItem } from '../lib/storage/types';
import { format, addDays, differenceInDays, subDays, startOfWeek, formatDistanceToNow } from 'date-fns';

// --- Components ---

/**
 * 1. Action Center: The primary interface for starting reviews
 */
const ActionCenter = ({ 
    dueItems, 
    newItems, 
    overdueItems, 
    sessionInProgress, 
    onResume, 
    onStart 
}: { 
    dueItems: QueueItem[], 
    newItems: QueueItem[], 
    overdueItems: QueueItem[],
    sessionInProgress: boolean,
    onResume: () => void,
    onStart: (items: QueueItem[], mode: 'all' | 'today' | 'new') => void
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

    if (sessionInProgress) {
        const progress = queue.length > 0 ? (sessionIndex / queue.length) * 100 : 0;
        
        return (
            <motion.div 
                layout
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className="card bg-base-100 shadow-xl border-l-4 border-primary overflow-hidden"
            >
                <div className="card-body">
                    <div className="flex justify-between items-start mb-4">
                        <div>
                            <h2 className="card-title text-2xl mb-1">Session In Progress</h2>
                            <p className="text-base-content/60">You are locked in. Keep the momentum!</p>
                        </div>
                        <div className="badge badge-primary badge-lg gap-2">
                            <Zap size={14} /> {sessionIndex} / {queue.length}
                        </div>
                    </div>
                    
                    <div className="w-full bg-base-200 rounded-full h-3 mb-6 overflow-hidden">
                        <motion.div 
                            className="bg-primary h-full rounded-full"
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            transition={{ type: "spring", stiffness: 50, damping: 20 }}
                        />
                    </div>

                    <div className="flex gap-3">
                        <button onClick={onResume} className="btn btn-primary flex-1 gap-2">
                            <Play size={18} /> Resume Session
                        </button>
                    </div>
                </div>
            </motion.div>
        );
    }

    if (dueItems.length === 0 && newItems.length === 0 && overdueItems.length === 0) {
        return (
            <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="card bg-gradient-to-br from-success/5 to-base-100 border border-success/20 shadow-lg"
            >
                <div className="card-body items-center text-center py-12">
                    <div className="w-20 h-20 bg-success/10 rounded-full flex items-center justify-center mb-4 text-success">
                        <CheckCircle size={40} />
                    </div>
                    <h2 className="text-3xl font-bold text-base-content mb-2">All Caught Up!</h2>
                    <p className="text-base-content/60 max-w-md mx-auto">
                        You've completed all your reviews for now. Your memory retention is optimized.
                    </p>
                </div>
            </motion.div>
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Main Action Card */}
            <div className="card bg-base-100 shadow-xl border border-base-200 col-span-1 lg:col-span-2">
                <div className="card-body">
                    <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 mb-6">
                        <div>
                            <h2 className="text-3xl font-bold flex items-center gap-3">
                                <Brain className="text-primary" />
                                Ready to Review
                            </h2>
                            <p className="text-base-content/60 mt-1">
                                {dueItems.length} cards due, {overdueItems.length} overdue
                            </p>
                        </div>
                        
                        <div className="flex items-center gap-2 bg-base-200/50 p-1.5 rounded-lg">
                            <span className="text-xs font-bold px-2 opacity-60 uppercase">Batch Size</span>
                            <div className="join">
                                {[10, 20, 50, 100].map(size => (
                                    <button
                                        key={size}
                                        onClick={() => setSessionSize(size)}
                                        className={`btn btn-sm join-item ${sessionSize === size ? 'btn-primary' : 'btn-ghost'}`}
                                    >
                                        {size}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                        {/* 1. Smart Mix (Default) */}
                        <button 
                            onClick={() => onStart(dueItems.slice(0, sessionSize), 'all')}
                            className="btn h-auto py-4 flex-col items-start gap-2 btn-outline border-base-300 hover:border-primary hover:bg-primary/5 group text-left"
                            disabled={dueItems.length === 0}
                        >
                            <div className="flex w-full justify-between items-center">
                                <span className="badge badge-primary badge-md">Recommended</span>
                                <Play size={16} className="opacity-0 group-hover:opacity-100 transition-opacity text-primary" />
                            </div>
                            <div>
                                <div className="font-bold text-lg">Smart Review</div>
                                <div className="text-xs opacity-60 font-normal mt-1">
                                    Mix of overdue & today's cards
                                </div>
                            </div>
                            <div className="mt-2 text-2xl font-bold text-primary">
                                {Math.min(dueItems.length, sessionSize)}
                            </div>
                        </button>

                        {/* 2. Clearing Backlog */}
                        <button 
                            onClick={() => onStart(overdueItems.slice(0, sessionSize), 'today')}
                            className="btn h-auto py-4 flex-col items-start gap-2 btn-outline border-base-300 hover:border-warning hover:bg-warning/5 group text-left"
                            disabled={overdueItems.length === 0}
                        >
                            <div className="flex w-full justify-between items-center">
                                <span className={`badge ${overdueItems.length > 0 ? 'badge-warning' : 'badge-ghost'} badge-md`}>
                                    High Priority
                                </span>
                            </div>
                            <div>
                                <div className="font-bold text-lg">Clear Backlog</div>
                                <div className="text-xs opacity-60 font-normal mt-1">
                                    Focus on overdue items only
                                </div>
                            </div>
                            <div className="mt-2 text-2xl font-bold text-warning">
                                {Math.min(overdueItems.length, sessionSize)}
                            </div>
                        </button>

                        {/* 3. New Cards */}
                        <button 
                            onClick={() => onStart(newItems.slice(0, sessionSize), 'new')}
                            className="btn h-auto py-4 flex-col items-start gap-2 btn-outline border-base-300 hover:border-info hover:bg-info/5 group text-left"
                            disabled={newItems.length === 0}
                        >
                            <div className="flex w-full justify-between items-center">
                                <span className="badge badge-info badge-outline badge-md">Learning</span>
                            </div>
                            <div>
                                <div className="font-bold text-lg">Learn New</div>
                                <div className="text-xs opacity-60 font-normal mt-1">
                                    Introduce new concepts
                                </div>
                            </div>
                            <div className="mt-2 text-2xl font-bold text-info">
                                {Math.min(newItems.length, sessionSize)}
                            </div>
                        </button>
                    </div>
                </div>
            </div>

            {/* True Retention Card */}
            <div className="card bg-base-100 shadow-sm border border-base-200">
                <div className="card-body p-6">
                    <div className="flex items-center gap-2 text-info font-bold uppercase text-xs tracking-wider mb-1">
                        <Brain size={16} />
                        True Retention
                    </div>
                    <h3 className="text-lg font-bold mb-4">Actual Pass Rate</h3>
                    <div className="text-2xl font-bold text-info">{passRate.toFixed(0)}%</div>
                </div>
            </div>

            {/* Review Distribution */}
            <ReviewDistribution distribution={{
                1: reviewHistory.filter(log => log.rating === 1).length,
                2: reviewHistory.filter(log => log.rating === 2).length,
                3: reviewHistory.filter(log => log.rating === 3).length,
                4: reviewHistory.filter(log => log.rating === 4).length,
            }} />
        </div>
    );
};

/**
 * 5. Retention Simulator: Approximate forgetting curve based on stability
 */
const RetentionSimulator = ({ stabilityList }: { stabilityList: number[] }) => {
    const dataPoints = useMemo(() => {
        if (stabilityList.length === 0) return [];
        const points: { day: number; retention: number }[] = [];
        // Increase resolution for smoother SVG curve
        for (let t = 0; t <= 30; t += 1) {
            let totalR = 0;
            stabilityList.forEach(s => {
                const base = Math.max(s, 0.1);
                // FSRS forgetting curve approximation: R = 0.9^(t/s)
                // (Simplified, standard FSRS uses power law, but this is close enough for viz)
                totalR += Math.pow(0.9, t / base);
            });
            const avgR = (totalR / stabilityList.length) * 100;
            points.push({ day: t, retention: avgR });
        }
        return points;
    }, [stabilityList]);

    const hasData = stabilityList.length > 0 && dataPoints.length > 0;

    if (!hasData) {
        return (
            <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
                <div className="card-body p-6 flex flex-col items-start justify-center gap-3">
                    <div className="flex items-center gap-2 text-info font-bold uppercase text-xs tracking-wider">
                        <Brain size={16} />
                        Retention Power
                    </div>
                    <h3 className="text-lg font-bold">暂无遗忘曲线数据</h3>
                    <p className="text-xs opacity-60">
                        完成几次正式复习后，这里会根据你的 FSRS 稳定度绘制一条个性化遗忘曲线，帮助你判断如果现在停更会掉多少分。
                    </p>
                    <p className="text-[11px] opacity-50">
                        小建议：先在「Focus」标签页完成一两轮复习，再回到这里查看趋势。
                    </p>
                </div>
            </div>
        );
    }

    const day30 = dataPoints[dataPoints.length - 1];
    
    // Generate SVG Path
    const width = 100;
    const height = 100;
    const maxDay = 30;
    const maxRet = 100;
    
    // M x y ...
    const pointsStr = dataPoints.map(pt => {
        const x = (pt.day / maxDay) * width;
        const y = height - (pt.retention / maxRet) * height;
        return `${x},${y}`;
    }).join(' L ');
    
    const areaPath = `M 0,${height} L ${pointsStr} L ${width},${height} Z`;
    const linePath = `M ${pointsStr}`;

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                <div className="flex items-center gap-2 text-info font-bold uppercase text-xs tracking-wider mb-1">
                    <Brain size={16} />
                    Retention Power
                </div>
                <div className="flex justify-between items-end mb-4">
                    <h3 className="text-lg font-bold">Forgetting Curve</h3>
                    <div className="text-right">
                         <div className="text-2xl font-bold text-info">{day30.retention.toFixed(0)}%</div>
                         <div className="text-xs opacity-50">Est. retention in 30d</div>
                    </div>
                </div>

                <div className="h-32 w-full relative overflow-hidden">
                    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="retentionGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="currentColor" className="text-info" stopOpacity="0.2" />
                                <stop offset="100%" stopColor="currentColor" className="text-info" stopOpacity="0" />
                            </linearGradient>
                        </defs>
                        {/* Grid Lines */}
                        <line x1="0" y1="25" x2="100" y2="25" stroke="currentColor" className="text-base-300" strokeWidth="0.5" strokeDasharray="2 2" />
                        <line x1="0" y1="50" x2="100" y2="50" stroke="currentColor" className="text-base-300" strokeWidth="0.5" strokeDasharray="2 2" />
                        <line x1="0" y1="75" x2="100" y2="75" stroke="currentColor" className="text-base-300" strokeWidth="0.5" strokeDasharray="2 2" />
                        
                        <path d={areaPath} fill="url(#retentionGradient)" />
                        <path d={linePath} fill="none" stroke="currentColor" className="text-info" strokeWidth="2" vectorEffect="non-scaling-stroke" />
                    </svg>
                    
                    {/* Axis Labels overlay */}
                    <div className="absolute bottom-0 left-0 right-0 flex justify-between text-[10px] opacity-40 px-1">
                        <span>Now</span>
                        <span>15d</span>
                        <span>30d</span>
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * 6. Difficulty Heatmap: Aggregate difficulty by folder
 */
const DifficultyHeatmap = ({ folderDifficulty }: { folderDifficulty: Record<string, { sum: number; count: number }> }) => {
    const folders = useMemo(() => {
        return Object.entries(folderDifficulty)
            .map(([path, stats]) => ({
                path,
                avg: stats.sum / stats.count,
                count: stats.count,
            }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 5);
    }, [folderDifficulty]);

    const getDifficultyColor = (avg: number) => {
        if (avg > 8) return 'badge-error'; // Hard
        if (avg > 5) return 'badge-warning'; // Medium
        return 'badge-success'; // Easy
    };

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                <div className="flex items-center gap-2 text-warning font-bold uppercase text-xs tracking-wider mb-1">
                    <Folder size={16} />
                    Hardest Topics
                </div>
                <h3 className="text-lg font-bold mb-4">Difficulty Hotspots</h3>

                <div className="space-y-3 text-sm">
                    {folders.map(f => (
                        <div key={f.path} className="flex items-center justify-between group">
                            <div className="flex items-center gap-2 overflow-hidden">
                                <span className={`badge badge-xs ${getDifficultyColor(f.avg)}`}>
                                    {f.avg.toFixed(1)}
                                </span>
                                <span
                                    className="truncate max-w-[140px] group-hover:text-primary transition-colors"
                                    title={f.path}
                                >
                                    {f.path === '.' ? 'Root' : f.path}
                                </span>
                            </div>
                            <span className="text-xs opacity-50">{f.count} cards</span>
                        </div>
                    ))}
                    {folders.length === 0 && (
                        <div className="opacity-60 text-xs leading-relaxed">
                            暂无难度数据。完成一些复习后，这里会根据卡片的平均难度，列出最容易踩坑的文件夹，提醒你在哪里需要拆分、精简或补充笔记。
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};

/**
 * 7. Activity Grid: GitHub-style review heatmap (last ~16 weeks)
 */
const ActivityGrid = () => {
    const reviewHistory = useAppStore((state) => state.reviewHistory);

    const activityMap = useMemo(() => {
        const map: Record<string, number> = {};
        reviewHistory.forEach(log => {
            const key = format(new Date(log.review), 'yyyy-MM-dd');
            map[key] = (map[key] || 0) + 1;
        });
        return map;
    }, [reviewHistory]);

    const weeks = useMemo(() => {
        const today = new Date();
        const numWeeks = 16;
        let current = subDays(today, numWeeks * 7);
        current = startOfWeek(current);

        const result: { date: string; count: number; inFuture: boolean }[][] = [];

        for (let w = 0; w < numWeeks; w++) {
            const week: { date: string; count: number; inFuture: boolean }[] = [];
            for (let d = 0; d < 7; d++) {
                const date = addDays(current, d);
                const key = format(date, 'yyyy-MM-dd');
                week.push({
                    date: key,
                    count: activityMap[key] || 0,
                    inFuture: date > today,
                });
            }
            result.push(week);
            current = addDays(current, 7);
        }

        return result;
    }, [activityMap]);

    const getColor = (count: number) => {
        if (count === 0) return 'bg-base-300/40';
        if (count < 3) return 'bg-success/40';
        if (count < 6) return 'bg-success/60';
        if (count < 10) return 'bg-success/80';
        return 'bg-success';
    };

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                <div className="flex items-center gap-2 text-success font-bold uppercase text-xs tracking-wider mb-1">
                    <TrendingUp size={16} />
                    Consistency
                </div>
                <div className="flex justify-between items-end mb-4">
                    <h3 className="text-lg font-bold">Activity</h3>
                    <div className="text-xs opacity-50">{reviewHistory.length} reviews</div>
                </div>

                <div className="flex gap-[3px] justify-end overflow-hidden">
                    {weeks.map((week, i) => (
                        <div key={i} className="flex flex-col gap-[3px]">
                            {week.map(day => (
                                <div
                                    key={day.date}
                                    title={`${day.date}: ${day.count} reviews`}
                                    className={`w-3 h-3 rounded-[2px] ${day.inFuture ? 'opacity-0' : getColor(day.count)}`}
                                />
                            ))}
                        </div>
                    ))}
                </div>

                {reviewHistory.length === 0 && (
                    <p className="mt-4 text-[11px] opacity-60 leading-relaxed">
                        暂无复习记录。先在「Focus」标签页完成一次学习或复习，这里会用 GitHub 风格的热力图展示你过去几周的坚持情况。
                    </p>
                )}
            </div>
        </div>
    );
};

/**
 * 8. Review Distribution: Donut chart of ratings (Again, Hard, Good, Easy)
 */
const ReviewDistribution = ({ distribution }: { distribution: Record<number, number> }) => {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);

    // 空态：没有任何评分数据
    if (total === 0) {
        return (
            <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
                <div className="card-body p-6 flex flex-col justify-center gap-3">
                    <div className="flex items-center gap-2 text-secondary font-bold uppercase text-xs tracking-wider mb-1">
                        <PieChart size={16} />
                        Review Quality
                    </div>
                    <h3 className="text-lg font-bold">暂无评分分布</h3>
                    <p className="text-xs opacity-60">
                        复习时选择 Again / Hard / Good / Easy，这里会展示一段时间内的质量分布，帮助你判断是否需要调慢或调快节奏。
                    </p>
                    <p className="text-[11px] opacity-50">
                        先完成几张卡片的复习，看看最近是太简单还是太吃力。
                    </p>
                </div>
            </div>
        );
    }

    // Colors for 1=Again, 2=Hard, 3=Good, 4=Easy
    const colors = {
        1: 'bg-error',
        2: 'bg-warning',
        3: 'bg-info',
        4: 'bg-success'
    };
    const labels = {
        1: 'Again',
        2: 'Hard',
        3: 'Good',
        4: 'Easy'
    };

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                <div className="flex items-center gap-2 text-secondary font-bold uppercase text-xs tracking-wider mb-1">
                    <PieChart size={16} />
                    Review Quality
                </div>
                <h3 className="text-lg font-bold mb-4">Rating Breakdown</h3>

                <div className="flex flex-col gap-3">
                    <div className="flex h-4 w-full rounded-full overflow-hidden bg-base-200">
                        {[1, 2, 3, 4].map(rating => {
                            const count = distribution[rating] || 0;
                            if (count === 0) return null;
                            const pct = (count / total) * 100;
                            return (
                                <div 
                                    key={rating} 
                                    className={`${colors[rating as 1|2|3|4]} h-full`} 
                                    style={{ width: `${pct}%` }}
                                    title={`${labels[rating as 1|2|3|4]}: ${count} (${pct.toFixed(0)}%)`}
                                />
                            );
                        })}
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-xs">
                        {[1, 2, 3, 4].map(rating => {
                            const count = distribution[rating] || 0;
                            return (
                                <div key={rating} className="flex items-center justify-between">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${colors[rating as 1|2|3|4]}`} />
                                        <span className="opacity-70">{labels[rating as 1|2|3|4]}</span>
                                    </div>
                                    <span className="font-mono font-bold opacity-60">{count}</span>
                                </div>
                            );
                        })}
                    </div>
                </div>
            </div>
        </div>
    );
};

/**
 * 2. Leech Killer: Identifying difficult cards
 */
const LeechKiller = ({ leeches, onLoadNote }: { leeches: QueueItem[], onLoadNote: (path: string, idx: number) => void }) => {
    if (leeches.length === 0) {
        return (
            <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
                <div className="card-body p-6">
                    <div className="flex items-center gap-2 text-success font-bold uppercase text-xs tracking-wider mb-4">
                        <CheckCircle size={16} />
                        No Leeches Detected
                    </div>
                    <h3 className="text-lg font-bold mb-2">暂无困难卡片</h3>
                    <p className="text-sm opacity-70">
                        当前没有频繁忘记的卡片，这通常说明你的节奏和笔记质量都不错。如果以后某些卡片不断重复失败，它们会出现在这里，提醒你重写或拆分。
                    </p>
                </div>
            </div>
        );
    }

    return (
        <div className="card bg-base-100 shadow-sm border border-error/20">
            <div className="card-body p-6">
                <div className="flex items-center gap-2 text-error font-bold uppercase text-xs tracking-wider mb-4">
                    <AlertCircle size={16} />
                    Critical Attention Needed
                </div>
                <h3 className="text-lg font-bold mb-2">Difficulty Spike Detected</h3>
                <p className="text-sm opacity-70 mb-4">
                    These {leeches.length} cards have high lapse rates (&gt;5). Consider rewriting the note or adding better hints.
                </p>
                
                <div className="space-y-2">
                    {leeches.slice(0, 3).map((item, i) => (
                        <div key={`${item.noteId}-${item.clozeIndex}`} className="flex items-center justify-between bg-base-200/50 p-3 rounded-lg group hover:bg-base-200 transition-colors">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <span className="text-xs font-mono opacity-40">#{i + 1}</span>
                                <span className="text-sm font-medium truncate max-w-[200px]">
                                    {item.filepath.split('/').pop()}
                                </span>
                            </div>
                            <button 
                                onClick={() => onLoadNote(item.filepath, item.clozeIndex)}
                                className="btn btn-xs btn-ghost opacity-0 group-hover:opacity-100 text-error"
                            >
                                Edit
                            </button>
                        </div>
                    ))}
                </div>
                
                {leeches.length > 3 && (
                    <button className="btn btn-xs btn-ghost w-full mt-2">View all {leeches.length} leeches</button>
                )}
            </div>
        </div>
    );
};

/**
 * 3. Workload Forecast: Improved Bar chart
 */
const WorkloadForecast = ({ futureCounts }: { futureCounts: Record<string, number> }) => {
    const days = useMemo(() => {
        const result = [];
        for (let i = 0; i < 7; i++) {
            const date = addDays(new Date(), i);
            const key = format(date, 'yyyy-MM-dd');
            result.push({
                label: i === 0 ? 'Today' : format(date, 'EEE'),
                date: key,
                count: futureCounts[key] || 0
            });
        }
        return result;
    }, [futureCounts]);

    const maxCount = Math.max(...days.map(d => d.count), 5); // Min height for visual balance
    const allZero = days.every(d => d.count === 0);

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                <div className="flex items-center justify-between mb-4">
                     <div className="flex items-center gap-2 text-primary font-bold uppercase text-xs tracking-wider">
                        <Calendar size={16} />
                        Upcoming
                    </div>
                    <span className="text-xs opacity-50">7 Day Forecast</span>
                </div>
                
                <div className="flex items-end justify-between h-32 gap-3 pt-2">
                    {days.map((day, i) => {
                        const heightPercent = (day.count / maxCount) * 100;
                        const isHigh = day.count > 20; // Arbitrary threshold for "busy"
                        return (
                            <div key={day.date} className="flex flex-col items-center gap-2 flex-1 group relative">
                                {/* Count Bubble */}
                                <div className={`mb-1 text-xs font-bold transition-all ${i===0 ? 'text-primary' : 'opacity-0 group-hover:opacity-100'}`}>
                                    {day.count}
                                </div>
                                
                                <div className="w-full bg-base-200/50 rounded-t-lg relative h-full flex items-end overflow-hidden">
                                     <motion.div 
                                        className={`w-full rounded-t-lg ${i === 0 ? 'bg-primary' : isHigh ? 'bg-secondary/60' : 'bg-base-content/20'} group-hover:bg-primary/80 transition-colors`}
                                        initial={{ height: 0 }}
                                        animate={{ height: `${Math.max(heightPercent, 4)}%` }}
                                        transition={{ duration: 0.6, delay: i * 0.05, type: 'spring' }}
                                    />
                                </div>
                                
                                <span className={`text-[10px] font-medium uppercase tracking-wider ${i === 0 ? 'text-primary' : 'opacity-40'}`}>
                                    {day.label}
                                </span>
                            </div>
                        );
                    })}
                </div>

                {allZero && (
                    <p className="mt-4 text-[11px] opacity-60">
                        暂无预计复习负载。随着你添加更多卡片并开始复习，这里会展示未来 7 天的大致复习量，帮助你避免某一天过载。
                    </p>
                )}
            </div>
        </div>
    );
};

/**
 * 4. Vault Health: Stacked Bar & Stats
 */
const VaultHealth = ({ stats, orphanCount }: { stats: { new: number, learning: number, review: number, relearning: number }, orphanCount: number }) => {
    const total = stats.new + stats.learning + stats.review + stats.relearning;
    
    // Percentages
    const pNew = total ? (stats.new / total) * 100 : 0;
    const pLearn = total ? ((stats.learning + stats.relearning) / total) * 100 : 0;
    const pReview = total ? (stats.review / total) * 100 : 0;

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                 <div className="flex items-center gap-2 text-secondary font-bold uppercase text-xs tracking-wider mb-4">
                    <Activity size={16} />
                    Vault Composition
                </div>
                
                <div className="flex items-end gap-1 mb-2">
                     <div className="text-4xl font-extrabold tracking-tight">{total}</div>
                     <div className="text-sm opacity-50 mb-1.5 ml-1">Total Cards</div>
                </div>

                {total === 0 && (
                    <p className="text-[11px] opacity-60 mb-3 leading-relaxed">
                        还没有任何卡片被跟踪。打开一个 Markdown 笔记并使用类似 c1:: 这样的 cloze 标记创建卡片后，这里会展示新卡、学习中和成熟复习卡的整体构成。
                    </p>
                )}

                {/* Stacked Progress Bar */}
                <div className="flex w-full h-4 bg-base-200 rounded-full overflow-hidden mb-6">
                    <div className="bg-success h-full" style={{ width: `${pReview}%` }} title={`Review: ${stats.review}`} />
                    <div className="bg-warning h-full" style={{ width: `${pLearn}%` }} title={`Learning: ${stats.learning + stats.relearning}`} />
                    <div className="bg-info h-full" style={{ width: `${pNew}%` }} title={`New: ${stats.new}`} />
                </div>

                <div className="space-y-3 text-xs">
                    <div className="flex justify-between items-center">
                        <span className="flex items-center gap-2 opacity-70"><div className="w-2 h-2 rounded-full bg-success" /> Mature & Review</span>
                        <span className="font-mono font-bold opacity-80">{stats.review}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="flex items-center gap-2 opacity-70"><div className="w-2 h-2 rounded-full bg-warning" /> Learning</span>
                        <span className="font-mono font-bold opacity-80">{stats.learning + stats.relearning}</span>
                    </div>
                    <div className="flex justify-between items-center">
                        <span className="flex items-center gap-2 opacity-70"><div className="w-2 h-2 rounded-full bg-info" /> New Cards</span>
                        <span className="font-mono font-bold opacity-80">{stats.new}</span>
                    </div>
                </div>

                {orphanCount > 0 && (
                     <div className="mt-auto pt-4 border-t border-base-200">
                        <div className="flex items-center justify-between text-error/80 text-xs font-medium bg-error/5 p-2 rounded">
                            <span className="flex items-center gap-2"><AlertCircle size={14} /> {orphanCount} Orphaned Notes</span>
                            <button className="btn btn-xs btn-ghost text-error">Fix</button>
                        </div>
                     </div>
                )}
            </div>
        </div>
    );
};

// --- Main Dashboard Component ---

export const Dashboard = ({ mode = 'full' }: { mode?: 'full' | 'hero-only' | 'insights-only' }) => {
    const {
        files,
        fileMetadatas,
        setQueue,
        startSession,
        queue,
        sessionIndex,
        loadNote,
        setViewMode,
        syncMode,
        lastSyncAt,
        pendingSyncCount,
        reviewHistory,
    } = useAppStore(
        useShallow((state) => ({
            files: state.files,
            fileMetadatas: state.fileMetadatas,
            setQueue: state.setQueue,
            startSession: state.startSession,
            queue: state.queue,
            sessionIndex: state.sessionIndex,
            loadNote: state.loadNote,
            setViewMode: state.setViewMode,
            syncMode: state.syncMode,
            lastSyncAt: state.lastSyncAt,
            pendingSyncCount: state.pendingSyncCount,
            reviewHistory: state.reviewHistory,
        })),
    );

    // --- 1. Smart Aggregation (Memoized) ---
    const dashboardData = useMemo(() => {
        const now = new Date();
        const todayKey = format(now, 'yyyy-MM-dd');
        
        const dueItems: QueueItem[] = [];
        const overdueItems: QueueItem[] = [];
        const newItems: QueueItem[] = [];
        const leeches: QueueItem[] = [];
        
        // Workload forecast map (Date -> Count)
        const futureCounts: Record<string, number> = {};
        
        // Health stats
        const stats = { new: 0, learning: 0, review: 0, relearning: 0 };
        
        // Strategic stats
        const stabilityList: number[] = [];
        const folderDifficulty: Record<string, { sum: number; count: number }> = {};
        
        // Iterate all data
        files.forEach(f => {
            const meta = fileMetadatas[f];
            if (!meta || !meta.cards) return;
            
            Object.entries(meta.cards).forEach(([indexStr, card]) => {
                const due = new Date(card.due);
                const clozeIdx = parseInt(indexStr, 10);
                const item: QueueItem = {
                    noteId: meta.noteId || '',
                    filepath: f,
                    clozeIndex: clozeIdx,
                    due: due
                };

                // Compute folder from path (normalize separators)
                const normalizedPath = f.replace(/\\/g, '/');
                const folder = normalizedPath.includes('/')
                    ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/'))
                    : '.';

                // 1. State Stats
                if (card.state === 0) stats.new++;
                else if (card.state === 1) stats.learning++;
                else if (card.state === 2) stats.review++;
                else if (card.state === 3) stats.relearning++;

                // 2. Strategic metrics (only for learned cards)
                if (card.state !== 0) {
                    stabilityList.push(card.stability);
                    if (!folderDifficulty[folder]) {
                        folderDifficulty[folder] = { sum: 0, count: 0 };
                    }
                    folderDifficulty[folder].sum += card.difficulty;
                    folderDifficulty[folder].count += 1;
                }

                // 3. Leech Detection (Lapses > 5)
                if (card.lapses > 5) {
                    leeches.push(item);
                }

                // 4. Queues
                if (card.state === 0) {
                     newItems.push(item);
                } else if (due <= now) {
                    dueItems.push(item);
                    // Is it overdue? (Due before today 00:00)
                    if (differenceInDays(now, due) >= 1) {
                        overdueItems.push(item);
                    }
                    // Also count for today's workload
                    futureCounts[todayKey] = (futureCounts[todayKey] || 0) + 1;
                } else {
                    // Future workload
                    const dateKey = format(due, 'yyyy-MM-dd');
                    futureCounts[dateKey] = (futureCounts[dateKey] || 0) + 1;
                }
            });
        });

        // Sort items by due date / priority
        dueItems.sort((a, b) => a.due.getTime() - b.due.getTime());
        overdueItems.sort((a, b) => a.due.getTime() - b.due.getTime());
        
        // Orphaned notes (files without metadata or cards)
        const trackedFiles = Object.keys(fileMetadatas);
        const orphanCount = files.length - trackedFiles.filter(f => fileMetadatas[f]?.cards && Object.keys(fileMetadatas[f].cards).length > 0).length;

        // Calculate Streak
        // Sort history by date
        // A simple day-streak calculator
        let currentStreak = 0;
        const historyDates = reviewHistory.map(r => new Date(r.review).setHours(0,0,0,0)).sort((a,b) => b - a);
        const uniqueDates = Array.from(new Set(historyDates));
        
        if (uniqueDates.length > 0) {
            const today = new Date().setHours(0,0,0,0);
            const yesterday = subDays(new Date(), 1).setHours(0,0,0,0);
            
            // If reviewed today, start count from today. If not, check if reviewed yesterday.
            let startIndex = -1;
            if (uniqueDates[0] === today) startIndex = 0;
            else if (uniqueDates[0] === yesterday) startIndex = 0;
            
            if (startIndex !== -1) {
                currentStreak = 1;
                for (let i = 0; i < uniqueDates.length - 1; i++) {
                    const curr = uniqueDates[i];
                    const next = uniqueDates[i+1];
                    if (differenceInDays(curr, next) === 1) {
                        currentStreak++;
                    } else {
                        break;
                    }
                }
            }
        }

        // Calculate True Retention (Pass Rate on Reviews)
        // Filter for review cards (state === 2 usually, but retention generally means "did I remember?")
        // In FSRS: rating > 1 means "pass" (Hard, Good, Easy). rating 1 is "fail" (Again).
        // We consider all non-new cards reviews.
        const validReviews = reviewHistory.filter(r => r.state !== 0); // Exclude learning new cards if desired, or keep all
        const passedReviews = validReviews.filter(r => r.rating > 1).length;
        const retentionRate = validReviews.length > 0 ? (passedReviews / validReviews.length) * 100 : 0;

        // Calculate Rating Distribution
        const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
        reviewHistory.forEach(r => {
            if (ratingDist[r.rating] !== undefined) ratingDist[r.rating]++;
        });

        return { 
            dueItems, overdueItems, newItems, leeches, futureCounts, stats, 
            orphanCount, stabilityList, folderDifficulty, currentStreak, 
            retentionRate, ratingDist 
        };
    }, [files, fileMetadatas, reviewHistory]);

    // --- 2. Handlers ---

    const handleStartSession = (items: QueueItem[], mode: 'all' | 'today' | 'new') => {
        console.log(`Starting session in mode: ${mode}`); // Logging for analytics
        setQueue(items);
        startSession();
    };

    const handleResumeSession = () => {
        const currentItem = queue[sessionIndex];
        if (currentItem) {
            loadNote(currentItem.filepath, currentItem.clozeIndex);
            setViewMode('test');
        }
    };

    const handleEditNote = (filepath: string, clozeIndex: number) => {
        loadNote(filepath, clozeIndex);
        setViewMode('edit');
    };

    const hasSessionInProgress = queue.length > 0 && sessionIndex < queue.length;

    const syncLabel = syncMode === 'supabase' ? 'Cloud (Supabase)' : 'Local-only (Mock)';
    const lastSyncText =
        syncMode === 'supabase'
            ? lastSyncAt
                ? `Last cloud sync ${formatDistanceToNow(lastSyncAt, { addSuffix: true })}`
                : 'No cloud sync yet'
            : 'Cloud sync disabled';

    const pendingLabel =
        syncMode === 'supabase'
            ? 'All reviews synced'
            : `${pendingSyncCount} reviews only on this device`;

    return (
        <div className="max-w-6xl mx-auto w-full space-y-8 py-6 px-4">
            
            {/* --- Header --- */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-bold">Dashboard</h1>
                    <p className="opacity-60 text-sm">Overview of your knowledge base</p>
                </div>
                <div className="text-right text-xs opacity-50">
                    <div>{files.length} Files Tracked</div>
                    <div>Memory Player v0.2</div>
                </div>
            </div>

            {/* --- 1. Action Center --- */}
            {mode !== 'insights-only' && (
                <ActionCenter 
                    dueItems={dashboardData.dueItems}
                    overdueItems={dashboardData.overdueItems}
                    newItems={dashboardData.newItems}
                    sessionInProgress={hasSessionInProgress}
                    onResume={handleResumeSession}
                    onStart={handleStartSession}
                />
            )}

            {/* --- INSIGHTS VIEW --- */}
            {mode !== 'hero-only' && (
                <div className="space-y-6 animate-in fade-in duration-500">
                    
                    {/* 1. Top Stats Row (Vital Signs) */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                         <div className="card bg-base-100 border border-base-200 shadow-sm p-4 flex flex-col">
                             <div className="text-xs font-bold uppercase text-base-content/40 mb-1">Current Streak</div>
                             <div className="flex items-baseline gap-2">
                                 <span className="text-3xl font-black text-primary">{dashboardData.currentStreak}</span>
                                 <span className="text-xs opacity-60">days</span>
                             </div>
                         </div>
                         <div className="card bg-base-100 border border-base-200 shadow-sm p-4 flex flex-col">
                             <div className="text-xs font-bold uppercase text-base-content/40 mb-1">True Retention</div>
                             <div className="flex items-baseline gap-2">
                                 <span className="text-3xl font-black text-success">{dashboardData.retentionRate.toFixed(1)}%</span>
                                 <span className="text-xs opacity-60">pass rate</span>
                             </div>
                         </div>
                         <div className="card bg-base-100 border border-base-200 shadow-sm p-4 flex flex-col">
                             <div className="text-xs font-bold uppercase text-base-content/40 mb-1">Learned Cards</div>
                             <div className="flex items-baseline gap-2">
                                 <span className="text-3xl font-black text-info">{dashboardData.stats.review}</span>
                                 <span className="text-xs opacity-60">mature</span>
                             </div>
                         </div>
                         <div className="card bg-base-100 border border-base-200 shadow-sm p-4 flex flex-col">
                             <div className="text-xs font-bold uppercase text-base-content/40 mb-1">Total Files</div>
                             <div className="flex items-baseline gap-2">
                                 <span className="text-3xl font-black text-base-content">{files.length}</span>
                                 <span className="text-xs opacity-60">notes</span>
                             </div>
                         </div>
                    </div>

                    {/* 2. Main Bento Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(280px,auto)]">
                        
                        {/* Retention Curve - Large (2 cols) */}
                        <div className="md:col-span-2 h-full">
                            <RetentionSimulator stabilityList={dashboardData.stabilityList} />
                        </div>

                        {/* Review Distribution - Small (1 col) - NEW */}
                        <div className="md:col-span-1 h-full">
                             <ReviewDistribution distribution={dashboardData.ratingDist} />
                        </div>

                        {/* Activity Grid - Large (2 cols) */}
                        <div className="md:col-span-2 h-full">
                             <ActivityGrid />
                        </div>

                        {/* Vault Health - Small (1 col) */}
                        <div className="md:col-span-1 h-full">
                             <VaultHealth stats={dashboardData.stats} orphanCount={dashboardData.orphanCount} />
                        </div>

                        {/* Leech Killer - Large (2 cols) */}
                        <div className="md:col-span-2 h-full">
                             <LeechKiller leeches={dashboardData.leeches} onLoadNote={handleEditNote} />
                        </div>
                        
                         {/* Forecast - Small (1 col) */}
                         <div className="md:col-span-1 h-full">
                             <WorkloadForecast futureCounts={dashboardData.futureCounts} />
                        </div>
                        
                        {/* Difficulty - Small (1 col) - pushed to bottom or integrated elsewhere? Keeping it here for completeness */}
                        <div className="md:col-span-1 h-full">
                             <DifficultyHeatmap folderDifficulty={dashboardData.folderDifficulty} />
                        </div>
                    </div>
                </div>
            )}

            {/* --- Footer / Context --- */}
            {mode !== 'hero-only' && (
                <div className="border-t border-base-200 pt-6 pb-2 flex items-center justify-between text-xs opacity-50">
                    <div className="flex items-center gap-4">
                        <span>Memory Player v0.3</span>
                        <span className="flex items-center gap-1">
                            <Cloud
                                size={12}
                                className={syncMode === 'supabase' ? 'text-success' : 'opacity-40'}
                            />
                            {syncLabel}
                        </span>
                    </div>
                    <div className="flex items-center gap-4">
                        <span className="flex items-center gap-1">
                            <RefreshCw size={12} />
                            {lastSyncText}
                        </span>
                        <span>{pendingLabel}</span>
                        <span>
                            Total Cards: {dashboardData.stats.new + dashboardData.stats.learning + dashboardData.stats.review + dashboardData.stats.relearning}
                        </span>
                    </div>
                </div>
            )}
        </div>
    );
};
