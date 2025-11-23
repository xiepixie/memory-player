import { useMemo } from 'react';
import { useAppStore } from '../../../store/appStore';
import { Activity } from 'lucide-react';
import { format, subDays, startOfWeek, addDays } from 'date-fns';
import { CardHeader } from '../Shared';

export const ActivityHeatmap = () => {
    const reviewHistory = useAppStore((state) => state.reviewHistory);

    const activityMap = useMemo(() => {
        const map: Record<string, number> = {};
        reviewHistory.forEach(log => {
            const key = format(new Date(log.review), 'yyyy-MM-dd');
            map[key] = (map[key] || 0) + 1;
        });
        return map;
    }, [reviewHistory]);

    const { weeks, months } = useMemo(() => {
        const today = new Date();
        const numWeeks = 20; // Show more weeks
        let current = subDays(today, (numWeeks * 7) - 1);
        current = startOfWeek(current, { weekStartsOn: 1 }); // Start Monday

        const grid: { date: string; count: number; inFuture: boolean }[][] = [];
        const monthLabels: { label: string; col: number }[] = [];

        for (let w = 0; w < numWeeks; w++) {
            const week: { date: string; count: number; inFuture: boolean }[] = [];
            // Check for month change
            const weekStart = addDays(current, 0);
            if (weekStart.getDate() <= 7) {
                monthLabels.push({ label: format(weekStart, 'MMM'), col: w });
            }

            for (let d = 0; d < 7; d++) {
                const date = addDays(current, d);
                const key = format(date, 'yyyy-MM-dd');
                week.push({
                    date: key,
                    count: activityMap[key] || 0,
                    inFuture: date > today,
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
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full overflow-hidden">
            <div className="card-body p-6">
                <CardHeader
                    icon={Activity}
                    title="Consistency Graph"
                    color="text-success"
                    subtitle={`${reviewHistory.length} total reviews`}
                />

                <div className="relative mt-2">
                    {/* Month Labels */}
                    <div className="flex mb-2 text-[10px] opacity-40 font-bold uppercase tracking-wider h-4 relative w-full">
                        {months.map((m, i) => (
                            <span key={i} style={{ left: `${(m.col / weeks.length) * 100}%` }} className="absolute">
                                {m.label}
                            </span>
                        ))}
                    </div>

                    <div className="flex gap-[3px] justify-between overflow-hidden h-[100px]">
                        {weeks.map((week, i) => (
                            <div key={i} className="flex flex-col gap-[3px] h-full justify-between flex-1">
                                {week.map((day, j) => (
                                    <div
                                        key={day.date}
                                        className={`w-full h-full rounded-[1px] transition-all duration-300 relative group
                                            ${day.inFuture ? 'opacity-0' : getColor(day.count)}`}
                                    >
                                        {/* Tooltip */}
                                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 whitespace-nowrap">
                                            <div className="bg-base-300 text-xs px-2 py-1 rounded shadow-lg text-base-content">
                                                <span className="font-bold">{day.count}</span> reviews on {day.date}
                                            </div>
                                        </div>
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
        </div>
    );
};
