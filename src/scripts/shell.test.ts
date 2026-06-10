import { describe, expect, it } from 'vitest';
import { complete, initialState, promptString, run, type ShellState } from './shell';

describe('run', () => {
    it('returns nothing for empty input, without touching history', () => {
        const result = run('   ', initialState);
        expect(result.output).toEqual([]);
        expect(result.state.history).toEqual([]);
    });

    it('reports unknown commands without crashing', () => {
        const result = run('frobnicate', initialState);
        expect(result.output[0]).toBe('command not found: frobnicate');
    });

    it('records every non-empty command in history, valid or not', () => {
        let state = initialState;
        state = run('whoami', state).state;
        state = run('bogus', state).state;
        expect(state.history).toEqual(['whoami', 'bogus']);
    });

    it('resolves aliases to their target command', () => {
        const a = run('?', initialState);
        const b = run('help', initialState);
        expect(a.output).toEqual(b.output);
    });

    it('clear signals the renderer to wipe the screen', () => {
        const result = run('clear', initialState);
        expect(result.clear).toBe(true);
        expect(result.output).toEqual([]);
    });

    it('theme: bare/toggle/light/dark all report correctly', () => {
        expect(run('theme', initialState).theme).toBe('toggle');
        expect(run('theme toggle', initialState).theme).toBe('toggle');
        expect(run('theme light', initialState).theme).toBe('light');
        expect(run('theme dark', initialState).theme).toBe('dark');
        expect(run('theme nonsense', initialState).theme).toBeUndefined();
    });

    it('pwd reports the absolute path of the cwd', () => {
        expect(run('pwd', initialState).output).toEqual(['/']);
        const inProjects = run('cd projects', initialState).state;
        expect(run('pwd', inProjects).output).toEqual(['/projects']);
    });

    describe('cd / ls navigation', () => {
        it('cd into a real directory, then back to root with cd / cd ~', () => {
            const inProjects = run('cd projects', initialState).state;
            expect(inProjects.cwd).toEqual(['projects']);

            expect(run('cd', inProjects).state.cwd).toEqual([]);
            expect(run('cd ~', inProjects).state.cwd).toEqual([]);
            expect(run('cd ..', inProjects).state.cwd).toEqual([]);
        });

        it('refuses to cd into a file or a non-existent path', () => {
            expect(run('cd contact.txt', initialState).output[0]).toMatch(/Not a directory/);
            expect(run('cd nowhere', initialState).output[0]).toMatch(/No such file or directory/);
        });

        it('ls lists directories with a trailing slash and files without', () => {
            const out = run('ls', initialState).output[0];
            expect(out).toContain('projects/');
            expect(out).toContain('contact.txt');
        });

        it('does not list command-backing content like neofetch.txt', () => {
            expect(run('ls', initialState).output[0]).not.toContain('neofetch.txt');
        });
    });

    describe('cat', () => {
        it('reads a real file as lines', () => {
            const out = run('cat contact.txt', initialState).output;
            expect(out.length).toBeGreaterThan(0);
            expect(out.join('\n')).toContain('Reach me here');
        });

        it('reports missing operand / missing file distinctly', () => {
            expect(run('cat', initialState).output[0]).toMatch(/missing file operand/);
            expect(run('cat nope.txt', initialState).output[0]).toMatch(
                /No such file or directory/,
            );
        });

        it('cannot read command-backing content like neofetch.txt — it is not a real file', () => {
            expect(run('cat neofetch.txt', initialState).output[0]).toMatch(
                /No such file or directory/,
            );
        });

        it('resolves relative paths against the cwd', () => {
            const inProjects = run('cd projects', initialState).state;
            const out = run('cat wayfairer.md', inProjects).output;
            expect(out.join('\n')).toContain('Co-Founder');
        });
    });

    it('promptString reflects user, host and cwd', () => {
        expect(promptString(initialState)).toBe('guest@jameshunt.nz:~$');
        const inProjects = run('cd projects', initialState).state;
        expect(promptString(inProjects)).toBe('guest@jameshunt.nz:~/projects$');
    });

    describe('commands whose output is entirely a content file', () => {
        it('whoami, projects and vim are auto-registered from content/commands and produce real output', () => {
            expect(run('whoami', initialState).output[0]).toBe('guest');
            expect(run('projects', initialState).output[0]).toBe('projects/');
            expect(run('vim', initialState).output[0]).toBe('Type :q to exit.');
        });
    });

    describe('history', () => {
        it('lists past commands with 1-based indices, including itself', () => {
            let state = initialState;
            state = run('whoami', state).state;
            state = run('pwd', state).state;
            const out = run('history', state).output;
            expect(out[0]).toMatch(/1\s+whoami/);
            expect(out[1]).toMatch(/2\s+pwd/);
            expect(out[2]).toMatch(/3\s+history/);
        });

        it('shows a single entry when run on a fresh session (records itself)', () => {
            const out = run('history', initialState).output;
            expect(out).toHaveLength(1);
            expect(out[0]).toMatch(/1\s+history/);
        });
    });

    describe('easter eggs stay obviously jokes', () => {
        it('sudo refuses without claiming real privileges', () => {
            expect(run('sudo rm -rf /', initialState).output[0]).toMatch(/Nice try/);
        });

        it('sudo with no args shows a usage/joke message', () => {
            const out = run('sudo', initialState).output;
            expect(out[0]).toMatch(/usage/i);
            expect(out.join('\n')).toMatch(/password/i);
        });

        it('rm refuses on a read-only filesystem', () => {
            expect(run('rm', initialState).output[0]).toMatch(/read-only filesystem/);
            expect(run('rm about.txt', initialState).output[0]).toMatch(/read-only filesystem/);
        });

        it('rm -rf / shows the specific permission-denied easter egg', () => {
            expect(run('rm -rf /', initialState).output[0]).toMatch(/Permission denied/);
        });
    });

    describe('ls with an explicit path argument', () => {
        it('lists the contents of a subdirectory by name', () => {
            const out = run('ls projects', initialState).output[0];
            expect(out).toContain('wayfairer.md');
        });

        it('reports an error for a non-existent path', () => {
            expect(run('ls nowhere', initialState).output[0]).toMatch(/No such file or directory/);
        });
    });

    describe('cat with absolute paths', () => {
        it('resolves an absolute path from any cwd', () => {
            const inProjects = run('cd projects', initialState).state;
            const out = run('cat /contact.txt', inProjects).output;
            expect(out.join('\n')).toContain('Reach me here');
        });
    });

    describe('theme output messages', () => {
        it('reports "switched to light mode" when light is selected', () => {
            expect(run('theme light', initialState).output[0]).toMatch(/light/);
        });

        it('reports "switched to dark mode" when dark is selected', () => {
            expect(run('theme dark', initialState).output[0]).toMatch(/dark/);
        });
    });

    describe('cd edge cases', () => {
        it('cd .. from root stays at root', () => {
            expect(run('cd ..', initialState).state.cwd).toEqual([]);
        });

        it('cd with a multi-segment path resolves correctly', () => {
            const inProjects = run('cd projects', initialState).state;
            expect(run('cd projects/..', initialState).state.cwd).toEqual([]);
            expect(run('cd ..', inProjects).state.cwd).toEqual([]);
        });
    });
});

describe('complete', () => {
    const state: ShellState = initialState;

    it('completes the first word against command names, not filesystem entries', () => {
        // regression: "neo<Tab>" used to search the fake filesystem and find
        // nothing, because the first word was treated as a path fragment
        expect(complete('neo', state, true)).toEqual(['neofetch']);
        expect(complete('hel', state, true)).toEqual(['help']);
    });

    it('includes aliases in command completion', () => {
        // "?" only exists in `aliases`, not `handlers` — completing it proves
        // completion sources both maps, not just real handlers.
        expect(complete('?', state, true)).toEqual(['?']);
    });

    it('completes commands that are entirely file-backed (auto-registered from content/commands)', () => {
        expect(complete('neo', state, true)).toEqual(['neofetch']);
        expect(complete('whoa', state, true)).toEqual(['whoami']);
        expect(complete('vi', state, true)).toEqual(['vim']);
    });

    it('completes later words against the fake filesystem, directories suffixed with /', () => {
        const matches = complete('proj', state, false);
        expect(matches).toEqual(['projects/']);
    });

    it('completes paths relative to a non-root cwd', () => {
        const inProjects = run('cd projects', initialState).state;
        expect(complete('way', inProjects, false)).toEqual(['wayfairer.md']);
    });

    it('two tabs on "cat pro": first gives projects/, second gives projects/wayfairer.md', () => {
        // Tab 1: partial "pro" → "projects/"
        expect(complete('pro', state, false)).toEqual(['projects/']);

        // Tab 2: partial is now "projects/" — result must keep the dir prefix
        // so the terminal replaces the whole partial correctly
        expect(complete('projects/', state, false)).toEqual(['projects/wayfairer.md']);
    });

    it('does not complete command-backing content like neofetch.txt as a path', () => {
        expect(complete('neo', state, false)).toEqual([]);
    });

    it('returns no matches for a path fragment that matches nothing', () => {
        expect(complete('zzz', state, false)).toEqual([]);
    });

    it('empty partial for path completion returns all entries in the current directory', () => {
        const matches = complete('', state, false);
        expect(matches).toContain('projects/');
        expect(matches).toContain('contact.txt');
    });
});
