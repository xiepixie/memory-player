import { useState, useRef, useEffect, memo, useCallback } from 'react';
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
    const [isDragging, setIsDragging] = useState(false);
    const [position, setPosition] = useState({ x: note.x, y: note.y });
    const noteRef = useRef<HTMLDivElement>(null);
    const resizeRef = useRef<{ startX: number, startY: number, startWidth: number, startHeight: number } | null>(null);
    const dragRef = useRef<{ startX: number, startY: number, noteX: number, noteY: number } | null>(null);
    
    // Sync position when props change
    useEffect(() => {
        setPosition({ x: note.x, y: note.y });
    }, [note.x, note.y]);

    const theme = NOTE_COLORS[note.color] ?? NOTE_COLORS.primary;

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

    // Native pointer drag handler
    useEffect(() => {
        if (!isDragging) return;

        const handlePointerMove = (e: PointerEvent) => {
            if (!dragRef.current) return;
            e.preventDefault();
            
            const deltaX = e.clientX - dragRef.current.startX;
            const deltaY = e.clientY - dragRef.current.startY;
            
            setPosition({
                x: dragRef.current.noteX + deltaX,
                y: dragRef.current.noteY + deltaY
            });
        };

        const handlePointerUp = (e: PointerEvent) => {
            if (!dragRef.current) return;
            
            const deltaX = e.clientX - dragRef.current.startX;
            const deltaY = e.clientY - dragRef.current.startY;
            
            const rawX = dragRef.current.noteX + deltaX;
            const rawY = dragRef.current.noteY + deltaY;

            // Clamp to viewport
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            const minVisible = 40;
            const noteWidth = note.isMinimized ? 200 : note.width;
            const noteHeight = note.isMinimized ? 40 : note.height;

            const clampedX = Math.min(Math.max(rawX, minVisible - noteWidth), viewportWidth - minVisible);
            const clampedY = Math.min(Math.max(rawY, minVisible - noteHeight), viewportHeight - minVisible);

            onUpdate(note.id, { x: clampedX, y: clampedY });
            setIsDragging(false);
            dragRef.current = null;
            document.body.style.cursor = '';
        };

        window.addEventListener('pointermove', handlePointerMove);
        window.addEventListener('pointerup', handlePointerUp);
        document.body.style.cursor = 'grabbing';

        return () => {
            window.removeEventListener('pointermove', handlePointerMove);
            window.removeEventListener('pointerup', handlePointerUp);
            document.body.style.cursor = '';
        };
    }, [isDragging, note.id, note.width, note.height, note.isMinimized, onUpdate]);

    const handleDragStart = useCallback((e: React.PointerEvent) => {
        if (isResizing || isEditing) return;
        const target = e.target as HTMLElement;
        if (target.closest('button')) return;
        
        e.preventDefault();
        onFocus(note.id);
        dragRef.current = {
            startX: e.clientX,
            startY: e.clientY,
            noteX: position.x,
            noteY: position.y
        };
        setIsDragging(true);
    }, [isResizing, isEditing, note.id, position.x, position.y, onFocus]);

    return (
        <div
            ref={noteRef}
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                transform: `translate(${position.x}px, ${position.y}px) scale(${isDragging ? 1.02 : 1})`,
                width: note.isMinimized ? 200 : note.width,
                height: note.isMinimized ? 40 : note.height,
                zIndex: note.zIndex,
            }}
            onMouseDown={() => onFocus(note.id)}
            className={`
                group flex flex-col overflow-hidden
                rounded-lg 
                shadow-lg hover:shadow-xl transition-shadow duration-200
                backdrop-blur-sm
                ${theme.bg} ${theme.border} ${theme.text}
                border border-opacity-50
                ${isEditing ? 'shadow-2xl ring-2 ring-black/10 dark:ring-white/10' : ''}
                ${isDragging ? '' : 'transition-transform duration-100'}
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
                onPointerDown={handleDragStart}
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
                                id={`sticky-note-${note.id}`}
                                name="stickyNoteContent"
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
                                    cursor-text text-[13px] leading-relaxed
                                    space-y-1 break-words whitespace-pre-wrap
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
                                            h1: ({node, ...props}) => <h1 {...props} className="text-[18px] font-semibold mb-1 leading-snug" />,
                                            h2: ({node, ...props}) => <h2 {...props} className="text-[16px] font-semibold mb-1 leading-snug" />,
                                            h3: ({node, ...props}) => <h3 {...props} className="text-[13px] font-semibold mb-1 leading-snug" />,
                                            h4: ({node, ...props}) => <h4 {...props} className="text-[13px] font-semibold mb-1 leading-snug" />,
                                            h5: ({node, ...props}) => <h5 {...props} className="text-[13px] font-semibold mb-1 leading-snug" />,
                                            h6: ({node, ...props}) => <h6 {...props} className="text-[13px] font-semibold mb-1 leading-snug" />,
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
        </div>
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
