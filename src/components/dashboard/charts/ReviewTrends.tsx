import { PieChart } from 'lucide-react';
import { CardHeader } from '../Shared';

export const ReviewTrends = ({ distribution }: { distribution: Record<number, number> }) => {
    const total = Object.values(distribution).reduce((a, b) => a + b, 0);

    const config = [
        { id: 1, label: 'Again', color: 'bg-error', text: 'text-error' },
        { id: 2, label: 'Hard', color: 'bg-warning', text: 'text-warning' },
        { id: 3, label: 'Good', color: 'bg-info', text: 'text-info' },
        { id: 4, label: 'Easy', color: 'bg-success', text: 'text-success' }
    ];

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                <CardHeader icon={PieChart} title="Rating Breakdown" color="text-secondary" />

                {total === 0 ? (
                    <div className="flex-1 flex flex-col items-center justify-center opacity-40">
                        <PieChart size={32} className="mb-2" />
                        <div className="text-xs">No data yet</div>
                    </div>
                ) : (
                    <div className="flex flex-col gap-4 h-full justify-center">
                        <div className="flex h-4 w-full rounded-full overflow-hidden bg-base-200 shadow-inner">
                            {config.map(c => {
                                const count = distribution[c.id] || 0;
                                const pct = total > 0 ? (count / total) * 100 : 0;
                                if (pct === 0) return null;
                                return (
                                    <div
                                        key={c.id}
                                        className={`${c.color} h-full transition-all hover:opacity-80`}
                                        style={{ width: `${pct}%` }}
                                    />
                                );
                            })}
                        </div>

                        <div className="grid grid-cols-2 gap-3 text-xs">
                            {config.map(c => {
                                const count = distribution[c.id] || 0;
                                const pct = total > 0 ? (count / total) * 100 : 0;
                                return (
                                    <div key={c.id} className="flex items-center justify-between group">
                                        <div className="flex items-center gap-2">
                                            <div className={`w-2 h-2 rounded-full ${c.color}`} />
                                            <span className="opacity-70">{c.label}</span>
                                        </div>
                                        <div className="text-right">
                                            <div className="font-mono font-bold opacity-80">{count}</div>
                                            <div className="text-[9px] opacity-40">{pct.toFixed(0)}%</div>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
};
