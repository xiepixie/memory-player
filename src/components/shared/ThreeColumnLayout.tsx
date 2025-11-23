import { ReactNode, useState } from 'react';
import { ChevronLeft, ChevronRight, Menu, List } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

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
    if (immersive && (showLeft || showRight)) {
        setShowLeft(false);
        setShowRight(false);
    }

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
            <AnimatePresence initial={false}>
                {left && showLeft && !immersive && (
                    <motion.div
                        initial={{ x: -280, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: -280, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="absolute top-0 left-0 bottom-0 w-[280px] border-r border-white/5 bg-base-100/60 backdrop-blur-xl z-20 shadow-2xl"
                    >
                        <div className="flex-1 h-full overflow-hidden">
                            {left}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toggle Left Button */}
            {left && !immersive && (
                <motion.button
                    initial={false}
                    animate={{
                        x: showLeft ? 260 : 0,
                        backgroundColor: showLeft ? 'rgba(255,255,255,0.1)' : 'rgba(20,20,25,0.6)'
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="absolute bottom-6 left-6 z-30 btn btn-circle btn-sm shadow-xl border border-white/10 backdrop-blur-md text-base-content/80 hover:text-white transition-colors"
                    onClick={() => setShowLeft(!showLeft)}
                    title={showLeft ? "Hide Explorer" : "Show Explorer"}
                >
                    {showLeft ? <ChevronLeft size={16} /> : <Menu size={16} />}
                </motion.button>
            )}

            {/* Right Sidebar - Floating */}
            <AnimatePresence initial={false}>
                {right && showRight && !immersive && (
                    <motion.div
                        initial={{ x: 240, opacity: 0 }}
                        animate={{ x: 0, opacity: 1 }}
                        exit={{ x: 240, opacity: 0 }}
                        transition={{ duration: 0.3, ease: "easeInOut" }}
                        className="absolute top-0 right-0 bottom-0 w-[240px] border-l border-white/5 bg-base-100/60 backdrop-blur-xl z-20 shadow-2xl"
                    >
                        <div className="flex-1 h-full overflow-hidden">
                            {right}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>

            {/* Toggle Right Button */}
            {right && !immersive && (
                <motion.button
                    initial={false}
                    animate={{
                        x: showRight ? -220 : 0,
                        backgroundColor: showRight ? 'rgba(255,255,255,0.1)' : 'rgba(20,20,25,0.6)'
                    }}
                    whileHover={{ scale: 1.1 }}
                    whileTap={{ scale: 0.95 }}
                    className="absolute bottom-6 right-6 z-30 btn btn-circle btn-sm shadow-xl border border-white/10 backdrop-blur-md text-base-content/80 hover:text-white transition-colors"
                    onClick={() => setShowRight(!showRight)}
                    title={showRight ? "Hide Outline" : "Show Outline"}
                >
                    {showRight ? <ChevronRight size={16} /> : <List size={16} />}
                </motion.button>
            )}
        </div>
    );
};
