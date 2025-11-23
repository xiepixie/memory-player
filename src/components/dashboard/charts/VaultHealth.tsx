import { useMemo } from 'react';
import { BarChart3, AlertTriangle, CheckCircle } from 'lucide-react';
import { DashboardCard } from '../Shared';

export const VaultHealth = ({ stats, orphanCount }: { stats: { new: number, learning: number, review: number, relearning: number }, orphanCount: number }) => {
    const { total, healthScore, advice, segments } = useMemo(() => {
        const activeTotal = stats.new + stats.learning + stats.review + stats.relearning;
        const total = activeTotal + orphanCount;
        
        const learningSum = stats.learning + stats.relearning;
        
        // Health Score Calculation
        // 1. Too many untracked is bad (-1 per 5% untracked)
        // 2. Healthy vault has steady mature (review) count (>50% is good)
        // 3. Too many learning (>30%) might indicate bottleneck
        
        let score = 100;
        const orphanRatio = total > 0 ? orphanCount / total : 0;
        const learningRatio = activeTotal > 0 ? learningSum / activeTotal : 0;
        const reviewRatio = activeTotal > 0 ? stats.review / activeTotal : 0;

        score -= Math.round(orphanRatio * 100); // -1 point per 1% orphan
        if (learningRatio > 0.3) score -= 10; // Penalty for overload
        if (reviewRatio < 0.2 && activeTotal > 50) score -= 10; // Penalty for low retention base
        
        score = Math.max(0, Math.min(100, score));

        // Advice
        let advice = "Vault is healthy.";
        if (orphanCount > activeTotal * 0.5) advice = "High untracked files. Consider importing.";
        else if (learningRatio > 0.4) advice = "High learning load. Reduce new cards.";
        else if (reviewRatio > 0.8) advice = "Great maturity! Add new content.";

        const segments = [
            { label: 'Mature', value: stats.review, color: 'text-success', stroke: 'text-success' },
            { label: 'Learning', value: learningSum, color: 'text-warning', stroke: 'text-warning' },
            { label: 'New', value: stats.new, color: 'text-info', stroke: 'text-info' },
            { label: 'Untracked', value: orphanCount, color: 'text-base-300', stroke: 'text-base-300' },
        ];

        return { total, healthScore: score, advice, segments };
    }, [stats, orphanCount]);

    // Donut Chart Logic
    const radius = 40;
    const circumference = 2 * Math.PI * radius;
    let currentOffset = 0;

    return (
        <DashboardCard 
            icon={BarChart3} 
            title="Vault Health" 
            headerColor={healthScore > 80 ? 'text-success' : healthScore > 50 ? 'text-warning' : 'text-error'}
            subtitle={`Score: ${healthScore}/100`}
        >
            <div className="flex flex-col h-full">
                {/* Insight Banner */}
                <div className={`text-[10px] mb-4 px-2 py-1 rounded border flex items-center gap-2
                    ${healthScore < 70 ? 'bg-warning/10 border-warning/40 text-warning' : 'bg-base-200/50 border-base-content/10 opacity-70'}`}>
                    {healthScore < 70 ? <AlertTriangle size={12} /> : <CheckCircle size={12} />}
                    <span>{advice}</span>
                </div>

                <div className="flex-1 flex items-center justify-between gap-4">
                    {/* Donut Chart */}
                    <div className="relative w-32 h-32 flex-shrink-0">
                        <svg className="w-full h-full transform -rotate-90" viewBox="0 0 100 100">
                            {/* Background Circle */}
                            <circle
                                cx="50"
                                cy="50"
                                r={radius}
                                stroke="currentColor"
                                strokeWidth="10"
                                fill="none"
                                className="text-base-200"
                            />
                            
                            {/* Segments */}
                            {segments.map((seg, i) => {
                                if (seg.value === 0) return null;
                                const pct = seg.value / total;
                                const dashArray = pct * circumference;
                                currentOffset += dashArray;
                                
                                return (
                                    <circle
                                        key={i}
                                        cx="50"
                                        cy="50"
                                        r={radius}
                                        stroke="currentColor"
                                        strokeWidth="10"
                                        fill="none"
                                        className={`${seg.stroke} transition-all duration-500`}
                                        strokeDasharray={`${dashArray} ${circumference}`}
                                        strokeDashoffset={- (currentOffset - dashArray)} // Fix offset logic
                                    />
                                );
                            })}
                        </svg>
                        <div className="absolute inset-0 flex flex-col items-center justify-center text-center pointer-events-none">
                            <div className="text-2xl font-black tracking-tighter">{total}</div>
                            <div className="text-[9px] uppercase tracking-widest opacity-40 font-bold">Cards</div>
                        </div>
                    </div>

                    {/* Legend */}
                    <div className="flex-1 space-y-2 min-w-0">
                        {segments.map((seg) => (
                            <div key={seg.label} className="flex justify-between items-center text-xs group">
                                <div className="flex items-center gap-2 min-w-0">
                                    <div className={`w-2 h-2 rounded-full ${seg.color.replace('text-', 'bg-')}`} />
                                    <span className="opacity-70 truncate">{seg.label}</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <span className="font-mono font-bold">{seg.value}</span>
                                    <span className="text-[9px] opacity-40 w-6 text-right">
                                        {total > 0 ? Math.round((seg.value / total) * 100) : 0}%
                                    </span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </DashboardCard>
    );
};
