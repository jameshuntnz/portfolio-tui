import { test, expect, type Page } from '@playwright/test';

// Mirrors a11y.test.ts: skip animations so the boot sequence (which types
// out character-by-character) completes instantly, then wait for the screen
// to report it's done before each test starts driving the terminal.
test.beforeEach(async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.goto('/');
    await page.locator('.screen[aria-busy="false"]').waitFor({ timeout: 10_000 });
});

// While a command's output is streaming in, the prompt is hidden and
// keystrokes are ignored (see `whileBusy` in terminal.ts) — wait for it to
// reappear before sending more input, just like a real user would wait for
// the prompt before typing the next command.
async function waitForPrompt(page: Page) {
    await page.locator('.input-line').waitFor({ state: 'visible', timeout: 5_000 });
}

async function runCommand(page: Page, command: string) {
    await page.keyboard.type(command);
    await page.keyboard.press('Enter');
    await waitForPrompt(page);
}

test.describe('boot sequence', () => {
    test('runs neofetch automatically', async ({ page }) => {
        const screen = page.locator('.screen');
        await expect(screen).toContainText('guest@jameshunt.nz:~$ neofetch');
        await expect(screen).toContainText('Type');
        await expect(screen).toContainText('to see what you can do here');
    });

    test('leaves the prompt focused and ready for input', async ({ page }) => {
        await expect(page.locator('.hidden-input')).toBeFocused();
        await expect(page.locator('.prompt')).toHaveText('guest@jameshunt.nz:~$');
    });
});

test.describe('running commands', () => {
    test('typing a command echoes it and prints its output', async ({ page }) => {
        await runCommand(page, 'whoami');

        const screen = page.locator('.screen');
        await expect(screen).toContainText('guest@jameshunt.nz:~$ whoami');
        await expect(screen).toContainText('guest');
    });

    test('unknown commands suggest help', async ({ page }) => {
        await runCommand(page, 'frobnicate');

        await expect(page.locator('.screen')).toContainText('command not found: frobnicate');
        await expect(page.locator('.cmd-link', { hasText: 'help' }).first()).toBeVisible();
    });
});

test.describe('filesystem navigation', () => {
    test('ls lists the fake filesystem', async ({ page }) => {
        await runCommand(page, 'ls');

        const screen = page.locator('.screen');
        await expect(screen).toContainText('about.txt');
        await expect(screen).toContainText('projects/');
    });

    test('cd into a directory updates the prompt, pwd, and ls', async ({ page }) => {
        await runCommand(page, 'cd projects');
        await expect(page.locator('.prompt')).toHaveText('guest@jameshunt.nz:~/projects$');

        await runCommand(page, 'pwd');
        await expect(page.locator('.screen')).toContainText('/projects');

        await runCommand(page, 'ls');
        await expect(page.locator('.screen')).toContainText('wayfairer.md');

        await runCommand(page, 'cd ..');
        await expect(page.locator('.prompt')).toHaveText('guest@jameshunt.nz:~$');
    });

    test('cat prints a file; cd/cat report missing paths', async ({ page }) => {
        await runCommand(page, 'cat contact.txt');
        await expect(page.locator('.screen')).toContainText('Reach me here');
        await expect(page.locator('.screen')).toContainText('huntjames379@gmail.com');

        await runCommand(page, 'cd nowhere');
        await expect(page.locator('.screen')).toContainText('No such file or directory');

        await runCommand(page, 'cat nowhere.txt');
        await expect(page.locator('.screen')).toContainText('No such file or directory');
    });
});

test.describe('tab completion', () => {
    test('completes a unique command name', async ({ page }) => {
        await page.keyboard.type('neofe');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        await waitForPrompt(page);

        await expect(page.locator('.screen')).toContainText('guest@jameshunt.nz:~$ neofetch');
    });

    test('completes a unique file path', async ({ page }) => {
        await page.keyboard.type('cat contact.t');
        await page.keyboard.press('Tab');
        await page.keyboard.press('Enter');
        await waitForPrompt(page);

        await expect(page.locator('.screen')).toContainText(
            'guest@jameshunt.nz:~$ cat contact.txt',
        );
        await expect(page.locator('.screen')).toContainText('Reach me here');
    });

    test('lists candidates on ambiguous completion without running anything', async ({ page }) => {
        await page.keyboard.type('c');
        await page.keyboard.press('Tab');

        const screen = page.locator('.screen');
        await expect(screen).toContainText('cat');
        await expect(screen).toContainText('cd');
        await expect(screen).toContainText('clear');

        // the buffer still just holds "c" — running it is "command not found"
        await page.keyboard.press('Enter');
        await waitForPrompt(page);
        await expect(screen).toContainText('command not found: c');
    });
});

test.describe('command history', () => {
    test('ArrowUp recalls and re-runs the previous command', async ({ page }) => {
        await runCommand(page, 'whoami');

        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('Enter');
        await waitForPrompt(page);

        await expect(page.locator('.screen .output', { hasText: 'whoami' })).toHaveCount(2);
    });

    test('ArrowDown restores the in-progress draft after browsing history', async ({ page }) => {
        await runCommand(page, 'whoami');

        await page.keyboard.type('zzzdraft');
        await page.keyboard.press('ArrowUp');
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        await waitForPrompt(page);

        await expect(page.locator('.screen')).toContainText('command not found: zzzdraft');
    });

    test('history command lists past commands in order', async ({ page }) => {
        await runCommand(page, 'whoami');
        await runCommand(page, 'pwd');
        await runCommand(page, 'history');

        const screen = page.locator('.screen');
        await expect(screen).toContainText('1  neofetch');
        await expect(screen).toContainText('2  whoami');
        await expect(screen).toContainText('3  pwd');
    });
});

test.describe('theme switching', () => {
    test('theme dark switches and persists to localStorage', async ({ page }) => {
        await runCommand(page, 'theme dark');

        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await expect(page.locator('.screen')).toContainText('switched to dark mode');
        expect(await page.evaluate(() => localStorage.getItem('jh-terminal-theme'))).toBe('dark');
    });

    test('theme toggle flips the current theme', async ({ page }) => {
        await runCommand(page, 'theme dark');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

        await runCommand(page, 'theme toggle');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    });

    test('theme choice survives a reload', async ({ page }) => {
        await runCommand(page, 'theme dark');
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

        await page.reload();
        await page.locator('.screen[aria-busy="false"]').waitFor({ timeout: 10_000 });
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    });
});

test('clear wipes the screen', async ({ page }) => {
    await runCommand(page, 'whoami');
    await expect(page.locator('.screen')).toContainText('guest');

    await runCommand(page, 'clear');

    await expect(page.locator('.screen .output')).toHaveCount(0);
});

test('clicking a command link runs that command', async ({ page }) => {
    await page.locator('.cmd-link', { hasText: 'help' }).first().click();

    await expect(page.locator('.screen')).toContainText('guest@jameshunt.nz:~$ help');
    await expect(page.locator('.screen')).toContainText('Available commands');
});

test.describe('easter eggs', () => {
    test('sudo without a command', async ({ page }) => {
        await runCommand(page, 'sudo');

        await expect(page.locator('.screen')).toContainText('usage: sudo <command>');
    });

    test('rm -rf / is refused', async ({ page }) => {
        await runCommand(page, 'rm -rf /');

        await expect(page.locator('.screen')).toContainText('Permission denied');
    });
});

test('pasting multiple lines runs all but the last as commands', async ({ page }) => {
    await page.locator('.hidden-input').evaluate((el) => {
        const dt = new DataTransfer();
        dt.setData('text/plain', 'whoami\npwd');
        el.dispatchEvent(
            new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }),
        );
    });

    // "whoami" ran immediately
    await expect(page.locator('.screen')).toContainText('guest@jameshunt.nz:~$ whoami');
    await waitForPrompt(page);

    // "pwd" is left in the buffer, ready to run
    await page.keyboard.press('Enter');
    await expect(page.locator('.screen')).toContainText('guest@jameshunt.nz:~$ pwd');
});
