import { test, expect } from '@playwright/test';

// Mirrors a11y.test.ts/shell.test.ts: skip animations so the boot sequence
// completes instantly, then wait for the default window's screen to report
// it's done before driving the desktop.
test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('.screen[aria-busy="false"]').waitFor({ timeout: 10_000 });
});

test('loads with exactly one window and runs neofetch on boot', async ({ page }) => {
    await expect(page.locator('.window')).toHaveCount(1);
    await expect(page.locator('.screen')).toContainText('neofetch');
    await expect(page.locator('#splash')).toHaveCount(0);
});

test('clicking "+ term" opens a second window without the boot sequence', async ({ page }) => {
    await page.locator('.polybar-new-window').click();

    await expect(page.locator('.window')).toHaveCount(2);
    const newWindow = page.locator('.window').last();
    await expect(newWindow.locator('.screen')).not.toContainText('Connecting to jameshunt.nz...');
    await expect(newWindow.locator('.input-line')).toBeVisible();
});

test('Ctrl+Enter opens a new window', async ({ page }) => {
    await page.keyboard.press('Control+Enter');

    await expect(page.locator('.window')).toHaveCount(2);
});

// Mirrors MAX_WINDOWS in window-manager.ts.
const MAX_WINDOWS = 10;

test('window count is capped at the maximum', async ({ page }) => {
    for (let i = 1; i < MAX_WINDOWS; i++) {
        await page.keyboard.press('Control+Enter');
    }
    await expect(page.locator('.window')).toHaveCount(MAX_WINDOWS);
    await expect(page.locator('.polybar-new-window')).toBeDisabled();

    // Further attempts via either entry point are no-ops.
    await page.keyboard.press('Control+Enter');
    await page.locator('.polybar-new-window').click({ force: true });
    await expect(page.locator('.window')).toHaveCount(MAX_WINDOWS);
});

test('plain Enter commits the line and does not open a new window', async ({ page }) => {
    await page.keyboard.type('whoami');
    await page.keyboard.press('Enter');
    await page.locator('.input-line').waitFor({ state: 'visible', timeout: 5_000 });

    await expect(page.locator('.window')).toHaveCount(1);
    await expect(page.locator('.screen')).toContainText('guest@jameshunt.nz:~$ whoami');
});

test('clicking a workspace dot focuses the corresponding window', async ({ page }) => {
    await page.locator('.polybar-new-window').click();
    await expect(page.locator('.window')).toHaveCount(2);

    // The newly created window is focused by default.
    await expect(page.locator('.window').nth(1)).toHaveClass(/window--focused/);
    await expect(page.locator('.window').nth(0)).not.toHaveClass(/window--focused/);

    await page.locator('.workspace-dot').first().click();

    await expect(page.locator('.window').nth(0)).toHaveClass(/window--focused/);
    await expect(page.locator('.window').nth(1)).not.toHaveClass(/window--focused/);
});

test('close button removes a window and shows the empty-desktop hint', async ({ page }) => {
    await expect(page.locator('.window')).toHaveCount(1);

    await page.locator('.window-close').click();

    await expect(page.locator('.window')).toHaveCount(0);
    await expect(page.locator('.desktop-hint')).toBeVisible();
});

test('polybar theme toggle flips the theme', async ({ page }) => {
    const before = await page.locator('html').getAttribute('data-theme');

    await page.locator('.polybar-theme-toggle').click();

    const after = await page.locator('html').getAttribute('data-theme');
    expect(after).not.toBe(before);
    expect(['light', 'dark']).toContain(after);
});

test.describe('mobile viewport', () => {
    test('hides the new-window button and shows only the focused window', async ({ page }) => {
        await page.keyboard.press('Control+Enter');
        await expect(page.locator('.window')).toHaveCount(2);

        await page.setViewportSize({ width: 390, height: 844 });

        await expect(page.locator('.polybar-new-window')).toBeHidden();
        await expect(page.locator('.window').nth(1)).toBeVisible();
        await expect(page.locator('.window').nth(0)).toBeHidden();
    });
});
