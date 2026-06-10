import { describe, expect, it } from 'vitest';
import {
    initialEditorState,
    insertChar,
    deleteCharBefore,
    deleteWordBefore,
    deleteCharAt,
    moveCursorLeft,
    moveCursorRight,
    moveWordLeft,
    moveWordRight,
    moveCursorHome,
    moveCursorEnd,
    navigateHistory,
    tabPartial,
    applyCompletion,
    splitPasteLines,
    type EditorState,
} from './editor';

// Shorthand: build an editor state with only the fields that matter for a test.
function st(
    buffer: string,
    cursorPos = buffer.length,
    extras: Partial<EditorState> = {},
): EditorState {
    return { ...initialEditorState, buffer, cursorPos, ...extras };
}

describe('insertChar', () => {
    it('appends when cursor is at the end', () => {
        expect(insertChar(st('he'), 'y')).toMatchObject({ buffer: 'hey', cursorPos: 3 });
    });

    it('inserts at the cursor position', () => {
        expect(insertChar(st('helo', 3), 'l')).toMatchObject({ buffer: 'hello', cursorPos: 4 });
    });

    it('inserts at the start', () => {
        expect(insertChar(st('ello', 0), 'h')).toMatchObject({ buffer: 'hello', cursorPos: 1 });
    });
});

describe('deleteCharBefore (Backspace)', () => {
    it('removes the character before the cursor', () => {
        expect(deleteCharBefore(st('hello'))).toMatchObject({ buffer: 'hell', cursorPos: 4 });
    });

    it('removes from the middle', () => {
        expect(deleteCharBefore(st('hello', 3))).toMatchObject({ buffer: 'helo', cursorPos: 2 });
    });

    it('is a no-op at position 0', () => {
        const s = st('hello', 0);
        expect(deleteCharBefore(s)).toBe(s);
    });
});

describe('deleteWordBefore (Alt+Backspace)', () => {
    it('deletes the whole word when cursor is at the end', () => {
        expect(deleteWordBefore(st('hello'))).toMatchObject({ buffer: '', cursorPos: 0 });
    });

    it('deletes only the last word, leaving earlier words', () => {
        expect(deleteWordBefore(st('cat about.txt'))).toMatchObject({
            buffer: 'cat ',
            cursorPos: 4,
        });
    });

    it('skips trailing whitespace before the word', () => {
        expect(deleteWordBefore(st('cat   '))).toMatchObject({ buffer: '', cursorPos: 0 });
    });

    it('deletes trailing whitespace + preceding word together', () => {
        expect(deleteWordBefore(st('foo bar  '))).toMatchObject({ buffer: 'foo ', cursorPos: 4 });
    });

    it('is a no-op at position 0', () => {
        const s = st('hello', 0);
        expect(deleteWordBefore(s)).toBe(s);
    });

    it('only deletes up to the cursor, leaving text after it', () => {
        expect(deleteWordBefore(st('hello world', 5))).toMatchObject({
            buffer: ' world',
            cursorPos: 0,
        });
    });
});

describe('deleteCharAt (Delete key)', () => {
    it('removes the character at the cursor', () => {
        expect(deleteCharAt(st('hello', 0))).toMatchObject({ buffer: 'ello', cursorPos: 0 });
    });

    it('removes from the middle', () => {
        expect(deleteCharAt(st('hello', 2))).toMatchObject({ buffer: 'helo', cursorPos: 2 });
    });

    it('is a no-op when cursor is at the end', () => {
        expect(deleteCharAt(st('hello'))).toMatchObject({ buffer: 'hello', cursorPos: 5 });
    });
});

describe('cursor movement', () => {
    it('moveCursorLeft decrements cursorPos, clamped at 0', () => {
        expect(moveCursorLeft(st('hello', 3))).toMatchObject({ cursorPos: 2 });
        expect(moveCursorLeft(st('hello', 0))).toMatchObject({ cursorPos: 0 });
    });

    it('moveCursorRight increments cursorPos, clamped at buffer length', () => {
        expect(moveCursorRight(st('hello', 3))).toMatchObject({ cursorPos: 4 });
        expect(moveCursorRight(st('hello', 5))).toMatchObject({ cursorPos: 5 });
    });

    it('moveCursorHome jumps to 0', () => {
        expect(moveCursorHome(st('hello', 3))).toMatchObject({ cursorPos: 0 });
    });

    it('moveCursorEnd jumps to buffer length', () => {
        expect(moveCursorEnd(st('hello', 2))).toMatchObject({ cursorPos: 5 });
    });
});

describe('moveWordLeft (Alt/Ctrl+Left)', () => {
    it('jumps to the start of the current/preceding word', () => {
        expect(moveWordLeft(st('cat about.txt'))).toMatchObject({ cursorPos: 4 });
    });

    it('skips whitespace before landing on the word start', () => {
        // cursor is in the whitespace between words
        expect(moveWordLeft(st('cat   about', 6))).toMatchObject({ cursorPos: 0 });
    });

    it('from the middle of a word, lands at the word start', () => {
        expect(moveWordLeft(st('hello world', 8))).toMatchObject({ cursorPos: 6 });
    });

    it('is a no-op at position 0', () => {
        expect(moveWordLeft(st('hello', 0))).toMatchObject({ cursorPos: 0 });
    });

    it('jumps all the way to 0 from a single-word buffer', () => {
        expect(moveWordLeft(st('hello'))).toMatchObject({ cursorPos: 0 });
    });
});

describe('moveWordRight (Alt/Ctrl+Right)', () => {
    it('jumps to just past the end of the next word', () => {
        expect(moveWordRight(st('cat about.txt', 0))).toMatchObject({ cursorPos: 3 });
    });

    it('skips leading whitespace then lands after the word', () => {
        expect(moveWordRight(st('cat   about', 3))).toMatchObject({ cursorPos: 11 });
    });

    it('from the middle of a word, lands just past its end', () => {
        expect(moveWordRight(st('hello world', 2))).toMatchObject({ cursorPos: 5 });
    });

    it('is a no-op at the end of the buffer', () => {
        expect(moveWordRight(st('hello'))).toMatchObject({ cursorPos: 5 });
    });

    it('jumps all the way to the end from a single-word buffer', () => {
        expect(moveWordRight(st('hello', 0))).toMatchObject({ cursorPos: 5 });
    });
});

describe('navigateHistory', () => {
    const history = ['whoami', 'pwd', 'ls'];

    it('ArrowUp on a fresh buffer saves the draft and loads the last history entry', () => {
        const result = navigateHistory(st('partial'), history, 'up');
        expect(result.buffer).toBe('ls');
        expect(result.draftBeforeHistory).toBe('partial');
        expect(result.historyIndex).toBe(2);
    });

    it('ArrowUp again walks further back', () => {
        const s = navigateHistory(st(''), history, 'up');
        const result = navigateHistory(s, history, 'up');
        expect(result.buffer).toBe('pwd');
        expect(result.historyIndex).toBe(1);
    });

    it('ArrowUp at the oldest entry stays there', () => {
        let s = navigateHistory(st(''), history, 'up');
        s = navigateHistory(s, history, 'up');
        s = navigateHistory(s, history, 'up');
        const stuck = navigateHistory(s, history, 'up');
        expect(stuck.buffer).toBe('whoami');
        expect(stuck.historyIndex).toBe(0);
    });

    it('ArrowDown after ArrowUp walks forward through history', () => {
        let s = navigateHistory(st(''), history, 'up');
        s = navigateHistory(s, history, 'up');
        s = navigateHistory(s, history, 'down');
        expect(s.buffer).toBe('ls');
        expect(s.historyIndex).toBe(2);
    });

    it('ArrowDown at the newest entry restores the saved draft', () => {
        let s = navigateHistory(st('draft'), history, 'up');
        s = navigateHistory(s, history, 'down');
        expect(s.buffer).toBe('draft');
        expect(s.historyIndex).toBe(-1);
    });

    it('ArrowDown when not in history mode is a no-op', () => {
        const s = st('hello');
        expect(navigateHistory(s, history, 'down')).toBe(s);
    });

    it('ArrowUp with empty history is a no-op', () => {
        const s = st('hello');
        expect(navigateHistory(s, [], 'up')).toBe(s);
    });

    it('cursor lands at the end of the recalled entry', () => {
        const result = navigateHistory(st(''), history, 'up');
        expect(result.cursorPos).toBe(result.buffer.length);
    });
});

describe('tabPartial', () => {
    it('returns the partial token and marks it as first word when nothing precedes it', () => {
        expect(tabPartial(st('cat'))).toEqual({ partial: 'cat', isFirstWord: true });
    });

    it('marks as not first word when there is a preceding token', () => {
        expect(tabPartial(st('cat pro'))).toEqual({ partial: 'pro', isFirstWord: false });
    });

    it('returns empty partial when the cursor follows a space', () => {
        expect(tabPartial(st('cat '))).toEqual({ partial: '', isFirstWord: false });
    });

    it('uses the cursor position, not the end of the buffer', () => {
        // cursor after 'cat', buffer continues with ' about.txt'
        const s = st('cat about.txt', 3);
        expect(tabPartial(s)).toEqual({ partial: 'cat', isFirstWord: true });
    });
});

describe('applyCompletion', () => {
    it('replaces the partial with the completed token and adds a trailing space for files', () => {
        const result = applyCompletion(st('cat con'), 'con', 'contact.txt');
        expect(result.buffer).toBe('cat contact.txt ');
        expect(result.cursorPos).toBe('cat contact.txt '.length);
    });

    it('does not add a trailing space for directory completions', () => {
        const result = applyCompletion(st('cat pro'), 'pro', 'projects/');
        expect(result.buffer).toBe('cat projects/');
        expect(result.cursorPos).toBe('cat projects/'.length);
    });

    it('works when completing the first word (a command name)', () => {
        const result = applyCompletion(st('neo'), 'neo', 'neofetch');
        expect(result.buffer).toBe('neofetch ');
        expect(result.cursorPos).toBe('neofetch '.length);
    });
});

describe('splitPasteLines', () => {
    it('returns a single-element array for text with no newlines', () => {
        expect(splitPasteLines('hello')).toEqual(['hello']);
    });

    it('splits on \\n', () => {
        expect(splitPasteLines('a\nb\nc')).toEqual(['a', 'b', 'c']);
    });

    it('splits on \\r\\n (Windows)', () => {
        expect(splitPasteLines('a\r\nb\r\nc')).toEqual(['a', 'b', 'c']);
    });

    it('splits on \\r (old Mac)', () => {
        expect(splitPasteLines('a\rb\rc')).toEqual(['a', 'b', 'c']);
    });

    it('preserves empty lines', () => {
        expect(splitPasteLines('a\n\nc')).toEqual(['a', '', 'c']);
    });
});
