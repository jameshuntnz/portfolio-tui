// Pure input-buffer state machine — no DOM, no shell concerns.
// terminal.ts owns the DOM; shell.ts owns command interpretation.
// This module owns the in-between: what happens to the buffer and
// cursor as the user types, deletes, navigates history, and tabs.

export interface EditorState {
    buffer: string;
    cursorPos: number;
    historyIndex: number;
    draftBeforeHistory: string;
}

export const initialEditorState: EditorState = {
    buffer: '',
    cursorPos: 0,
    historyIndex: -1,
    draftBeforeHistory: '',
};

export function insertChar(s: EditorState, char: string): EditorState {
    return {
        ...s,
        buffer: s.buffer.slice(0, s.cursorPos) + char + s.buffer.slice(s.cursorPos),
        cursorPos: s.cursorPos + 1,
    };
}

export function deleteCharBefore(s: EditorState): EditorState {
    if (s.cursorPos === 0) return s;
    return {
        ...s,
        buffer: s.buffer.slice(0, s.cursorPos - 1) + s.buffer.slice(s.cursorPos),
        cursorPos: s.cursorPos - 1,
    };
}

// Option/Alt+Backspace — skip trailing whitespace then the preceding word.
export function deleteWordBefore(s: EditorState): EditorState {
    if (s.cursorPos === 0) return s;
    let start = s.cursorPos;
    while (start > 0 && /\s/.test(s.buffer[start - 1])) start -= 1;
    while (start > 0 && !/\s/.test(s.buffer[start - 1])) start -= 1;
    return {
        ...s,
        buffer: s.buffer.slice(0, start) + s.buffer.slice(s.cursorPos),
        cursorPos: start,
    };
}

export function deleteCharAt(s: EditorState): EditorState {
    return {
        ...s,
        buffer: s.buffer.slice(0, s.cursorPos) + s.buffer.slice(s.cursorPos + 1),
    };
}

export function moveCursorLeft(s: EditorState): EditorState {
    return { ...s, cursorPos: Math.max(0, s.cursorPos - 1) };
}

export function moveCursorRight(s: EditorState): EditorState {
    return { ...s, cursorPos: Math.min(s.buffer.length, s.cursorPos + 1) };
}

// Option/Alt+Left (macOS) or Ctrl+Left (Windows/Linux) — skip whitespace then
// the preceding word, landing at its start.
export function moveWordLeft(s: EditorState): EditorState {
    let pos = s.cursorPos;
    while (pos > 0 && /\s/.test(s.buffer[pos - 1])) pos -= 1;
    while (pos > 0 && !/\s/.test(s.buffer[pos - 1])) pos -= 1;
    return { ...s, cursorPos: pos };
}

// Option/Alt+Right (macOS) or Ctrl+Right (Windows/Linux) — skip whitespace
// then the next word, landing just past its last character.
export function moveWordRight(s: EditorState): EditorState {
    let pos = s.cursorPos;
    while (pos < s.buffer.length && /\s/.test(s.buffer[pos])) pos += 1;
    while (pos < s.buffer.length && !/\s/.test(s.buffer[pos])) pos += 1;
    return { ...s, cursorPos: pos };
}

export function moveCursorHome(s: EditorState): EditorState {
    return { ...s, cursorPos: 0 };
}

export function moveCursorEnd(s: EditorState): EditorState {
    return { ...s, cursorPos: s.buffer.length };
}

export function navigateHistory(
    s: EditorState,
    history: string[],
    dir: 'up' | 'down',
): EditorState {
    if (dir === 'up') {
        if (!history.length) return s;
        if (s.historyIndex === -1) {
            const historyIndex = history.length - 1;
            const buffer = history[historyIndex];
            return { buffer, cursorPos: buffer.length, historyIndex, draftBeforeHistory: s.buffer };
        }
        if (s.historyIndex > 0) {
            const historyIndex = s.historyIndex - 1;
            const buffer = history[historyIndex];
            return { ...s, buffer, cursorPos: buffer.length, historyIndex };
        }
        return s;
    } else {
        if (s.historyIndex === -1) return s;
        if (s.historyIndex < history.length - 1) {
            const historyIndex = s.historyIndex + 1;
            const buffer = history[historyIndex];
            return { ...s, buffer, cursorPos: buffer.length, historyIndex };
        }
        const buffer = s.draftBeforeHistory;
        return { ...s, buffer, cursorPos: buffer.length, historyIndex: -1 };
    }
}

// Returns the partial token under/before the cursor and whether it is the
// first word — same split a real shell makes for command vs. path completion.
export function tabPartial(s: EditorState): { partial: string; isFirstWord: boolean } {
    const before = s.buffer.slice(0, s.cursorPos);
    const match = before.match(/(\S+)$/);
    const partial = match ? match[1] : '';
    const isFirstWord = before.slice(0, before.length - partial.length).trim() === '';
    return { partial, isFirstWord };
}

// Replaces the partial with the completed token and appends a trailing space
// for non-directory completions (so you can keep typing arguments straight away).
export function applyCompletion(s: EditorState, partial: string, completed: string): EditorState {
    const before = s.buffer.slice(0, s.cursorPos);
    const suffix = completed.endsWith('/') ? '' : ' ';
    const newBefore = before.slice(0, before.length - partial.length) + completed + suffix;
    const buffer = newBefore + s.buffer.slice(s.cursorPos);
    return { ...s, buffer, cursorPos: newBefore.length };
}

// Splits pasted text on any newline convention. The caller runs all but the
// last line as commands; the last line stays in the buffer for editing.
export function splitPasteLines(text: string): string[] {
    return text.split(/\r\n|\r|\n/);
}
