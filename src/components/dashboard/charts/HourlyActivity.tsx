import { useMemo } from 'react';
import { Clock } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { CardHeader } from '../Shared';
import { motion } from 'framer-motion';

export const HourlyActivity = () => {
    const reviewHistory = useAppStore((state) => state.reviewHistory);

    const hourlyData = useMemo(() => {
        const hours = new Array(24).fill(0);
        reviewHistory.forEach(log => {
            const hour = new Date(log.review).getHours();
            hours[hour]++;
        });
        return hours;
    }, [reviewHistory]);

    const maxCount = Math.max(...hourlyData, 1);

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                <CardHeader icon={Clock} title="Peak Performance" color="text-purple-500" subtitle="Reviews by hour of day" />

                <div className="flex items-end justify-between h-32 gap-[2px] pt-4">
                    {hourlyData.map((count, i) => (
                        <div key={i} className="flex flex-col items-center flex-1 group relative h-full justify-end">
                            <div className="absolute -top-8 opacity-0 group-hover:opacity-100 transition-opacity bg-base-300 text-[10px] px-2 py-1 rounded pointer-events-none whitespace-nowrap z-20 font-mono">
                                {i}:00 - {count} reviews
                            </div>
                            <motion.div
                                className={`w-full rounded-t-[1px] transition-all duration-300 ${count > 0 ? 'bg-purple-500/80 hover:bg-purple-500' : 'bg-base-200'}`}
                                initial={{ height: 0 }}
                                animate={{ height: `${(count / maxCount) * 100}%` }}
                                style={{ minHeight: count > 0 ? '4px' : '2px' }}
                            />
                        </div>
                    ))}
                </div>
                <div className="flex justify-between text-[9px] opacity-40 font-mono mt-2">
                    <span>12 AM</span>
                    <span>6 AM</span>
                    <span>12 PM</span>
                    <span>6 PM</span>
                </div>
            </div>
        </div>
    );
};
