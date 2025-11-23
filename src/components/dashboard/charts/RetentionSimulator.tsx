import { useMemo, useRef, useState, MouseEvent } from 'react';
import { Brain, Info } from 'lucide-react';
import { DashboardCard } from '../Shared';

export const RetentionSimulator = ({ stabilityList }: { stabilityList: number[] }) => {
    const [hoverDay, setHoverDay] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const { dataPoints, stats } = useMemo(() => {
        if (stabilityList.length === 0) return { dataPoints: [], stats: null };
        
        const points: { day: number; retention: number }[] = [];
        let day80 = 0;
        let found80 = false;

        for (let t = 0; t <= 31; t += 0.5) { // 0.5 resolution
            let totalR = 0;
            stabilityList.forEach(s => {
                const base = Math.max(s, 0.1);
                totalR += Math.pow(0.9, t / base);
            });
            const avgR = (totalR / stabilityList.length) * 100;
            points.push({ day: t, retention: avgR });

            if (!found80 && avgR < 80) {
                day80 = t;
                found80 = true;
            }
        }
        return { 
            dataPoints: points, 
            stats: { day80: found80 ? day80 : '>30', avgStability: (stabilityList.reduce((a,b)=>a+b,0)/stabilityList.length).toFixed(1) } 
        };
    }, [stabilityList]);

    const handleMouseMove = (e: MouseEvent) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const width = rect.width;
        // Map x to day (0-30)
        const day = Math.min(Math.max(0, (x / width) * 30), 30);
        setHoverDay(day);
    };

    const activePoint = useMemo(() => {
        if (hoverDay === null || dataPoints.length === 0) return dataPoints[dataPoints.length - 1];
        return dataPoints.reduce((prev, curr) =>
            Math.abs(curr.day - hoverDay) < Math.abs(prev.day - hoverDay) ? curr : prev
        );
    }, [hoverDay, dataPoints]);

    if (stabilityList.length === 0) {
        return (
            <DashboardCard icon={Brain} title="Forgetting Curve" headerColor="text-info">
                <div className="flex-1 flex flex-col items-center justify-center text-center gap-4 opacity-60">
                    <Brain size={32} />
                    <p className="text-xs">Complete reviews to generate curve.</p>
                </div>
            </DashboardCard>
        );
    }

    // Generate SVG Path
    const width = 100;
    const height = 100;
    const maxDay = 30;
    const maxRet = 100;

    const pointsStr = dataPoints.map(pt => {
        const x = (pt.day / maxDay) * width;
        const y = height - (pt.retention / maxRet) * height;
        return `${x},${y}`;
    }).join(' L ');

    const areaPath = `M 0,${height} L ${pointsStr} L ${width},${height} Z`;

    return (
        <DashboardCard 
            icon={Brain} 
            title="Forgetting Curve" 
            subtitle={`Avg Stability: ${stats?.avgStability}d`}
            headerColor="text-info"
        >
            <div className="flex flex-col h-full">
                {stats && (
                    <div className="text-[10px] mb-4 px-2 py-1 rounded border bg-info/10 border-info/20 text-info flex items-center gap-2">
                        <Info size={12} />
                        <span>Retention drops to 80% after <strong>{stats.day80} days</strong>.</span>
                    </div>
                )}

                <div className="flex justify-between items-end mb-2">
                    <div>
                        <div className="text-3xl font-black text-info tracking-tight">
                            {activePoint?.retention.toFixed(1)}%
                        </div>
                        <div className="text-xs font-bold opacity-50 uppercase tracking-wide mt-1">
                            Retention at Day {activePoint?.day.toFixed(1)}
                        </div>
                    </div>
                </div>

                <div
                    ref={containerRef}
                    className="h-48 w-full relative cursor-crosshair touch-none flex-1"
                    onMouseMove={handleMouseMove}
                    onMouseLeave={() => setHoverDay(null)}
                >
                    <svg viewBox="0 0 100 100" className="w-full h-full overflow-visible" preserveAspectRatio="none">
                        <defs>
                            <linearGradient id="retentionGradient" x1="0" y1="0" x2="0" y2="1">
                                <stop offset="0%" stopColor="currentColor" className="text-info" stopOpacity="0.3" />
                                <stop offset="100%" stopColor="currentColor" className="text-info" stopOpacity="0" />
                            </linearGradient>
                        </defs>

                        {/* Grid Lines */}
                        {[20, 40, 60, 80].map(ret => {
                            const y = 100 - ret;
                            return (
                                <g key={ret}>
                                    <line x1="0" y1={y} x2="100" y2={y} stroke="currentColor" className="text-base-content/5" strokeWidth="0.5" strokeDasharray="2 2" />
                                    <text x="-2" y={y+1} className="text-[4px] fill-base-content/30" textAnchor="end">{ret}%</text>
                                </g>
                            );
                        })}

                        {/* 80% Threshold Line */}
                        <line x1="0" y1="20" x2="100" y2="20" stroke="currentColor" className="text-info/30" strokeWidth="0.5" strokeDasharray="1 1" />

                        {/* The Curve */}
                        <path d={areaPath} fill="url(#retentionGradient)" />
                        <path d={`M ${pointsStr}`} fill="none" stroke="currentColor" className="text-info" strokeWidth="2.5" strokeLinecap="round" vectorEffect="non-scaling-stroke" />

                        {/* Hover Indicator */}
                        {hoverDay !== null && (
                            <g>
                                <line
                                    x1={(activePoint.day / maxDay) * 100}
                                    y1="0"
                                    x2={(activePoint.day / maxDay) * 100}
                                    y2="100"
                                    stroke="currentColor"
                                    className="text-info/50"
                                    strokeWidth="1"
                                    strokeDasharray="2 2"
                                    vectorEffect="non-scaling-stroke"
                                />
                                <circle
                                    cx={(activePoint.day / maxDay) * 100}
                                    cy={100 - (activePoint.retention / maxRet) * 100}
                                    r="4"
                                    className="fill-base-100 stroke-info stroke-2"
                                    vectorEffect="non-scaling-stroke"
                                />
                            </g>
                        )}
                    </svg>

                    {/* Axis Labels */}
                    <div className="absolute -bottom-5 left-0 right-0 flex justify-between text-[10px] font-mono opacity-40">
                        <span>Day 0</span>
                        <span>Day 15</span>
                        <span>Day 30</span>
                    </div>
                </div>
            </div>
        </DashboardCard>
    );
};
