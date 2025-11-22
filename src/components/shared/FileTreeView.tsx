import { useState, useMemo } from 'react';
import { FolderOpen, FileText, ChevronRight, ChevronDown } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { isPast, isToday } from 'date-fns';

export interface TreeNode {
    name: string;
    path?: string;
    children?: Record<string, TreeNode>;
}

export const FileTreeView = ({ files, rootPath, loadNote, metadatas, className }: { files: string[], rootPath: string | null, loadNote: (path: string) => void, metadatas: Record<string, any>, className?: string }) => {
    const tree = useMemo(() => {
        const root: TreeNode = { name: 'root', children: {} };
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
    }, [files, rootPath]);

    return (
        <div className={`bg-transparent p-2 ${className || ''}`}>
            <TreeItem node={tree} depth={0} loadNote={loadNote} isRoot={true} metadatas={metadatas} />
        </div>
    );
};

const TreeItem = ({ node, depth, loadNote, isRoot = false, metadatas }: { node: TreeNode, depth: number, loadNote: (path: string) => void, isRoot?: boolean, metadatas: Record<string, any> }) => {
    const [isOpen, setIsOpen] = useState(isRoot || depth < 1);
    const hasChildren = node.children && Object.keys(node.children).length > 0;

    // Determine status color if it's a file
    let statusColor = '';
    let statusIcon = null;

    if (node.path) {
        const meta = metadatas[node.path];
        const isNew = !meta?.card || meta.card.reps === 0;
        const dueDate = meta?.card?.due ? new Date(meta.card.due) : null;

        if (isNew) {
            statusColor = 'text-info';
            statusIcon = <div className="w-2 h-2 rounded-full bg-info" title="New" />;
        } else if (dueDate && isPast(dueDate) && !isToday(dueDate)) {
            statusColor = 'text-error';
            statusIcon = <div className="w-2 h-2 rounded-full bg-error" title="Overdue" />;
        } else if (dueDate && isToday(dueDate)) {
            statusColor = 'text-warning';
            statusIcon = <div className="w-2 h-2 rounded-full bg-warning" title="Due Today" />;
        }
    }

    if (isRoot && node.children) {
        return (
            <div className="flex flex-col gap-1">
                {Object.values(node.children).map((child) => (
                    <TreeItem key={child.path || child.name} node={child} depth={depth} loadNote={loadNote} metadatas={metadatas} />
                ))}
            </div>
        );
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
            </div>

            <AnimatePresence>
                {isOpen && hasChildren && node.children && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="overflow-hidden"
                    >
                        {Object.values(node.children).map((child) => (
                            <TreeItem key={child.path || child.name} node={child} depth={depth + 1} loadNote={loadNote} metadatas={metadatas} />
                        ))}
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
