import { useEffect, useState, useCallback } from 'react';
import { StickyNoteData } from './types';
import { StickyNote } from './StickyNote';
import { AnimatePresence, motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { createPortal } from 'react-dom';

interface StickyBoardProps {
    identity: string | null;
    isOpen: boolean;
}

export const StickyBoard = ({ identity, isOpen }: StickyBoardProps) => {
    const [notes, setNotes] = useState<StickyNoteData[]>([]);
    const [portalTarget, setPortalTarget] = useState<HTMLElement | null>(null);

    useEffect(() => {
        const el = document.getElementById('sticky-controls-portal');
        if (el) setPortalTarget(el);
    }, [isOpen]);

    const storageKey = identity ? `stickyNotes:${identity}` : null;
    const oldStorageKey = identity ? `stickyNote:${identity}` : null;

    // Load notes
    useEffect(() => {
        if (!storageKey) {
            setNotes([]);
            return;
        }

        const raw = localStorage.getItem(storageKey);
        if (raw) {
            try {
                setNotes(JSON.parse(raw));
            } catch (e) {
                console.error("Failed to parse sticky notes", e);
                setNotes([]);
            }
        } else if (oldStorageKey) {
            // Migration from v1
            const oldRaw = localStorage.getItem(oldStorageKey);
            if (oldRaw) {
                try {
                    const parsed = JSON.parse(oldRaw);
                    if (parsed.content) {
                        const migratedNote: StickyNoteData = {
                            id: crypto.randomUUID(),
                            content: parsed.content,
                            x: parsed.x || 100,
                            y: parsed.y || 100,
                            width: 300,
                            height: 200,
                            color: 'yellow',
                            isMinimized: false,
                            zIndex: 1
                        };
                        setNotes([migratedNote]);
                    }
                } catch {}
            }
        }
    }, [storageKey, oldStorageKey]);

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
        const newNote: StickyNoteData = {
            id: crypto.randomUUID(),
            content: '',
            x: window.innerWidth / 2 - 150,
            y: window.innerHeight / 2 - 100,
            width: 300,
            height: 200,
            color: 'yellow',
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
            const maxZ = Math.max(...prev.map(n => n.zIndex || 0), 0);
            return prev.map(n => n.id === id ? { ...n, zIndex: maxZ + 1 } : n);
        });
    }, []);

    const getMaxZIndex = () => {
        return Math.max(...notes.map(n => n.zIndex || 0), 0);
    };

    if (!isOpen && notes.length === 0) return null;

    return (
        <AnimatePresence>
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
                        <motion.div 
                            initial={{ width: 0, opacity: 0 }}
                            animate={{ width: 'auto', opacity: 1 }}
                            exit={{ width: 0, opacity: 0 }}
                            className="flex items-center gap-1 overflow-hidden"
                        >
                             <div className="w-px h-4 bg-base-content/10 mx-1" />
                             <button
                                className="btn btn-xs btn-ghost btn-circle"
                                onClick={addNote}
                                title="Add Sticky Note"
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
                        </motion.div>,
                        portalTarget
                    )}
                </>
            )}
        </AnimatePresence>
    );
};
