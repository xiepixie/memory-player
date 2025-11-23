import { useMemo } from 'react';
import { PieChart, AlertCircle, Check } from 'lucide-react';
import { DashboardCard } from '../Shared';

export const ReviewTrends = ({ distribution }: { distribution: Record<number, number> }) => {
    const { total, segments, insight, status } = useMemo(() => {
        const t = Object.values(distribution).reduce((a, b) => a + b, 0);
        
        const config = [
            { id: 1, label: 'Again', color: 'bg-error', text: 'text-error' },
            { id: 2, label: 'Hard', color: 'bg-warning', text: 'text-warning' },
            { id: 3, label: 'Good', color: 'bg-info', text: 'text-info' },
            { id: 4, label: 'Easy', color: 'bg-success', text: 'text-success' }
        ];

        const segs = config.map(c => {
            const count = distribution[c.id] || 0;
            const pct = t > 0 ? (count / t) * 100 : 0;
            return { ...c, count, pct };
        });

        // Analysis
        let msg = "Grading is balanced.";
        let st: 'neutral' | 'warning' | 'success' = 'success';

        const againPct = segs.find(s => s.id === 1)?.pct || 0;
        const easyPct = segs.find(s => s.id === 4)?.pct || 0;

        if (againPct > 20) {
            msg = "High lapse rate (>20%). Content might be too difficult.";
            st = 'warning';
        } else if (easyPct > 60) {
            msg = "Too many 'Easy' (>60%). Consider increasing ease factor.";
            st = 'neutral';
        } else if (t < 10) {
            msg = "Need more data for insights.";
            st = 'neutral';
        }

        return { total: t, segments: segs, insight: msg, status: st };
    }, [distribution]);

    return (
        <DashboardCard icon={PieChart} title="Rating Breakdown" headerColor="text-secondary" subtitle={`${total} total reviews`}>
            <div className="flex flex-col gap-4 h-full">
                 {/* Insight Banner */}
                 <div className={`text-[10px] px-2 py-1 rounded border flex items-center gap-2
                    ${status === 'warning' ? 'bg-warning/10 border-warning/20 text-warning-content' : 
                      status === 'success' ? 'bg-success/10 border-success/20 text-success-content' : 
                      'bg-base-200/50 border-base-content/10 opacity-70'}`}>
                    {status === 'warning' ? <AlertCircle size={12} /> : <Check size={12} />}
                    <span>{insight}</span>
                </div>

                {total === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                        <PieChart size={32} className="mb-2" />
                        <div className="text-xs">No reviews yet. Complete some reviews to see trends.</div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-6 flex-1 justify-center">
                        {/* The Bar */}
                        <div className="relative h-6 w-full rounded-md overflow-hidden flex shadow-inner">
                            {segments.map(s => {
                                if (s.pct === 0) return null;
                                return (
                                    <div
                                        key={s.id}
                                        className={`${s.color} h-full transition-all hover:opacity-80 relative group`}
                                        style={{ width: `${s.pct}%` }}
                                    >
                                         <div className="opacity-0 group-hover:opacity-100 absolute inset-0 flex items-center justify-center text-[10px] font-bold text-black/50">
                                            {s.pct.toFixed(0)}%
                                         </div>
                                    </div>
                                );
                            })}
                        </div>

                        {/* Legend Grid */}
                        <div className="grid grid-cols-2 gap-3 text-xs">
                            {segments.map(s => (
                                <div key={s.id} className="flex items-center justify-between group">
                                    <div className="flex items-center gap-2">
                                        <div className={`w-2 h-2 rounded-full ${s.color}`} />
                                        <span className="opacity-70">{s.label}</span>
                                    </div>
                                    <div className="text-right flex items-center gap-2">
                                        <div className="font-mono font-bold opacity-80">{s.count}</div>
                                        <div className="text-[9px] opacity-40 w-8">{s.pct.toFixed(0)}%</div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </DashboardCard>
    );
};
