import { useEffect } from 'react';
import { Palette } from 'lucide-react';
import { useAppStore } from '../../store/appStore';

const THEMES = [
    'winter',
    'night',
    'pastel',
    'autumn',
    'dim',
    'sunset'
];

export const ThemeController = () => {
    const theme = useAppStore((state) => state.theme);
    const setTheme = useAppStore((state) => state.setTheme);

    useEffect(() => {
        document.documentElement.setAttribute('data-theme', theme);
    }, [theme]);

    return (
        <div className="dropdown dropdown-end">
            <div tabIndex={0} role="button" className="btn btn-ghost btn-circle">
                <Palette size={20} />
            </div>
            <ul tabIndex={0} className="dropdown-content z-[1] menu p-2 shadow-2xl bg-base-300 rounded-box w-52 max-h-96 overflow-y-auto">
                {THEMES.map(t => (
                    <li key={t}>
                        <input
                            type="radio"
                            name="theme-dropdown"
                            className="theme-controller btn btn-sm btn-block btn-ghost justify-start"
                            aria-label={t.charAt(0).toUpperCase() + t.slice(1)}
                            value={t}
                            checked={theme === t}
                            onChange={() => setTheme(t)}
                        />
                    </li>
                ))}
            </ul>
        </div>
    );
};
