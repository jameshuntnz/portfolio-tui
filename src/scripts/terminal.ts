// Lightweight hand-rolled terminal renderer. No xterm.js — this is a simulated
// shell, not a PTY connection, so a small custom renderer keeps the bundle tiny
// and gives full control over the boot sequence, cursor, and link rendering.

import '../styles/terminal.css';
import { run, initialState, promptString, complete, type ShellState } from './shell';
import { commandLink } from '../data/markup';
import { ansiToHTML, escapeHtml } from './ansi';
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

const terminalEl = document.getElementById('terminal') as HTMLElement;
const screen = document.getElementById('screen') as HTMLElement;
const inputLineEl = document.getElementById('input-line') as HTMLElement;
const promptEl = document.getElementById('prompt') as HTMLElement;
const typedEl = document.getElementById('typed') as HTMLElement;
const hiddenInput = document.getElementById('hidden-input') as HTMLInputElement;

const THEME_KEY = 'jh-terminal-theme';
const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function currentTheme(): 'light' | 'dark' {
    return document.documentElement.dataset.theme === 'dark' ? 'dark' : 'light';
}

function applyTheme(theme: 'light' | 'dark') {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem(THEME_KEY, theme);
}

let state: ShellState = initialState;
let editor: EditorState = initialEditorState;

// True while a command's output is streaming in. Like a real terminal mid-print,
// the prompt shouldn't reappear (or accept keystrokes) until output finishes —
// so we hide the input line and ignore input for the duration.
let busy = false;

// Renders a block of related lines (e.g. one command's output) inside a
// shared wrapper. Column-aligned content — neofetch's ASCII art plus its
// aligned key/value pairs — breaks when word-wrapped, so if any line in the
// block would overflow, the whole block switches to unwrapped text and
// scrolls horizontally together as one unit (so the columns stay aligned as
// you scroll), like a real terminal pane narrower than its content.
// Pause between inserting each line of a block — fast enough to read as
// "streaming in" rather than a noticeable wait. Lines are inserted one at a
// time (rather than all at once with a CSS stagger) so the rendering speed
// is driven from here — the same place that owns the boot sequence's typing
// speed — and so the screen genuinely scrolls as the block grows, like a
// real terminal printing output line by line.
const LINE_STAGGER_MS = prefersReducedMotion ? 0 : 16;

async function appendBlock(lines: string[], className = '') {
    const wrapper = document.createElement('div');
    wrapper.className = 'output';
    screen.appendChild(wrapper);

    const lineDivs: HTMLDivElement[] = [];
    for (let i = 0; i < lines.length; i++) {
        if (i > 0) await delay(LINE_STAGGER_MS);
        const div = document.createElement('div');
        div.className = `line ${className}`.trim();
        div.innerHTML = ansiToHTML(lines[i]) || '&nbsp;';
        wrapper.appendChild(div);
        lineDivs.push(div);
        scrollToBottom();
    }

    for (const div of lineDivs) div.style.whiteSpace = 'pre';
    if (wrapper.scrollWidth > wrapper.clientWidth) {
        wrapper.classList.add('output--overflow');
    } else {
        for (const div of lineDivs) div.style.whiteSpace = '';
    }

    scrollToBottom();
}

function appendLine(text: string, className = '') {
    return appendBlock([text], className);
}

function appendLines(lines: string[], className = '') {
    return appendBlock(lines, className);
}

// Echoes a command line with the prompt in accent and the typed command in
// default fg — matching how the live input line looks while typing.
function appendEchoLine(prompt: string, command: string) {
    const wrapper = document.createElement('div');
    wrapper.className = 'output';
    const div = document.createElement('div');
    div.className = 'line';
    const promptSpan = document.createElement('span');
    promptSpan.className = 'echo-prompt';
    promptSpan.textContent = prompt;
    div.appendChild(promptSpan);
    div.appendChild(document.createTextNode(command ? ' ' + command : ''));
    wrapper.appendChild(div);
    screen.appendChild(wrapper);
    scrollToBottom();
}

// Scrolls the terminal viewport itself (not the page) — like a real emulator,
// the buffer scrolls inside its own pane, line by line, as output streams in.
function scrollToBottom() {
    terminalEl.scrollTop = terminalEl.scrollHeight;
}

function updatePrompt() {
    promptEl.textContent = promptString(state);
}

function renderInputLine() {
    const { buffer, cursorPos } = editor;
    const before = buffer.slice(0, cursorPos);
    const at = buffer[cursorPos] ?? ' ';
    const after = buffer.slice(cursorPos + 1);
    typedEl.innerHTML = `${escapeHtml(before)}<span class="cursor-char">${escapeHtml(at)}</span>${escapeHtml(after)}`;
}

function focusInput() {
    hiddenInput.focus({ preventScroll: true });
}

// Echoes a command line and runs it through the interpreter — shared by the
// real input path (commitLine) and clickable command-suggestion spans
// ({{link:cmd:...}} → .cmd-link), so clicking "Try: cat projects/wayfairer.md"
// behaves exactly as if you'd typed and run it yourself.
async function runAndRender(command: string) {
    appendEchoLine(promptString(state), command);

    const result = run(command, state);
    state = result.state;

    if (result.theme) {
        applyTheme(
            result.theme === 'toggle'
                ? currentTheme() === 'dark'
                    ? 'light'
                    : 'dark'
                : result.theme,
        );
    }

    if (result.clear) {
        screen.innerHTML = '';
    } else if (result.output.length) {
        await appendLines(result.output);
    }

    updatePrompt();
    scrollToBottom();
}

// Hides the input line and ignores keystrokes for the duration of `task` —
// shared by commitLine and runFromClick so output never streams in alongside
// a visible (or editable) prompt, matching how a real terminal looks mid-print.
async function whileBusy(task: () => Promise<void>) {
    busy = true;
    inputLineEl.style.display = 'none';

    await task();

    inputLineEl.style.display = '';
    busy = false;
}

async function commitLine() {
    await whileBusy(async () => {
        await runAndRender(editor.buffer);

        editor = initialEditorState;
        renderInputLine();
        scrollToBottom();
    });
}

// Clicking a .cmd-link runs that command exactly as if it had been typed —
// echoed, executed, output appended — then returns focus to the prompt.
async function runFromClick(command: string) {
    await whileBusy(async () => {
        await runAndRender(command);
        renderInputLine();
    });
    focusInput();
}

function handleKey(e: KeyboardEvent) {
    if (busy) {
        e.preventDefault();
        return;
    }

    const key = e.key;

    if (key === 'Enter') {
        e.preventDefault();
        commitLine();
        return;
    }

    if (key === 'Backspace') {
        e.preventDefault();
        // Option/Alt+Backspace (macOS) or Ctrl+Backspace (Windows/Linux) deletes
        // the previous word — skip trailing whitespace, then the word itself.
        editor = e.altKey || e.ctrlKey ? deleteWordBefore(editor) : deleteCharBefore(editor);
        renderInputLine();
        return;
    }

    if (key === 'Delete') {
        e.preventDefault();
        editor = deleteCharAt(editor);
        renderInputLine();
        return;
    }

    if (key === 'ArrowLeft') {
        e.preventDefault();
        editor = e.altKey || e.ctrlKey ? moveWordLeft(editor) : moveCursorLeft(editor);
        renderInputLine();
        return;
    }

    if (key === 'ArrowRight') {
        e.preventDefault();
        editor = e.altKey || e.ctrlKey ? moveWordRight(editor) : moveCursorRight(editor);
        renderInputLine();
        return;
    }

    if (key === 'ArrowUp') {
        e.preventDefault();
        editor = navigateHistory(editor, state.history, 'up');
        renderInputLine();
        return;
    }

    if (key === 'ArrowDown') {
        e.preventDefault();
        editor = navigateHistory(editor, state.history, 'down');
        renderInputLine();
        return;
    }

    if (key === 'Tab') {
        e.preventDefault();
        const { partial, isFirstWord } = tabPartial(editor);
        const matches = complete(partial, state, isFirstWord);
        if (matches.length === 1) {
            editor = applyCompletion(editor, partial, matches[0]);
            renderInputLine();
        } else if (matches.length > 1) {
            appendEchoLine(promptString(state), editor.buffer);
            appendLine(matches.join('   '));
            scrollToBottom();
        }
        return;
    }

    if (key === 'Home') {
        e.preventDefault();
        editor = moveCursorHome(editor);
        renderInputLine();
        return;
    }

    if (key === 'End') {
        e.preventDefault();
        editor = moveCursorEnd(editor);
        renderInputLine();
        return;
    }

    if (key.length === 1 && !e.metaKey && !e.ctrlKey && !e.altKey) {
        e.preventDefault();
        editor = insertChar(editor, key);
        renderInputLine();
    }
}

// Pasting goes to the hidden input's native value, not our `buffer` — intercept
// it, insert at the cursor, and clear the input so its value never drifts out
// of sync with what we render. A multi-line paste runs each line but the last
// as its own command (matching real shell paste behaviour), leaving the final
// line in the buffer for editing.
async function handlePaste(e: ClipboardEvent) {
    e.preventDefault();
    if (busy) return;
    const text = e.clipboardData?.getData('text') ?? '';
    if (!text) return;

    const lines = splitPasteLines(text);
    const { buffer, cursorPos } = editor;
    const before = buffer.slice(0, cursorPos);
    const after = buffer.slice(cursorPos);

    if (lines.length === 1) {
        editor = {
            ...editor,
            buffer: before + lines[0] + after,
            cursorPos: before.length + lines[0].length,
        };
        renderInputLine();
        return;
    }

    editor = { ...editor, buffer: before + lines[0], cursorPos: (before + lines[0]).length };
    await commitLine();
    for (let i = 1; i < lines.length - 1; i++) {
        editor = { ...editor, buffer: lines[i], cursorPos: lines[i].length };
        await commitLine();
    }
    const last = lines[lines.length - 1];
    editor = { ...editor, buffer: last + after, cursorPos: last.length };
    renderInputLine();
}

function wireInput() {
    hiddenInput.addEventListener('keydown', handleKey);
    hiddenInput.addEventListener('paste', handlePaste);

    // Clicking or keyboard-activating a command-suggestion span runs that command,
    // same as typing it. Delegated on the screen so it works for output appended
    // at any point, not just what existed at wire-up time.
    screen.addEventListener('click', (e) => {
        const el = (e.target as HTMLElement).closest<HTMLElement>('.cmd-link');
        if (!el?.dataset.command) return;
        runFromClick(el.dataset.command);
    });

    screen.addEventListener('keydown', (e) => {
        if (e.key !== 'Enter' && e.key !== ' ') return;
        const el = (e.target as HTMLElement).closest<HTMLElement>('.cmd-link');
        if (!el?.dataset.command) return;
        e.preventDefault();
        runFromClick(el.dataset.command);
    });

    // Refocus the hidden input on click — but NOT when the click is the tail
    // end of a text-selection drag. Stealing focus there would move the
    // "active selection" the browser copies from off the visible text and onto
    // the (empty) hidden input, silently breaking copy/paste.
    document.addEventListener('click', (e) => {
        if ((e.target as HTMLElement).closest('.cmd-link')) return;
        const selection = window.getSelection();
        if (selection && selection.toString().length > 0) return;
        focusInput();
    });

    focusInput();
}

// --- boot sequence ---

function delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
}

function animDelay(ms: number): Promise<void> {
    return prefersReducedMotion ? Promise.resolve() : delay(ms);
}

async function typeOut(text: string, className = '', charDelay = 14) {
    const div = document.createElement('div');
    div.className = `line ${className}`.trim();
    screen.appendChild(div);
    if (prefersReducedMotion) {
        div.textContent = text;
        scrollToBottom();
        return;
    }
    for (const char of text) {
        div.textContent += char;
        scrollToBottom();
        await delay(charDelay);
    }
}

async function bootSequence() {
    const bootLines = [
        'Connecting to jameshunt.nz...',
        'Connection established.',
        'Authenticating as guest... ok',
        '',
    ];
    for (const line of bootLines) {
        await typeOut(line, 'boot');
        await animDelay(110);
    }

    await animDelay(200);

    inputLineEl.style.display = '';
    for (const ch of 'neofetch') {
        editor = insertChar(editor, ch);
        renderInputLine();
        scrollToBottom();
        await animDelay(55);
    }
    await animDelay(200);
    await commitLine();

    await appendLine('');
    await appendLine(`Type ${commandLink('help')} to see what you can do here.`, 'box-hint');
    await appendLine('');
}

async function init() {
    inputLineEl.style.display = 'none';
    screen.setAttribute('aria-busy', 'true');
    updatePrompt();
    renderInputLine();
    await bootSequence();
    screen.setAttribute('aria-busy', 'false');
    inputLineEl.style.display = '';
    wireInput();
    scrollToBottom();
}

init();
