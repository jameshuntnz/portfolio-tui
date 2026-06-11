// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyTheme, currentTheme, onThemeChange, toggleTheme } from './theme';

const THEME_KEY = 'jh-terminal-theme';

beforeEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.clear();
});

describe('currentTheme', () => {
    it('defaults to light when no theme is set on the document', () => {
        expect(currentTheme()).toBe('light');
    });

    it('reads dark from the document element', () => {
        document.documentElement.dataset.theme = 'dark';
        expect(currentTheme()).toBe('dark');
    });

    it('treats any non-"dark" value as light', () => {
        document.documentElement.dataset.theme = 'sepia';
        expect(currentTheme()).toBe('light');
    });
});

describe('applyTheme', () => {
    it('sets the document element dataset', () => {
        applyTheme('dark');
        expect(document.documentElement.dataset.theme).toBe('dark');

        applyTheme('light');
        expect(document.documentElement.dataset.theme).toBe('light');
    });

    it('persists the choice to localStorage', () => {
        applyTheme('dark');
        expect(localStorage.getItem(THEME_KEY)).toBe('dark');

        applyTheme('light');
        expect(localStorage.getItem(THEME_KEY)).toBe('light');
    });

    it('notifies subscribers with the new theme', () => {
        const listener = vi.fn();
        const unsubscribe = onThemeChange(listener);

        applyTheme('dark');

        expect(listener).toHaveBeenCalledExactlyOnceWith('dark');
        unsubscribe();
    });
});

describe('toggleTheme', () => {
    it('flips light to dark and back, returning the new theme', () => {
        applyTheme('light');

        expect(toggleTheme()).toBe('dark');
        expect(currentTheme()).toBe('dark');

        expect(toggleTheme()).toBe('light');
        expect(currentTheme()).toBe('light');
    });
});

describe('onThemeChange', () => {
    it('stops notifying once unsubscribed', () => {
        const listener = vi.fn();
        const unsubscribe = onThemeChange(listener);

        applyTheme('dark');
        expect(listener).toHaveBeenCalledTimes(1);

        unsubscribe();
        applyTheme('light');
        expect(listener).toHaveBeenCalledTimes(1);
    });

    it('supports multiple independent subscribers', () => {
        const a = vi.fn();
        const b = vi.fn();
        const unsubscribeA = onThemeChange(a);
        const unsubscribeB = onThemeChange(b);

        applyTheme('dark');

        expect(a).toHaveBeenCalledWith('dark');
        expect(b).toHaveBeenCalledWith('dark');

        unsubscribeA();
        unsubscribeB();
    });
});
