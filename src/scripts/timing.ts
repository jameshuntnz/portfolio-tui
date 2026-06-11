// Shared animation timing helpers — used by the per-window terminal output
// (terminal.ts) and the full-screen boot splash (splash.ts) so both respect
// prefers-reduced-motion the same way.

export const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

export function animDelay(ms: number): Promise<void> {
    return prefersReducedMotion ? Promise.resolve() : delay(ms);
}
