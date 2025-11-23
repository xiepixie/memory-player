import { useMemo } from 'react';
import { Calendar, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { DashboardCard, TooltipCard } from '../Shared';
import { addDays, format } from 'date-fns';
import { motion } from 'framer-motion';

export const WorkloadForecast = ({ futureCounts }: { futureCounts: Record<string, number> }) => {
    const { days, stats } = useMemo(() => {
        const result = [];
        let total = 0;
        let max = 0;

        for (let i = 0; i < 7; i++) {
            const date = addDays(new Date(), i);
            const key = format(date, 'yyyy-MM-dd');
            const count = futureCounts[key] || 0;
            total += count;
            if (count > max) max = count;

            result.push({
                label: i === 0 ? 'Today' : format(date, 'EEE'),
                fullDate: format(date, 'MMM d'),
                date: key,
                count
            });
        }

        const avg = total / 7;
        const todayCount = result[0].count;
        const tomorrowCount = result[1].count;
        
        // Simple advice logic
        let advice = "Workload is stable.";
        let adviceType: 'neutral' | 'warning' | 'success' = 'neutral';

        if (todayCount > avg * 1.5) {
            advice = "Today is heavy. Consider reducing new cards.";
            adviceType = 'warning';
        } else if (tomorrowCount > todayCount * 1.3) {
            advice = `Prepare for +${Math.round((tomorrowCount - todayCount)/todayCount * 100)}% load tomorrow.`;
            adviceType = 'warning';
        } else if (todayCount < avg * 0.7) {
            advice = "Light day. Good time for new cards.";
            adviceType = 'success';
        }

        return { 
            days: result, 
            stats: { max, avg, todayCount, advice, adviceType } 
        };
    }, [futureCounts]);

    // Safe max for scaling (at least 10 to avoid div/0 or flat graphs)
    const graphMax = Math.max(stats.max, 10);

    const getSeverity = (count: number, avg: number) => {
        if (count > avg * 1.5) return 'warning'; // heavy
        if (count < avg * 0.6) return 'success'; // light
        return 'neutral'; 
    };

    const getColor = (severity: string, isToday: boolean) => {
        if (isToday) return 'bg-primary';
        switch (severity) {
            case 'warning': return 'bg-warning/70 group-hover:bg-warning';
            case 'success': return 'bg-emerald-400/70 group-hover:bg-emerald-400';
            default: return 'bg-base-content/20 group-hover:bg-base-content/40';
        }
    };

    return (
        <DashboardCard 
            icon={Calendar} 
            title="7-Day Forecast" 
            headerColor="text-primary"
            subtitle={
                <div className="flex items-center gap-1">
                    <span>Avg: {Math.round(stats.avg)}/day</span>
                </div>
            }
        >
            <div className="flex flex-col h-full">
                {/* Insight Banner */}
                <div className={`text-[10px] mb-4 px-2 py-1 rounded border flex items-center gap-2
                    ${stats.adviceType === 'warning' ? 'bg-warning/10 border-warning/40 text-warning' : 
                      stats.adviceType === 'success' ? 'bg-success/10 border-success/40 text-success' : 
                      'bg-base-200/50 border-base-content/10'}`}>
                    {stats.adviceType === 'warning' ? <TrendingUp size={12} /> : 
                     stats.adviceType === 'success' ? <TrendingDown size={12} /> : 
                     <Minus size={12} />}
                    {stats.advice}
                </div>

                <div className="flex items-end justify-between flex-1 gap-2 relative min-h-[100px]">
                    {/* Average Line */}
                    <div 
                        className="absolute left-0 right-0 border-t border-dashed border-base-content/20 pointer-events-none z-0"
                        style={{ bottom: `${(stats.avg / graphMax) * 100}%` }}
                    >
                        <span className="absolute -top-2.5 right-0 text-[9px] opacity-30">Avg</span>
                    </div>

                    {days.map((day, i) => {
                        const heightPercent = (day.count / graphMax) * 100;
                        const severity = getSeverity(day.count, stats.avg);
                        
                        return (
                            <div key={day.date} className="flex flex-col items-center gap-2 flex-1 group relative h-full justify-end z-10">
                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block transition-all z-50">
                                    <TooltipCard
                                        title={day.fullDate}
                                        items={[
                                            { label: 'Cards', value: day.count },
                                            { label: 'Vs Avg', value: `${day.count > stats.avg ? '+' : ''}${Math.round(((day.count - stats.avg) / stats.avg) * 100)}%`, color: day.count > stats.avg ? 'text-warning' : 'text-success' }
                                        ]}
                                        severity={severity === 'warning' ? 'warning' : 'neutral'}
                                    />
                                </div>

                                <div className="w-full bg-base-200/30 rounded-t-md relative flex items-end overflow-hidden h-full">
                                    <motion.div
                                        className={`w-full rounded-t-md relative ${getColor(severity, i === 0)}`}
                                        initial={{ height: 0 }}
                                        animate={{ height: `${Math.max(heightPercent, 4)}%` }}
                                        transition={{ duration: 0.5, delay: i * 0.05 }}
                                    />
                                </div>

                                <span className={`text-[9px] font-bold uppercase tracking-wider text-center w-full ${i === 0 ? 'text-primary' : 'opacity-40'}`}>
                                    {day.label.slice(0, 1)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </DashboardCard>
    );
};
