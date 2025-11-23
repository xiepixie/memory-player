import { useMemo } from 'react';
import { Activity, Flame, Calendar } from 'lucide-react';
import { DashboardCard, TooltipCard } from '../Shared';
import { useAppStore } from '../../../store/appStore';
import { format, subDays, startOfWeek, addDays } from 'date-fns';

export const ActivityGrid = () => {
    const reviewHistory = useAppStore((state) => state.reviewHistory);

    const { activityMap, stats } = useMemo(() => {
        const map: Record<string, number> = {};
        const dates: number[] = []; // timestamps for sorting

        reviewHistory.forEach(log => {
            const date = new Date(log.review);
            const key = format(date, 'yyyy-MM-dd');
            map[key] = (map[key] || 0) + 1;
            dates.push(date.setHours(0,0,0,0));
        });

        // Calculate Stats
        const uniqueDates = Array.from(new Set(dates)).sort((a, b) => a - b);
        
        // Current Streak
        let currentStreak = 0;
        const today = new Date().setHours(0,0,0,0);
        let checkDate = today;
        
        // If no review today, check yesterday for streak start
        if (!uniqueDates.includes(today)) {
             checkDate = subDays(today, 1).getTime();
        }

        if (uniqueDates.includes(checkDate)) {
            currentStreak = 1;
            let i = 1;
            while (true) {
                const prev = subDays(checkDate, i).getTime();
                if (uniqueDates.includes(prev)) {
                    currentStreak++;
                    i++;
                } else {
                    break;
                }
            }
        } else if (uniqueDates.includes(today)) {
            // Case where we checked yesterday but actually we did review today (covered by first if, but just safety)
             // actually if uniqueDates includes today, the first if covers it. 
             // Wait, if today is NOT in uniqueDates, we check yesterday. If yesterday is in uniqueDates, we start counting back.
             // If neither, streak is 0.
        } else {
            currentStreak = 0;
        }

        // Active days last 30d
        const thirtyDaysAgo = subDays(today, 30).getTime();
        const activeLast30 = uniqueDates.filter(d => d >= thirtyDaysAgo).length;

        return { 
            activityMap: map, 
            stats: { 
                currentStreak, 
                totalReviews: reviewHistory.length,
                activeLast30
            } 
        };
    }, [reviewHistory]);

    const { weeks, months } = useMemo(() => {
        const today = new Date();
        const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
        const numWeeks = 20; 
        let current = subDays(today, (numWeeks * 7) - 1);
        current = startOfWeek(current, { weekStartsOn: 1 }); 

        const grid: { date: string; count: number; inFuture: boolean; fullDate: string; isToday: boolean }[][] = [];
        const monthLabels: { label: string; col: number }[] = [];

        for (let w = 0; w < numWeeks; w++) {
            const week: { date: string; count: number; inFuture: boolean; fullDate: string; isToday: boolean }[] = [];
            const weekStart = addDays(current, 0);
            if (weekStart.getDate() <= 7) {
                const baseLabel = format(weekStart, 'MMM');
                const label = monthLabels.length === 0
                    ? `${baseLabel} ${format(weekStart, 'yyyy')}`
                    : baseLabel;
                monthLabels.push({ label, col: w });
            }

            for (let d = 0; d < 7; d++) {
                const date = addDays(current, d);
                const key = format(date, 'yyyy-MM-dd');
                const isToday = date.getTime() === todayMidnight.getTime();
                week.push({
                    date: key,
                    fullDate: format(date, 'MMM d, yyyy'),
                    count: activityMap[key] || 0,
                    inFuture: date > today,
                    isToday,
                });
            }
            grid.push(week);
            current = addDays(current, 7);
        }
        return { weeks: grid, months: monthLabels };
    }, [activityMap]);

    const getColor = (count: number) => {
        if (count === 0) return 'bg-base-200';
        if (count < 5) return 'bg-emerald-200 dark:bg-emerald-900/40';
        if (count < 10) return 'bg-emerald-300 dark:bg-emerald-800';
        if (count < 20) return 'bg-emerald-400 dark:bg-emerald-600';
        return 'bg-emerald-500 dark:bg-emerald-500';
    };

    return (
        <DashboardCard 
            icon={Activity} 
            title="Consistency" 
            headerColor="text-success"
            subtitle={`${stats.totalReviews} reviews total`}
        >
            <div className="flex flex-col h-full gap-4">
                {/* Stats Row */}
                <div className="grid grid-cols-2 gap-2">
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-base-200/50 border border-base-200">
                        <div className={`p-2 rounded-md ${stats.currentStreak > 0 ? 'bg-orange-100 text-orange-600' : 'bg-base-300 text-base-content/50'}`}>
                            <Flame size={16} />
                        </div>
                        <div>
                            <div className="text-lg font-black leading-none">{stats.currentStreak}</div>
                            <div className="text-[10px] opacity-50 uppercase font-bold tracking-wider">Day Streak</div>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 p-2 rounded-lg bg-base-200/50 border border-base-200">
                        <div className="p-2 rounded-md bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400">
                            <Calendar size={16} />
                        </div>
                        <div>
                            <div className="text-lg font-black leading-none">{stats.activeLast30}/30</div>
                            <div className="text-[10px] opacity-50 uppercase font-bold tracking-wider">Active Days</div>
                        </div>
                    </div>
                </div>

                <div className="relative flex-1 min-h-0 flex flex-col justify-end">
                    {/* Month Labels */}
                    <div className="flex mb-2 text-[10px] opacity-40 font-bold uppercase tracking-wider h-4 relative w-full">
                        {months.map((m, i) => (
                            <span
                                key={i}
                                style={{ left: `${((m.col + 0.5) / weeks.length) * 100}%` }}
                                className="absolute -translate-x-1/2"
                            >
                                {m.label}
                            </span>
                        ))}
                    </div>

                    <div className="flex gap-[3px] justify-between h-24 sm:h-28 md:h-32">
                        {weeks.map((week, i) => (
                            <div key={i} className="flex flex-col gap-[3px] h-full justify-between flex-1">
                                {week.map((day) => (
                                    <div
                                        key={day.date}
                                        className={`w-full h-full rounded-[1px] transition-all duration-300 relative group
                                            ${day.inFuture ? 'opacity-0' : getColor(day.count)} ${day.isToday ? 'ring-1 ring-primary/80' : ''}`}
                                    >
                                        {/* Tooltip */}
                                        {!day.inFuture && (
                                            <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 whitespace-nowrap">
                                                <TooltipCard
                                                    title={day.fullDate}
                                                    items={[{ label: 'Reviews', value: day.count }]}
                                                    footer={day.count > 0 ? "Good job!" : "No reviews this day"}
                                                />
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        ))}
                    </div>

                    <div className="flex items-center justify-end gap-2 mt-2 text-[9px] opacity-40">
                        <span>Less</span>
                        <div className="flex gap-1">
                            <div className="w-2 h-2 bg-base-200 rounded-[1px]" />
                            <div className="w-2 h-2 bg-emerald-200 dark:bg-emerald-900/40 rounded-[1px]" />
                            <div className="w-2 h-2 bg-emerald-400 dark:bg-emerald-600 rounded-[1px]" />
                            <div className="w-2 h-2 bg-emerald-500 dark:bg-emerald-500 rounded-[1px]" />
                        </div>
                        <span>More</span>
                    </div>
                </div>
            </div>
        </DashboardCard>
    );
};
