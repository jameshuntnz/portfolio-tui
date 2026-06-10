// Generic terminal-escape-to-HTML parser — colour AND links come entirely
// from the content (real escape codes), not from per-command stylesheet rules
// or pattern-matching known strings. There's no indexed palette tier: every
// colour is 24-bit truecolor (38;2;r;g;b / 48;2;r;g;b) — exact hex, always,
// never re-themed — which is also how the hardcoded {{paper}}/{{moss}}/etc.
// shortcuts compile (see markup.ts), and links are real OSC 8 sequences
// ({{link:url}} in markup.ts), exactly what a real terminal emits. This
// module just paints whatever the content specifies — pure string in, HTML
// string out, no DOM access — so it can run and be tested anywhere.

export function escapeHtml(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// Matches SGR colour/style sequences, OSC 8 hyperlinks, and the custom
// OSC 201-204 sequences emitted by markup.ts for CSS-variable colours and
// decorative-art flags ({{glyphs}} / {{deco}}).
// Group 1: SGR params  Group 2: OSC 8 URL  Group 3: "201".."204"  Group 4: CSS var value (201/202 only)
const ESCAPE_RE =
    // eslint-disable-next-line no-control-regex -- \x1b (ESC) is the terminal escape byte we're matching
    /\x1b\[([0-9;]*)m|\x1b]8;[^;]*;([^\x1b]*)\x1b\\|\x1b](20[1-4]);;([^\x1b]*)\x1b\\/g;

export function ansiToHTML(text: string): string {
    let html = '';
    let lastIndex = 0;
    let fg: string | null = null;
    let bg: string | null = null;
    let bold = false;
    let dim = false;
    let glyphs = false;
    let deco = false;
    let link: string | null = null;

    const flush = (segment: string) => {
        if (!segment) return;
        const styles: string[] = [];
        if (fg) styles.push(`color: ${fg}`);
        if (bg) styles.push(`background: ${bg}`);
        if (bold) styles.push('font-weight: 700');
        if (dim) styles.push('opacity: 0.7');
        const inner = escapeHtml(segment);

        const attrs: string[] = [];
        if (glyphs) attrs.push('class="glyphs"');
        if (styles.length) attrs.push(`style="${styles.join('; ')}"`);
        if (deco) attrs.push('aria-hidden="true"');
        const styled = attrs.length ? `<span ${attrs.join(' ')}>${inner}</span>` : inner;

        if (link?.startsWith('cmd:')) {
            const command = link.slice(4);
            html += `<span class="cmd-link" role="button" tabindex="0" data-command="${escapeHtml(command)}">${styled}</span>`;
        } else if (link) {
            html += `<a href="${escapeHtml(link)}" target="_blank" rel="noopener noreferrer">${styled}</a>`;
        } else {
            html += styled;
        }
    };

    ESCAPE_RE.lastIndex = 0;
    let match: RegExpExecArray | null;
    while ((match = ESCAPE_RE.exec(text))) {
        flush(text.slice(lastIndex, match.index));
        lastIndex = ESCAPE_RE.lastIndex;

        if (match[2] !== undefined) {
            link = match[2] || null;
            continue;
        }

        // OSC 201/202 = CSS-variable fg/bg (value is a CSS colour string, e.g.
        // "var(--accent)"). OSC 203/204 = {{glyphs}}/{{deco}} flags — no value,
        // just turns the flag on until the next reset.
        if (match[3] !== undefined) {
            if (match[3] === '201') fg = match[4] || null;
            else if (match[3] === '202') bg = match[4] || null;
            else if (match[3] === '203') glyphs = true;
            else if (match[3] === '204') deco = true;
            continue;
        }

        const codes = match[1]
            .split(';')
            .filter((c) => c !== '')
            .map(Number);
        if (codes.length === 0) codes.push(0);

        for (let i = 0; i < codes.length; i++) {
            const code = codes[i];
            if (code === 0) {
                fg = null;
                bg = null;
                bold = false;
                dim = false;
                glyphs = false;
                deco = false;
            } else if (code === 1) bold = true;
            else if (code === 2) dim = true;
            else if (code === 22) {
                bold = false;
                dim = false;
            } else if (code === 38 || code === 48) {
                const isBg = code === 48;
                if (codes[i + 1] === 2) {
                    const [r, g, b] = [codes[i + 2], codes[i + 3], codes[i + 4]];
                    const value = `rgb(${r}, ${g}, ${b})`;
                    if (isBg) bg = value;
                    else fg = value;
                    i += 4;
                }
            }
        }
    }
    flush(text.slice(lastIndex));
    return html;
}
