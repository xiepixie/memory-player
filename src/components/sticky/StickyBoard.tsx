import { useEffect, useState, useCallback, useRef } from 'react';
import { StickyNoteData } from './types';
import { StickyNote } from './StickyNote';
import { Plus, Trash2, Keyboard } from 'lucide-react';
import { createPortal } from 'react-dom';

interface StickyBoardProps {
    identity: string | null;
    isOpen: boolean;
}

export const StickyBoard = ({ identity, isOpen }: StickyBoardProps) => {
    const [notes, setNotes] = useState<StickyNoteData[]>([]);
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);
    const [showHint, setShowHint] = useState(false);
    const hintTimeoutRef = useRef<NodeJS.Timeout | null>(null);

    useEffect(() => {
        const el = document.getElementById('sticky-controls-portal');
        if (el) setPortalTarget(el);
    }, [isOpen]);

    const storageKey = identity ? `stickyNotes:${identity}` : null;
    const oldStorageKey = identity ? `stickyNote:${identity}` : null;


    const BASE_Z_INDEX = 1100;

    const getMaxZIndex = () => {
        if (notes.length === 0) return BASE_Z_INDEX;
        return Math.max(...notes.map(n => n.zIndex || 0), BASE_Z_INDEX);
    };

    // Load notes
    useEffect(() => {
        if (!storageKey) {
            setNotes([]);
            return;
        }

        let loadedNotes: StickyNoteData[] = [];
        const raw = localStorage.getItem(storageKey);
        
        if (raw) {
            try {
                loadedNotes = JSON.parse(raw);
                // Normalize z-indices on load to ensure they are above UI elements
                loadedNotes = loadedNotes.map(n => ({
                    ...n,
                    zIndex: Math.max(n.zIndex || 0, BASE_Z_INDEX)
                }));
            } catch (e) {
                console.error("Failed to parse sticky notes", e);
                loadedNotes = [];
            }
        } else if (oldStorageKey) {
            // Migration from v1
            const oldRaw = localStorage.getItem(oldStorageKey);
            if (oldRaw) {
                try {
                    const parsed = JSON.parse(oldRaw);
                    if (parsed.content) {
                        loadedNotes = [{
                            id: crypto.randomUUID(),
                            content: parsed.content,
                            x: parsed.x || 100,
                            y: parsed.y || 100,
                            width: 300,
                            height: 200,
                            color: 'yellow',
                            isMinimized: false,
                            zIndex: BASE_Z_INDEX + 1
                        }];
                    }
                } catch {}
            }
        }

        // Deep UX: If the board is open (user clicked button) but no notes exist,
        // automatically create one so the user isn't staring at an empty screen.
        if (isOpen && loadedNotes.length === 0) {
            const defaultWidth = 320;
            const defaultHeight = 300;
            const newNote: StickyNoteData = {
                id: crypto.randomUUID(),
                content: '',
                x: window.innerWidth / 2 - defaultWidth / 2,
                y: window.innerHeight / 2 - defaultHeight / 2,
                width: defaultWidth,
                height: defaultHeight,
                color: 'primary',
                isMinimized: false,
                zIndex: BASE_Z_INDEX + 1
            };
            loadedNotes = [newNote];
        }

        setNotes(loadedNotes);
    }, [storageKey, oldStorageKey, isOpen]);

    // Save notes
    useEffect(() => {
        if (!storageKey) return;
        if (notes.length > 0) {
            localStorage.setItem(storageKey, JSON.stringify(notes));
        } else {
            localStorage.removeItem(storageKey);
        }
    }, [notes, storageKey]);

    const addNote = () => {
        const defaultWidth = 320;
        const defaultHeight = 300;

        const newNote: StickyNoteData = {
            id: crypto.randomUUID(),
            content: '',
            x: window.innerWidth / 2 - defaultWidth / 2,
            y: window.innerHeight / 2 - defaultHeight / 2,
            width: defaultWidth,
            height: defaultHeight,
            color: 'primary',
            isMinimized: false,
            zIndex: getMaxZIndex() + 1
        };
        setNotes(prev => [...prev, newNote]);
    };

    const updateNote = useCallback((id: string, updates: Partial<StickyNoteData>) => {
        setNotes(prev => prev.map(n => n.id === id ? { ...n, ...updates } : n));
    }, []);

    const deleteNote = useCallback((id: string) => {
        setNotes(prev => prev.filter(n => n.id !== id));
    }, []);

    const clearAll = () => {
        if (confirm('Are you sure you want to clear all sticky notes for this card?')) {
            setNotes([]);
        }
    };

    const focusNote = useCallback((id: string) => {
        setNotes(prev => {
            const maxZ = Math.max(...prev.map(n => n.zIndex || 0), BASE_Z_INDEX);
            return prev.map(n => n.id === id ? { ...n, zIndex: maxZ + 1 } : n);
        });
    }, []);

    // Keyboard shortcuts for StickyBoard
    useEffect(() => {
        if (!isOpen) return;

        const handleKeyDown = (e: KeyboardEvent) => {
            // Ctrl/Cmd + N: Add new note
            if ((e.ctrlKey || e.metaKey) && e.key === 'n' && !e.shiftKey) {
                // Only if not in an input/textarea
                if (document.activeElement?.tagName !== 'TEXTAREA' && document.activeElement?.tagName !== 'INPUT') {
                    e.preventDefault();
                    addNote();
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isOpen]);

    // Show keyboard hint briefly when board opens
    useEffect(() => {
        if (isOpen && notes.length > 0) {
            setShowHint(true);
            hintTimeoutRef.current = setTimeout(() => setShowHint(false), 3000);
        } else {
            setShowHint(false);
        }
        return () => {
            if (hintTimeoutRef.current) clearTimeout(hintTimeoutRef.current);
        };
    }, [isOpen]);

    if (!isOpen && notes.length === 0) return null;

    return (
        <>
            {isOpen && (
                <>
                    {/* Render Notes */}
                    {notes.map(note => (
                        <StickyNote
                            key={note.id}
                            note={note}
                            onUpdate={updateNote}
                            onDelete={deleteNote}
                            onFocus={focusNote}
                        />
                    ))}

                    {/* Portal Controls to Header */}
                    {portalTarget && createPortal(
                        <div className="flex items-center gap-1 overflow-hidden animate-in fade-in slide-in-from-left-2 duration-200">
                             <div className="w-px h-4 bg-base-content/10 mx-1" />
                             <button
                                className="btn btn-xs btn-ghost btn-circle hover:bg-primary/10 hover:text-primary"
                                onClick={addNote}
                                title="Add Sticky Note (Ctrl+N)"
                            >
                                <Plus size={14} />
                            </button>
                            {notes.length > 0 && (
                                <button
                                    className="btn btn-xs btn-ghost btn-circle text-error/60 hover:text-error hover:bg-error/10"
                                    onClick={clearAll}
                                    title="Clear All Notes"
                                >
                                    <Trash2 size={14} />
                                </button>
                            )}
                            <span className="text-[10px] font-mono opacity-50 min-w-[20px] text-center select-none">
                                {notes.length}
                            </span>
                        </div>,
                        portalTarget
                    )}
                    
                    {/* Keyboard Shortcut Hint */}
                    {showHint && (
                        <div className="fixed bottom-20 left-1/2 -translate-x-1/2 z-[1200] animate-in fade-in slide-in-from-bottom-2 duration-300">
                            <div className="flex items-center gap-2 px-3 py-1.5 bg-base-100/90 backdrop-blur-sm rounded-full shadow-lg border border-base-200 text-xs">
                                <Keyboard size={12} className="opacity-50" />
                                <span className="opacity-70">Press</span>
                                <kbd className="px-1.5 py-0.5 bg-base-200 rounded text-[10px] font-mono">Ctrl+N</kbd>
                                <span className="opacity-70">for new note</span>
                            </div>
                        </div>
                    )}
                </>
            )}
        </>
    );
};
