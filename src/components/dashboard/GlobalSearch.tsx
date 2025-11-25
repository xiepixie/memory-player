import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useAppStore } from '../../store/appStore';
import { useShallow } from 'zustand/react/shallow';
import { Search, FileText, Loader2, X, BookOpen, Pencil, Sparkles } from 'lucide-react';

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

// Highlight matching text in search results
const HighlightedText = ({ text, query }: { text: string; query: string }) => {
    if (!query.trim() || !text) return <>{text}</>;
    
    const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
    
    return (
        <>
            {parts.map((part, i) => 
                part.toLowerCase() === query.toLowerCase() ? (
                    <mark key={i} className="bg-primary/20 text-primary rounded px-0.5 font-medium">
                        {part}
                    </mark>
                ) : (
                    <span key={i}>{part}</span>
                )
            )}
        </>
    );
};

export const GlobalSearch: React.FC = () => {
    const [query, setQuery] = useState('');
    const debouncedQuery = useDebounce(query, 250);
    const [results, setResults] = useState<any[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [isOpen, setIsOpen] = useState(false);
    const [openMode, setOpenMode] = useState<'edit' | 'test'>('test');
    const [selectedIndex, setSelectedIndex] = useState(0);
    const searchRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLInputElement>(null);
    const listRef = useRef<HTMLUListElement>(null);

    const { searchCards, loadNote, setViewMode } = useAppStore(
        useShallow((state) => ({
            searchCards: state.searchCards,
            loadNote: state.loadNote,
            setViewMode: state.setViewMode,
        })),
    );

    // Reset selection when results change
    useEffect(() => {
        setSelectedIndex(0);
    }, [results]);

    // Perform search
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

    // Click outside to close
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

    // Scroll selected item into view
    useEffect(() => {
        if (listRef.current && results.length > 0) {
            const selectedItem = listRef.current.children[selectedIndex] as HTMLElement;
            if (selectedItem) {
                selectedItem.scrollIntoView({ block: 'nearest' });
            }
        }
    }, [selectedIndex, results.length]);

    const handleSelect = useCallback((result: any) => {
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
        setResults([]);
    }, [loadNote, setViewMode, openMode]);

    const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
        if (!isOpen) return;

        switch (e.key) {
            case 'ArrowDown':
                e.preventDefault();
                setSelectedIndex(prev => Math.min(prev + 1, results.length - 1));
                break;
            case 'ArrowUp':
                e.preventDefault();
                setSelectedIndex(prev => Math.max(prev - 1, 0));
                break;
            case 'Enter':
                e.preventDefault();
                if (results[selectedIndex]) {
                    handleSelect(results[selectedIndex]);
                }
                break;
            case 'Escape':
                e.preventDefault();
                setIsOpen(false);
                inputRef.current?.blur();
                break;
            case 'Tab':
                // Toggle mode on Tab
                e.preventDefault();
                setOpenMode(prev => prev === 'test' ? 'edit' : 'test');
                break;
        }
    }, [isOpen, results, selectedIndex, handleSelect]);

    const clearSearch = useCallback(() => {
        setQuery('');
        setResults([]);
        inputRef.current?.focus();
    }, []);

    const showResults = isOpen && (query.length > 0 || results.length > 0);

    return (
        <div className="relative w-full" ref={searchRef}>
            {/* Search Input */}
            <div className="relative group">
                <div className={`absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none transition-colors ${isOpen ? 'text-primary' : 'text-base-content/40'}`}>
                    <Search className="h-4 w-4" />
                </div>
                <input
                    ref={inputRef}
                    type="text"
                    id="global-card-search"
                    name="globalCardSearch"
                    autoComplete="off"
                    className={`input input-sm h-10 w-full pl-9 pr-20 bg-base-200/50 border-transparent 
                        focus:bg-base-100 focus:border-primary/20 focus:ring-2 focus:ring-primary/10
                        rounded-xl transition-all text-sm placeholder:text-base-content/30`}
                    placeholder="Search cards by content..."
                    value={query}
                    onChange={(e) => {
                        setQuery(e.target.value);
                        setIsOpen(true);
                    }}
                    onFocus={() => setIsOpen(true)}
                    onKeyDown={handleKeyDown}
                />
                
                {/* Right side indicators */}
                <div className="absolute inset-y-0 right-0 pr-2 flex items-center gap-1">
                    {isLoading && (
                        <Loader2 className="h-4 w-4 text-primary animate-spin" />
                    )}
                    {query && !isLoading && (
                        <button 
                            onClick={clearSearch}
                            className="p-1 rounded-md hover:bg-base-300/50 text-base-content/40 hover:text-base-content transition-colors"
                        >
                            <X size={14} />
                        </button>
                    )}
                    {/* Mode indicator pill */}
                    <div className={`px-2 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wider transition-colors
                        ${openMode === 'test' ? 'bg-primary/10 text-primary' : 'bg-secondary/10 text-secondary'}`}>
                        {openMode === 'test' ? 'Study' : 'Edit'}
                    </div>
                </div>
            </div>

            {/* Results Dropdown */}
            {showResults && (
                <div className="absolute mt-2 w-full bg-base-100 rounded-2xl shadow-2xl border border-base-200 overflow-hidden z-50 backdrop-blur-xl">
                    {/* Header */}
                    <div className="flex items-center justify-between px-3 py-2 border-b border-base-200/50 bg-base-200/30">
                        <div className="flex items-center gap-2">
                            <span className="text-[10px] uppercase tracking-wider text-base-content/40 font-bold">
                                {results.length > 0 ? `${results.length} results` : 'Search'}
                            </span>
                        </div>
                        <div className="flex items-center gap-1">
                            <button
                                type="button"
                                className={`btn btn-xs gap-1.5 rounded-lg transition-all ${
                                    openMode === 'test' 
                                        ? 'btn-primary' 
                                        : 'btn-ghost text-base-content/50 hover:text-base-content'
                                }`}
                                onClick={() => setOpenMode('test')}
                            >
                                <BookOpen size={12} />
                                Study
                            </button>
                            <button
                                type="button"
                                className={`btn btn-xs gap-1.5 rounded-lg transition-all ${
                                    openMode === 'edit' 
                                        ? 'btn-secondary' 
                                        : 'btn-ghost text-base-content/50 hover:text-base-content'
                                }`}
                                onClick={() => setOpenMode('edit')}
                            >
                                <Pencil size={12} />
                                Edit
                            </button>
                        </div>
                    </div>

                    {/* Results List */}
                    <div className="max-h-80 overflow-y-auto">
                        {results.length > 0 ? (
                            <ul ref={listRef} className="py-1">
                                {results.map((result, index) => {
                                    const filepath = result.filepath || result.notes?.relative_path || '';
                                    const fileLabel = filepath ? filepath.split(/[\\/]/).pop()?.replace(/\.md$/, '') : result.noteId || 'Untitled';
                                    const content = result.content_raw || result.noteId || '';
                                    const isSelected = index === selectedIndex;
                                    const clozeIndex = result.clozeIndex ?? result.cloze_index;
                                    
                                    return (
                                        <li key={`${filepath}-${clozeIndex}-${index}`}>
                                            <button
                                                onClick={() => handleSelect(result)}
                                                onMouseEnter={() => setSelectedIndex(index)}
                                                className={`w-full text-left px-3 py-2.5 flex flex-col gap-1.5 transition-colors ${
                                                    isSelected 
                                                        ? 'bg-primary/10' 
                                                        : 'hover:bg-base-200/50'
                                                }`}
                                            >
                                                <div className="flex items-center gap-2">
                                                    <FileText size={12} className={`shrink-0 ${isSelected ? 'text-primary' : 'text-base-content/40'}`} />
                                                    <span className={`text-xs font-bold truncate ${isSelected ? 'text-primary' : 'text-base-content/60'}`}>
                                                        {fileLabel}
                                                    </span>
                                                    {typeof clozeIndex === 'number' && (
                                                        <span className="text-[10px] px-1.5 py-0.5 bg-base-200 rounded font-mono text-base-content/40">
                                                            c{clozeIndex}
                                                        </span>
                                                    )}
                                                </div>
                                                <div className={`text-sm line-clamp-2 leading-relaxed ${isSelected ? 'text-base-content' : 'text-base-content/70'}`}>
                                                    <HighlightedText text={content} query={query} />
                                                </div>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        ) : (
                            <div className="p-6 text-center">
                                {isLoading ? (
                                    <div className="flex flex-col items-center gap-2 text-base-content/50">
                                        <Loader2 className="h-6 w-6 animate-spin text-primary" />
                                        <span className="text-sm">Searching...</span>
                                    </div>
                                ) : query.trim() ? (
                                    <div className="flex flex-col items-center gap-2 text-base-content/40">
                                        <Search size={24} className="opacity-30" />
                                        <span className="text-sm">No cards match "{query}"</span>
                                        <span className="text-xs opacity-60">Try different keywords</span>
                                    </div>
                                ) : (
                                    <div className="flex flex-col items-center gap-2 text-base-content/40">
                                        <Sparkles size={24} className="opacity-30" />
                                        <span className="text-sm">Start typing to search</span>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>

                    {/* Footer with keyboard hints */}
                    {results.length > 0 && (
                        <div className="flex items-center justify-between px-3 py-1.5 border-t border-base-200/50 bg-base-200/20 text-[10px] text-base-content/40">
                            <div className="flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <kbd className="kbd kbd-xs">↑</kbd>
                                    <kbd className="kbd kbd-xs">↓</kbd>
                                    navigate
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="kbd kbd-xs">↵</kbd>
                                    select
                                </span>
                                <span className="flex items-center gap-1">
                                    <kbd className="kbd kbd-xs">Tab</kbd>
                                    toggle mode
                                </span>
                            </div>
                            <span className="flex items-center gap-1">
                                <kbd className="kbd kbd-xs">Esc</kbd>
                                close
                            </span>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
};
