// Full-screen "connecting" splash shown once on initial page load, before the
// desktop renders — see terminal.ts's bootSequence() for the per-window
// neofetch+hint sequence that follows it in the first window.

import { prefersReducedMotion, delay, animDelay } from './timing';

const SPLASH_LINES = [
    'Connecting to jameshunt.nz...',
    'Connection established.',
    'Authenticating as guest... ok',
];

const CHAR_DELAY_MS = 14;
const LINE_PAUSE_MS = 110;
const FADE_MS = 300;

// `root` must be `#splash`, containing `.splash-lines` — see index.html.
// Resolves once the sequence has finished and the splash has removed itself
// from the DOM, so the desktop can start rendering underneath.
export async function runSplash(root: HTMLElement): Promise<void> {
    const linesEl = root.querySelector<HTMLElement>('.splash-lines')!;

    for (const line of SPLASH_LINES) {
        const div = document.createElement('div');
        div.className = 'line boot';
        linesEl.appendChild(div);

        if (prefersReducedMotion) {
            div.textContent = line;
        } else {
            for (const char of line) {
                div.textContent += char;
                await delay(CHAR_DELAY_MS);
            }
        }
        await animDelay(LINE_PAUSE_MS);
    }

    await animDelay(FADE_MS);

    root.classList.add('splash--hidden');
    await animDelay(FADE_MS);
    root.remove();
}
