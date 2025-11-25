import { ReactNode } from 'react';

interface Props {
    label: string;
    action?: string; // e.g. "Hold" or "Press"
    keys?: string[]; // e.g. ["SPACE"]
    extraContent?: ReactNode;
    onClick?: () => void;
    className?: string;
}

// PERFORMANCE: Replaced Framer Motion with CSS animations
// motion.div triggers Framer Motion's layout system initialization

export const ModeActionHint = ({ label, action, keys = ["SPACE"], extraContent, onClick, className = "" }: Props) => {
    return (
        <div 
            className={`flex items-center gap-3 bg-base-100/60 backdrop-blur-xl border border-white/10 px-4 py-2 rounded-full shadow-lg select-none animate-in fade-in zoom-in-95 duration-200 ${onClick ? 'cursor-pointer hover:bg-base-100/80 active:scale-95 transition-all' : ''} ${className}`}
            onClick={onClick}
        >
            {action && <span className="text-xs font-medium opacity-50 uppercase tracking-wide">{action}</span>}
            
            <div className="flex gap-1">
                {keys.map(k => (
                    <kbd key={k} className="kbd kbd-sm font-sans bg-white/5 border border-white/10 text-base-content/90 min-h-[20px] h-6 px-2 text-xs font-bold shadow-none">
                        {k}
                    </kbd>
                ))}
            </div>
            
            <span className="text-xs font-medium opacity-70">{label}</span>
            
            {extraContent && (
                <>
                    <div className="w-px h-4 bg-white/10 mx-1" />
                    {extraContent}
                </>
            )}
        </div>
    );
};
