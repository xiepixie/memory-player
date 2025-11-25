import { ReactNode, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight, Menu, List } from 'lucide-react';

interface Props {
    left?: ReactNode;
    center: ReactNode;
    right?: ReactNode;
    immersive?: boolean;
    fullWidth?: boolean;
}

export const ThreeColumnLayout = ({ left, center, right, immersive = false, fullWidth = false }: Props) => {
    const [showLeft, setShowLeft] = useState(false); // Default closed to focus on content
    const [showRight, setShowRight] = useState(false);

    // Close sidebars when entering immersive mode
    useEffect(() => {
        if (immersive && (showLeft || showRight)) {
            setShowLeft(false);
            setShowRight(false);
        }
    }, [immersive]);

    return (
        <div className="flex h-full w-full overflow-hidden bg-base-100 relative">
            {/* Center Content - Always Full Width/Centered */}
            <div className="absolute inset-0 flex flex-col items-center justify-center z-0">
                <div 
                    className="w-full h-full relative transition-all duration-300 ease-in-out"
                    style={{ 
                        maxWidth: fullWidth ? "100%" : "48rem"
                    }}
                >
                    {center}
                </div>
            </div>

            {/* Left Sidebar - Floating */}
            {left && (
                <div
                    className="absolute top-0 left-0 bottom-0 w-[280px] border-r border-white/5 bg-base-100/60 backdrop-blur-xl z-20 shadow-2xl transition-all duration-300"
                    style={{
                        transform: showLeft && !immersive ? 'translateX(0)' : 'translateX(-280px)',
                        opacity: showLeft && !immersive ? 1 : 0,
                        pointerEvents: showLeft && !immersive ? 'auto' : 'none'
                    }}
                >
                    <div className="flex-1 h-full overflow-hidden">
                        {left}
                    </div>
                </div>
            )}

            {/* Toggle Left Button */}
            {left && !immersive && (
                <button
                    className="absolute bottom-6 left-6 z-30 btn btn-circle btn-sm shadow-xl border border-white/10 backdrop-blur-md text-base-content/80 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95"
                    style={{
                        transform: showLeft ? 'translateX(260px)' : 'translateX(0)',
                        backgroundColor: showLeft ? 'rgba(255,255,255,0.1)' : 'rgba(20,20,25,0.6)'
                    }}
                    onClick={() => setShowLeft(!showLeft)}
                    title={showLeft ? "Hide Explorer" : "Show Explorer"}
                >
                    {showLeft ? <ChevronLeft size={16} /> : <Menu size={16} />}
                </button>
            )}

            {/* Right Sidebar - Floating */}
            {right && (
                <div
                    className="absolute top-0 right-0 bottom-0 w-[240px] border-l border-white/5 bg-base-100/60 backdrop-blur-xl z-20 shadow-2xl transition-all duration-300"
                    style={{
                        transform: showRight && !immersive ? 'translateX(0)' : 'translateX(240px)',
                        opacity: showRight && !immersive ? 1 : 0,
                        pointerEvents: showRight && !immersive ? 'auto' : 'none'
                    }}
                >
                    <div className="flex-1 h-full overflow-hidden">
                        {right}
                    </div>
                </div>
            )}

            {/* Toggle Right Button */}
            {right && !immersive && (
                <button
                    className="absolute bottom-6 right-6 z-30 btn btn-circle btn-sm shadow-xl border border-white/10 backdrop-blur-md text-base-content/80 hover:text-white transition-all duration-200 hover:scale-110 active:scale-95"
                    style={{
                        transform: showRight ? 'translateX(-220px)' : 'translateX(0)',
                        backgroundColor: showRight ? 'rgba(255,255,255,0.1)' : 'rgba(20,20,25,0.6)'
                    }}
                    onClick={() => setShowRight(!showRight)}
                    title={showRight ? "Hide Outline" : "Show Outline"}
                >
                    {showRight ? <ChevronRight size={16} /> : <List size={16} />}
                </button>
            )}
        </div>
    );
};
