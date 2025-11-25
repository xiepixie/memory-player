import { useState, useMemo, useCallback, memo } from 'react';
import { FolderOpen, FileText, ChevronRight, FolderClosed } from 'lucide-react';
import { isPast, isToday } from 'date-fns';
import { useAppStore } from '../../store/appStore';

export interface TreeNode {
    name: string;
    path?: string;
    children?: Record<string, TreeNode>;
}

// Default expand depth: show 2 levels by default for better overview
const DEFAULT_EXPAND_DEPTH = 2;

/**
 * FileTreeView with direct store subscription for optimal performance.
 * 
 * ZUSTAND BEST PRACTICE:
 * - Subscribes to `fileMetadatas` directly instead of receiving it as a prop
 * - This prevents parent components (NoteRenderer) from re-rendering when metadata changes
 * - Only FileTreeView and its relevant TreeItems re-render on metadata updates
 */
export const FileTreeView = ({ files, rootPath, loadNote, className }: { 
    files: string[], 
    rootPath: string | null, 
    loadNote: (path: string) => void, 
    className?: string 
}) => {
    // ZUSTAND: Direct subscription - isolates metadata changes to this component
    const metadatas = useAppStore((state) => state.fileMetadatas);
    const rootName = useMemo(() => {
        if (!rootPath) return 'Vault';
        return rootPath.split(/[/\\]/).pop() || 'Vault';
    }, [rootPath]);

    const { tree, totalFolders, totalFiles } = useMemo(() => {
        const root: TreeNode = { name: rootName, children: {} };
        let folderCount = 0;
        let fileCount = 0;
        
        files.forEach(file => {
            const relative = rootPath ? file.replace(rootPath, '') : file;
            const parts = relative.split(/[/\\]/).filter(p => p);

            let current = root;
            parts.forEach((part, i) => {
                if (!current.children) current.children = {};
                if (!current.children[part]) {
                    current.children[part] = { name: part };
                    if (i < parts.length - 1) folderCount++;
                }
                current = current.children[part];
                if (i === parts.length - 1) {
                    current.path = file;
                    fileCount++;
                }
            });
        });
        return { tree: root, totalFolders: folderCount, totalFiles: fileCount };
    }, [files, rootPath, rootName]);

    // Expand all folders handler
    const [expandAll, setExpandAll] = useState<boolean | null>(null);
    const toggleExpandAll = useCallback(() => {
        setExpandAll(prev => prev === null ? true : !prev);
    }, []);

    return (
        <div className={`bg-transparent ${className || ''}`}>
            {/* Tree Header with stats and controls */}
            <div className="flex items-center justify-between px-2 py-1.5 mb-1 border-b border-base-200/50">
                <div className="flex items-center gap-2 text-xs text-base-content/50">
                    <span className="font-medium">{totalFiles} files</span>
                    {totalFolders > 0 && (
                        <>
                            <span className="opacity-30">•</span>
                            <span>{totalFolders} folders</span>
                        </>
                    )}
                </div>
                <button 
                    onClick={toggleExpandAll}
                    className="btn btn-ghost btn-xs text-[10px] gap-1 h-6 min-h-0 px-2 opacity-60 hover:opacity-100"
                >
                    {expandAll ? 'Collapse' : 'Expand'} All
                </button>
            </div>
            
            <div className="p-1">
                <TreeItem 
                    node={tree} 
                    depth={0} 
                    loadNote={loadNote} 
                    metadatas={metadatas} 
                    forcedOpen={true}
                    globalExpand={expandAll}
                />
            </div>
        </div>
    );
};

/**
 * TreeItem component with memo for performance optimization.
 * Only re-renders when its specific props change.
 * 
 * Performance optimizations based on Zustand/React best practices:
 * - memo() wrapper prevents re-render when parent updates but props unchanged
 * - useMemo for expensive status calculations
 * - Stable callback references
 * - Loading state for immediate click feedback
 */
const TreeItem = memo(({ node, depth, loadNote, metadatas, forcedOpen = false, globalExpand }: { 
    node: TreeNode, 
    depth: number, 
    loadNote: (path: string) => void, 
    metadatas: Record<string, any>, 
    forcedOpen?: boolean,
    globalExpand?: boolean | null
}) => {
    // Smart default: expand first N levels, or follow global toggle
    const defaultOpen = forcedOpen || depth < DEFAULT_EXPAND_DEPTH;
    const [localOpen, setLocalOpen] = useState(defaultOpen);
    const [isLoading, setIsLoading] = useState(false);
    
    // Global expand/collapse override
    const isOpen = globalExpand !== null ? globalExpand : localOpen;
    
    const hasChildren = node.children && Object.keys(node.children).length > 0;
    const childCount = hasChildren ? Object.keys(node.children!).length : 0;
    
    // Sort children: folders first, then files, alphabetically within each group
    const sortedChildren = useMemo(() => {
        if (!node.children) return [];
        return Object.values(node.children).sort((a, b) => {
            const aIsFolder = !!a.children && Object.keys(a.children).length > 0;
            const bIsFolder = !!b.children && Object.keys(b.children).length > 0;
            if (aIsFolder && !bIsFolder) return -1;
            if (!aIsFolder && bIsFolder) return 1;
            return a.name.localeCompare(b.name);
        });
    }, [node.children]);

    // PERFORMANCE: Memoize status calculation to avoid repeated date comparisons
    // This is critical for 200+ files - prevents O(N*M) date operations per render
    const { statusColor, statusDot, cardCount } = useMemo(() => {
        if (!node.path) {
            return { statusColor: '', statusDot: null, cardCount: 0 };
        }
        
        const meta = metadatas[node.path];
        const cards = meta?.cards ? Object.values(meta.cards) : [];
        const count = cards.length;
        
        if (count === 0) {
            return { statusColor: '', statusDot: null, cardCount: 0 };
        }
        
        // Aggregate status: check if any card is overdue/due/new
        let hasOverdue = false;
        let hasDueToday = false;
        let hasNew = false;
        
        for (const card of cards as any[]) {
            const isNewCard = !card || card.reps === 0;
            const dueDate = card?.due ? new Date(card.due) : null;
            
            if (isNewCard) {
                hasNew = true;
            } else if (dueDate && isPast(dueDate) && !isToday(dueDate)) {
                hasOverdue = true;
                break; // Overdue is highest priority, no need to check more
            } else if (dueDate && isToday(dueDate)) {
                hasDueToday = true;
            }
        }
        
        // Priority: Overdue > Due Today > New
        if (hasOverdue) {
            return {
                statusColor: 'text-error',
                statusDot: <div className="w-1.5 h-1.5 rounded-full bg-error animate-pulse" title="Has overdue cards" />,
                cardCount: count
            };
        } else if (hasDueToday) {
            return {
                statusColor: 'text-warning',
                statusDot: <div className="w-1.5 h-1.5 rounded-full bg-warning" title="Has cards due today" />,
                cardCount: count
            };
        } else if (hasNew) {
            return {
                statusColor: 'text-info',
                statusDot: <div className="w-1.5 h-1.5 rounded-full bg-info/70" title="Has new cards" />,
                cardCount: count
            };
        }
        
        return { statusColor: '', statusDot: null, cardCount: count };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [node.path, node.path ? metadatas[node.path]?.cards : null]); // Only recalculate when this file's metadata changes

    // PERFORMANCE: Optimized click handler with immediate visual feedback
    const handleClick = async () => {
        if (hasChildren) {
            setLocalOpen(!localOpen);
        } else if (node.path) {
            // Prevent double clicks
            if (isLoading) return;
            
            // Set loading state immediately for visual feedback
            setIsLoading(true);
            
            try {
                // Allow React to paint loading state before async work
                await new Promise(resolve => setTimeout(resolve, 0));
                await loadNote(node.path);
            } finally {
                setIsLoading(false);
            }
        }
    };

    return (
        <div className="flex flex-col select-none">
            <div
                className={`group flex items-center gap-1.5 py-1 px-1 rounded-md cursor-pointer transition-colors
                    ${hasChildren ? 'hover:bg-base-200/50' : ''}
                    ${!hasChildren && isLoading ? 'bg-primary/10 text-primary' : ''}
                    ${!hasChildren && !isLoading ? 'hover:bg-primary/5 hover:text-primary' : ''}
                    ${!hasChildren && statusColor && !isLoading ? statusColor : ''}`}
                style={{ paddingLeft: `${depth * 14 + 4}px` }}
                onClick={handleClick}
            >
                {/* Chevron for folders */}
                {hasChildren ? (
                    <span className={`transition-transform duration-150 ${isOpen ? 'rotate-90' : ''} text-base-content/40 group-hover:text-base-content/70`}>
                        <ChevronRight size={12} />
                    </span>
                ) : (
                    <span className="w-3" /> // Spacer for alignment
                )}

                {/* Icon */}
                {hasChildren ? (
                    isOpen ? (
                        <FolderOpen size={14} className="text-secondary/80 shrink-0" />
                    ) : (
                        <FolderClosed size={14} className="text-secondary/60 group-hover:text-secondary/80 shrink-0" />
                    )
                ) : isLoading ? (
                    <span className="loading loading-spinner loading-xs shrink-0" />
                ) : (
                    <FileText size={14} className={`shrink-0 ${statusColor ? '' : 'text-base-content/60 group-hover:text-primary'}`} />
                )}

                {/* Name */}
                <span className={`text-xs font-medium truncate flex-1 ${hasChildren ? 'text-base-content/80' : ''}`}>
                    {node.name.replace(/\.md$/, '')}
                </span>

                {/* Status dot for files */}
                {statusDot && (
                    <span className="shrink-0 mr-1">
                        {statusDot}
                    </span>
                )}

                {/* Card count badge for files */}
                {!hasChildren && cardCount > 0 && (
                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-mono shrink-0
                        ${statusColor ? 'bg-current/10' : 'bg-base-200 text-base-content/40'}`}>
                        {cardCount}
                    </span>
                )}
                
                {/* Child count for folders */}
                {hasChildren && childCount > 0 && (
                    <span className="text-[10px] text-base-content/30 font-mono shrink-0 opacity-0 group-hover:opacity-100 transition-opacity">
                        {childCount}
                    </span>
                )}
            </div>

            {/* Children with CSS transition instead of Framer Motion for performance */}
            {hasChildren && node.children && (
                <div 
                    className={`overflow-hidden transition-[max-height,opacity] duration-200 ease-out
                        ${isOpen ? 'max-h-[9999px] opacity-100' : 'max-h-0 opacity-0'}`}
                >
                    {sortedChildren.map((child) => (
                        <TreeItem 
                            key={child.path || child.name} 
                            node={child} 
                            depth={depth + 1} 
                            loadNote={loadNote} 
                            metadatas={metadatas}
                            globalExpand={globalExpand}
                        />
                    ))}
                </div>
            )}
        </div>
    );
});

TreeItem.displayName = 'TreeItem';
