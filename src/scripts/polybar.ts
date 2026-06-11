// Polybar status bar: brand label, workspace dots (one per open window), a
// clock, theme toggle, and the "+ term" new-window button. The static markup
// (sections, buttons) lives in index.html's #polybar; this only wires up the
// parts that change at runtime — workspace dots and the theme glyph re-render
// via the window-manager/theme pub/sub so they stay in sync regardless of
// which window (or polybar control) triggered the change.

import { currentTheme, onThemeChange, toggleTheme, type Theme } from './theme';
import { MAX_WINDOWS, type WindowManager } from './window-manager';

// Only minute-resolution is shown, so a coarse interval is plenty.
const CLOCK_UPDATE_MS = 15_000;

export function createPolybar(root: HTMLElement, wm: WindowManager): { destroy(): void } {
    const workspacesEl = root.querySelector<HTMLElement>('.polybar-workspaces')!;
    const clockEl = root.querySelector<HTMLElement>('.polybar-clock')!;
    const themeToggleEl = root.querySelector<HTMLButtonElement>('.polybar-theme-toggle')!;
    const newWindowEl = root.querySelector<HTMLButtonElement>('.polybar-new-window')!;

    function renderWorkspaces() {
        const focusedId = wm.getFocusedId();
        workspacesEl.innerHTML = wm
            .listWindows()
            .map((win, i) => {
                const active = win.id === focusedId;
                return `<button type="button" class="workspace-dot${active ? ' workspace-dot--active' : ''}" data-window-id="${win.id}" aria-label="Terminal ${i + 1}" aria-pressed="${active}"></button>`;
            })
            .join('');
    }

    function renderNewWindowButton() {
        const atLimit = wm.listWindows().length >= MAX_WINDOWS;
        newWindowEl.disabled = atLimit;
        newWindowEl.title = atLimit
            ? `Maximum of ${MAX_WINDOWS} terminals open`
            : 'New terminal (Ctrl/Cmd+Enter)';
    }

    function renderThemeToggle(theme: Theme = currentTheme()) {
        themeToggleEl.textContent = theme === 'dark' ? '☾' : '☀';
    }

    function updateClock() {
        clockEl.textContent = new Intl.DateTimeFormat([], {
            hour: '2-digit',
            minute: '2-digit',
            hour12: false,
        }).format(new Date());
    }

    workspacesEl.addEventListener('click', (e) => {
        const dot = (e.target as HTMLElement).closest<HTMLElement>('.workspace-dot');
        const id = dot?.dataset.windowId;
        if (!id) return;
        wm.focusWindow(id);
    });

    themeToggleEl.addEventListener('click', () => {
        renderThemeToggle(toggleTheme());
    });

    newWindowEl.addEventListener('click', () => {
        wm.createWindow({ skipBoot: true });
    });

    function render() {
        renderWorkspaces();
        renderNewWindowButton();
    }

    const unsubscribeWindows = wm.onChange(render);
    const unsubscribeTheme = onThemeChange(renderThemeToggle);

    render();
    renderThemeToggle();
    updateClock();
    const clockInterval = window.setInterval(updateClock, CLOCK_UPDATE_MS);

    function destroy() {
        window.clearInterval(clockInterval);
        unsubscribeWindows();
        unsubscribeTheme();
    }

    return { destroy };
}
