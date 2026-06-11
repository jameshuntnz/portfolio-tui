// @vitest-environment jsdom

// `splash.ts` imports `./timing`, whose `prefersReducedMotion` is computed
// once from `matchMedia` at module-load time — mock it before each dynamic
// `import('./splash')` (after `vi.resetModules()`) to control which path runs.
import { afterEach, describe, expect, it, vi } from 'vitest';

function mockMatchMedia(matches: boolean) {
    window.matchMedia = vi.fn().mockImplementation((query: string) => ({
        matches,
        media: query,
        onchange: null,
        addListener: vi.fn(),
        removeListener: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        dispatchEvent: vi.fn(),
    }));
}

function buildRoot(): HTMLElement {
    const root = document.createElement('div');
    root.id = 'splash';
    root.innerHTML = '<div class="splash-lines"></div>';
    document.body.appendChild(root);
    return root;
}

const EXPECTED_LINES = [
    'Connecting to jameshunt.nz...',
    'Connection established.',
    'Authenticating as guest... ok',
];

afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
    document.body.innerHTML = '';
});

describe('runSplash with reduced motion', () => {
    it('renders each line in full and removes itself from the DOM', async () => {
        mockMatchMedia(true);
        const { runSplash } = await import('./splash');
        const root = buildRoot();

        await runSplash(root);

        const lines = root.querySelectorAll('.splash-lines .line.boot');
        expect([...lines].map((el) => el.textContent)).toEqual(EXPECTED_LINES);
        expect(root.classList.contains('splash--hidden')).toBe(true);
        expect(root.isConnected).toBe(false);
    });
});

describe('runSplash with full motion', () => {
    it('types each line out character by character before fading and removing itself', async () => {
        mockMatchMedia(false);
        vi.useFakeTimers();
        const { runSplash } = await import('./splash');
        const root = buildRoot();

        const done = runSplash(root);
        await vi.runAllTimersAsync();
        await done;

        const lines = root.querySelectorAll('.splash-lines .line.boot');
        expect([...lines].map((el) => el.textContent)).toEqual(EXPECTED_LINES);
        expect(root.isConnected).toBe(false);
    });
});
