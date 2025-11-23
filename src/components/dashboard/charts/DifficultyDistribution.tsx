import { useMemo } from 'react';
import { Folder, AlertOctagon } from 'lucide-react';
import { DashboardCard, TooltipCard } from '../Shared';

export const DifficultyDistribution = ({ folderLapses }: { folderLapses: Record<string, { sum: number; count: number }> }) => {
    const { folders, maxAvg } = useMemo(() => {
        const list = Object.entries(folderLapses)
            .map(([path, stats]) => ({
                path,
                avg: stats.count ? stats.sum / stats.count : 0,
                count: stats.count,
            }))
            .sort((a, b) => b.avg - a.avg) // Descending difficulty
            .slice(0, 6);
            
        const max = Math.max(...list.map(f => f.avg), 1);
        return { folders: list, maxAvg: max };
    }, [folderLapses]);

    const getIntensity = (avg: number) => {
        // Assuming avg is Lapses or similar "Badness" metric
        if (avg > 5) return { color: 'bg-error', text: 'text-error', label: 'Critical' };
        if (avg > 2) return { color: 'bg-warning', text: 'text-warning', label: 'Hard' };
        return { color: 'bg-success', text: 'text-success', label: 'Stable' };
    };

    return (
        <DashboardCard 
            icon={AlertOctagon} 
            title="Trouble Spots" 
            headerColor="text-error"
            subtitle="Folders with highest lapse rates"
        >
            <div className="flex-1 flex flex-col gap-3 pt-2">
                {folders.length === 0 ? (
                     <div className="flex flex-col items-center justify-center flex-1 text-center opacity-40">
                        <Folder size={32} className="mb-2 opacity-20" />
                        <p className="text-xs">No lapse data yet. Trouble spots will appear here.</p>
                    </div>
                ) : (
                    folders.map((f) => {
                        const intensity = getIntensity(f.avg);
                        const widthPct = (f.avg / maxAvg) * 100;
                        const folderName = f.path === '.' ? 'Root' : f.path.split('/').pop();
                        
                        return (
                            <div key={f.path} className="relative group cursor-default">
                                {/* Tooltip */}
                                <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 whitespace-nowrap">
                                    <TooltipCard
                                        title={folderName}
                                        items={[
                                            { label: 'Avg Lapses', value: f.avg.toFixed(1) },
                                            { label: 'Cards', value: f.count },
                                            { label: 'Path', value: f.path.length > 20 ? '...'+f.path.slice(-20) : f.path }
                                        ]}
                                        severity={intensity.label === 'Critical' ? 'error' : intensity.label === 'Hard' ? 'warning' : 'success'}
                                    />
                                </div>

                                <div className="flex items-center justify-between text-xs mb-1 px-1">
                                    <div className="flex items-center gap-2 overflow-hidden">
                                        <span className="font-bold truncate max-w-[120px] opacity-90">{folderName}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <span className="opacity-50 text-[10px]">{f.count} cards</span>
                                        <span className={`font-mono font-bold ${intensity.text}`}>{f.avg.toFixed(1)}</span>
                                    </div>
                                </div>
                                
                                <div className="h-2 w-full bg-base-200 rounded-full overflow-hidden relative">
                                    <div 
                                        className={`absolute top-0 left-0 h-full rounded-full ${intensity.color} opacity-80`} 
                                        style={{ width: `${widthPct}%` }} 
                                    />
                                </div>
                            </div>
                        );
                    })
                )}
            </div>
        </DashboardCard>
    );
};
