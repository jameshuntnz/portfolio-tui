// Tiny build-time compiler: turns readable {{tag}}...{{/}} markup into real
// ANSI/terminal escape sequences. The renderer downstream only ever sees
// genuine escapes — exactly what a real terminal emits — so content stays
// portable to a future SSH/PTY layer. Only the *authoring* step needs the
// friendlier syntax, and that compilation happens here, at build time.

// The entire colour vocabulary, full stop — carried over verbatim from
// ~/dev/portfolio (paper / ink / sand / sand-soft / moss). There is no 16-slot
// indexed palette here: every named colour below compiles straight to a real
// 24-bit truecolor SGR code (38;2;r;g;b / 48;2;r;g;b), exactly like
// {{rgb:r,g,b}} does — they're shorthand for the same mechanism, not a
// separate system, so what you see is always the exact hex, never a re-themed
// approximation.
const PALETTE: Record<string, [number, number, number]> = {
    paper: [0xf1, 0xf1, 0xe7],
    ink: [0x2e, 0x31, 0x2a],
    sand: [0xb7, 0xa8, 0x8c],
    'sand-soft': [0xdb, 0xd4, 0xc6],
    moss: [0x6b, 0x7f, 0x4f],
};

const STRUCTURAL_CODES: Record<string, number[]> = {
    reset: [0],
    bold: [1],
    dim: [2],
    italic: [3],
    underline: [4],
    blink: [5],
    invert: [7],
    strikethrough: [9],
};

function compileTag(raw: string): string {
    const tag = raw.trim();
    if (tag === '/' || tag === 'reset') return '\x1b[0m';

    // {{link:url}}...{{/link}} — a real OSC 8 hyperlink, the same escape a
    // terminal like iTerm2/kitty/wezterm uses to make text clickable. Encoding
    // the link *in the content* (rather than pattern-matching known strings at
    // render time) means a link is just another piece of real terminal output —
    // portable to a future SSH/PTY layer like everything else here.
    if (tag === '/link') return '\x1b]8;;\x1b\\';
    const link = tag.match(/^link:(.+)$/);
    if (link) return `\x1b]8;;${link[1]}\x1b\\`;

    // {{rgb:r,g,b}} / {{bg-rgb:r,g,b}} — arbitrary truecolor, exact and theme-independent.
    const rgb = tag.match(/^(bg-)?rgb:(\d{1,3}),(\d{1,3}),(\d{1,3})$/);
    if (rgb) {
        const [, bg, r, g, b] = rgb;
        return `\x1b[${bg ? 48 : 38};2;${r};${g};${b}m`;
    }

    // {{hex:#rrggbb}} / {{bg-hex:#rrggbb}} — hex shorthand for the same truecolor mechanism.
    const hex = tag.match(/^(bg-)?hex:#([0-9a-fA-F]{6})$/);
    if (hex) {
        const [, bg, h] = hex;
        const r = parseInt(h.slice(0, 2), 16);
        const g = parseInt(h.slice(2, 4), 16);
        const b = parseInt(h.slice(4, 6), 16);
        return `\x1b[${bg ? 48 : 38};2;${r};${g};${b}m`;
    }

    // {{accent}} / {{bg-accent}} / {{accent-dim}} / {{ok}} — theme-aware CSS
    // variable colours. Unlike the hardcoded palette above these compile to
    // custom OSC sequences (201 = fg, 202 = bg) that the HTML renderer converts
    // to CSS custom properties, so they follow the active theme. A future
    // SSH/PTY renderer would substitute its own concrete values instead.
    const isBg = tag.startsWith('bg-');
    const baseTag = isBg ? tag.slice(3) : tag;
    const cssVar: Record<string, string> = {
        accent: 'var(--accent)',
        'accent-dim': 'var(--accent-dim)',
        ok: 'var(--ok)',
    };
    if (cssVar[baseTag]) return `\x1b]${isBg ? 202 : 201};;${cssVar[baseTag]}\x1b\\`;

    // {{glyphs}} / {{deco}} — flag tags for decorative box-drawing/dingbat art
    // (logos, banners, the neofetch star scatter). {{glyphs}} marks a span
    // whose *line* should tighten to line-height: 1.3 / letter-spacing: 0 so
    // multi-row block-glyph pictures tile without gaps (see terminal.css).
    // {{deco}} marks content as decorative — the renderer adds aria-hidden so
    // screen readers skip it and axe doesn't flag glyph-only text for
    // color-contrast. Both compile to custom OSC sequences (203/204) that
    // carry no value, just a flag, and both are cleared by {{/}} like every
    // other piece of state here.
    const FLAG_OSC: Record<string, number> = {
        glyphs: 203,
        deco: 204,
    };
    if (FLAG_OSC[tag]) return `\x1b]${FLAG_OSC[tag]};;\x1b\\`;

    // {{paper}} / {{bg-moss}} / etc — named shortcuts for the hardcoded palette
    // above, compiled to the exact same truecolor codes as {{rgb:...}}.
    const swatch = PALETTE[baseTag];
    if (swatch) {
        const [r, g, b] = swatch;
        return `\x1b[${isBg ? 48 : 38};2;${r};${g};${b}m`;
    }

    const codes = STRUCTURAL_CODES[tag];
    return codes ? `\x1b[${codes.join(';')}m` : '';
}

export function compileMarkup(text: string): string {
    return text.replace(/\{\{\s*([^}]+?)\s*}}/g, (_, tag) => compileTag(tag));
}

// A clickable command suggestion — "Try: cat projects/wayfairer.md" etc.
// Reuses the exact same OSC 8 hyperlink mechanism as {{link:...}}, just with a
// custom `cmd:` URI scheme — the same layering trick real terminal
// integrations use (VSCode's `command:`, iTerm2's proprietary schemes) to ride
// on top of a standard escape rather than invent a new one. The renderer
// recognises the scheme and runs the command instead of navigating.
export function commandLink(command: string, label = command): string {
    return `\x1b]8;;cmd:${command}\x1b\\${label}\x1b]8;;\x1b\\`;
}
