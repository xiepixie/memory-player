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
    const [showLeft, setShowLeft] = useState(false);
    const [showRight, setShowRight] = useState(false);

    // Close sidebars when entering immersive mode - use effect to avoid setState during render
    useEffect(() => {
        if (immersive) {
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

            {/* Left Sidebar - Floating with CSS transitions */}
            {left && !immersive && (
                <div
                    className={`absolute top-0 left-0 bottom-0 w-[280px] border-r border-white/5 bg-base-100/60 backdrop-blur-xl z-20 shadow-2xl transition-all duration-300 ease-out ${
                        showLeft ? 'translate-x-0 opacity-100' : '-translate-x-full opacity-0 pointer-events-none'
                    }`}
                >
                    <div className="flex-1 h-full overflow-hidden">
                        {left}
                    </div>
                </div>
            )}

            {/* Toggle Left Button */}
            {left && !immersive && (
                <button
                    className={`absolute bottom-6 z-30 btn btn-circle btn-sm shadow-xl border border-white/10 backdrop-blur-md text-base-content/80 hover:text-white hover:scale-110 active:scale-95 transition-all duration-300 ${
                        showLeft ? 'left-[272px] bg-white/10' : 'left-6 bg-base-300/60'
                    }`}
                    onClick={() => setShowLeft(!showLeft)}
                    title={showLeft ? "Hide Explorer" : "Show Explorer"}
                >
                    {showLeft ? <ChevronLeft size={16} /> : <Menu size={16} />}
                </button>
            )}

            {/* Right Sidebar - Floating with CSS transitions */}
            {right && !immersive && (
                <div
                    className={`absolute top-0 right-0 bottom-0 w-[240px] border-l border-white/5 bg-base-100/60 backdrop-blur-xl z-20 shadow-2xl transition-all duration-300 ease-out ${
                        showRight ? 'translate-x-0 opacity-100' : 'translate-x-full opacity-0 pointer-events-none'
                    }`}
                >
                    <div className="flex-1 h-full overflow-hidden">
                        {right}
                    </div>
                </div>
            )}

            {/* Toggle Right Button */}
            {right && !immersive && (
                <button
                    className={`absolute bottom-6 z-30 btn btn-circle btn-sm shadow-xl border border-white/10 backdrop-blur-md text-base-content/80 hover:text-white hover:scale-110 active:scale-95 transition-all duration-300 ${
                        showRight ? 'right-[232px] bg-white/10' : 'right-6 bg-base-300/60'
                    }`}
                    onClick={() => setShowRight(!showRight)}
                    title={showRight ? "Hide Outline" : "Show Outline"}
                >
                    {showRight ? <ChevronRight size={16} /> : <List size={16} />}
                </button>
            )}
        </div>
    );
};
