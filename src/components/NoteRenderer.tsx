import { useAppStore } from '../store/appStore';
import { useToastStore } from '../store/toastStore';
import { GradingBar } from './GradingBar';
import { SessionSummary } from './SessionSummary';
import { ArrowLeft, Maximize2, Minimize2, PenTool, Brain, Eye, StickyNote as StickyNoteIcon } from 'lucide-react';
import { useState, useEffect, useRef, lazy, Suspense } from 'react';
import { ThreeColumnLayout } from './shared/ThreeColumnLayout';
import { TableOfContents } from './shared/TableOfContents';
import { FileTreeView } from './shared/FileTreeView';
import { ErrorBoundary } from './shared/ErrorBoundary';
import { VirtualizedMarkdownProvider } from './shared/VirtualizedMarkdown';
import { useShallow } from 'zustand/react/shallow';
import { ContentSkeleton } from './skeletons/ContentSkeleton';

// Move lazy components outside to avoid recreating on every render
const EditModeLazy = lazy(() => import('./modes/EditMode').then((m) => ({ default: m.EditMode })));
const ClozeModeLazy = lazy(() => import('./modes/ClozeMode').then((m) => ({ default: m.ClozeMode })));
const BlurModeLazy = lazy(() => import('./modes/BlurMode').then((m) => ({ default: m.BlurMode })));
const StickyBoardLazy = lazy(() => import('./sticky/StickyBoard').then((m) => ({ default: m.StickyBoard })));

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
        queue,
        suspendCard,
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
            queue: state.queue,
            suspendCard: state.suspendCard,
        })),
    );
    const [immersive, setImmersive] = useState(false);
    const [stickyOpen, setStickyOpen] = useState(false);
    const addToast = useToastStore((state) => state.addToast);

    // Animation: Track previous viewMode to determine transition direction
    const prevViewModeRef = useRef(viewMode);
    useEffect(() => {
        prevViewModeRef.current = viewMode;
    }, [viewMode]);
    const prevViewMode = prevViewModeRef.current;

    const isStudyMode = viewMode === 'test' || viewMode === 'master';
    const hasSessionInProgress = queue.length > 0 && sessionIndex < queue.length;
    const currentQueueItem = queue[sessionIndex];
    const canSuspendCurrent = !!currentQueueItem?.cardId;

    // Blur controls previously used a Space-to-peek behavior implemented via filter animations.
    // That path has been removed to improve performance.

    // Default to edit mode when opening if not already set
    useEffect(() => {
        if (viewMode === 'review') {
            setViewMode('edit');
        }
    }, [viewMode, setViewMode]);

    if (viewMode === 'summary') {
        return <SessionSummary />;
    }

    const progressPercentage = hasSessionInProgress
        ? Math.round(((Math.min(sessionIndex + 1, sessionTotal)) / sessionTotal) * 100)
        : 0;

    const remainingCards = hasSessionInProgress
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

    const handleSuspendCurrent = async () => {
        if (!currentQueueItem || !currentQueueItem.cardId) {
            addToast('Cannot suspend this card in the current session', 'warning');
            return;
        }

        try {
            await suspendCard(currentQueueItem.cardId, true);
            const { queue, sessionIndex } = useAppStore.getState();

            if (queue.length === 0) {
                return;
            }

            const nextIndex = sessionIndex + 1;

            // Increment skipped count for this session
            useAppStore.setState((state) => ({
                sessionStats: {
                    ...state.sessionStats,
                    skippedCount: (state.sessionStats.skippedCount || 0) + 1,
                },
            }));

            if (nextIndex < queue.length) {
                const nextItem = queue[nextIndex];
                useAppStore.setState({ sessionIndex: nextIndex });
                await useAppStore.getState().loadNote(nextItem.filepath, nextItem.clozeIndex);
            } else {
                // No more cards in this session: show summary
                useAppStore.setState({
                    currentFilepath: null,
                    currentNote: null,
                    viewMode: 'summary',
                    sessionIndex: queue.length,
                });
                useToastStore.getState().addToast('Session Complete!', 'success');
            }
        } catch (e) {
            console.error('Failed to suspend card', e);
            addToast('Failed to suspend card', 'error');
        }
    };

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
                    className="bg-transparent shadow-none p-0"
                />
            </div>
        </div>
    );

    const CenterContent = (
        <div className="h-full flex flex-col bg-base-100 relative">
            {/* Session HUD Progress Bar */}
            {hasSessionInProgress && (
                <div className="absolute top-0 left-0 right-0 h-1 z-50">
                    <div
                        className="h-full bg-secondary transition-all duration-300 ease-out"
                        style={{ width: `${progressPercentage}%` }}
                    />
                </div>
            )}

            {/* Unified Header */}
            <div
                className="sticky top-0 left-0 right-0 flex items-center justify-between px-4 py-3 border-b border-base-200 bg-base-100/95 backdrop-blur z-40 transition-all duration-300"
                style={{
                    transform: immersive ? 'translateY(-60px)' : 'translateY(0)',
                    opacity: immersive ? 0 : 1
                }}
            >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                        className="btn btn-circle btn-ghost btn-sm hover:scale-110 active:scale-90 transition-transform duration-150"
                        onClick={closeNote}
                        title="Back to Library"
                    >
                        <ArrowLeft size={18} />
                    </button>

                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-sm truncate">{noteName}</span>
                        {hasSessionInProgress && (
                            <span className="text-[10px] opacity-50 font-mono">
                                {Math.min(sessionIndex + 1, sessionTotal)} / {sessionTotal}
                            </span>
                        )}
                    </div>
                </div>

                {/* Central Controls */}
                <div className="flex-1 flex justify-center">
                    <div className="flex items-center bg-base-200/50 p-1 rounded-full border border-base-content/5 isolate">
                        {[
                            { id: 'edit', label: 'Write', icon: PenTool, color: 'text-primary' },
                            { id: 'test', label: 'Cloze', icon: Brain, color: 'text-secondary' },
                            { id: 'master', label: 'Blur', icon: Eye, color: 'text-info' },
                        ]
                            .filter(m => !hasSessionInProgress || (isStudyMode && m.id !== 'edit')) // Show all if not session; if session & study, hide edit
                            .map((mode) => {
                                const isActive = viewMode === mode.id;
                                return (
                                    <button
                                        key={mode.id}
                                        onClick={() => setViewMode(mode.id as any)}
                                        className={`relative btn btn-sm rounded-full px-4 border-none transition-all duration-200 ${
                                            isActive 
                                                ? `${mode.color} bg-base-100 shadow-sm` 
                                                : 'text-base-content/60 hover:text-base-content bg-transparent hover:bg-transparent'
                                        }`}
                                    >
                                        <mode.icon size={14} className="mr-2" />
                                        {mode.label}
                                    </button>
                                );
                            })}

                        {/* Resume Button for Session Paused State */}
                        {hasSessionInProgress && !isStudyMode && (
                            <button
                                className="btn btn-sm btn-secondary gap-2 rounded-full shadow-sm ml-2"
                                onClick={() => setViewMode('test')}
                            >
                                <Brain size={14} />
                                Resume Study
                            </button>
                        )}
                    </div>
                </div>

                {/* Right Side Actions */}
                <div className="flex-1 flex justify-end items-center gap-2">
                    {/* Contextual Actions */}
                    {hasSessionInProgress && isStudyMode && (
                        <button
                            className="btn btn-ghost btn-sm btn-circle opacity-60 hover:opacity-100"
                            onClick={() => setViewMode('edit')}
                            title="Edit Note"
                        >
                            <PenTool size={16} />
                        </button>
                    )}

                    {hasSessionInProgress && isStudyMode && canSuspendCurrent && (
                        <button
                            className="btn btn-ghost btn-sm gap-1 text-warning"
                            onClick={handleSuspendCurrent}
                            title="Suspend this card from future queues"
                        >
                            Suspend
                        </button>
                    )}

                    {!isStudyMode && !hasSessionInProgress && (
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
            </div>

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
            <Suspense fallback={null}>
                <StickyBoardLazy
                    identity={stickyIdentity}
                    isOpen={stickyOpen}
                />
            </Suspense>

            {/* Content Area - Dual Layer Persistent Architecture */}
            <div className="relative flex-1 w-full h-full overflow-hidden bg-base-100">
                {/* Layer 1: Editor (Persistent) */}
                <div
                    className="absolute inset-0 w-full h-full overflow-hidden bg-base-100 transition-opacity duration-200 ease-out"
                    style={{
                        opacity: viewMode === 'edit' ? 1 : 0,
                        zIndex: viewMode === 'edit' ? 10 : 1,
                        pointerEvents: viewMode === 'edit' ? 'auto' : 'none',
                        visibility: viewMode === 'edit' || prevViewMode === 'edit' ? 'visible' : 'hidden'
                    }}
                >
                    <div className="w-full h-full">
                        <Suspense fallback={<ContentSkeleton />}>
                            <ErrorBoundary componentName="EditMode" resetKey={currentFilepath ?? undefined}>
                                <EditModeLazy />
                            </ErrorBoundary>
                        </Suspense>
                    </div>
                </div>

                {/* Layer 2: Review (Cloze/Blur) */}
                <div
                    id="note-scroll-container"
                    className="absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden bg-base-100 transition-opacity duration-200 ease-out"
                    style={{
                        opacity: viewMode !== 'edit' ? 1 : 0,
                        zIndex: viewMode !== 'edit' ? 10 : 1,
                        pointerEvents: viewMode !== 'edit' ? 'auto' : 'none',
                        visibility: viewMode !== 'edit' || prevViewMode !== 'edit' ? 'visible' : 'hidden'
                    }}
                >
                    <div className={`min-h-full mx-auto transition-all duration-300 ${immersive ? 'max-w-5xl' : 'max-w-3xl' // Padding handled by internal components now
                        }`}>
                        {(viewMode === 'test' || viewMode === 'master' || (hasSessionInProgress && viewMode !== 'edit')) && (
                            <div
                                key={viewMode === 'master' ? 'master' : 'test'}
                                className="transition-opacity duration-150"
                                style={{ opacity: 1 }}
                            >
                                <Suspense fallback={null}>
                                    {viewMode === 'master' ? (
                                        <BlurModeLazy immersive={immersive} />
                                    ) : (
                                        <ClozeModeLazy immersive={immersive} />
                                    )}
                                </Suspense>
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Grading Bar (Only in Study Mode) - Moved to outer layout for viewport positioning */}
        </div>
    );

    return (
        <VirtualizedMarkdownProvider>
            <ThreeColumnLayout
                left={viewMode === 'edit' ? undefined : LeftSidebar}
                center={
                    <>
                        {CenterContent}
                        {/* Grading Bar (Only in Study Mode) - anchored to content column */}
                        {isStudyMode && (
                            <div
                                className="fixed inset-x-0 bottom-0 z-[100] pointer-events-none pb-6 transition-all duration-300"
                                style={{
                                    transform: isStudyMode ? 'translateY(0)' : 'translateY(100px)',
                                    opacity: isStudyMode ? 1 : 0
                                }}
                            >
                                <div
                                    className={`relative mx-auto transition-all duration-300 ${immersive
                                            ? 'max-w-5xl px-12'
                                            : 'max-w-3xl px-8'
                                        }`}
                                >
                                    <GradingBar />
                                </div>
                            </div>
                        )}

                        {immersive && (
                            <ImmersiveControls onExit={() => setImmersive(false)} remaining={hasSessionInProgress ? remainingCards : null} />
                        )}
                    </>
                }
                right={viewMode === 'edit' ? undefined : <TableOfContents />}
                immersive={immersive}
                fullWidth={viewMode === 'edit'}
            />
        </VirtualizedMarkdownProvider>
    );
}

const ImmersiveControls = ({ onExit, remaining }: { onExit: () => void; remaining: number | null }) => {
    return (
        <div
            className="absolute top-6 right-6 z-50 group transition-all duration-200"
            style={{ opacity: 1 }}
        >
            <div className="flex items-center gap-3 bg-base-100/40 backdrop-blur-md border border-base-content/5 shadow-sm hover:shadow-md rounded-full p-1.5 pr-4 transition-all duration-300 hover:bg-base-100/90">
                <button
                    className="btn btn-circle btn-sm btn-ghost bg-base-100/50 hover:bg-base-200 border-none shadow-sm"
                    onClick={onExit}
                    title="Exit Immersive Mode (ESC)"
                >
                    <Minimize2 size={16} />
                </button>

                <div className="flex flex-col">
                    <span className="text-[10px] font-bold uppercase tracking-widest opacity-40 group-hover:opacity-60 transition-opacity">
                        Focus Mode
                    </span>
                    {typeof remaining === 'number' && (
                        <span className="text-xs font-mono font-medium opacity-70">
                            {remaining} cards left
                        </span>
                    )}
                </div>
            </div>
        </div>
    );
};
