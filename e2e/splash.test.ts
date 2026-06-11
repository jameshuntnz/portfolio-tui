import { test, expect } from '@playwright/test';

// Unlike desktop.test.ts/a11y.test.ts, this runs with full animation timing
// (no reduced-motion override) so the splash is observable mid-sequence
// before it fades out and the desktop renders underneath.
test('shows a full-screen connecting splash before the desktop loads', async ({ page }) => {
    await page.goto('/');

    await expect(page.locator('#splash')).toBeVisible();
    await expect(page.locator('#splash')).toContainText('Connecting to jameshunt.nz...');
    await expect(page.locator('.window')).toHaveCount(0);

    await page.locator('#splash').waitFor({ state: 'detached', timeout: 10_000 });

    await expect(page.locator('.window')).toHaveCount(1);
    await expect(page.locator('.screen[aria-busy="false"]')).toBeVisible({ timeout: 10_000 });
});
