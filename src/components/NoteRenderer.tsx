import { useAppStore } from '../store/appStore';
import { useToastStore } from '../store/toastStore';
import { GradingBar } from './GradingBar';
import { SessionSummary } from './SessionSummary';
import { ArrowLeft, Maximize2, Minimize2, PenTool, Brain, Eye, StickyNote as StickyNoteIcon } from 'lucide-react';
import { useState, useEffect, lazy, Suspense, useRef } from 'react';
import { ThreeColumnLayout } from './shared/ThreeColumnLayout';
import { TableOfContents } from './shared/TableOfContents';
import { FileTreeView } from './shared/FileTreeView';
import { useShallow } from 'zustand/react/shallow';
import { ContentSkeleton } from './skeletons/ContentSkeleton';

const EditModeLazy = lazy(() => import('./modes/EditMode').then((m) => ({ default: m.EditMode })));
const ClozeModeLazy = lazy(() => import('./modes/ClozeMode').then((m) => ({ default: m.ClozeMode })));
const BlurModeLazy = lazy(() => import('./modes/BlurMode').then((m) => ({ default: m.BlurMode })));
const StickyBoardLazy = lazy(() => import('./sticky/StickyBoard').then((m) => ({ default: m.StickyBoard })));

export const NoteRenderer = () => {
    // ZUSTAND BEST PRACTICE: 
    // - Separate high-frequency updates (queue, sessionIndex) from stable refs (actions)
    // - fileMetadatas moved to FileTreeView for isolation (it changes frequently)
    // - Actions are stable references, can be grouped
    const {
        viewMode,
        setViewMode,
        closeNote,
        currentFilepath,
        files,
        loadNote,
        rootPath,
        currentNote,
        currentMetadata,
        suspendCard,
        skipCurrentCard,
    } = useAppStore(
        useShallow((state) => ({
            viewMode: state.viewMode,
            setViewMode: state.setViewMode,
            closeNote: state.closeNote,
            currentFilepath: state.currentFilepath,
            files: state.files,
            loadNote: state.loadNote,
            rootPath: state.rootPath,
            currentNote: state.currentNote,
            currentMetadata: state.currentMetadata,
            suspendCard: state.suspendCard,
            skipCurrentCard: state.skipCurrentCard,
        })),
    );
    // ZUSTAND: Separate subscriptions for frequently changing values
    const sessionIndex = useAppStore((state) => state.sessionIndex);
    const queue = useAppStore((state) => state.queue);
    const currentClozeIndex = useAppStore((state) => state.currentClozeIndex);
    const sessionStats = useAppStore((state) => state.sessionStats);
    const [immersive, setImmersive] = useState(false);
    const [isPeeking, setIsPeeking] = useState(false);
    const [stickyOpen, setStickyOpen] = useState(false);
    const [isHydrating, setIsHydrating] = useState(false);
    const addToast = useToastStore((state) => state.addToast);

    // UX: Close sticky notes when switching to a different file
    // Each file has its own sticky notes, so we close the panel to avoid confusion
    const prevFilepathRef = useRef(currentFilepath);
    useEffect(() => {
        if (prevFilepathRef.current !== currentFilepath) {
            setStickyOpen(false);
            prevFilepathRef.current = currentFilepath;
        }
    }, [currentFilepath]);

    // Check for stale session - redirect to library to show Resume/Discard UI
    // This effect needs to run when session state is restored by persist middleware
    const STALE_SESSION_THRESHOLD_MS = 4 * 60 * 60 * 1000; // 4 hours
    const [staleCheckDone, setStaleCheckDone] = useState(false);
    useEffect(() => {
        // Only check once after session state is available
        if (staleCheckDone) return;
        if (queue.length === 0 && sessionStats.timeStarted === 0) return; // Wait for persist to restore
        
        setStaleCheckDone(true);
        
        const hasUnfinishedSession = queue.length > 0 && sessionIndex < queue.length;
        const sessionAge = sessionStats.timeStarted ? Date.now() - sessionStats.timeStarted : Infinity;
        const isSessionStale = hasUnfinishedSession && sessionAge > STALE_SESSION_THRESHOLD_MS;
        
        // If session is stale and we're in study mode, redirect to library for Resume/Discard decision
        if (isSessionStale && (viewMode === 'test' || viewMode === 'master')) {
            setViewMode('library');
            addToast('Your session was paused. Resume or discard it from the dashboard.', 'info');
        }
    }, [queue.length, sessionStats.timeStarted, sessionIndex, viewMode, staleCheckDone, setViewMode, addToast]);

    // Restore note content if we have a filepath but no parsed note yet (e.g. after app restart)
    // PERFORMANCE: Use ref to prevent duplicate hydration calls when dependencies change
    const hydrationInProgressRef = useRef<string | null>(null);
    useEffect(() => {
        // Only hydrate if we have a filepath, no note content, and not in library view
        if (!currentFilepath || currentNote || viewMode === 'library') {
            hydrationInProgressRef.current = null;
            return;
        }
        
        // Skip if already hydrating this filepath (prevents duplicate calls)
        if (hydrationInProgressRef.current === currentFilepath) {
            return;
        }
        
        hydrationInProgressRef.current = currentFilepath;
        setIsHydrating(true);
        
        // Restore with session context (clozeIndex) if available
        const targetCloze = queue.length > 0 && sessionIndex < queue.length 
            ? queue[sessionIndex]?.clozeIndex 
            : currentClozeIndex;
            
        loadNote(currentFilepath, targetCloze).finally(() => {
            setIsHydrating(false);
            hydrationInProgressRef.current = null;
        });
    // IMPORTANT: Reduced dependencies - only re-run when filepath changes or note becomes null
    // queue/sessionIndex/currentClozeIndex are read at call time, not reactive triggers
    }, [currentFilepath, currentNote, viewMode, loadNote]);


    const isStudyMode = viewMode === 'test' || viewMode === 'master';
    const hasSessionInProgress = queue.length > 0 && sessionIndex < queue.length;
    // Use queue.length as source of truth since sessionTotal might be stale/0 after resume
    const effectiveTotal = queue.length;
    const currentQueueItem = queue[sessionIndex];
    const canSuspendCurrent = !!currentQueueItem?.cardId;

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

    // Ensure immersive mode is only active in study views
    useEffect(() => {
        if (!isStudyMode && immersive) {
            setImmersive(false);
        }
    }, [isStudyMode, immersive]);

    // Default to edit mode when opening if not already set
    useEffect(() => {
        if (viewMode === 'review') {
            setViewMode('edit');
        }
    }, [viewMode, setViewMode]);

    if (viewMode === 'summary') {
        return <SessionSummary />;
    }

    // Show loading state during hydration or when note is loading
    // This provides immediate visual feedback when user clicks a file
    if (isHydrating || (currentFilepath && !currentNote)) {
        // Cross-platform filename extraction for loading state
        const loadingNoteName = currentFilepath?.split(/[\\/]/).pop()?.replace(/\.md$/i, '') || 'Loading...';
        
        return (
            <div className="h-full w-full flex flex-col bg-base-100">
                {/* Header skeleton with actual file name */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-base-200 bg-base-100/95">
                    <div className="flex items-center gap-3 flex-1 min-w-0">
                        <div className="w-8 h-8 rounded-full bg-base-200 animate-pulse" />
                        <div className="flex flex-col min-w-0">
                            <span className="font-bold text-sm truncate">{loadingNoteName}</span>
                            {hasSessionInProgress && (
                                <span className="text-[10px] opacity-50 font-mono">
                                    {sessionIndex + 1} / {effectiveTotal}
                                </span>
                            )}
                        </div>
                    </div>
                    <div className="flex justify-center">
                        <div className="h-8 w-48 rounded-full bg-base-200 animate-pulse" />
                    </div>
                    <div className="flex justify-end gap-2 flex-1">
                        <div className="w-8 h-8 rounded-full bg-base-200/50 animate-pulse" />
                    </div>
                </div>
                
                {/* Content skeleton */}
                <div className="flex-1 flex justify-center overflow-hidden">
                    <ContentSkeleton />
                </div>
            </div>
        );
    }

    const progressPercentage = hasSessionInProgress
        ? Math.round(((Math.min(sessionIndex + 1, effectiveTotal)) / effectiveTotal) * 100)
        : 0;

    const remainingCards = hasSessionInProgress
        ? Math.max(effectiveTotal - Math.min(sessionIndex + 1, effectiveTotal), 0)
        : 0;

    // Cross-platform filename extraction (Windows uses \, Unix uses /)
    const noteName = currentFilepath?.split(/[\\/]/).pop()?.replace(/\.md$/i, '') || 'Untitled';

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
            await skipCurrentCard();
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
                {/* ZUSTAND: FileTreeView now subscribes to fileMetadatas directly */}
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
                className={`sticky top-0 left-0 right-0 flex items-center justify-between px-4 py-3 border-b border-base-200 bg-base-100/95 backdrop-blur z-40 transition-all duration-300 ${
                    immersive ? '-translate-y-16 opacity-0 pointer-events-none' : 'translate-y-0 opacity-100'
                }`}
            >
                <div className="flex items-center gap-3 flex-1 min-w-0">
                    <button
                        className="btn btn-circle btn-ghost btn-sm hover:scale-110 active:scale-90 transition-transform"
                        onClick={closeNote}
                        title="Back to Library"
                    >
                        <ArrowLeft size={18} />
                    </button>

                    <div className="flex flex-col min-w-0">
                        <span className="font-bold text-sm truncate">{noteName}</span>
                        {hasSessionInProgress && (
                            <span className="text-[10px] opacity-50 font-mono">
                                {sessionIndex + 1} / {effectiveTotal}
                            </span>
                        )}
                    </div>
                </div>

                {/* Central Controls */}
                <div className="flex-1 flex justify-center">
                    {/* Mode Toggle - only show when not in session-paused state */}
                    {!(hasSessionInProgress && !isStudyMode) && (() => {
                        const modes = [
                            { id: 'edit', label: 'Write', icon: PenTool, color: 'text-primary' },
                            { id: 'test', label: 'Cloze', icon: Brain, color: 'text-secondary' },
                            { id: 'master', label: 'Blur', icon: Eye, color: 'text-info' },
                        ].filter(m => !hasSessionInProgress || (isStudyMode && m.id !== 'edit'));
                        
                        const activeIndex = modes.findIndex(m => m.id === viewMode);
                        
                        return (
                            <div className="relative flex items-center bg-base-200/40 p-1 rounded-full border border-base-content/5">
                                {/* Sliding Background Indicator */}
                                <div
                                    className="absolute top-1 bottom-1 bg-base-100 shadow-sm rounded-full border border-base-200/50 transition-all duration-200 ease-out"
                                    style={{
                                        width: `calc(${100 / modes.length}% - 4px)`,
                                        left: activeIndex >= 0 ? `calc(${(activeIndex / modes.length) * 100}% + 2px)` : '2px',
                                    }}
                                />
                                {modes.map((mode) => {
                                    const isActive = viewMode === mode.id;
                                    return (
                                        <button
                                            key={mode.id}
                                            onClick={() => setViewMode(mode.id as any)}
                                            className={`relative z-10 btn btn-sm rounded-full px-4 border-none bg-transparent transition-colors duration-150 ${
                                                isActive 
                                                    ? mode.color
                                                    : 'text-base-content/60 hover:text-base-content'
                                            }`}
                                        >
                                            <mode.icon size={14} className="mr-2" />
                                            {mode.label}
                                        </button>
                                    );
                                })}
                            </div>
                        );
                    })()}
                    
                    {/* Resume Button - standalone when session is paused */}
                    {hasSessionInProgress && !isStudyMode && (
                        <button
                            className="btn btn-sm btn-secondary gap-2 rounded-full shadow-md"
                            onClick={() => setViewMode('test')}
                        >
                            <Brain size={14} />
                            Resume Study
                        </button>
                    )}
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
                    {/* Layer 1: Editor - no inner wrapper needed */}
                    <div
                        className={`absolute inset-0 w-full h-full overflow-hidden bg-base-100 transition-all duration-300 ease-out ${
                            viewMode === 'edit' 
                                ? 'translate-x-0 opacity-100 scale-100 z-10' 
                                : '-translate-x-[5%] opacity-0 scale-[0.98] z-0 pointer-events-none'
                        }`}
                    >
                        <Suspense fallback={<ContentSkeleton />}>
                            <EditModeLazy active={viewMode === 'edit'} />
                        </Suspense>
                    </div>

                    {/* Layer 2: Review - max-width merged into mode wrappers */}
                    <div
                        id="note-scroll-container"
                        className={`absolute inset-0 w-full h-full overflow-y-auto overflow-x-hidden bg-base-100 transition-all duration-300 ease-out ${
                            viewMode !== 'edit' 
                                ? 'translate-x-0 opacity-100 scale-100 z-10' 
                                : 'translate-x-[5%] opacity-0 scale-[0.98] z-0 pointer-events-none'
                        }`}
                    >
                        {/* Cloze Mode Layer - max-width moved here from parent wrapper */}
                        <div
                            className={`min-h-full mx-auto transition-all duration-200 ease-out ${
                                immersive ? 'max-w-5xl' : 'max-w-3xl'
                            } ${
                                viewMode === 'test' 
                                    ? 'opacity-100 pointer-events-auto' 
                                    : 'opacity-0 pointer-events-none absolute inset-0'
                            }`}
                            aria-hidden={viewMode !== 'test'}
                        >
                            <Suspense fallback={null}>
                                <ClozeModeLazy immersive={immersive} />
                            </Suspense>
                        </div>
                        
                        {/* Blur Mode Layer - max-width moved here from parent wrapper */}
                        <div
                            className={`min-h-full mx-auto transition-all duration-200 ease-out ${
                                immersive ? 'max-w-5xl' : 'max-w-3xl'
                            } ${
                                viewMode === 'master' 
                                    ? 'opacity-100 pointer-events-auto' 
                                    : 'opacity-0 pointer-events-none absolute inset-0'
                            } ${viewMode === 'master' && !isPeeking ? 'blur-[5px]' : 'blur-0'}`}
                            aria-hidden={viewMode !== 'master'}
                        >
                            <Suspense fallback={null}>
                                <BlurModeLazy immersive={immersive} />
                            </Suspense>
                        </div>
                    </div>
                </div>

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
                    <div
                        className={`fixed inset-x-0 bottom-0 z-[100] pointer-events-none pb-6 transition-all duration-300 ease-out ${
                            isStudyMode ? 'translate-y-0 opacity-100' : 'translate-y-full opacity-0'
                        }`}
                    >
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

                    {immersive && isStudyMode && (
                        <ImmersiveControls onExit={() => setImmersive(false)} remaining={hasSessionInProgress ? remainingCards : null} />
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
        <div className="absolute top-6 right-6 z-50 group animate-in fade-in slide-in-from-top-2 duration-300">
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
