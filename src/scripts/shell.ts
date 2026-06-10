// Pure-function command interpreter + fake filesystem. Deliberately framework-
// and DOM-free: (input, state) -> { output, state }. If a real SSH layer ever
// happens (e.g. a Node `ssh2` server), this module could run there unchanged.

import { files, commandOutput } from '../data/files';
import { commandLink } from '../data/markup';

export interface ShellState {
    cwd: string[];
    history: string[];
}

export interface ShellResult {
    output: string[];
    state: ShellState;
    clear?: boolean;
    theme?: 'light' | 'dark' | 'toggle';
}

export const initialState: ShellState = { cwd: [], history: [] };

const PROMPT_USER = 'guest';
const PROMPT_HOST = 'jameshunt.nz';

// --- fake filesystem: directories are tracked implicitly via file paths ---

function dirContents(path: string[]): { dirs: string[]; files: string[] } {
    const prefix = path.length ? path.join('/') + '/' : '';
    const dirs = new Set<string>();
    const localFiles: string[] = [];

    for (const filePath of Object.keys(files)) {
        if (!filePath.startsWith(prefix)) continue;
        const rest = filePath.slice(prefix.length);
        if (!rest) continue;
        const slash = rest.indexOf('/');
        if (slash === -1) {
            localFiles.push(rest);
        } else {
            dirs.add(rest.slice(0, slash));
        }
    }

    return { dirs: Array.from(dirs).sort(), files: localFiles.sort() };
}

function resolvePath(cwd: string[], target: string): string[] | null {
    let parts = target.startsWith('/') || target.startsWith('~') ? [] : [...cwd];
    const segments = target.replace(/^~\/?/, '').split('/').filter(Boolean);

    for (const seg of segments) {
        if (seg === '.') continue;
        if (seg === '..') {
            if (parts.length > 0) parts = parts.slice(0, -1);
            continue;
        }
        parts = [...parts, seg];
    }
    return parts;
}

function promptPath(cwd: string[]): string {
    return cwd.length ? `~/${cwd.join('/')}` : '~';
}

export function promptString(state: ShellState): string {
    return `${PROMPT_USER}@${PROMPT_HOST}:${promptPath(state.cwd)}$`;
}

// --- command implementations ---

type Handler = (args: string[], state: ShellState) => ShellResult;

const handlers: Record<string, Handler> = {
    pwd: (_args, state) => ({ state, output: [`/${state.cwd.join('/')}`] }),

    ls: (args, state) => {
        const target = args[0] ? resolvePath(state.cwd, args[0]) : state.cwd;
        if (target === null) return { state, output: [`ls: cannot access '${args[0]}'`] };
        const { dirs, files: localFiles } = dirContents(target);
        if (dirs.length === 0 && localFiles.length === 0) {
            return {
                state,
                output: [`ls: cannot access '${args[0] ?? '.'}': No such file or directory`],
            };
        }
        const entries = [...dirs.map((d) => `${d}/`), ...localFiles];
        return { state, output: [entries.join('   ')] };
    },

    cd: (args, state) => {
        if (!args[0] || args[0] === '~') {
            return { state: { ...state, cwd: [] }, output: [] };
        }
        const target = resolvePath(state.cwd, args[0]);
        if (target === null)
            return { state, output: [`cd: ${args[0]}: No such file or directory`] };
        if (target.length === 0) return { state: { ...state, cwd: target }, output: [] };
        const { dirs, files: localFiles } = dirContents(target.slice(0, -1));
        const last = target[target.length - 1];
        if (dirs.includes(last)) return { state: { ...state, cwd: target }, output: [] };
        if (localFiles.includes(last))
            return { state, output: [`cd: ${args[0]}: Not a directory`] };
        return { state, output: [`cd: ${args[0]}: No such file or directory`] };
    },

    cat: (args, state) => {
        if (!args[0]) return { state, output: ['cat: missing file operand'] };
        const target = resolvePath(state.cwd, args[0]);
        if (target === null)
            return { state, output: [`cat: ${args[0]}: No such file or directory`] };
        const path = target.join('/');
        const content = files[path];
        if (content === undefined)
            return { state, output: [`cat: ${args[0]}: No such file or directory`] };
        return { state, output: content.split('\n') };
    },

    history: (_args, state) => ({
        state,
        output: state.history.length
            ? state.history.map((cmd, i) => `  ${i + 1}  ${cmd}`)
            : ['(empty)'],
    }),

    clear: (_args, state) => ({ state, output: [], clear: true }),

    theme: (args, state) => {
        const arg = args[0]?.toLowerCase();
        if (arg === 'light' || arg === 'dark') {
            return { state, output: [`switched to ${arg} mode`], theme: arg };
        }
        if (!arg || arg === 'toggle') {
            return { state, output: ['toggled color scheme'], theme: 'toggle' };
        }
        return { state, output: ['usage: theme [light|dark|toggle]'] };
    },

    // --- easter eggs: obviously jokes, not factual claims ---
    sudo: (args, state) => ({
        state,
        output: args.length
            ? [`Nice try. This isn't that kind of terminal.`]
            : [
                  'usage: sudo <command>',
                  "(you don't have the password, and neither do I, half the time)",
              ],
    }),

    rm: (args, state) => {
        if (args.includes('-rf') && args.includes('/')) {
            return { state, output: ['Permission denied. (good thing, too.)'] };
        }
        return { state, output: [`rm: cannot remove: this is a read-only filesystem`] };
    },
};

// Commands whose entire output is a content file (e.g. `neofetch`, `whoami`,
// `vim`) don't need a bespoke handler — register one automatically for any
// content/commands/* file that doesn't already have one. This keeps them
// "real" entries in `handlers` (so tab-completion, aliasing, etc. all see
// them the same as any other command) without hand-wiring each one.
for (const key of Object.keys(commandOutput)) {
    const name = key.replace(/\.[^/.]+$/, '');
    if (!(name in handlers)) {
        handlers[name] = (_args, state) => ({ state, output: commandOutput[key].split('\n') });
    }
}

const aliases: Record<string, string> = {
    '?': 'help',
};

export function run(rawInput: string, state: ShellState): ShellResult {
    const input = rawInput.trim();
    if (!input) return { state, output: [] };

    const newHistory = [...state.history, input];
    const stateWithHistory = { ...state, history: newHistory };

    const [cmd, ...args] = input.split(/\s+/);
    const resolved = aliases[cmd] ?? cmd;
    const handler = handlers[resolved];

    if (!handler) {
        return {
            state: stateWithHistory,
            output: [
                `command not found: ${cmd}`,
                `(try ${commandLink('help')} for a list of things that work)`,
            ],
        };
    }

    const result = handler(args, stateWithHistory);
    return { ...result, state: { ...result.state, history: newHistory } };
}

// --- completion for Tab ---
//
// Real shells complete differently depending on word position: the first word
// completes against command names, everything after completes against paths.
// Mixing the two (the original bug) meant `nec<Tab>` found nothing, because
// "nec" was searched as a filesystem entry rather than a command name.

function completeCommand(partial: string): string[] {
    const names = new Set([...Object.keys(handlers), ...Object.keys(aliases)]);
    return [...names].filter((name) => name.startsWith(partial)).sort();
}

function completePath(partial: string, state: ShellState): string[] {
    const lastSlash = partial.lastIndexOf('/');
    const dirPart = lastSlash >= 0 ? partial.slice(0, lastSlash) : '';
    const namePart = lastSlash >= 0 ? partial.slice(lastSlash + 1) : partial;

    const target = dirPart ? resolvePath(state.cwd, dirPart) : state.cwd;
    if (target === null) return [];
    const { dirs, files: localFiles } = dirContents(target);
    const entries = [...dirs.map((d) => `${d}/`), ...localFiles];
    const prefix = dirPart ? dirPart + '/' : '';
    return entries
        .filter((e) => e.startsWith(namePart))
        .map((e) => prefix + e)
        .sort();
}

export function complete(partial: string, state: ShellState, isFirstWord: boolean): string[] {
    return isFirstWord ? completeCommand(partial) : completePath(partial, state);
}
