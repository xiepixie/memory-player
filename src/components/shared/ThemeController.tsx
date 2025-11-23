import { useEffect, useState, useRef } from 'react';
import { Palette, Check, Moon, Sun, Sunset, CloudRain, Leaf } from 'lucide-react';
import { useAppStore } from '../../store/appStore';
import { motion, AnimatePresence } from 'framer-motion';

const THEMES = [
    { id: 'winter', name: 'Winter', icon: CloudRain, color: 'bg-sky-100' },
    { id: 'night', name: 'Night', icon: Moon, color: 'bg-slate-900' },
    { id: 'pastel', name: 'Pastel', icon: Sun, color: 'bg-purple-100' },
    { id: 'autumn', name: 'Autumn', icon: Leaf, color: 'bg-orange-100' },
    { id: 'dim', name: 'Dim', icon: Moon, color: 'bg-gray-800' },
    { id: 'sunset', name: 'Sunset', icon: Sunset, color: 'bg-red-100' }
];

export const ThemeController = () => {
    const theme = useAppStore((state) => state.theme);
    const setTheme = useAppStore((state) => state.setTheme);
    const [isOpen, setIsOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={dropdownRef}>
            <motion.button
                whileHover={{ scale: 1.05, rotate: 15 }}
                whileTap={{ scale: 0.95 }}
                onClick={() => setIsOpen(!isOpen)}
                className={`btn btn-sm btn-ghost btn-square transition-colors ${isOpen ? 'bg-primary/10 text-primary' : 'text-base-content/60'}`}
                title="Change Theme"
            >
                <Palette size={18} />
            </motion.button>

            <AnimatePresence>
                {isOpen && (
                    <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        transition={{ duration: 0.2 }}
                        className="absolute right-0 top-full mt-2 w-48 bg-base-100 rounded-xl shadow-xl border border-base-200 overflow-hidden z-50"
                    >
                        <div className="px-3 py-2 bg-base-200/50 border-b border-base-200 text-[10px] font-bold uppercase tracking-wider text-base-content/40">
                            Select Theme
                        </div>
                        <div className="p-1 max-h-64 overflow-y-auto">
                            {THEMES.map((t) => {
                                const isActive = theme === t.id;
                                return (
                                    <button
                                        key={t.id}
                                        onClick={() => {
                                            setTheme(t.id);
                                            setIsOpen(false);
                                        }}
                                        className={`flex w-full items-center justify-between px-3 py-2 rounded-lg text-left text-xs transition-all ${
                                            isActive 
                                            ? 'bg-primary/10 text-primary font-bold' 
                                            : 'hover:bg-base-200 text-base-content/70'
                                        }`}
                                    >
                                        <div className="flex items-center gap-3">
                                            <div className={`w-6 h-6 rounded-full flex items-center justify-center ${isActive ? 'bg-primary text-primary-content' : 'bg-base-200 text-base-content/50'}`}>
                                                <t.icon size={12} />
                                            </div>
                                            <span>{t.name}</span>
                                        </div>
                                        {isActive && <Check size={14} />}
                                    </button>
                                );
                            })}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};
