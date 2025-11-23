import { useMemo } from 'react';
import { Clock, Zap } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { DashboardCard, TooltipCard } from '../Shared';
import { motion } from 'framer-motion';

export const HourlyActivity = () => {
    const reviewHistory = useAppStore((state) => state.reviewHistory);

    const { hourlyData, stats } = useMemo(() => {
        // Initialize 24 hours
        const hours = Array.from({ length: 24 }, (_, i) => ({
            hour: i,
            total: 0,
            again: 0,
            hard: 0,
            good: 0,
            easy: 0,
            scoreSum: 0
        }));

        reviewHistory.forEach(log => {
            const hour = new Date(log.review).getHours();
            const h = hours[hour];
            h.total++;
            
            // Map rating to key
            if (log.rating === 1) h.again++;
            else if (log.rating === 2) h.hard++;
            else if (log.rating === 3) h.good++;
            else if (log.rating === 4) h.easy++;

            // Simple score: Again=1, Easy=4
            h.scoreSum += log.rating; 
        });

        // Find best hour (min 10 reviews to be significant)
        let bestHour = -1;
        let maxAvgScore = 0;

        hours.forEach(h => {
            if (h.total > 5) {
                const avg = h.scoreSum / h.total;
                if (avg > maxAvgScore) {
                    maxAvgScore = avg;
                    bestHour = h.hour;
                }
            }
        });

        const maxTotal = Math.max(...hours.map(h => h.total), 1);

        return { hourlyData: hours, stats: { bestHour, maxTotal } };
    }, [reviewHistory]);

    const getAmPm = (h: number) => {
        if (h === 0) return '12am';
        if (h === 12) return '12pm';
        return h > 12 ? `${h-12}pm` : `${h}am`;
    };

    return (
        <DashboardCard 
            icon={Clock} 
            title="Hourly Performance" 
            headerColor="text-purple-500" 
            subtitle="Review quality by time of day"
        >
            <div className="flex flex-col h-full">
                {stats.bestHour !== -1 && (
                    <div className="text-[10px] mb-4 px-2 py-1 rounded border bg-purple-500/10 border-purple-500/20 text-purple-700 dark:text-purple-300 flex items-center gap-2">
                        <Zap size={12} />
                        <span>Best performance around <strong>{getAmPm(stats.bestHour)}</strong> (High retention)</span>
                    </div>
                )}

                <div className="flex items-end justify-between flex-1 gap-[1px] pt-2 relative min-h-[100px]">
                    {hourlyData.map((data, i) => {
                        const heightPercent = (data.total / stats.maxTotal) * 100;
                        const hasData = data.total > 0;
                        
                        // Calculate segment heights percentages relative to the BAR height (not total chart)
                        // To stacking work with percentages of parent height, we need the parent to be the full bar height.
                        
                        return (
                            <div key={i} className="flex flex-col items-center flex-1 group relative h-full justify-end">
                                {/* Tooltip */}
                                {hasData && (
                                    <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block transition-all z-50">
                                        <TooltipCard
                                            title={`${getAmPm(data.hour)} - ${getAmPm((data.hour + 1) % 24)}`}
                                            items={[
                                                { label: 'Total', value: data.total },
                                                { label: 'Easy', value: data.easy, color: 'text-success' },
                                                { label: 'Good', value: data.good, color: 'text-info' },
                                                { label: 'Hard', value: data.hard, color: 'text-warning' },
                                                { label: 'Again', value: data.again, color: 'text-error' },
                                            ]}
                                            footer={`Avg Score: ${(data.scoreSum/data.total).toFixed(1)}/4`}
                                        />
                                    </div>
                                )}

                                {/* The Bar Container */}
                                <motion.div
                                    className={`w-full rounded-t-[1px] relative flex flex-col-reverse overflow-hidden ${hasData ? 'opacity-100' : 'bg-base-200 opacity-50'}`}
                                    initial={{ height: 0 }}
                                    animate={{ height: hasData ? `${Math.max(heightPercent, 5)}%` : '4px' }}
                                    style={{ minHeight: hasData ? '4px' : '2px' }}
                                >
                                    {/* Segments (Stacked) - render order is reversed by flex-col-reverse so bottom is first in DOM? No, flex-col-reverse means last is top. 
                                       Actually let's just use normal flex-col-reverse and put the bottom element (Again) last? 
                                       Let's use simple percentage heights.
                                    */}
                                    {hasData ? (
                                        <>
                                            <div style={{ height: `${(data.again / data.total) * 100}%` }} className="bg-error w-full transition-all duration-300" />
                                            <div style={{ height: `${(data.hard / data.total) * 100}%` }} className="bg-warning w-full transition-all duration-300" />
                                            <div style={{ height: `${(data.good / data.total) * 100}%` }} className="bg-info w-full transition-all duration-300" />
                                            <div style={{ height: `${(data.easy / data.total) * 100}%` }} className="bg-success w-full transition-all duration-300" />
                                        </>
                                    ) : null}
                                </motion.div>
                            </div>
                        );
                    })}
                </div>
                
                {/* X Axis */}
                <div className="flex justify-between text-[9px] opacity-40 font-mono mt-2 px-1">
                    <span>12am</span>
                    <span>6am</span>
                    <span>12pm</span>
                    <span>6pm</span>
                </div>
            </div>
        </DashboardCard>
    );
};
