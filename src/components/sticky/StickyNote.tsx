import { useState, useRef, useEffect } from 'react';
import { motion, useDragControls } from 'framer-motion';
import { X, Minus, Maximize2, Palette, GripHorizontal } from 'lucide-react';
import { StickyNoteData, NOTE_COLORS } from './types';

interface StickyNoteProps {
    note: StickyNoteData;
    onUpdate: (id: string, updates: Partial<StickyNoteData>) => void;
    onDelete: (id: string) => void;
    onFocus: (id: string) => void;
}

export const StickyNote = ({ note, onUpdate, onDelete, onFocus }: StickyNoteProps) => {
    const [isColorPickerOpen, setIsColorPickerOpen] = useState(false);
    const [isResizing, setIsResizing] = useState(false);
    const noteRef = useRef<HTMLDivElement>(null);
    const resizeRef = useRef<{ startX: number, startY: number, startWidth: number, startHeight: number } | null>(null);
    const dragControls = useDragControls();
    
    const theme = NOTE_COLORS[note.color];

    // Handle resize
    useEffect(() => {
        if (!isResizing) return;

        const handleMouseMove = (e: MouseEvent) => {
            if (!resizeRef.current) return;
            e.preventDefault();
            
            const deltaX = e.clientX - resizeRef.current.startX;
            const deltaY = e.clientY - resizeRef.current.startY;
            
            const newWidth = Math.max(200, resizeRef.current.startWidth + deltaX);
            const newHeight = Math.max(100, resizeRef.current.startHeight + deltaY);
            
            onUpdate(note.id, { width: newWidth, height: newHeight });
        };

        const handleMouseUp = () => {
            setIsResizing(false);
            resizeRef.current = null;
        };

        window.addEventListener('mousemove', handleMouseMove);
        window.addEventListener('mouseup', handleMouseUp);

        return () => {
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, [isResizing, note.id, onUpdate]);

    const handleDragEnd = (_: any, info: any) => {
        onUpdate(note.id, {
            x: note.x + info.offset.x,
            y: note.y + info.offset.y
        });
    };

    return (
        <motion.div
            ref={noteRef}
            initial={{ opacity: 0, scale: 0.9, x: note.x, y: note.y }}
            animate={{ 
                opacity: 1, 
                scale: 1, 
                x: note.x,
                y: note.y,
                width: note.isMinimized ? 200 : note.width,
                height: note.isMinimized ? 48 : note.height,
                zIndex: note.zIndex 
            }}
            transition={{ duration: 0.1, ease: "easeOut" }}
            exit={{ opacity: 0, scale: 0.9 }}
            drag={!isResizing} // Disable drag when resizing
            dragControls={dragControls}
            dragListener={false}
            dragMomentum={false}
            onDragEnd={handleDragEnd}
            onDragStart={() => onFocus(note.id)}
            onMouseDown={() => onFocus(note.id)}
            style={{ position: 'fixed', top: 0, left: 0 }} // Anchor to top-left to ensure x/y transforms work as expected without shifting
            className={`rounded-2xl shadow-xl backdrop-blur-md border ${theme.bg} ${theme.border} ${theme.text} overflow-hidden flex flex-col transition-colors duration-300`}
        >
            {/* Header / Drag Handle */}
            <div
                className="h-8 flex items-center justify-between px-2 cursor-grab active:cursor-grabbing select-none border-b border-black/5 dark:border-white/5 shrink-0"
                onPointerDown={(e) => {
                    if (isResizing) return;
                    const target = e.target as HTMLElement | null;
                    if (target && target.closest('button')) return;
                    dragControls.start(e);
                }}
            >
                <div className="flex items-center gap-2 opacity-60 hover:opacity-100 transition-opacity overflow-hidden">
                    <GripHorizontal size={14} />
                    {note.isMinimized && (
                        <span className="text-xs font-medium truncate max-w-[100px]">{note.content || 'Empty Note'}</span>
                    )}
                </div>
                
                <div className="flex items-center gap-1 shrink-0">
                    <div className="relative">
                        <button 
                            tabIndex={0} 
                            className="btn btn-ghost btn-xs btn-circle opacity-50 hover:opacity-100"
                            onClick={(e) => { e.stopPropagation(); setIsColorPickerOpen(!isColorPickerOpen); }}
                            onMouseDown={(e) => e.stopPropagation()}
                        >
                            <Palette size={12} />
                        </button>
                        {isColorPickerOpen && (
                            <div 
                                className="absolute top-full right-0 mt-2 p-2 shadow-xl bg-base-100 rounded-xl border border-base-300 flex flex-wrap gap-1 justify-center w-32 z-[50]"
                                onMouseDown={(e) => e.stopPropagation()}
                            >
                                {(Object.keys(NOTE_COLORS) as Array<keyof typeof NOTE_COLORS>).map((c) => (
                                    <button
                                        key={c}
                                        className={`w-6 h-6 rounded-full border border-black/10 transition-transform hover:scale-110 ${NOTE_COLORS[c].bg.split(' ')[0]}`}
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onUpdate(note.id, { color: c });
                                            setIsColorPickerOpen(false);
                                        }}
                                        title={c}
                                    />
                                ))}
                            </div>
                        )}
                    </div>

                    <button 
                        className="btn btn-ghost btn-xs btn-circle opacity-50 hover:opacity-100"
                        onClick={(e) => { e.stopPropagation(); onUpdate(note.id, { isMinimized: !note.isMinimized }); }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        {note.isMinimized ? <Maximize2 size={12} /> : <Minus size={12} />}
                    </button>

                    <button 
                        className="btn btn-ghost btn-xs btn-circle opacity-50 hover:opacity-100 hover:bg-red-500/20 hover:text-red-500"
                        onClick={(e) => { e.stopPropagation(); onDelete(note.id); }}
                        onMouseDown={(e) => e.stopPropagation()}
                    >
                        <X size={12} />
                    </button>
                </div>
            </div>

            {/* Content Area */}
            {!note.isMinimized && (
                <>
                    <div className="flex-1 relative group min-h-0">
                        <textarea
                            className={`w-full h-full bg-transparent resize-none p-3 text-sm leading-relaxed focus:outline-none placeholder-black/20 dark:placeholder-white/20 ${theme.text}`}
                            placeholder="Type your thoughts..."
                            value={note.content}
                            onChange={(e) => onUpdate(note.id, { content: e.target.value })}
                            onKeyDown={(e) => e.stopPropagation()} // Prevent global shortcuts
                        />
                    </div>
                    
                    {/* Resize Handle */}
                    <div 
                        className="absolute bottom-0 right-0 w-6 h-6 cursor-nwse-resize flex items-center justify-center group hover:bg-black/5 dark:hover:bg-white/5 rounded-tl-lg transition-colors z-10"
                        onMouseDown={(e) => {
                            e.stopPropagation();
                            e.preventDefault(); // Prevent text selection
                            resizeRef.current = {
                                startX: e.clientX,
                                startY: e.clientY,
                                startWidth: note.width,
                                startHeight: note.height
                            };
                            setIsResizing(true);
                        }}
                    >
                         <svg width="8" height="8" viewBox="0 0 8 8" fill="currentColor" className="opacity-30 group-hover:opacity-100 transition-opacity">
                            <path d="M8 8H0L8 0V8Z" />
                        </svg>
                    </div>
                    
                    {/* Footer Info */}
                    <div className="absolute bottom-1 left-2 text-[10px] opacity-30 pointer-events-none select-none font-mono">
                        {note.content.length} chars
                    </div>
                </>
            )}
        </motion.div>
    );
};
