import { useMemo } from 'react';
import { Calendar } from 'lucide-react';
import { CardHeader } from '../Shared';
import { addDays, format } from 'date-fns';
import { motion } from 'framer-motion';

export const WorkloadForecast = ({ futureCounts }: { futureCounts: Record<string, number> }) => {
    const days = useMemo(() => {
        const result = [];
        for (let i = 0; i < 7; i++) {
            const date = addDays(new Date(), i);
            const key = format(date, 'yyyy-MM-dd');
            result.push({
                label: i === 0 ? 'Today' : format(date, 'EEE'),
                fullDate: format(date, 'MMM d'),
                date: key,
                count: futureCounts[key] || 0
            });
        }
        return result;
    }, [futureCounts]);

    const maxCount = Math.max(...days.map(d => d.count), 10);

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                <CardHeader icon={Calendar} title="7-Day Forecast" color="text-primary" />

                <div className="flex items-end justify-between h-40 gap-2 pt-4 relative">
                    {/* Dashed line for 'Heavy' workload hint */}
                    <div className="absolute top-1/3 left-0 right-0 border-t border-dashed border-base-300 opacity-50 text-[9px] text-base-content/30">
                        <span className="absolute -top-2 right-0">Heavy</span>
                    </div>

                    {days.map((day, i) => {
                        const heightPercent = (day.count / maxCount) * 100;
                        const isToday = i === 0;

                        return (
                            <div key={day.date} className="flex flex-col items-center gap-2 flex-1 group relative h-full justify-end">
                                <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-base-300 text-xs px-2 py-1 rounded pointer-events-none whitespace-nowrap z-20 font-mono">
                                    {day.count} cards
                                </div>

                                <div className="w-full bg-base-200/30 rounded-t-md relative flex items-end overflow-hidden h-full">
                                    <motion.div
                                        className={`w-full rounded-t-md transition-all duration-300 relative
                                            ${isToday ? 'bg-primary' : 'bg-base-content/10 group-hover:bg-primary/50'}`}
                                        initial={{ height: 0 }}
                                        animate={{ height: `${Math.max(heightPercent, 4)}%` }}
                                        transition={{ duration: 0.5, delay: i * 0.05 }}
                                    />
                                </div>

                                <span className={`text-[9px] font-bold uppercase tracking-wider text-center w-full ${isToday ? 'text-primary' : 'opacity-40'}`}>
                                    {day.label.slice(0, 1)}
                                </span>
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
};
