import { test, expect } from '@playwright/test';
import AxeBuilder from '@axe-core/playwright';

test.beforeEach(async ({ page }) => {
    // Skip animations so the boot sequence completes instantly
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    // aria-busy flips to false in init() only after bootSequence() fully resolves,
    // including all neofetch output — safer than waiting on #input-line visibility.
    await page.locator('#screen[aria-busy="false"]').waitFor({ timeout: 10_000 });
});

test('no axe violations after boot', async ({ page }) => {
    const results = await new AxeBuilder({ page }).analyze();
    expect(results.violations).toEqual([]);
    expect(results.incomplete).toEqual([]);
});

test('cmd-links are keyboard activatable via Enter', async ({ page }) => {
    const link = page.locator('.cmd-link').first();
    await link.waitFor();
    await link.focus();
    const before = await page.locator('#screen .output').count();
    await page.keyboard.press('Enter');
    await page.locator('#input-line').waitFor({ state: 'visible', timeout: 5_000 });
    expect(await page.locator('#screen .output').count()).toBeGreaterThan(before);
});

test('cmd-links are keyboard activatable via Space', async ({ page }) => {
    const link = page.locator('.cmd-link').first();
    await link.waitFor();
    await link.focus();
    const before = await page.locator('#screen .output').count();
    await page.keyboard.press('Space');
    await page.locator('#input-line').waitFor({ state: 'visible', timeout: 5_000 });
    expect(await page.locator('#screen .output').count()).toBeGreaterThan(before);
});

test('viewport does not block zoom', async ({ page }) => {
    const content = await page.evaluate(
        () => document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
    );
    expect(content).not.toContain('maximum-scale');
    expect(content).not.toContain('user-scalable=no');
});

test('screen has aria-live region', async ({ page }) => {
    await expect(page.locator('#screen')).toHaveAttribute('aria-live', 'polite');
});

test('hidden input has accessible label', async ({ page }) => {
    await expect(page.locator('#hidden-input')).toHaveAttribute('aria-label');
});
