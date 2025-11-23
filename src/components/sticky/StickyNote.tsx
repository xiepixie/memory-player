import { useState, useRef, useEffect, memo } from 'react';
import { 
    motion, 
    useDragControls, 
    useMotionValue, 
    useTransform, 
    useSpring,
    useVelocity
} from 'framer-motion';
import { X, Minus, Maximize2, Palette, Edit3, GripVertical } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { StickyNoteData, NOTE_COLORS } from './types';

const COLOR_KEYS = Object.keys(NOTE_COLORS) as Array<keyof typeof NOTE_COLORS>;

interface StickyNoteProps {
    note: StickyNoteData;
    onUpdate: (id: string, updates: Partial<StickyNoteData>) => void;
    onDelete: (id: string) => void;
    onFocus: (id: string) => void;
}

export const StickyNote = memo(({ note, onUpdate, onDelete, onFocus }: StickyNoteProps) => {
    const [isResizing, setIsResizing] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const noteRef = useRef<HTMLDivElement>(null);
    const resizeRef = useRef<{ startX: number, startY: number, startWidth: number, startHeight: number } | null>(null);
    const dragControls = useDragControls();
    
    // Motion values for physics-based interactions
    const x = useMotionValue(note.x);
    const y = useMotionValue(note.y);
    
    // Sync motion values when props change (e.g. external update or initial load)
    useEffect(() => {
        x.set(note.x);
        y.set(note.y);
    }, [note.x, note.y, x, y]);

    // Calculate rotation based on drag velocity for a natural "paper" feel
    const xVelocity = useVelocity(x);
    const rotate = useSpring(useTransform(xVelocity, [-1000, 1000], [0, 0]), {
        damping: 20,
        stiffness: 400
    });
    
    // Scale effect on drag
    const scale = useSpring(1, { damping: 20, stiffness: 300 });

    const theme = NOTE_COLORS[note.color];

    // Optimized font stack
    const fontStyle = {
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", "PingFang SC", "Hiragino Sans GB", "Microsoft YaHei", "Noto Sans SC", sans-serif'
    };

    // Handle resize logic
    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizeRef.current) return;
            e.preventDefault();
            
            const deltaX = e.clientX - resizeRef.current.startX;
            const deltaY = e.clientY - resizeRef.current.startY;
            
            const newWidth = Math.max(200, resizeRef.current.startWidth + deltaX);
            const newHeight = Math.max(100, resizeRef.current.startHeight + deltaY);
            
            // Use requestAnimationFrame for smoother visual updates during resize if needed,
            // but React state is usually fast enough for this scale.
            onUpdate(note.id, { width: newWidth, height: newHeight });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            resizeRef.current = null;
            document.body.style.cursor = '';
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'nwse-resize';

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
        };
    }, [isResizing, note.id, onUpdate]);

    const handleDragEnd = (_: any, info: any) => {
        scale.set(1);

        const rawX = note.x + info.offset.x;
        const rawY = note.y + info.offset.y;

        if (typeof window === 'undefined') {
            // Update the final position
            onUpdate(note.id, { x: rawX, y: rawY });
            return;
        }

        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;

        const minVisibleX = 40;
        const minVisibleY = 40;

        const noteWidth = note.isMinimized ? 200 : note.width;
        const noteHeight = note.isMinimized ? 40 : note.height;

        const clampedX = Math.min(
            Math.max(rawX, minVisibleX - noteWidth),
            viewportWidth - minVisibleX
        );

        const clampedY = Math.min(
            Math.max(rawY, minVisibleY - noteHeight),
            viewportHeight - minVisibleY
        );

        // Update the final position
        onUpdate(note.id, {
            x: clampedX,
            y: clampedY
        });
    };

    const handleDragStart = () => {
        onFocus(note.id);
        scale.set(1.02);
    };

    return (
        <motion.div
            ref={noteRef}
            initial={{ opacity: 0, scale: 0.9, y: note.y + 20 }}
            animate={{ 
                opacity: 1, 
                scale: 1,
                y: note.y, // Ensure y is controlled here for the initial entry
                rotate: 0 // Reset rotation when not dragging
            }}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                x, // Use motion value for performant drag
                y, // Use motion value
                rotate, // Apply physics-based rotation
                width: note.isMinimized ? 200 : note.width,
                height: note.isMinimized ? 40 : note.height,
                zIndex: note.zIndex,
                scale // Bind scale spring
            }}
            drag={!isResizing && !isEditing}
            dragControls={dragControls}
            dragListener={false} // We use the header to initiate drag
            dragMomentum={false} // Disable momentum for precise "sticky" feel
            dragElastic={0.1} // Slight elasticity when hitting edges if we had constraints
            onDragEnd={handleDragEnd}
            onDragStart={handleDragStart}
            onMouseDown={() => onFocus(note.id)}
            className={`
                group flex flex-col overflow-hidden
                rounded-lg 
                shadow-lg hover:shadow-xl transition-shadow duration-300
                backdrop-blur-sm
                ${theme.bg} ${theme.border} ${theme.text}
                border border-opacity-50
                ${isEditing ? 'shadow-2xl ring-2 ring-black/10 dark:ring-white/10' : ''}
            `}
        >
            {/* Header / Drag Handle */}
            <div
                className={`
                    h-9 flex items-center justify-between px-3
                    cursor-grab active:cursor-grabbing select-none shrink-0
                    border-b border-black/5 dark:border-white/5
                    transition-colors duration-200
                    ${note.isMinimized ? 'bg-black/5 dark:bg-white/5' : 'hover:bg-black/5 dark:hover:bg-white/5'}
                `}
                onPointerDown={(e) => {
                    if (isResizing || isEditing) return;
                    // Prevent drag if clicking a button
                    const target = e.target as HTMLElement;
                    if (target.closest('button')) return;
                    dragControls.start(e);
                }}
            >
                <div className="flex items-center gap-2 overflow-hidden flex-1">
                    <GripVertical size={14} className="opacity-40 group-hover:opacity-60 transition-opacity" />
                    {note.isMinimized && (
                        <span className="text-xs font-medium truncate opacity-80" style={fontStyle}>
                            {note.content || 'Empty Note'}
                        </span>
                    )}
                    {!note.isMinimized && (
                         <span className="text-[10px] font-bold uppercase tracking-wider opacity-30 select-none">
                            Sticky
                         </span>
                    )}
                </div>
                
                {/* Action Buttons - Fade in on hover */}
                <div className={`flex items-center gap-1 shrink-0 transition-opacity duration-200 ${isEditing ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}>
                    {!note.isMinimized && !isEditing && (
                        <ActionBtn onClick={() => setIsEditing(true)} icon={<Edit3 size={12} />} label="Edit" />
                    )}
                    <ActionBtn 
                        onClick={() => {
                            const currentIndex = COLOR_KEYS.indexOf(note.color);
                            const nextColor = COLOR_KEYS[(currentIndex + 1 + COLOR_KEYS.length) % COLOR_KEYS.length];
                            onUpdate(note.id, { color: nextColor });
                        }} 
                        icon={<Palette size={12} />} 
                        label="Color" 
                    />
                    <ActionBtn 
                        onClick={() => onUpdate(note.id, { isMinimized: !note.isMinimized })}
                        icon={note.isMinimized ? <Maximize2 size={12} /> : <Minus size={12} />}
                        label={note.isMinimized ? "Expand" : "Minimize"}
                    />
                    <ActionBtn 
                        onClick={() => onDelete(note.id)}
                        icon={<X size={12} />}
                        label="Close"
                        variant="danger"
                    />
                </div>
            </div>

            {/* Content Area */}
            <div className="flex-1 relative min-h-0">
                {!note.isMinimized && (
                    <>
                        {isEditing ? (
                            <textarea
                                autoFocus
                                className={`
                                    w-full h-full bg-transparent resize-none p-4 
                                    text-sm leading-relaxed focus:outline-none 
                                    placeholder-black/30 dark:placeholder-white/30
                                    ${theme.text}
                                `}
                                style={fontStyle}
                                placeholder="Type here..."
                                value={note.content}
                                onChange={(e) => onUpdate(note.id, { content: e.target.value })}
                                onBlur={() => setIsEditing(false)}
                                onKeyDown={(e) => {
                                    if (e.key === 'Escape') {
                                        setIsEditing(false);
                                        e.stopPropagation();
                                    }
                                    e.stopPropagation();
                                }}
                            />
                        ) : (
                            <div 
                                className={`
                                    w-full h-full p-4 overflow-y-auto custom-scrollbar 
                                    cursor-text prose prose-sm max-w-none 
                                    prose-p:my-1 prose-headings:my-2 prose-ul:my-1 prose-li:my-0 break-words whitespace-pre-wrap
                                    selection:bg-black/10 dark:selection:bg-white/20
                                `}
                                style={fontStyle}
                                onDoubleClick={() => setIsEditing(true)}
                            >
                                {note.content ? (
                                    <ReactMarkdown 
                                        remarkPlugins={[remarkGfm, remarkMath]}
                                        rehypePlugins={[rehypeKatex]}
                                        components={{
                                            a: ({node, ...props}) => <a {...props} className="underline decoration-dotted hover:decoration-solid cursor-pointer" target="_blank" rel="noopener noreferrer" />,
                                            code: ({node, ...props}) => <code {...props} className="bg-black/5 dark:bg-white/10 rounded px-1 py-0.5 text-xs font-mono" />,
                                            h1: ({node, ...props}) => <h1 {...props} className="text-sm font-semibold mb-1 leading-snug" />,
                                            h2: ({node, ...props}) => <h2 {...props} className="text-[13px] font-semibold mb-1 leading-snug opacity-90" />,
                                            h3: ({node, ...props}) => <h3 {...props} className="text-[12px] font-semibold mb-1 leading-snug opacity-80" />,
                                            li: ({node, ...props}) => <li {...props} className="my-0.5" />,
                                        }}
                                    >
                                        {note.content.replace(/\n/g, '  \n')}
                                    </ReactMarkdown>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center opacity-30 select-none pointer-events-none">
                                        <Edit3 size={24} className="mb-2 opacity-50" />
                                        <span className="text-xs">Double-click to edit</span>
                                    </div>
                                )}
                            </div>
                        )}
                        
                        {/* Footer / Info */}
                        {!isEditing && (
                            <div className="absolute bottom-1 left-3 text-[10px] opacity-0 group-hover:opacity-40 transition-opacity pointer-events-none font-mono">
                                {new Date().toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                            </div>
                        )}

                        {/* Resize Handle */}
                        <div 
                            className={`
                                absolute bottom-0 right-0 w-8 h-8 
                                cursor-nwse-resize flex items-center justify-center 
                                transition-opacity duration-200 z-10
                                ${isEditing ? 'opacity-0 pointer-events-none' : 'opacity-0 group-hover:opacity-100'}
                            `}
                            onMouseDown={(e) => {
                                e.stopPropagation();
                                e.preventDefault();
                                resizeRef.current = {
                                    startX: e.clientX,
                                    startY: e.clientY,
                                    startWidth: note.width,
                                    startHeight: note.height
                                };
                                setIsResizing(true);
                            }}
                        >
                            <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="opacity-30">
                                <path d="M8 8H0L8 0V8Z" />
                            </svg>
                        </div>
                    </>
                )}
            </div>
        </motion.div>
    );
});

// Helper sub-component for cleaner render code
const ActionBtn = ({ onClick, icon, label, variant = 'default' }: { onClick: (e: any) => void, icon: React.ReactNode, label: string, variant?: 'default' | 'danger' }) => (
    <button 
        className={`
            btn btn-ghost btn-xs btn-circle 
            ${variant === 'danger' ? 'hover:bg-red-500/20 hover:text-red-600' : 'hover:bg-black/10 dark:hover:bg-white/10'}
            opacity-60 hover:opacity-100 transition-all
        `}
        onClick={(e) => { e.stopPropagation(); onClick(e); }}
        onMouseDown={(e) => e.stopPropagation()}
        title={label}
    >
        {icon}
    </button>
);
