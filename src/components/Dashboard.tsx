import { useMemo } from 'react';
import { useAppStore } from '../store/appStore';
import { useShallow } from 'zustand/react/shallow';
import {
    Brain, Activity, CheckCircle, Layers
} from 'lucide-react';
import { QueueItem } from '../lib/storage/types';
import { format, differenceInDays, subDays } from 'date-fns';
import { ActionCenter } from './dashboard/ActionCenter';
import { RetentionSimulator } from './dashboard/charts/RetentionSimulator';
import { ActivityGrid } from './dashboard/charts/ActivityGrid';
import { ReviewTrends } from './dashboard/charts/ReviewTrends';
import { WorkloadForecast } from './dashboard/charts/WorkloadForecast';
import { VaultHealth } from './dashboard/charts/VaultHealth';
import { DifficultyDistribution } from './dashboard/charts/DifficultyDistribution';
import { StabilityScatter } from './dashboard/charts/StabilityScatter';
import { HourlyActivity } from './dashboard/charts/HourlyActivity';
import { StatLabelIcon } from './dashboard/Shared';
import { GlobalSearch } from './dashboard/GlobalSearch';
import { RecycleBin } from './dashboard/RecycleBin';

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
            reviewHistory: state.reviewHistory,
        })),
    );

    // Data Aggregation
    const dashboardData = useMemo(() => {
        const now = new Date();
        const todayKey = format(now, 'yyyy-MM-dd');

        const dueItems: QueueItem[] = [];
        const overdueItems: QueueItem[] = [];
        const newItems: QueueItem[] = [];
        const leeches: QueueItem[] = [];
        const futureCounts: Record<string, number> = {};
        const stats = { new: 0, learning: 0, review: 0, relearning: 0 };
        const stabilityList: number[] = [];
        const folderLapses: Record<string, { sum: number; count: number }> = {};

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

                const normalizedPath = f.replace(/\\/g, '/');
                const folder = normalizedPath.includes('/') ? normalizedPath.slice(0, normalizedPath.lastIndexOf('/')) : '.';

                // Stats
                if (card.state === 0) stats.new++;
                else if (card.state === 1) stats.learning++;
                else if (card.state === 2) stats.review++;
                else if (card.state === 3) stats.relearning++;

                if (card.state !== 0) {
                    stabilityList.push(card.stability);
                    if (!folderLapses[folder]) {
                        folderLapses[folder] = { sum: 0, count: 0 };
                    }
                    folderLapses[folder].sum += card.lapses;
                    folderLapses[folder].count += 1;
                }

                if (card.lapses > 5) leeches.push(item);

                const isDueOrPast = due <= now;

                if (card.state === 0) {
                    newItems.push(item);

                    if (isDueOrPast) {
                        dueItems.push(item);
                        if (differenceInDays(now, due) >= 1) overdueItems.push(item);
                        futureCounts[todayKey] = (futureCounts[todayKey] || 0) + 1;
                    } else {
                        const dateKey = format(due, 'yyyy-MM-dd');
                        futureCounts[dateKey] = (futureCounts[dateKey] || 0) + 1;
                    }
                } else if (isDueOrPast) {
                    dueItems.push(item);
                    if (differenceInDays(now, due) >= 1) overdueItems.push(item);
                    futureCounts[todayKey] = (futureCounts[todayKey] || 0) + 1;
                } else {
                    const dateKey = format(due, 'yyyy-MM-dd');
                    futureCounts[dateKey] = (futureCounts[dateKey] || 0) + 1;
                }
            });
        });

        dueItems.sort((a, b) => a.due.getTime() - b.due.getTime());

        // Streak Calculation
        const historyDates = reviewHistory.map(r => new Date(r.review).setHours(0, 0, 0, 0)).sort((a, b) => b - a);
        const uniqueDates = Array.from(new Set(historyDates));
        const reviewDays = uniqueDates.length;
        let currentStreak = 0;
        if (uniqueDates.length > 0) {
            const today = new Date().setHours(0, 0, 0, 0);
            const yesterday = subDays(new Date(), 1).setHours(0, 0, 0, 0);
            let startIndex = -1;
            if (uniqueDates[0] === today) startIndex = 0;
            else if (uniqueDates[0] === yesterday) startIndex = 0;

            if (startIndex !== -1) {
                currentStreak = 1;
                for (let i = 0; i < uniqueDates.length - 1; i++) {
                    if (differenceInDays(uniqueDates[i], uniqueDates[i + 1]) === 1) currentStreak++;
                    else break;
                }
            }
        }

        const validReviews = reviewHistory.filter(r => r.state !== 0);
        const passedReviews = validReviews.filter(r => r.rating > 1).length;
        const retentionRate = validReviews.length > 0 ? (passedReviews / validReviews.length) * 100 : 0;

        const ratingDist: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0 };
        reviewHistory.forEach(r => { if (ratingDist[r.rating] !== undefined) ratingDist[r.rating]++; });

        const trackedFiles = Object.keys(fileMetadatas);
        const orphanCount = files.length - trackedFiles.filter(f => fileMetadatas[f]?.cards && Object.keys(fileMetadatas[f].cards).length > 0).length;

        return {
            dueItems, overdueItems, newItems, leeches, futureCounts, stats,
            orphanCount, stabilityList, folderLapses, currentStreak,
            retentionRate, ratingDist, reviewDays
        };
    }, [files, fileMetadatas, reviewHistory]);

    // Handlers
    const handleStartSession = (items: QueueItem[]) => {
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

    const hasSessionInProgress = queue.length > 0 && sessionIndex < queue.length;

    return (
        <div className="max-w-7xl mx-auto w-full space-y-6 py-8 px-6 pb-32">
            {/* Header Section */}
            <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 pb-2 border-b border-base-200/50">
                <div className="space-y-1">
                    <div className="flex items-center gap-3">
                        <h1 className="text-3xl font-black tracking-tight text-base-content">
                            Dashboard
                        </h1>
                        <div className="badge badge-ghost badge-sm font-mono text-[10px] tracking-wider opacity-50">
                            v0.5.0
                        </div>
                    </div>
                    <p className="text-sm font-medium text-base-content/40 flex items-center gap-2">
                        <span className="uppercase tracking-widest text-[10px]">
                            {format(new Date(), 'EEEE, MMMM do')}
                        </span>
                        <span className="w-1 h-1 rounded-full bg-base-content/20" />
                        <span>Neural Network Optimization Center</span>
                    </p>
                </div>
                <div className="w-full md:w-auto md:min-w-[320px]">
                    <GlobalSearch />
                </div>
            </div>

            {/* Focus Zone */}
            {mode !== 'insights-only' && (
                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 animate-in fade-in duration-500 slide-in-from-bottom-2">
                    {/* Main Action Center - 9/12 cols */}
                    <div className="lg:col-span-9 h-full">
                        <ActionCenter
                            dueItems={dashboardData.dueItems}
                            overdueItems={dashboardData.overdueItems}
                            newItems={dashboardData.newItems}
                            sessionInProgress={hasSessionInProgress}
                            onResume={handleResumeSession}
                            onStart={handleStartSession}
                            streak={dashboardData.currentStreak}
                        />
                    </div>

                    {/* Auxiliary Panel (Recycle Bin) - 3/12 cols */}
                    <div className="lg:col-span-3 h-full min-h-[240px]">
                        <RecycleBin />
                    </div>
                </div>
            )}

            {/* Insights Grid */}
            {mode !== 'hero-only' && (
                <div className="space-y-6 animate-in fade-in duration-700 slide-in-from-bottom-8">

                    {/* 1. Vital Signs Row */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        {[
                            { label: 'Retention', val: `${dashboardData.retentionRate.toFixed(0)}%`, icon: Brain, color: 'text-success' },
                            { label: 'Mature Cards', val: dashboardData.stats.review, icon: CheckCircle, color: 'text-info' },
                            { label: 'Total Reviews', val: reviewHistory.length, icon: Activity, color: 'text-primary' },
                            { label: 'Total Notes', val: files.length, icon: Layers, color: 'text-secondary' },
                        ].map((stat, i) => (
                            <div key={i} className="card bg-base-100 border border-base-200 shadow-sm p-4 flex flex-col gap-1 hover:border-base-300 transition-colors">
                                <StatLabelIcon icon={stat.icon} label={stat.label} iconClassName={stat.color} />
                                <div className="text-2xl font-black text-base-content">{stat.val}</div>
                            </div>
                        ))}
                    </div>

                    {/* 2. Bento Grid */}
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 auto-rows-[minmax(300px,auto)]">
                        {/* Row 1: Retention (Wide) + Vault Health */}
                        <div className="md:col-span-2 h-full">
                            <RetentionSimulator stabilityList={dashboardData.stabilityList} reviewDays={dashboardData.reviewDays} />
                        </div>
                        <div className="md:col-span-1 h-full">
                            <VaultHealth stats={dashboardData.stats} orphanCount={dashboardData.orphanCount} />
                        </div>

                        {/* Row 2: Consistency (Wide) + Review Trends */}
                        <div className="md:col-span-2 h-full">
                            <ActivityGrid />
                        </div>
                        <div className="md:col-span-1 h-full">
                            <ReviewTrends distribution={dashboardData.ratingDist} />
                        </div>

                        {/* Row 3: Planning (3 cols) */}
                        <div className="md:col-span-1 h-full">
                            <WorkloadForecast futureCounts={dashboardData.futureCounts} />
                        </div>
                        <div className="md:col-span-1 h-full">
                            <HourlyActivity />
                        </div>
                        <div className="md:col-span-1 h-full">
                            <DifficultyDistribution folderLapses={dashboardData.folderLapses} />
                        </div>

                        {/* Row 4: Deep Analysis (Full Width) */}
                        <div className="md:col-span-3 h-full min-h-[350px]">
                            <StabilityScatter />
                        </div>
                    </div>

                </div>
            )}
        </div>
    );
};
