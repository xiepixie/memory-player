import { useMemo } from 'react';
import { Folder, ArrowRight } from 'lucide-react';
import { CardHeader } from '../Shared';

export const DifficultyDistribution = ({ folderDifficulty }: { folderDifficulty: Record<string, { sum: number; count: number }> }) => {
    const folders = useMemo(() => {
        return Object.entries(folderDifficulty)
            .map(([path, stats]) => ({
                path,
                avg: stats.sum / stats.count,
                count: stats.count,
            }))
            .sort((a, b) => b.avg - a.avg)
            .slice(0, 5);
    }, [folderDifficulty]);

    const getDifficultyColor = (avg: number) => {
        if (avg > 8) return 'bg-error text-error-content';
        if (avg > 6) return 'bg-warning text-warning-content';
        return 'bg-success text-success-content';
    };

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
            <div className="card-body p-6">
                <CardHeader icon={Folder} title="Difficulty Hotspots" color="text-warning" />

                <div className="space-y-3">
                    {folders.map((f) => (
                        <div key={f.path} className="flex items-center justify-between group p-2 -mx-2 rounded-lg hover:bg-base-200/50 transition-colors cursor-default">
                            <div className="flex items-center gap-3 overflow-hidden">
                                <div className={`w-8 h-8 rounded-md flex items-center justify-center text-xs font-bold shadow-sm ${getDifficultyColor(f.avg)}`}>
                                    {f.avg.toFixed(1)}
                                </div>
                                <div className="flex flex-col">
                                    <span className="text-sm font-bold truncate max-w-[120px]" title={f.path}>
                                        {f.path === '.' ? 'Root' : f.path.split('/').pop()}
                                    </span>
                                    <span className="text-[10px] opacity-50">{f.count} cards</span>
                                </div>
                            </div>
                            <div className="opacity-0 group-hover:opacity-100 transition-opacity">
                                <ArrowRight size={14} className="text-base-content/30" />
                            </div>
                        </div>
                    ))}
                    {folders.length === 0 && (
                        <div className="flex flex-col items-center justify-center h-40 text-center opacity-60">
                            <Folder size={24} className="mb-2 opacity-20" />
                            <p className="text-xs">No difficulty data yet.</p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
};
