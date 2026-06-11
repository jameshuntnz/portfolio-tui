// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';

// window-manager's own job is window lifecycle/positioning/focus — the
// terminal it mounts is a black box here (covered by terminal.test.ts and the
// e2e suite), so it's mocked out to keep these tests independent of
// `prefers-reduced-motion`/boot-sequence timing.
vi.mock('./terminal', () => ({
    createTerminal: vi.fn(() => ({
        focus: vi.fn(),
        destroy: vi.fn(),
    })),
}));

import { createTerminal } from './terminal';
import { createWindowManager, MAX_WINDOWS } from './window-manager';

// jsdom doesn't implement the Pointer Capture API — wireDrag/wireResize call
// `setPointerCapture`/`releasePointerCapture` on pointerdown/pointerup, so stub
// them as no-ops to let those handlers run.
HTMLElement.prototype.setPointerCapture ??= vi.fn();
HTMLElement.prototype.releasePointerCapture ??= vi.fn();

// Mirrors the shape `createWindow` queries from `#window-template` in
// index.html — only the chrome it touches, since `.terminal`'s internals are
// owned by the (mocked) terminal module.
const TEMPLATE_HTML = `
    <div class="window">
        <div class="window-titlebar">
            <span class="window-title"></span>
            <button class="window-close" aria-label="Close window">×</button>
        </div>
        <div class="window-body">
            <div class="terminal"></div>
        </div>
        <div class="resize-handle" aria-hidden="true"></div>
    </div>
`;

function setup(width = 1200, height = 800) {
    const desktopEl = document.createElement('div');
    Object.defineProperty(desktopEl, 'clientWidth', { value: width, configurable: true });
    Object.defineProperty(desktopEl, 'clientHeight', { value: height, configurable: true });
    document.body.appendChild(desktopEl);

    const template = document.createElement('template');
    template.innerHTML = TEMPLATE_HTML;

    const wm = createWindowManager(desktopEl, template);
    return { desktopEl, wm };
}

afterEach(() => {
    document.body.innerHTML = '';
    vi.clearAllMocks();
});

describe('createWindow', () => {
    it('creates a window appended to the desktop, centered for an 1200x800 desktop', () => {
        const { desktopEl, wm } = setup();
        const win = wm.createWindow();

        expect(win).not.toBeNull();
        expect(desktopEl.contains(win!.el)).toBe(true);
        expect(win!.el.style.width).toBe('880px');
        expect(win!.el.style.height).toBe('560px');
        expect(win!.el.style.left).toBe('160px');
        expect(win!.el.style.top).toBe('120px');
    });

    it('clamps window size to a desktop smaller than the default', () => {
        const { wm } = setup(320, 480);
        const win = wm.createWindow()!;

        expect(win.el.style.width).toBe('320px');
        expect(win.el.style.height).toBe('336px'); // round(480 * 0.7)
        expect(win.el.style.left).toBe('0px');
        expect(win.el.style.top).toBe('72px'); // round((480 - 336) / 2)
    });

    it('cascades each subsequent window down and to the right', () => {
        const { wm } = setup();
        wm.createWindow();
        const second = wm.createWindow()!;
        const third = wm.createWindow()!;

        expect(second.el.style.left).toBe('192px'); // 160 + 32
        expect(second.el.style.top).toBe('152px'); // 120 + 32
        expect(third.el.style.left).toBe('224px'); // 160 + 64
        expect(third.el.style.top).toBe('184px'); // 120 + 64
    });

    it('removes desktop--empty once the first window opens', () => {
        const { desktopEl, wm } = setup();
        expect(desktopEl.classList.contains('desktop--empty')).toBe(true);

        wm.createWindow();
        expect(desktopEl.classList.contains('desktop--empty')).toBe(false);
    });

    it('labels each terminal with a 1-based index', () => {
        const { wm } = setup();
        wm.createWindow();
        wm.createWindow();

        const calls = vi.mocked(createTerminal).mock.calls;
        expect(calls[0][0].getAttribute('aria-label')).toBe('Terminal 1');
        expect(calls[1][0].getAttribute('aria-label')).toBe('Terminal 2');
    });

    it('passes skipBoot through to the terminal', () => {
        const { wm } = setup();
        wm.createWindow({ skipBoot: true });

        expect(vi.mocked(createTerminal).mock.calls[0][1]).toMatchObject({ skipBoot: true });
    });

    it('updates the window title when the terminal reports a prompt change', () => {
        const { wm } = setup();
        const win = wm.createWindow()!;

        const { onTitleChange } = vi.mocked(createTerminal).mock.calls[0][1]!;
        onTitleChange?.('guest@jameshunt.nz:~$');

        expect(win.titleEl.textContent).toBe('guest@jameshunt.nz:~$');
    });

    it('plays the open animation once, removing the class after it finishes', () => {
        const { wm } = setup();
        const win = wm.createWindow()!;

        expect(win.el.classList.contains('window--opening')).toBe(true);

        win.el.dispatchEvent(new Event('animationend'));
        expect(win.el.classList.contains('window--opening')).toBe(false);
    });

    it('focuses the new window above any existing windows', () => {
        const { wm } = setup();
        const first = wm.createWindow()!;
        const second = wm.createWindow()!;

        expect(first.el.classList.contains('window--focused')).toBe(false);
        expect(second.el.classList.contains('window--focused')).toBe(true);
        expect(Number(second.el.style.zIndex)).toBeGreaterThan(Number(first.el.style.zIndex));
    });

    it('notifies subscribers', () => {
        const { wm } = setup();
        const listener = vi.fn();
        wm.onChange(listener);

        wm.createWindow();
        expect(listener).toHaveBeenCalled();
    });

    it('refuses to create more than MAX_WINDOWS windows', () => {
        const { wm } = setup();
        for (let i = 0; i < MAX_WINDOWS; i++) {
            expect(wm.createWindow()).not.toBeNull();
        }

        expect(wm.listWindows()).toHaveLength(MAX_WINDOWS);
        expect(wm.createWindow()).toBeNull();
        expect(wm.listWindows()).toHaveLength(MAX_WINDOWS);
    });
});

describe('closeWindow', () => {
    it('removes the window from the DOM and destroys its terminal', () => {
        const { desktopEl, wm } = setup();
        const win = wm.createWindow()!;
        const terminal = vi.mocked(createTerminal).mock.results[0].value;

        wm.closeWindow(win.id);

        expect(desktopEl.contains(win.el)).toBe(false);
        expect(terminal.destroy).toHaveBeenCalled();
        expect(wm.listWindows()).toHaveLength(0);
    });

    it('marks the desktop empty again once the last window closes', () => {
        const { desktopEl, wm } = setup();
        const win = wm.createWindow()!;

        wm.closeWindow(win.id);
        expect(desktopEl.classList.contains('desktop--empty')).toBe(true);
    });

    it('focuses the most recently focused remaining window', () => {
        const { wm } = setup();
        const a = wm.createWindow()!;
        wm.createWindow();
        const c = wm.createWindow()!;

        // Focus order is currently a, b, c (c focused). Refocus a so it's most recent.
        wm.focusWindow(a.id);
        wm.closeWindow(a.id);

        expect(c.el.classList.contains('window--focused')).toBe(true);
        expect(wm.getFocusedId()).toBe(c.id);
    });

    it('ignores an unknown id', () => {
        const { wm } = setup();
        wm.createWindow();

        expect(() => wm.closeWindow('nope')).not.toThrow();
        expect(wm.listWindows()).toHaveLength(1);
    });
});

describe('focusWindow', () => {
    it('moves a window to the front without duplicating it in the focus order', () => {
        const { wm } = setup();
        const a = wm.createWindow()!;
        const b = wm.createWindow()!;

        wm.focusWindow(a.id);
        wm.focusWindow(a.id);

        expect(wm.getFocusedId()).toBe(a.id);
        expect(a.el.classList.contains('window--focused')).toBe(true);
        expect(b.el.classList.contains('window--focused')).toBe(false);
    });

    it('raises the focused window above the others', () => {
        const { wm } = setup();
        const a = wm.createWindow()!;
        const b = wm.createWindow()!;

        wm.focusWindow(a.id);
        expect(Number(a.el.style.zIndex)).toBeGreaterThan(Number(b.el.style.zIndex));
    });

    it('does nothing for an unknown id', () => {
        const { wm } = setup();
        const a = wm.createWindow()!;
        const listener = vi.fn();
        wm.onChange(listener);

        wm.focusWindow('nope');

        expect(listener).not.toHaveBeenCalled();
        expect(a.el.classList.contains('window--focused')).toBe(true);
    });
});

describe('listWindows', () => {
    it('returns a snapshot, not a live view', () => {
        const { wm } = setup();
        wm.createWindow();

        const snapshot = wm.listWindows();
        wm.createWindow();

        expect(snapshot).toHaveLength(1);
        expect(wm.listWindows()).toHaveLength(2);
    });
});

describe('getFocusedId', () => {
    it('returns null when no windows are open', () => {
        const { wm } = setup();
        expect(wm.getFocusedId()).toBeNull();
    });

    it('returns the id of the focused window', () => {
        const { wm } = setup();
        const win = wm.createWindow()!;
        expect(wm.getFocusedId()).toBe(win.id);
    });
});

// jsdom always reports 0 for offsetLeft/Top/Width/Height (no layout engine), so
// `startLeft`/`startWidth` etc. are always 0 here — these tests exercise the
// pointer-delta and clamping math, not real on-screen positions.
describe('dragging the titlebar', () => {
    function pointerEvent(type: string, x: number, y: number) {
        return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true });
    }

    it('moves the window by the pointer delta, clamped to the desktop', () => {
        const { wm } = setup();
        const win = wm.createWindow()!;
        const titlebar = win.el.querySelector<HTMLElement>('.window-titlebar')!;

        titlebar.dispatchEvent(pointerEvent('pointerdown', 100, 100));
        titlebar.dispatchEvent(pointerEvent('pointermove', 150, 80));

        expect(win.el.style.left).toBe('50px'); // 0 + (150 - 100)
        expect(win.el.style.top).toBe('0px'); // clamp(0 + (80 - 100), 0, 800)
    });

    it('clamps to the desktop bounds', () => {
        const { wm } = setup();
        const win = wm.createWindow()!;
        const titlebar = win.el.querySelector<HTMLElement>('.window-titlebar')!;

        titlebar.dispatchEvent(pointerEvent('pointerdown', 0, 0));
        titlebar.dispatchEvent(pointerEvent('pointermove', 5000, 5000));

        expect(win.el.style.left).toBe('1200px'); // desktop width (offsetWidth is 0)
        expect(win.el.style.top).toBe('800px'); // desktop height (offsetHeight is 0)
    });

    it('stops moving the window after pointerup', () => {
        const { wm } = setup();
        const win = wm.createWindow()!;
        const titlebar = win.el.querySelector<HTMLElement>('.window-titlebar')!;
        const left = win.el.style.left;

        titlebar.dispatchEvent(pointerEvent('pointerdown', 100, 100));
        titlebar.dispatchEvent(pointerEvent('pointerup', 100, 100));
        titlebar.dispatchEvent(pointerEvent('pointermove', 999, 999));

        expect(win.el.style.left).toBe(left);
    });

    it('does not start a drag from the close button', () => {
        const { wm } = setup();
        const win = wm.createWindow()!;
        const titlebar = win.el.querySelector<HTMLElement>('.window-titlebar')!;
        const closeBtn = win.el.querySelector<HTMLElement>('.window-close')!;
        const left = win.el.style.left;

        closeBtn.dispatchEvent(pointerEvent('pointerdown', 100, 100));
        titlebar.dispatchEvent(pointerEvent('pointermove', 200, 200));

        expect(win.el.style.left).toBe(left);
    });
});

describe('resizing via the resize handle', () => {
    function pointerEvent(type: string, x: number, y: number) {
        return new PointerEvent(type, { clientX: x, clientY: y, pointerId: 1, bubbles: true });
    }

    it('resizes the window by the pointer delta', () => {
        const { wm } = setup();
        const win = wm.createWindow()!;
        const handle = win.el.querySelector<HTMLElement>('.resize-handle')!;

        handle.dispatchEvent(pointerEvent('pointerdown', 0, 0));
        handle.dispatchEvent(pointerEvent('pointermove', 500, 300));

        expect(win.el.style.width).toBe('500px');
        expect(win.el.style.height).toBe('300px');
    });

    it('does not shrink below the minimum size', () => {
        const { wm } = setup();
        const win = wm.createWindow()!;
        const handle = win.el.querySelector<HTMLElement>('.resize-handle')!;

        handle.dispatchEvent(pointerEvent('pointerdown', 0, 0));
        handle.dispatchEvent(pointerEvent('pointermove', -1000, -1000));

        expect(win.el.style.width).toBe('360px'); // MIN_WIDTH
        expect(win.el.style.height).toBe('240px'); // MIN_HEIGHT
    });

    it('stops resizing after pointerup', () => {
        const { wm } = setup();
        const win = wm.createWindow()!;
        const handle = win.el.querySelector<HTMLElement>('.resize-handle')!;
        const width = win.el.style.width;

        handle.dispatchEvent(pointerEvent('pointerdown', 0, 0));
        handle.dispatchEvent(pointerEvent('pointerup', 0, 0));
        handle.dispatchEvent(pointerEvent('pointermove', 999, 999));

        expect(win.el.style.width).toBe(width);
    });
});

describe('onChange', () => {
    it('stops notifying once unsubscribed', () => {
        const { wm } = setup();
        const listener = vi.fn();
        const unsubscribe = wm.onChange(listener);

        unsubscribe();
        wm.createWindow();

        expect(listener).not.toHaveBeenCalled();
    });
});
