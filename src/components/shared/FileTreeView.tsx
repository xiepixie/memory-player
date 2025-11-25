import { useState, useMemo, memo } from 'react';
import { FolderOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { isPast, isToday } from 'date-fns';
import { useAppStore } from '../../store/appStore';
import { useShallow } from 'zustand/react/shallow';

export interface TreeNode {
    name: string;
    path?: string;
    children?: Record<string, TreeNode>;
}

const FileTreeViewImpl = ({ files, rootPath, loadNote, className }: { files: string[], rootPath: string | null, loadNote: (path: string) => void, className?: string }) => {
    const rootName = useMemo(() => {
        if (!rootPath) return 'Vault';
        return rootPath.split(/[/\\]/).pop() || 'Vault';
    }, [rootPath]);

    const tree = useMemo(() => {
        const root: TreeNode = { name: rootName, children: {} }; // Use real root name
        files.forEach(file => {
            // Remove rootPath from file path to get relative path
            const relative = rootPath ? file.replace(rootPath, '') : file;
            const parts = relative.split(/[/\\]/).filter(p => p); // Handle both slash types

            let current = root;
            parts.forEach((part, i) => {
                if (!current.children) current.children = {};
                if (!current.children[part]) {
                    current.children[part] = { name: part };
                }
                current = current.children[part];
                if (i === parts.length - 1) {
                    current.path = file;
                }
            });
        });
        return root;
    }, [files, rootPath, rootName]);

    return (
        <div className={`bg-transparent p-2 ${className || ''}`}>
            {/* We pass isRoot=false (default) so it renders the node itself, depth -1 effectively so children start at 0 visual indent if we wanted, 
                 but here we want the root to be visible. Let's treat it as depth 0. 
                 We manually create the "root" visual behavior by ensuring it's expanded. 
             */}
            <TreeItem
                node={tree}
                depth={0}
                loadNote={loadNote}
                forcedOpen={true} // New prop to force root open
            />
        </div>
    );
};

const TreeItem = memo(({ node, depth, loadNote, forcedOpen = false }: { node: TreeNode, depth: number, loadNote: (path: string) => void, forcedOpen?: boolean }) => {
    const [isOpen, setIsOpen] = useState(forcedOpen || depth < 1);
    const hasChildren = node.children && Object.keys(node.children).length > 0;

    // Select metadata only for this node if it's a file
    const meta = useAppStore(
        useShallow((state) => node.path ? state.fileMetadatas[node.path] : undefined)
    );

    // Determine status color if it's a file
    let statusColor = '';
    let statusIcon = null;
    let cardCount = 0;

    if (node.path && meta) {
        const isNew = !meta.cards || Object.values(meta.cards).every((c: any) => c.reps === 0);

        // Check for any due cards
        let hasOverdue = false;
        let hasToday = false;

        if (meta.cards) {
            const cards = Object.values(meta.cards);
            cardCount = cards.length;

            cards.forEach((card: any) => {
                if (card.due) {
                    const due = new Date(card.due);
                    if (isPast(due) && !isToday(due)) hasOverdue = true;
                    else if (isToday(due)) hasToday = true;
                }
            });
        }

        if (isNew) {
            statusColor = 'text-info';
            statusIcon = <div className="w-2 h-2 rounded-full bg-info" title="New" />;
        } else if (hasOverdue) {
            statusColor = 'text-error';
            statusIcon = <div className="w-2 h-2 rounded-full bg-error" title="Overdue" />;
        } else if (hasToday) {
            statusColor = 'text-warning';
            statusIcon = <div className="w-2 h-2 rounded-full bg-warning" title="Due Today" />;
        }
    }

    return (
        <div className="flex flex-col select-none">
            <div
                className={`flex items-center gap-2 p-1.5 rounded-lg cursor-pointer hover:bg-base-content/5 transition-colors ${!hasChildren ? 'ml-5' : ''}`}
                style={{ paddingLeft: `${depth * 10 + 4}px` }}
                onClick={() => {
                    if (hasChildren) setIsOpen(!isOpen);
                    else if (node.path) loadNote(node.path);
                }}
            >
                {hasChildren && (
                    <span className="opacity-50 hover:opacity-100">
                        {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
                    </span>
                )}

                {hasChildren ? (
                    <FolderOpen size={14} className="text-secondary opacity-70" />
                ) : (
                    <div className="relative">
                        <FileText size={14} className={`opacity-70 ${statusColor || 'text-base-content'}`} />
                        {statusIcon && <div className="absolute -top-0.5 -right-0.5">{statusIcon}</div>}
                    </div>
                )}

                <span className={`text-xs font-medium truncate ${statusColor ? '' : 'opacity-80'}`}>{node.name}</span>

                {!hasChildren && cardCount > 0 && (
                    <span className="ml-auto text-[10px] opacity-40 font-mono">
                        {cardCount}
                    </span>
                )}
            </div>

            {isOpen && hasChildren && node.children && (
                <div
                    className={`overflow-hidden transition-all duration-200 ease-out ${
                        isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
                    }`}
                >
                    {Object.values(node.children).map((child) => (
                        <TreeItem key={child.path || child.name} node={child} depth={depth + 1} loadNote={loadNote} />
                    ))}
                </div>
            )}
        </div>
    );
});

export const FileTreeView = memo(FileTreeViewImpl);
