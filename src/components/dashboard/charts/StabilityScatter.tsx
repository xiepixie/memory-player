import { useMemo } from 'react';
import { Target } from 'lucide-react';
import { useAppStore } from '../../../store/appStore';
import { CardHeader } from '../Shared';

export const StabilityScatter = () => {
    const fileMetadatas = useAppStore((state) => state.fileMetadatas);

    const points = useMemo(() => {
        const pts: { s: number; d: number; id: string }[] = [];
        Object.values(fileMetadatas).forEach(meta => {
            if (!meta.cards) return;
            Object.entries(meta.cards).forEach(([clozeIndex, card]) => {
                if (card.reps > 0) {
                    pts.push({
                        s: card.stability,
                        d: card.difficulty,
                        id: `${meta.filepath}#${clozeIndex}`
                    });
                }
            });
        });
        return pts;
    }, [fileMetadatas]);

    return (
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full overflow-hidden">
            <div className="card-body p-6">
                <CardHeader icon={Target} title="Stability vs Difficulty" color="text-accent" subtitle={`${points.length} cards`} />

                <div className="relative w-full h-48 border-l border-b border-base-300 mt-2">
                    {/* Axis Labels */}
                    <div className="absolute -left-6 top-1/2 -rotate-90 text-[10px] opacity-40 font-mono">Difficulty</div>
                    <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 text-[10px] opacity-40 font-mono">Stability (Days)</div>

                    {/* Grid Lines */}
                    {[25, 50, 75, 100].map(x => (
                        <div key={x} className="absolute bottom-0 border-r border-base-300/30 h-full" style={{ left: `${x}%` }} />
                    ))}
                    {[2.5, 5, 7.5].map(y => (
                        <div key={y} className="absolute left-0 border-t border-base-300/30 w-full" style={{ bottom: `${y * 10}%` }} />
                    ))}

                    {points.map((p, i) => (
                        <div
                            key={i}
                            className="absolute w-1.5 h-1.5 rounded-full bg-accent/40 hover:bg-accent hover:scale-150 transition-all cursor-pointer shadow-sm"
                            style={{
                                left: `${Math.min((p.s / 100) * 100, 100)}%`, // Cap stability at 100 days for viz
                                bottom: `${(p.d / 10) * 100}%`,
                            }}
                            title={`S:${p.s.toFixed(1)} D:${p.d.toFixed(1)}`}
                        />
                    ))}

                    {/* Hell Zone Gradient */}
                    <div className="absolute top-0 right-0 w-full h-full bg-gradient-to-bl from-error/5 via-transparent to-transparent pointer-events-none rounded-tr-lg" />

                    <div className="absolute top-2 right-2 text-[9px] text-error/40 font-bold uppercase tracking-widest pointer-events-none">
                        Ease Hell?
                    </div>
                </div>
            </div>
        </div>
    );
};
