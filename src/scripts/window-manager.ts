// Minimal floating window manager for the desktop: tracks open windows,
// stamps out window chrome from `#window-template`, and handles drag,
// resize, focus/z-order, and close. Plain pointer events — no library.

import { createTerminal, type TerminalInstance } from './terminal';

export interface DesktopWindow {
    id: string;
    el: HTMLElement;
    titleEl: HTMLElement;
    terminal: TerminalInstance;
}

export interface WindowManager {
    createWindow(opts?: { skipBoot?: boolean }): DesktopWindow | null;
    closeWindow(id: string): void;
    focusWindow(id: string): void;
    listWindows(): DesktopWindow[];
    getFocusedId(): string | null;
    onChange(fn: () => void): () => void;
}

export const MAX_WINDOWS = 10;

const DEFAULT_WIDTH = 880;
const DEFAULT_HEIGHT_RATIO = 0.7;
const MAX_DEFAULT_HEIGHT = 640;
const MIN_WIDTH = 360;
const MIN_HEIGHT = 240;
const CASCADE_STEP = 32;
const CASCADE_WRAP = 6;

function clamp(value: number, min: number, max: number): number {
    return Math.min(Math.max(value, min), max);
}

export function createWindowManager(
    desktopEl: HTMLElement,
    template: HTMLTemplateElement,
): WindowManager {
    const windows: DesktopWindow[] = [];
    const focusOrder: string[] = [];
    const listeners = new Set<() => void>();

    let nextId = 0;
    let nextZIndex = 1;
    let cascadeCount = 0;

    desktopEl.classList.add('desktop--empty');

    function notify() {
        for (const fn of listeners) fn();
    }

    function wireDrag(el: HTMLElement, titlebarEl: HTMLElement) {
        titlebarEl.addEventListener('pointerdown', (e: PointerEvent) => {
            if ((e.target as HTMLElement).closest('.window-close')) return;
            e.preventDefault();

            const startX = e.clientX;
            const startY = e.clientY;
            const startLeft = el.offsetLeft;
            const startTop = el.offsetTop;
            titlebarEl.setPointerCapture(e.pointerId);

            function onMove(e: PointerEvent) {
                const maxLeft = Math.max(0, desktopEl.clientWidth - el.offsetWidth);
                const maxTop = Math.max(0, desktopEl.clientHeight - el.offsetHeight);
                el.style.left = `${clamp(startLeft + (e.clientX - startX), 0, maxLeft)}px`;
                el.style.top = `${clamp(startTop + (e.clientY - startY), 0, maxTop)}px`;
            }

            function onUp() {
                titlebarEl.removeEventListener('pointermove', onMove);
                titlebarEl.removeEventListener('pointerup', onUp);
            }

            titlebarEl.addEventListener('pointermove', onMove);
            titlebarEl.addEventListener('pointerup', onUp);
        });
    }

    function wireResize(el: HTMLElement, handleEl: HTMLElement) {
        handleEl.addEventListener('pointerdown', (e: PointerEvent) => {
            e.preventDefault();
            e.stopPropagation();

            const startX = e.clientX;
            const startY = e.clientY;
            const startWidth = el.offsetWidth;
            const startHeight = el.offsetHeight;
            handleEl.setPointerCapture(e.pointerId);

            function onMove(e: PointerEvent) {
                const maxWidth = Math.max(MIN_WIDTH, desktopEl.clientWidth - el.offsetLeft);
                const maxHeight = Math.max(MIN_HEIGHT, desktopEl.clientHeight - el.offsetTop);
                el.style.width = `${clamp(startWidth + (e.clientX - startX), MIN_WIDTH, maxWidth)}px`;
                el.style.height = `${clamp(startHeight + (e.clientY - startY), MIN_HEIGHT, maxHeight)}px`;
            }

            function onUp() {
                handleEl.removeEventListener('pointermove', onMove);
                handleEl.removeEventListener('pointerup', onUp);
            }

            handleEl.addEventListener('pointermove', onMove);
            handleEl.addEventListener('pointerup', onUp);
        });
    }

    function createWindow(opts: { skipBoot?: boolean } = {}): DesktopWindow | null {
        if (windows.length >= MAX_WINDOWS) return null;

        const id = `window-${++nextId}`;

        const fragment = template.content.cloneNode(true) as DocumentFragment;
        const el = fragment.querySelector<HTMLElement>('.window')!;
        const titlebarEl = el.querySelector<HTMLElement>('.window-titlebar')!;
        const titleEl = el.querySelector<HTMLElement>('.window-title')!;
        const closeEl = el.querySelector<HTMLElement>('.window-close')!;
        const resizeEl = el.querySelector<HTMLElement>('.resize-handle')!;
        const terminalRoot = el.querySelector<HTMLElement>('.terminal')!;

        terminalRoot.setAttribute('aria-label', `Terminal ${windows.length + 1}`);

        const desktopWidth = desktopEl.clientWidth;
        const desktopHeight = desktopEl.clientHeight;
        const width = Math.min(DEFAULT_WIDTH, desktopWidth);
        const height = Math.min(
            MAX_DEFAULT_HEIGHT,
            Math.round(desktopHeight * DEFAULT_HEIGHT_RATIO),
        );

        let left = Math.max(0, Math.round((desktopWidth - width) / 2));
        let top = Math.max(0, Math.round((desktopHeight - height) / 2));

        if (windows.length > 0) {
            const offset = CASCADE_STEP * (cascadeCount % CASCADE_WRAP);
            left = clamp(left + offset, 0, Math.max(0, desktopWidth - width));
            top = clamp(top + offset, 0, Math.max(0, desktopHeight - height));
        }
        cascadeCount++;

        el.style.left = `${left}px`;
        el.style.top = `${top}px`;
        el.style.width = `${width}px`;
        el.style.height = `${height}px`;
        el.style.zIndex = String(++nextZIndex);

        // Played once on insertion; removed on completion so toggling the
        // mobile single-window `display` later doesn't replay it.
        el.classList.add('window--opening');
        el.addEventListener('animationend', () => el.classList.remove('window--opening'), {
            once: true,
        });

        // Append before creating the terminal instance — focusing the hidden
        // input during init only works once the element is in the document.
        desktopEl.appendChild(el);

        wireDrag(el, titlebarEl);
        wireResize(el, resizeEl);
        closeEl.addEventListener('click', () => closeWindow(id));

        // Capture phase so any click inside the window raises/focuses it
        // before the terminal's own click handlers run.
        el.addEventListener('pointerdown', () => focusWindow(id), { capture: true });

        const terminal = createTerminal(terminalRoot, {
            skipBoot: opts.skipBoot,
            onTitleChange: (title) => {
                titleEl.textContent = title;
            },
        });

        const win: DesktopWindow = { id, el, titleEl, terminal };
        windows.push(win);

        desktopEl.classList.remove('desktop--empty');
        focusWindow(id);
        notify();

        return win;
    }

    function closeWindow(id: string): void {
        const index = windows.findIndex((w) => w.id === id);
        if (index === -1) return;

        const [win] = windows.splice(index, 1);
        win.terminal.destroy();
        win.el.remove();

        const focusIndex = focusOrder.indexOf(id);
        if (focusIndex !== -1) focusOrder.splice(focusIndex, 1);

        if (windows.length === 0) {
            desktopEl.classList.add('desktop--empty');
            notify();
            return;
        }

        const nextFocusId = focusOrder[focusOrder.length - 1] ?? windows[windows.length - 1].id;
        focusWindow(nextFocusId);
    }

    function focusWindow(id: string): void {
        const win = windows.find((w) => w.id === id);
        if (!win) return;

        win.el.style.zIndex = String(++nextZIndex);

        for (const w of windows) {
            w.el.classList.toggle('window--focused', w.id === id);
        }

        const existingIndex = focusOrder.indexOf(id);
        if (existingIndex !== -1) focusOrder.splice(existingIndex, 1);
        focusOrder.push(id);

        win.terminal.focus();
        notify();
    }

    function listWindows(): DesktopWindow[] {
        return [...windows];
    }

    function getFocusedId(): string | null {
        return focusOrder[focusOrder.length - 1] ?? null;
    }

    function onChange(fn: () => void): () => void {
        listeners.add(fn);
        return () => listeners.delete(fn);
    }

    return { createWindow, closeWindow, focusWindow, listWindows, getFocusedId, onChange };
}
