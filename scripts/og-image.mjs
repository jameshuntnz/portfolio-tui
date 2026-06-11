// Regenerates public/og-image.png from a live render of the site: boots a
// headless browser against an in-process Vite dev server, waits for the
// splash + boot sequence to finish, and screenshots the result.
//
// Usage: pnpm run og-image

import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const outFile = path.join(root, 'public/og-image.png');

const server = await createServer({ root, clearScreen: false, server: { port: 0 } });
await server.listen();
const url = server.resolvedUrls.local[0];

// Render at a larger viewport and scale the screenshot back down to the
// 1200x630 og:image size — a cheap way to "zoom out" and fit more of the
// desktop in frame than a 1:1 capture would.
const OUTPUT_WIDTH = 1200; // matches og:image:width/height in index.html
const VIEWPORT_WIDTH = 1440;
const VIEWPORT_HEIGHT = 756;

const browser = await chromium.launch();
try {
  const page = await browser.newPage({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: OUTPUT_WIDTH / VIEWPORT_WIDTH,
  });
  await page.emulateMedia({ reducedMotion: 'reduce', colorScheme: 'dark' });
  await page.goto(url);
  await page.locator('.screen[aria-busy="false"]').waitFor({ timeout: 10_000 });
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({ path: outFile });
} finally {
  await browser.close();
  await server.close();
}

console.log(`Wrote ${path.relative(root, outFile)}`);
