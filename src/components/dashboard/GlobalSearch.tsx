import React, { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/appStore';
import { Search, FileText, Loader2 } from 'lucide-react';

function useDebounce<T>(value: T, delay: number): T {
    const [debouncedValue, setDebouncedValue] = useState(value);

    useEffect(() => {
        const handler = setTimeout(() => {
            setDebouncedValue(value);
        }, delay);

        return () => {
            clearTimeout(handler);
        };
    }, [value, delay]);

    return debouncedValue;
}

export const GlobalSearch: React.FC = () => {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, 300);
    const [results, setResults] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [openMode, setOpenMode] = useState<'edit' | 'test'>('test');
    const searchRef = useRef<HTMLDivElement>(null);

    const { searchCards, loadNote, setViewMode } = useAppStore();

    useEffect(() => {
        const performSearch = async () => {
            if (debouncedQuery.trim().length === 0) {
                setResults([]);
                return;
            }

            setIsLoading(true);
            try {
                const hits = await searchCards(debouncedQuery);
                setResults(hits);
            } catch (error) {
                console.error("Search failed", error);
            } finally {
                setIsLoading(false);
            }
        };

        performSearch();
    }, [debouncedQuery, searchCards]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleSelect = (result: any) => {
        const filepath = result.filepath || result.notes?.relative_path || '';
        const clozeIndex = result.clozeIndex ?? result.cloze_index ?? null;

        if (!filepath) {
            console.warn('[GlobalSearch] Missing filepath in search result', result);
            return;
        }

        loadNote(filepath, typeof clozeIndex === 'number' ? clozeIndex : null);
        setViewMode(openMode);
        setIsOpen(false);
        setQuery('');
    };

    return (
        <div className="relative w-full max-w-md" ref={searchRef}>
            <div className="relative">
                <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                    <Search className="h-5 w-5 text-base-content/50" />
                </div>
                <input
                    type="text"
                    id="global-card-search"
                    name="globalCardSearch"
                    className="input input-bordered w-full pl-10 bg-base-200/50 focus:bg-base-100 transition-colors"
                    placeholder="Search cards..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                />
                {isLoading && (
                    <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none">
                        <Loader2 className="h-5 w-5 text-primary animate-spin" />
                    </div>
                )}
            </div>

            {isOpen && (query.length > 0 || results.length > 0) && (
                <div className="absolute mt-2 w-full bg-base-100 rounded-xl shadow-xl border border-base-200 max-h-96 overflow-y-auto z-50">
                    <div className="flex items-center justify-between px-3 py-2 border-b border-base-200 text-[11px] uppercase tracking-wider text-base-content/50 bg-base-50">
                        <span>Search Results</span>
                        <div className="join">
                            <button
                                type="button"
                                className={`btn btn-ghost btn-xs join-item ${openMode === 'test' ? 'btn-active text-primary' : ''}`}
                                onClick={() => setOpenMode('test')}
                            >
                                Study
                            </button>
                            <button
                                type="button"
                                className={`btn btn-ghost btn-xs join-item ${openMode === 'edit' ? 'btn-active text-secondary' : ''}`}
                                onClick={() => setOpenMode('edit')}
                            >
                                Edit
                            </button>
                        </div>
                    </div>
                    {results.length > 0 ? (
                        <ul className="menu p-2">
                            {results.map((result, index) => {
                                const filepath = result.filepath || result.notes?.relative_path || '';
                                const fileLabel = filepath ? filepath.split('/').pop() : result.noteId || 'Untitled';
                                return (
                                <li key={index}>
                                    <button
                                        onClick={() => handleSelect(result)}
                                        className="flex flex-col items-start gap-1 py-3"
                                    >
                                        <div className="flex items-center gap-2 text-xs font-bold opacity-50 uppercase tracking-wider">
                                            <FileText size={12} />
                                            {fileLabel}
                                        </div>
                                        <div className="text-sm line-clamp-2 text-left">
                                            {result.content_raw || result.noteId}
                                        </div>
                                    </button>
                                </li>
                            );
                            })}
                        </ul>
                    ) : (
                        <div className="p-4 text-center text-base-content/50">
                            {isLoading ? 'Searching...' : 'No matching cards found'}
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
