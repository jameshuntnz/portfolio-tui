// Shared light/dark theme state. Theme lives on <html data-theme> and in
// localStorage — global to the page, not per-window — so every open
// terminal window and the polybar's theme toggle stay in sync regardless of
// which one changes it.

const THEME_KEY = 'jh-terminal-theme';

export type Theme = 'light' | 'dark';

type ThemeListener = (theme: Theme) => void;
const listeners = new Set<ThemeListener>();

export function currentTheme(): Theme {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

export function applyTheme(theme: Theme): void {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
    for (const fn of listeners) fn(theme);
}

export function toggleTheme(): Theme {
    const next: Theme = currentTheme() === 'dark' ? 'light' : 'dark';
    applyTheme(next);
    return next;
}

export function onThemeChange(fn: ThemeListener): () => void {
    listeners.add(fn);
    return () => listeners.delete(fn);
}
