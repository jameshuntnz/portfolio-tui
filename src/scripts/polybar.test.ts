// @vitest-environment jsdom

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

// `./window-manager` transitively imports `./terminal`, whose `prefersReducedMotion`
// reads `matchMedia` at module-load time — sidestep that entirely since polybar
// only needs the MAX_WINDOWS constant and the WindowManager type (erased at runtime).
vi.mock('./window-manager', () => ({ MAX_WINDOWS: 10 }));

import { createPolybar } from './polybar';
import { applyTheme } from './theme';
import type { DesktopWindow, WindowManager } from './window-manager';

function fakeWindow(id: string): DesktopWindow {
    return {
        id,
        el: document.createElement('div'),
        titleEl: document.createElement('span'),
        terminal: { focus: vi.fn(), destroy: vi.fn() },
    };
}

function createFakeWindowManager(windows: DesktopWindow[], focusedId: string | null) {
    const listeners = new Set<() => void>();
    const wm: WindowManager = {
        createWindow: vi.fn(() => null),
        closeWindow: vi.fn(),
        focusWindow: vi.fn(),
        listWindows: () => windows,
        getFocusedId: () => focusedId,
        onChange: (fn) => {
            listeners.add(fn);
            return () => listeners.delete(fn);
        },
    };
    return { wm, emit: () => listeners.forEach((fn) => fn()) };
}

// Mirrors the static markup in index.html's #polybar.
function buildRoot(): HTMLElement {
    const root = document.createElement('div');
    root.innerHTML = `
        <div class="polybar-section polybar-left">
            <span class="polybar-brand">jameshunt.nz</span>
        </div>
        <div class="polybar-section polybar-center polybar-workspaces"></div>
        <div class="polybar-section polybar-right">
            <span class="polybar-clock"></span>
            <button type="button" class="polybar-theme-toggle" aria-label="Toggle theme"></button>
            <button type="button" class="polybar-new-window" title="New terminal (Ctrl/Cmd+Enter)">+ term</button>
        </div>
    `;
    document.body.appendChild(root);
    return root;
}

beforeEach(() => {
    delete document.documentElement.dataset.theme;
    localStorage.clear();
});

afterEach(() => {
    document.body.innerHTML = '';
    vi.useRealTimers();
});

describe('workspace dots', () => {
    it('renders one dot per window, marking the focused one active', () => {
        const a = fakeWindow('a');
        const b = fakeWindow('b');
        const { wm } = createFakeWindowManager([a, b], 'b');
        const root = buildRoot();

        createPolybar(root, wm);

        const dots = root.querySelectorAll('.workspace-dot');
        expect(dots).toHaveLength(2);
        expect(dots[0].getAttribute('aria-pressed')).toBe('false');
        expect(dots[0].classList.contains('workspace-dot--active')).toBe(false);
        expect(dots[1].getAttribute('aria-pressed')).toBe('true');
        expect(dots[1].classList.contains('workspace-dot--active')).toBe(true);
        expect(dots[0].getAttribute('aria-label')).toBe('Terminal 1');
        expect(dots[1].getAttribute('aria-label')).toBe('Terminal 2');
    });

    it('focuses a window when its dot is clicked', () => {
        const a = fakeWindow('a');
        const { wm } = createFakeWindowManager([a], 'a');
        const root = buildRoot();

        createPolybar(root, wm);
        root.querySelector<HTMLElement>('.workspace-dot')!.click();

        expect(wm.focusWindow).toHaveBeenCalledWith('a');
    });

    it('ignores clicks that land outside a workspace dot', () => {
        const a = fakeWindow('a');
        const { wm } = createFakeWindowManager([a], 'a');
        const root = buildRoot();

        createPolybar(root, wm);
        root.querySelector<HTMLElement>('.polybar-workspaces')!.click();

        expect(wm.focusWindow).not.toHaveBeenCalled();
    });

    it('re-renders when the window manager reports a change', () => {
        const a = fakeWindow('a');
        const { wm, emit } = createFakeWindowManager([a], 'a');
        const root = buildRoot();

        createPolybar(root, wm);
        expect(root.querySelectorAll('.workspace-dot')).toHaveLength(1);

        const b = fakeWindow('b');
        wm.listWindows = () => [a, b];
        emit();

        expect(root.querySelectorAll('.workspace-dot')).toHaveLength(2);
    });
});

describe('new-window button', () => {
    it('is enabled with the default hint below MAX_WINDOWS', () => {
        const { wm } = createFakeWindowManager([fakeWindow('a')], 'a');
        const root = buildRoot();

        createPolybar(root, wm);

        const btn = root.querySelector<HTMLButtonElement>('.polybar-new-window')!;
        expect(btn.disabled).toBe(false);
        expect(btn.title).toBe('New terminal (Ctrl/Cmd+Enter)');
    });

    it('is disabled with a "limit reached" title at MAX_WINDOWS', () => {
        const windows = Array.from({ length: 10 }, (_, i) => fakeWindow(`w${i}`));
        const { wm } = createFakeWindowManager(windows, 'w0');
        const root = buildRoot();

        createPolybar(root, wm);

        const btn = root.querySelector<HTMLButtonElement>('.polybar-new-window')!;
        expect(btn.disabled).toBe(true);
        expect(btn.title).toBe('Maximum of 10 terminals open');
    });

    it('opens a new window (without the boot sequence) when clicked', () => {
        const { wm } = createFakeWindowManager([], null);
        const root = buildRoot();

        createPolybar(root, wm);
        root.querySelector<HTMLButtonElement>('.polybar-new-window')!.click();

        expect(wm.createWindow).toHaveBeenCalledWith({ skipBoot: true });
    });
});

describe('theme toggle', () => {
    it('shows the glyph for the current theme on render', () => {
        applyTheme('dark');
        const { wm } = createFakeWindowManager([], null);
        const root = buildRoot();

        createPolybar(root, wm);

        expect(root.querySelector('.polybar-theme-toggle')!.textContent).toBe('☾');
    });

    it('toggles the theme when clicked and updates its own glyph', () => {
        applyTheme('light');
        const { wm } = createFakeWindowManager([], null);
        const root = buildRoot();

        createPolybar(root, wm);
        const toggle = root.querySelector<HTMLButtonElement>('.polybar-theme-toggle')!;

        expect(toggle.textContent).toBe('☀');
        toggle.click();

        expect(toggle.textContent).toBe('☾');
        expect(document.documentElement.dataset.theme).toBe('dark');
    });

    it('updates its glyph when the theme changes elsewhere', () => {
        applyTheme('light');
        const { wm } = createFakeWindowManager([], null);
        const root = buildRoot();
        const polybar = createPolybar(root, wm);

        applyTheme('dark');
        expect(root.querySelector('.polybar-theme-toggle')!.textContent).toBe('☾');

        polybar.destroy();
    });
});

describe('clock', () => {
    it('shows the current time in 24-hour HH:MM format', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 0, 1, 9, 5));

        const { wm } = createFakeWindowManager([], null);
        const root = buildRoot();
        createPolybar(root, wm);

        expect(root.querySelector('.polybar-clock')!.textContent).toBe('09:05');
    });

    it('updates on an interval', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 0, 1, 9, 5));

        const { wm } = createFakeWindowManager([], null);
        const root = buildRoot();
        createPolybar(root, wm);

        vi.setSystemTime(new Date(2024, 0, 1, 9, 6));
        vi.advanceTimersByTime(15_000);

        expect(root.querySelector('.polybar-clock')!.textContent).toBe('09:06');
    });
});

describe('destroy', () => {
    it('stops the clock and unsubscribes from window/theme changes', () => {
        vi.useFakeTimers();
        vi.setSystemTime(new Date(2024, 0, 1, 9, 5));
        applyTheme('light');

        const a = fakeWindow('a');
        const { wm, emit } = createFakeWindowManager([a], 'a');
        const root = buildRoot();
        const polybar = createPolybar(root, wm);

        polybar.destroy();

        // Clock no longer ticks.
        vi.setSystemTime(new Date(2024, 0, 1, 9, 6));
        vi.advanceTimersByTime(15_000);
        expect(root.querySelector('.polybar-clock')!.textContent).toBe('09:05');

        // Window-manager changes no longer re-render.
        wm.listWindows = () => [a, fakeWindow('b')];
        emit();
        expect(root.querySelectorAll('.workspace-dot')).toHaveLength(1);

        // Theme changes no longer update the glyph.
        applyTheme('dark');
        expect(root.querySelector('.polybar-theme-toggle')!.textContent).toBe('☀');
    });
});
