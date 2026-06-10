import { describe, expect, it } from 'vitest';
import { ansiToHTML, escapeHtml } from './ansi';

const ESC = '\x1b';
const RESET = `${ESC}[0m`;

function sgr(...codes: number[]): string {
    return `${ESC}[${codes.join(';')}m`;
}

function fg(r: number, g: number, b: number): string {
    return sgr(38, 2, r, g, b);
}

function bg(r: number, g: number, b: number): string {
    return sgr(48, 2, r, g, b);
}

function osc8(url: string): string {
    return `${ESC}]8;;${url}${ESC}\\`;
}

function oscFlag(code: number): string {
    return `${ESC}]${code};;${ESC}\\`;
}

const linkClose = osc8('');

describe('escapeHtml', () => {
    it('escapes ampersands, angle brackets — but not quotes', () => {
        expect(escapeHtml('a & b < c > d')).toBe('a &amp; b &lt; c &gt; d');
        expect(escapeHtml(`"quoted"`)).toBe(`"quoted"`);
    });

    it('leaves plain text untouched', () => {
        expect(escapeHtml('hello world')).toBe('hello world');
    });
});

describe('ansiToHTML', () => {
    it('passes plain text through unstyled', () => {
        expect(ansiToHTML('hello world')).toBe('hello world');
    });

    it('escapes HTML-significant characters in plain text', () => {
        expect(ansiToHTML('a & b <tag>')).toBe('a &amp; b &lt;tag&gt;');
    });

    it('wraps truecolor foreground text in a styled span', () => {
        const html = ansiToHTML(`${fg(107, 127, 79)}moss${RESET}`);
        expect(html).toBe('<span style="color: rgb(107, 127, 79)">moss</span>');
    });

    it('wraps truecolor background text in a styled span', () => {
        const html = ansiToHTML(`${bg(241, 241, 231)}paper bg${RESET}`);
        expect(html).toBe('<span style="background: rgb(241, 241, 231)">paper bg</span>');
    });

    it('combines foreground, background, bold and dim into one style attribute', () => {
        const html = ansiToHTML(`${fg(1, 2, 3)}${bg(4, 5, 6)}${sgr(1)}${sgr(2)}styled${RESET}`);
        expect(html).toBe(
            '<span style="color: rgb(1, 2, 3); background: rgb(4, 5, 6); font-weight: 700; opacity: 0.7">styled</span>',
        );
    });

    it('resets all active styles on SGR code 0', () => {
        const html = ansiToHTML(`${fg(1, 2, 3)}${sgr(1)}bold-coloured${RESET}plain`);
        expect(html).toBe(
            '<span style="color: rgb(1, 2, 3); font-weight: 700">bold-coloured</span>plain',
        );
    });

    it('treats an empty SGR sequence ("\\x1b[m") as a reset', () => {
        const html = ansiToHTML(`${fg(1, 2, 3)}coloured${ESC}[mplain`);
        expect(html).toBe('<span style="color: rgb(1, 2, 3)">coloured</span>plain');
    });

    it('clears bold and dim (but not colour) on SGR code 22', () => {
        const html = ansiToHTML(`${fg(1, 2, 3)}${sgr(1)}bold${sgr(22)}not bold${RESET}`);
        expect(html).toBe(
            '<span style="color: rgb(1, 2, 3); font-weight: 700">bold</span>' +
                '<span style="color: rgb(1, 2, 3)">not bold</span>',
        );
    });

    it('ignores 38/48 sequences that are not truecolor (mode != 2)', () => {
        // 38;5;n is the indexed-256-colour form — explicitly unsupported (truecolor only).
        const html = ansiToHTML(`${sgr(38, 5, 200)}text${RESET}`);
        expect(html).toBe('text');
    });

    it('renders a plain OSC 8 link as an anchor opening in a new tab', () => {
        const html = ansiToHTML(`${osc8('https://example.com')}click me${linkClose}after`);
        expect(html).toBe(
            '<a href="https://example.com" target="_blank" rel="noopener noreferrer">click me</a>after',
        );
    });

    it('renders a cmd: link as a clickable command-suggestion span, not an anchor', () => {
        const html = ansiToHTML(`${osc8('cmd:cat about.txt')}cat about.txt${linkClose}`);
        expect(html).toBe(
            '<span class="cmd-link" role="button" tabindex="0" data-command="cat about.txt">cat about.txt</span>',
        );
    });

    it('escapes HTML-significant characters in link URLs and commands', () => {
        const plain = ansiToHTML(`${osc8('https://example.com?a=1&b=2')}link${linkClose}`);
        expect(plain).toContain('href="https://example.com?a=1&amp;b=2"');

        const cmd = ansiToHTML(`${osc8('cmd:echo <a> & <b>')}link${linkClose}`);
        expect(cmd).toContain('data-command="echo &lt;a&gt; &amp; &lt;b&gt;"');
    });

    it('applies colour styling to link text inside the anchor', () => {
        const html = ansiToHTML(
            `${fg(1, 2, 3)}${osc8('https://example.com')}styled link${linkClose}${RESET}`,
        );
        expect(html).toBe(
            '<a href="https://example.com" target="_blank" rel="noopener noreferrer">' +
                '<span style="color: rgb(1, 2, 3)">styled link</span></a>',
        );
    });

    it('stops linking once the link is closed with an empty OSC 8 sequence', () => {
        const html = ansiToHTML(`${osc8('https://example.com')}linked${linkClose}plain`);
        expect(html).toBe(
            '<a href="https://example.com" target="_blank" rel="noopener noreferrer">linked</a>plain',
        );
    });

    it('applies the glyphs class for OSC 203 (tight line-height marker)', () => {
        const html = ansiToHTML(`${oscFlag(203)}  __  ${RESET}`);
        expect(html).toBe('<span class="glyphs">  __  </span>');
    });

    it('marks content aria-hidden for OSC 204 (decorative)', () => {
        const html = ansiToHTML(`${oscFlag(204)}✦${RESET}`);
        expect(html).toBe('<span aria-hidden="true">✦</span>');
    });

    it('combines glyphs, deco, and colour into one span', () => {
        const html = ansiToHTML(`${fg(107, 127, 79)}${oscFlag(203)}${oscFlag(204)}art${RESET}`);
        expect(html).toBe(
            '<span class="glyphs" style="color: rgb(107, 127, 79)" aria-hidden="true">art</span>',
        );
    });

    it('resets glyphs and deco flags on SGR code 0', () => {
        const html = ansiToHTML(`${oscFlag(204)}hidden${RESET}visible`);
        expect(html).toBe('<span aria-hidden="true">hidden</span>visible');
    });

    it('drops empty segments rather than emitting empty spans/anchors', () => {
        // Adjacent escape codes with nothing between them shouldn't produce output.
        const html = ansiToHTML(
            `${fg(1, 2, 3)}${RESET}${osc8('https://example.com')}${linkClose}visible`,
        );
        expect(html).toBe('visible');
    });

    it('handles a realistic multi-segment line (colour + link + reset + plain)', () => {
        const line =
            `${fg(107, 127, 79)}$ ${RESET}` +
            `${osc8('cmd:cat projects/wayfairer.md')}cat projects/wayfairer.md${linkClose}` +
            ' — try it';
        const html = ansiToHTML(line);
        expect(html).toBe(
            '<span style="color: rgb(107, 127, 79)">$ </span>' +
                '<span class="cmd-link" role="button" tabindex="0" data-command="cat projects/wayfairer.md">cat projects/wayfairer.md</span>' +
                ' — try it',
        );
    });
});
