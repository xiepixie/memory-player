import { useAppStore } from '../store/appStore';
import { ClozeMode } from './modes/ClozeMode';
import { BlurMode } from './modes/BlurMode';
import { EditMode } from './modes/EditMode';
import { GradingBar } from './GradingBar';
import { SessionSummary } from './SessionSummary';
import { ArrowLeft, Maximize2, Minimize2, PenTool, Brain, Eye, StickyNote as StickyNoteIcon } from 'lucide-react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import type React from 'react';
import { useState, useEffect } from 'react';
import { ThreeColumnLayout } from './shared/ThreeColumnLayout';
import { TableOfContents } from './shared/TableOfContents';
import { FileTreeView } from './shared/FileTreeView';
import { StickyBoard } from './sticky/StickyBoard';
import { useShallow } from 'zustand/react/shallow';

export const NoteRenderer = () => {
    const {
        viewMode,
        setViewMode,
        sessionTotal,
        sessionIndex,
        closeNote,
        currentFilepath,
        files,
        loadNote,
        fileMetadatas,
        rootPath,
        currentNote,
        currentMetadata,
    } = useAppStore(
        useShallow((state) => ({
            viewMode: state.viewMode,
            setViewMode: state.setViewMode,
            sessionTotal: state.sessionTotal,
            sessionIndex: state.sessionIndex,
            closeNote: state.closeNote,
            currentFilepath: state.currentFilepath,
            files: state.files,
            loadNote: state.loadNote,
            fileMetadatas: state.fileMetadatas,
            rootPath: state.rootPath,
            currentNote: state.currentNote,
            currentMetadata: state.currentMetadata,
        })),
    );
    const [immersive, setImmersive] = useState(false);
    const [isPeeking, setIsPeeking] = useState(false);
    const [stickyOpen, setStickyOpen] = useState(false);

    // New local state for sub-modes
    // 'write' -> 'preview' | 'source' (Handled by EditMode internally or just toggle here? Let's use viewMode for simplicity)
    // Actually, let's map the new concept to existing viewModes:
    // Write -> 'edit' (which is now split/rich)
    // Study -> 'test' (Cloze) or 'master' (Blur)

    // Let's keep viewMode in store but add a UI abstraction
    const isStudyMode = viewMode === 'test' || viewMode === 'master';
    const isSessionActive = sessionTotal > 0;

    // Blur controls for BlurMode: hold Space to temporarily reveal
    useEffect(() => {
        if (viewMode !== 'master') {
            setIsPeeking(false);
            return;
        }

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                setIsPeeking(true);
            }
        };

        const handleKeyUp = (e: KeyboardEvent) => {
            if (e.code === 'Space') {
                e.preventDefault();
                setIsPeeking(false);
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        window.addEventListener('keyup', handleKeyUp);

        return () => {
            window.removeEventListener('keydown', handleKeyDown);
            window.removeEventListener('keyup', handleKeyUp);
        };
    }, [viewMode]);

    // Default to edit mode when opening if not already set
    useEffect(() => {
        if (viewMode === 'review') {
            setViewMode('edit');
        }
    }, [viewMode, setViewMode]);

    if (viewMode === 'summary') {
        return <SessionSummary />;
    }

    const renderContent = () => {
        switch (viewMode) {
            case 'edit': return <EditMode />;
            case 'test': return <ClozeMode immersive={immersive} />;
            case 'master': return <BlurMode immersive={immersive} />;
            default: return <EditMode />;
        }
    };

    const progressPercentage = sessionTotal > 0
        ? Math.round(((Math.min(sessionIndex + 1, sessionTotal)) / sessionTotal) * 100)
        : 0;

    const remainingCards = isSessionActive
        ? Math.max(sessionTotal - Math.min(sessionIndex + 1, sessionTotal), 0)
        : 0;

    const noteName = currentFilepath?.split('/').pop() || 'Untitled';

    const hints: string[] = (currentNote?.hints || []) as string[];

    // Sticky note identity: prefer stable mp-id / noteId, fallback to filepath
    const stickyIdentity =
        ((currentNote?.frontmatter as any)?.['mp-id'] as string | undefined)
        || currentMetadata?.noteId
        || currentFilepath
        || null;

    // Left Sidebar with Tree View
    const LeftSidebar = (
        <div className="h-full flex flex-col">
            <div className="p-4 border-b border-white/5 bg-base-100/50 backdrop-blur">
                <div className="text-xs font-bold opacity-40 uppercase tracking-widest text-[10px]">Explorer</div>
            </div>
            <div className="flex-1 overflow-y-auto p-2">
                <FileTreeView
                    files={files}
                    rootPath={rootPath}
                    loadNote={loadNote}
                    metadatas={fileMetadatas}
                    className="bg-transparent shadow-none p-0"
                />
            </div>
        </div>
    );

    const CenterContent = (
        <div className="h-full flex flex-col bg-base-100 relative">
            {/* Session HUD Progress Bar */}
            {sessionTotal > 0 && (
                <div className="absolute top-0 left-0 right-0 h-1 z-50">
                    <div
                        className="h-full bg-secondary transition-all duration-300 ease-out"
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>
            )}

            {/* Unified Header */}
            <motion.div
                initial={false}
                animate={{ y: immersive ? -60 : 0, opacity: immersive ? 0 : 1 }}
                transition={{ duration: 0.3 }}
                className="sticky top-0 left-0 right-0 flex items-center justify-between px-4 py-3 border-b border-base-200 bg-base-100/95 backdrop-blur z-40"
            >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <motion.button
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.9 }}
                        className="btn btn-circle btn-ghost btn-sm"
                        onClick={closeNote}
                        title="Back to Library"
                    >
                        <ArrowLeft size={18} />
                    </motion.button>

                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-sm truncate">{noteName}</span>
                        {sessionTotal > 0 && (
                            <span className="text-[10px] opacity-50 font-mono">
                                {Math.min(sessionIndex + 1, sessionTotal)} / {sessionTotal}
                            </span>
                        )}
                    </div>
                </div>

                {/* Central Controls */}
                <div className="flex-1 flex justify-center">
                    {!isSessionActive ? (
                        // Standard Mode Switcher (Library View) - Write / Cloze / Blur
                        <div className="join bg-base-200/50 p-1 rounded-full border border-base-content/5">
                            <button
                                className={`join-item btn btn-sm rounded-full px-4 border-none transition-all ${viewMode === 'edit' ? 'bg-base-100 shadow-sm text-primary' : 'btn-ghost opacity-60 hover:opacity-100'}`}
                                onClick={() => setViewMode('edit')}
                            >
                                <PenTool size={14} className="mr-2" /> Write
                            </button>
                            <button
                                className={`join-item btn btn-sm rounded-full px-4 border-none transition-all ${viewMode === 'test' ? 'bg-base-100 shadow-sm text-secondary' : 'btn-ghost opacity-60 hover:opacity-100'}`}
                                onClick={() => setViewMode('test')}
                                title="Cloze Test"
                            >
                                <Brain size={14} className="mr-2" /> Cloze
                            </button>
                            <button
                                className={`join-item btn btn-sm rounded-full px-4 border-none transition-all ${viewMode === 'master' ? 'bg-base-100 shadow-sm text-info' : 'btn-ghost opacity-60 hover:opacity-100'}`}
                                onClick={() => setViewMode('master')}
                                title="Blur Mode"
                            >
                                <Eye size={14} className="mr-2" /> Blur
                            </button>
                        </div>
                    ) : (
                        // Session Controls (Review View)
                        isStudyMode ? (
                            <div className="join bg-base-200/50 p-1 rounded-full border border-base-content/5">
                                <button
                                    className={`join-item btn btn-sm rounded-full px-4 border-none transition-all ${viewMode === 'test' ? 'bg-base-100 shadow-sm text-primary' : 'btn-ghost opacity-60 hover:opacity-100'}`}
                                    onClick={() => setViewMode('test')}
                                    title="Cloze Test"
                                >
                                    Cloze
                                </button>
                                <button
                                    className={`join-item btn btn-sm rounded-full px-4 border-none transition-all ${viewMode === 'master' ? 'bg-base-100 shadow-sm text-secondary' : 'btn-ghost opacity-60 hover:opacity-100'}`}
                                    onClick={() => setViewMode('master')}
                                    title="Blur Mode"
                                >
                                    Blur
                                </button>
                            </div>
                        ) : (
                            <button
                                className="btn btn-sm btn-secondary gap-2 rounded-full shadow-sm"
                                onClick={() => setViewMode('test')}
                            >
                                <Brain size={14} />
                                Resume Study
                            </button>
                        )
                    )}
                </div>

                {/* Right Side Actions */}
                <div className="flex-1 flex justify-end items-center gap-2">
                    {/* Contextual Actions */}
                    {isSessionActive && isStudyMode && (
                        <button
                            className="btn btn-ghost btn-sm btn-circle opacity-60 hover:opacity-100"
                            onClick={() => setViewMode('edit')}
                            title="Edit Note"
                        >
                            <PenTool size={16} />
                        </button>
                    )}

                    {!isStudyMode && !isSessionActive && (
                         <div className="text-xs opacity-50 font-mono mr-2">
                            CTRL+S to Save
                        </div>
                    )}

                    <div className={`flex items-center transition-all duration-300 ${stickyOpen ? 'bg-base-200/50 rounded-full pr-2 border border-base-content/5' : ''}`}>
                        <button
                            className={`btn btn-ghost btn-sm btn-circle ${stickyOpen ? 'bg-base-200 text-primary' : ''}`}
                            onClick={() => setStickyOpen(prev => !prev)}
                            title="Study Sticky Note"
                        >
                            <StickyNoteIcon size={16} />
                        </button>
                        <div id="sticky-controls-portal" />
                    </div>

                    <button
                        className="btn btn-ghost btn-sm btn-circle"
                        onClick={() => setImmersive(!immersive)}
                        title={immersive ? "Exit Immersive Mode" : "Enter Immersive Mode"}
                    >
                        {immersive ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
                    </button>
                </div>
            </motion.div>

            {/* Blur Mode Study Hints Overlay */}
            {viewMode === 'master' && hints.length > 0 && (
                <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center">
                    <div className="pointer-events-auto max-w-md bg-base-100/95 border border-info/30 shadow-xl rounded-2xl px-4 py-3">
                        <div className="text-[10px] font-semibold uppercase tracking-wide text-info mb-1">
                            Study Hints
                        </div>
                        <ul className="space-y-1 text-xs leading-snug text-base-content/80">
                            {hints.map((hint, idx) => (
                                <li key={idx} className="list-disc list-inside">
                                    {hint}
                                </li>
                            ))}
                        </ul>
                        <div className="mt-2 text-[10px] opacity-60">
                            先根据这些提示回忆脉络，再按住空格查看原文核对。
                        </div>
                    </div>
                </div>
            )}

            {/* Global Study Sticky Note - available in all modes */}
            <StickyBoard
                identity={stickyIdentity}
                isOpen={stickyOpen}
            />

            {/* Content Area */}
            <LayoutGroup>
                <motion.div
                    id="note-scroll-container"
                    layout
                    className={`relative flex-1 overflow-y-auto transition-all duration-500 ease-in-out ${immersive ? 'pt-0' : 'pt-0'}`}
                >
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={currentFilepath || 'empty'}
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0, y: -10 }}
                            transition={{ duration: 0.2 }}
                            className={`mx-auto h-full transition-all duration-500 ease-in-out ${
                                viewMode === 'edit' 
                                    ? 'max-w-full' 
                                    : immersive 
                                        ? 'max-w-5xl px-12 py-12' 
                                        : 'max-w-3xl px-8 py-8'
                            }`}
                            style={viewMode === 'master' && !isPeeking
                                ? ({ filter: 'blur(6px)' } as React.CSSProperties)
                                : undefined}
                        >
                            {renderContent()}
                        </motion.div>
                    </AnimatePresence>
                </motion.div>
            </LayoutGroup>

            {/* Grading Bar (Only in Study Mode) - Moved to outer layout for viewport positioning */}
        </div>
    );

    return (
        <ThreeColumnLayout
            left={viewMode === 'edit' ? undefined : LeftSidebar}
            center={
                <>
                    {CenterContent}
                    {/* Grading Bar (Only in Study Mode) - anchored to content column */}
                    <AnimatePresence>
                        {isStudyMode && (
                            <div className="fixed inset-x-0 bottom-0 z-[100] pointer-events-none pb-6">
                                <div
                                    className={`relative mx-auto transition-all duration-300 ${
                                        immersive
                                            ? 'max-w-5xl px-12'
                                            : 'max-w-3xl px-8'
                                    }`}
                                >
                                    <GradingBar />
                                </div>
                            </div>
                        )}
                    </AnimatePresence>

                    {immersive && (
                        <ImmersiveControls onExit={() => setImmersive(false)} remaining={isSessionActive ? remainingCards : null} />
                    )}
                </>
            }
            right={viewMode === 'edit' ? undefined : <TableOfContents />}
            immersive={immersive}
            fullWidth={viewMode === 'edit'}
        />
    );
};

const ImmersiveControls = ({ onExit, remaining }: { onExit: () => void; remaining: number | null }) => {
    return (
        <motion.div
            initial={{ y: -20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            className="absolute top-4 right-4 z-50 flex items-center gap-2 bg-base-100/80 backdrop-blur-md border border-base-content/5 shadow-lg rounded-full p-1 pr-3 pl-1"
        >
            <button
                className="btn btn-circle btn-sm btn-ghost hover:bg-base-200/50"
                onClick={onExit}
                title="Exit Immersive Mode"
            >
                <Minimize2 size={16} />
            </button>
            <span className="text-xs font-medium opacity-50 select-none">Reading Mode</span>
            {typeof remaining === 'number' && (
                <span className="text-[10px] font-mono opacity-60 select-none ml-2">
                    今日剩余 {remaining} 卡
                </span>
            )}
        </motion.div>
    );
};
