import { useMemo, useRef, useState, MouseEvent } from 'react';
import { Brain } from 'lucide-react';
import { CardHeader } from '../Shared';

export const RetentionSimulator = ({ stabilityList }: { stabilityList: number[] }) => {
    const [hoverDay, setHoverDay] = useState<number | null>(null);
    const containerRef = useRef<HTMLDivElement>(null);

    const dataPoints = useMemo(() => {
        if (stabilityList.length === 0) return [];
        const points: { day: number; retention: number }[] = [];
        for (let t = 0; t <= 31; t += 0.5) { // 0.5 resolution
            let totalR = 0;
            stabilityList.forEach(s => {
                const base = Math.max(s, 0.1);
                totalR += Math.pow(0.9, t / base);
            });
            const avgR = (totalR / stabilityList.length) * 100;
            points.push({ day: t, retention: avgR });
        }
        return points;
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
        if (hoverDay === null || dataPoints.length === 0) return dataPoints[dataPoints.length - 1]; // Default to last
        // Find closest point
        return dataPoints.reduce((prev, curr) =>
            Math.abs(curr.day - hoverDay) < Math.abs(prev.day - hoverDay) ? curr : prev
        );
    }, [hoverDay, dataPoints]);

    if (stabilityList.length === 0) {
        return (
            <div className="card bg-base-100 shadow-sm border border-base-200 h-full">
                <div className="card-body p-6 flex flex-col items-center justify-center text-center gap-4">
                    <div className="w-16 h-16 bg-base-200 rounded-full flex items-center justify-center text-base-content/20">
                        <Brain size={32} />
                    </div>
                    <div>
                        <h3 className="text-lg font-bold">No Retention Data</h3>
                        <p className="text-sm opacity-60 max-w-xs mx-auto mt-1">
                            Complete reviews to generate your personalized forgetting curve.
                        </p>
                    </div>
                </div>
            </div>
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
        <div className="card bg-base-100 shadow-sm border border-base-200 h-full overflow-hidden group relative">
            <div className="card-body p-6 z-10">
                <CardHeader
                    icon={Brain}
                    title="Forgetting Curve"
                    subtitle="Estimated recall probability over time"
                    color="text-info"
                />

                <div className="flex justify-between items-end mb-6">
                    <div>
                        <div className="text-3xl font-black text-info tracking-tight">
                            {activePoint?.retention.toFixed(1)}%
                        </div>
                        <div className="text-xs font-bold opacity-50 uppercase tracking-wide mt-1">
                            Retention at Day {activePoint?.day.toFixed(0)}
                        </div>
                    </div>
                </div>

                <div
                    ref={containerRef}
                    className="h-48 w-full relative cursor-crosshair touch-none"
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
                        {[25, 50, 75].map(y => (
                            <line key={y} x1="0" y1={y} x2="100" y2={y} stroke="currentColor" className="text-base-content/5" strokeWidth="0.5" strokeDasharray="2 2" />
                        ))}

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
        </div>
    );
};
