// @vitest-environment jsdom

// `prefersReducedMotion` is computed once from `matchMedia` at module-load
// time, so each branch needs `matchMedia` mocked *before* a fresh import —
// `vi.resetModules()` + dynamic `import()` re-evaluates the module body.
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

afterEach(() => {
    vi.resetModules();
    vi.useRealTimers();
});

describe('delay', () => {
    it('resolves only after the given duration', async () => {
        mockMatchMedia(false);
        vi.useFakeTimers();
        const { delay } = await import('./timing');

        const spy = vi.fn();
        delay(100).then(spy);

        await vi.advanceTimersByTimeAsync(99);
        expect(spy).not.toHaveBeenCalled();

        await vi.advanceTimersByTimeAsync(1);
        expect(spy).toHaveBeenCalled();
    });
});

describe('prefersReducedMotion', () => {
    it('queries the prefers-reduced-motion media feature', async () => {
        mockMatchMedia(false);
        await import('./timing');

        expect(window.matchMedia).toHaveBeenCalledWith('(prefers-reduced-motion: reduce)');
    });

    it('is false when the OS has no reduced-motion preference', async () => {
        mockMatchMedia(false);
        const { prefersReducedMotion } = await import('./timing');

        expect(prefersReducedMotion).toBe(false);
    });

    it('is true when the OS prefers reduced motion', async () => {
        mockMatchMedia(true);
        const { prefersReducedMotion } = await import('./timing');

        expect(prefersReducedMotion).toBe(true);
    });
});

describe('animDelay', () => {
    it('behaves like delay when motion is not reduced', async () => {
        mockMatchMedia(false);
        vi.useFakeTimers();
        const { animDelay } = await import('./timing');

        const spy = vi.fn();
        animDelay(50).then(spy);

        expect(spy).not.toHaveBeenCalled();
        await vi.advanceTimersByTimeAsync(50);
        expect(spy).toHaveBeenCalled();
    });

    it('resolves immediately when motion is reduced, regardless of duration', async () => {
        mockMatchMedia(true);
        const { animDelay } = await import('./timing');

        const spy = vi.fn();
        animDelay(10_000).then(spy);

        // No timers (real or fake) advanced — only a microtask is needed.
        await Promise.resolve();
        expect(spy).toHaveBeenCalled();
    });
});
