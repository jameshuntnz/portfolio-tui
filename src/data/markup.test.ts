import { describe, expect, it } from 'vitest';
import { commandLink, compileMarkup } from './markup';

describe('compileMarkup', () => {
    it('compiles structural tags to SGR codes', () => {
        expect(compileMarkup('{{bold}}hi{{/}}')).toBe('\x1b[1mhi\x1b[0m');
        expect(compileMarkup('{{dim}}hi{{/}}')).toBe('\x1b[2mhi\x1b[0m');
        expect(compileMarkup('{{italic}}hi{{/}}')).toBe('\x1b[3mhi\x1b[0m');
        expect(compileMarkup('{{underline}}hi{{/}}')).toBe('\x1b[4mhi\x1b[0m');
        expect(compileMarkup('{{blink}}hi{{/}}')).toBe('\x1b[5mhi\x1b[0m');
        expect(compileMarkup('{{invert}}hi{{/}}')).toBe('\x1b[7mhi\x1b[0m');
        expect(compileMarkup('{{strikethrough}}hi{{/}}')).toBe('\x1b[9mhi\x1b[0m');
        expect(compileMarkup('{{reset}}')).toBe('\x1b[0m');
    });

    it('compiles named palette colours to real truecolor codes — never an indexed palette', () => {
        // moss = #6b7f4f = rgb(107, 127, 79)
        expect(compileMarkup('{{moss}}x{{/}}')).toBe('\x1b[38;2;107;127;79mx\x1b[0m');
        // bg- variants flip to the background SGR (48 instead of 38)
        expect(compileMarkup('{{bg-moss}}x{{/}}')).toBe('\x1b[48;2;107;127;79mx\x1b[0m');
    });

    it('compiles every hardcoded palette name to the exact ~/dev/portfolio hex', () => {
        expect(compileMarkup('{{paper}}')).toBe('\x1b[38;2;241;241;231m');
        expect(compileMarkup('{{ink}}')).toBe('\x1b[38;2;46;49;42m');
        expect(compileMarkup('{{sand}}')).toBe('\x1b[38;2;183;168;140m');
        expect(compileMarkup('{{sand-soft}}')).toBe('\x1b[38;2;219;212;198m');
        expect(compileMarkup('{{moss}}')).toBe('\x1b[38;2;107;127;79m');
    });

    it('compiles bg- variants for every palette colour to background SGR codes', () => {
        expect(compileMarkup('{{bg-paper}}')).toBe('\x1b[48;2;241;241;231m');
        expect(compileMarkup('{{bg-ink}}')).toBe('\x1b[48;2;46;49;42m');
        expect(compileMarkup('{{bg-sand}}')).toBe('\x1b[48;2;183;168;140m');
        expect(compileMarkup('{{bg-sand-soft}}')).toBe('\x1b[48;2;219;212;198m');
        expect(compileMarkup('{{bg-moss}}')).toBe('\x1b[48;2;107;127;79m');
    });

    it('trims whitespace inside tag braces', () => {
        expect(compileMarkup('{{ bold }}hi{{/}}')).toBe('\x1b[1mhi\x1b[0m');
        expect(compileMarkup('{{ moss }}x{{/}}')).toBe('\x1b[38;2;107;127;79mx\x1b[0m');
    });

    it('compiles arbitrary {{rgb:...}} / {{bg-rgb:...}} to the same truecolor mechanism', () => {
        expect(compileMarkup('{{rgb:1,2,3}}')).toBe('\x1b[38;2;1;2;3m');
        expect(compileMarkup('{{bg-rgb:1,2,3}}')).toBe('\x1b[48;2;1;2;3m');
    });

    it('compiles {{hex:#rrggbb}} / {{bg-hex:#rrggbb}} to the same truecolor mechanism as rgb', () => {
        // #6b7f4f = moss = rgb(107,127,79) — must be byte-identical to the named palette
        expect(compileMarkup('{{hex:#6b7f4f}}')).toBe(compileMarkup('{{moss}}'));
        expect(compileMarkup('{{bg-hex:#6b7f4f}}')).toBe(compileMarkup('{{bg-moss}}'));
        // arbitrary colour
        expect(compileMarkup('{{hex:#010203}}')).toBe('\x1b[38;2;1;2;3m');
        expect(compileMarkup('{{bg-hex:#010203}}')).toBe('\x1b[48;2;1;2;3m');
        // uppercase hex digits
        expect(compileMarkup('{{hex:#FF0000}}')).toBe('\x1b[38;2;255;0;0m');
    });

    it('compiles {{glyphs}} and {{deco}} to flag-only custom OSC sequences, closed by {{/}}', () => {
        expect(compileMarkup('{{glyphs}}x{{/}}')).toBe('\x1b]203;;\x1b\\x\x1b[0m');
        expect(compileMarkup('{{deco}}x{{/}}')).toBe('\x1b]204;;\x1b\\x\x1b[0m');
        // stack — a single {{/}} (SGR reset) clears both flags at once
        expect(compileMarkup('{{glyphs}}{{deco}}x{{/}}')).toBe(
            '\x1b]203;;\x1b\\\x1b]204;;\x1b\\x\x1b[0m',
        );
    });

    it('compiles {{link:url}}...{{/link}} to real OSC 8 hyperlink sequences', () => {
        expect(compileMarkup('{{link:https://example.com}}text{{/link}}')).toBe(
            '\x1b]8;;https://example.com\x1b\\text\x1b]8;;\x1b\\',
        );
    });

    it('drops unknown tags rather than leaking authoring syntax into output', () => {
        expect(compileMarkup('{{not-a-real-tag}}x')).toBe('x');
    });

    it('leaves plain text untouched', () => {
        expect(compileMarkup('plain text, no tags')).toBe('plain text, no tags');
    });

    it('compiles {{link:cmd:...}} as an OSC 8 link with a custom cmd: scheme', () => {
        // commandLink and the {{link:cmd:...}} markup form must compile identically —
        // they're the same mechanism, just two ways to author it (TS helper vs. content file)
        expect(compileMarkup('{{link:cmd:help}}help{{/link}}')).toBe(commandLink('help'));
    });
});

describe('commandLink', () => {
    it('wraps a command in an OSC 8 link using the cmd: scheme', () => {
        expect(commandLink('help')).toBe('\x1b]8;;cmd:help\x1b\\help\x1b]8;;\x1b\\');
    });

    it('supports a separate display label from the underlying command', () => {
        expect(commandLink('cat about.txt', 'read about')).toBe(
            '\x1b]8;;cmd:cat about.txt\x1b\\read about\x1b]8;;\x1b\\',
        );
    });
});
