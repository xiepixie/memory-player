import { useMemo } from 'react';
import { Target, AlertTriangle } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { DashboardCard, TooltipCard } from '../Shared';

export const StabilityScatter = () => {
    const fileMetadatas = useAppStore((state) => state.fileMetadatas);

    const { points, leechCount } = useMemo(() => {
        const pts: { s: number; d: number; id: string; isLeech?: boolean }[] = [];
        let leeches = 0;

        Object.values(fileMetadatas).forEach(meta => {
            if (!meta.cards) return;
            Object.entries(meta.cards).forEach(([clozeIndex, card]) => {
                if (card.reps > 0) {
                    const isLeech = card.difficulty > 8 && card.stability < 5;
                    if (isLeech) leeches++;
                    
                    pts.push({
                        s: card.stability,
                        d: card.difficulty,
                        id: `${meta.filepath.split('/').pop()} #${clozeIndex}`,
                        isLeech
                    });
                }
            });
        });
        return { points: pts, leechCount: leeches };
    }, [fileMetadatas]);

    return (
        <DashboardCard 
            icon={Target} 
            title="Stability Matrix" 
            headerColor="text-accent" 
            subtitle={
                <div className="flex gap-2">
                    <span>{points.length} cards</span>
                    {leechCount > 0 && <span className="text-error flex items-center gap-1"><AlertTriangle size={10}/> {leechCount} leeches</span>}
                </div>
            }
        >
            <div className="relative w-full flex-1 border-l border-b border-base-300 min-h-[160px] mt-2 ml-2 mb-4">
                {/* Axis Labels */}
                <div className="absolute -left-6 top-1/2 -rotate-90 text-[10px] opacity-40 font-mono whitespace-nowrap">Difficulty</div>
                <div className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-[10px] opacity-40 font-mono whitespace-nowrap">Stability (Days)</div>

                {/* Grid Lines */}
                {[25, 50, 75, 100].map(x => (
                    <div key={x} className="absolute bottom-0 border-r border-base-300/30 h-full" style={{ left: `${x}%` }} />
                ))}
                {[2.5, 5, 7.5].map(y => (
                    <div key={y} className="absolute left-0 border-t border-base-300/30 w-full" style={{ bottom: `${y * 10}%` }} />
                ))}

                {/* Points */}
                {points.map((p, i) => (
                    <div
                        key={i}
                        className={`absolute w-2 h-2 rounded-full transition-all cursor-pointer shadow-sm group
                            ${p.isLeech ? 'bg-error z-10 animate-pulse' : 'bg-accent/40 hover:bg-accent z-0'}`}
                        style={{
                            left: `${Math.min((p.s / 100) * 100, 100)}%`, // Cap stability at 100 days for viz
                            bottom: `${Math.min((p.d / 10) * 100, 100)}%`,
                        }}
                    >
                        <div className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 hidden group-hover:block z-50 whitespace-nowrap">
                             <TooltipCard
                                title={p.id}
                                items={[
                                    { label: 'Stability', value: `${p.s.toFixed(1)}d` },
                                    { label: 'Difficulty', value: p.d.toFixed(1), color: p.d > 8 ? 'text-error' : '' }
                                ]}
                                severity={p.isLeech ? 'error' : 'neutral'}
                            />
                        </div>
                    </div>
                ))}

                {/* Hell Zone Gradient */}
                <div className="absolute top-0 left-0 w-full h-1/2 bg-gradient-to-b from-error/5 to-transparent pointer-events-none" />

                <div className="absolute top-2 left-2 text-[9px] text-error/40 font-bold uppercase tracking-widest pointer-events-none">
                    Hard & Unstable
                </div>
                 <div className="absolute bottom-2 right-2 text-[9px] text-success/40 font-bold uppercase tracking-widest pointer-events-none">
                    Solid
                </div>
            </div>
        </DashboardCard>
    );
};
