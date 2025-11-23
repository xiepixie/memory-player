import { BarChart3 } from 'lucide-react';
import { CardHeader } from '../Shared';

export const VaultHealth = ({ stats, orphanCount }: { stats: { new: number, learning: number, review: number, relearning: number }, orphanCount: number }) => {
    const total = stats.new + stats.learning + stats.review + stats.relearning;
    const pNew = total ? (stats.new / total) * 100 : 0;
    const pLearn = total ? ((stats.learning + stats.relearning) / total) * 100 : 0;
    const pReview = total ? (stats.review / total) * 100 : 0;

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                <CardHeader icon={BarChart3} title="Vault Composition" color="text-secondary" />

                <div className="flex items-end gap-1 mb-6">
                    <div className="text-4xl font-black tracking-tighter text-base-content">{total}</div>
                    <div className="text-xs font-bold opacity-40 mb-1.5 ml-1 uppercase tracking-wide">Cards</div>
                </div>

                <div className="flex w-full h-4 bg-base-200 rounded-md overflow-hidden mb-6 shadow-inner">
                    <div className="bg-success h-full" style={{ width: `${pReview}%` }} />
                    <div className="bg-warning h-full" style={{ width: `${pLearn}%` }} />
                    <div className="bg-info h-full" style={{ width: `${pNew}%` }} />
                </div>

                <div className="space-y-3">
                    {[
                        { label: 'Mature', count: stats.review, color: 'bg-success' },
                        { label: 'Learning', count: stats.learning + stats.relearning, color: 'bg-warning' },
                        { label: 'New', count: stats.new, color: 'bg-info' },
                        { label: 'Untracked', count: orphanCount, color: 'bg-base-300' }
                    ].map((s) => (
                        <div key={s.label} className="flex justify-between items-center text-sm">
                            <div className="flex items-center gap-2">
                                <div className={`w-2 h-2 rounded-full ${s.color}`} />
                                <span className="opacity-70">{s.label}</span>
                            </div>
                            <span className="font-mono font-bold opacity-80">{s.count}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};
