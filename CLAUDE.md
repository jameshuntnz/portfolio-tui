# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

A personal portfolio site built as a simulated terminal/TUI (Vite + vanilla TS, no UI framework). The visitor lands in a fake SSH session and interacts entirely via a hand-rolled shell interpreter and renderer — `whoami`, `cat about.txt`, `cat projects/wayfairer.md`, `theme`, etc.

## Commands

- `pnpm dev` — start dev server at localhost:5173
- `pnpm build` — type-check and production build to `./dist/`
- `pnpm preview` — preview the production build
- `pnpm test` — run the vitest suite (`vitest run`)
- `pnpm test:coverage` — run the vitest suite with coverage report
- `pnpm test:e2e` — run the Playwright e2e/a11y suite
- `pnpm exec vitest run src/scripts/shell.test.ts` — run a single test file
- `pnpm exec vitest run -t "pattern"` — run tests matching a name pattern
- `pnpm exec tsc --noEmit` — type-check the project
- `pnpm lint` — run ESLint
- `pnpm format` — format the codebase with Prettier
- `pnpm format:check` — check formatting without writing

## Architecture

The system is split into three layers, deliberately decoupled so the shell could one day run somewhere other than a browser:

1. **Interpreter (`src/scripts/shell.ts`)** — pure-function command interpreter and fake filesystem: `(input, state) -> { output, state }`. Framework- and DOM-free by design — the comment at the top notes that if a real SSH layer ever happens (e.g. a Node `ssh2` server), this module could run there unchanged. All commands live in the `handlers` map; aliases in `aliases`. Tab-completion (`complete`) splits on word position — first word completes against command names, everything else against filesystem paths — mirroring how real shells behave.

2. **Renderer (`src/scripts/terminal.ts`)** — hand-rolled terminal UI: keystroke handling, cursor, history navigation, boot sequence, theme switching, and an ANSI-escape-to-HTML parser (`ansiToHTML`). No xterm.js; this is a simulated shell rather than a real PTY connection, so a small custom renderer keeps the bundle tiny. It owns all DOM/browser concerns; `shell.ts` knows nothing about them.

3. **Content pipeline (`src/data/`)**:
   - `markup.ts` — build-time compiler that turns friendly `{{tag}}...{{/}}` authoring syntax into _real_ ANSI/terminal escape sequences (24-bit truecolor SGR codes, OSC 8 hyperlinks). There is no indexed/16-colour palette — every named colour (`paper`, `ink`, `sand`, `sand-soft`, `moss`, carried over verbatim from `~/dev/portfolio`) compiles to the exact same truecolor mechanism as `{{rgb:r,g,b}}`. `commandLink()` builds clickable command suggestions using a custom `cmd:` URI scheme layered on top of standard OSC 8 links (the same trick VSCode's `command:` and iTerm2's proprietary schemes use) — the renderer recognises this scheme and runs the command instead of navigating.
   - `files.ts` — build-time content loader. Uses `import.meta.glob` to pull raw text from two separate trees and runs each through `compileMarkup`: `src/content/fs/**/*` → `files` (the visitor-browsable fake filesystem that `ls`/`cd`/`cat` walk) and `src/content/commands/**/*` → `commandOutput` (text that backs a command's output but isn't a navigable "file" — e.g. `neofetch`, a system command rather than a file you'd `cat`). **Every command's output is just a content file; nothing is assembled in TypeScript at runtime.**

4. **Content**:
   - `src/content/fs/` — the actual fake filesystem visitors browse: `about.txt`, `resume.txt`, `contact.txt`, `projects/wayfairer.md`, etc. Directories are tracked _implicitly_ by file path — there's no separate directory data structure; `dirContents()` in `shell.ts` derives dirs/files from the set of file paths under a prefix. To add a new "file" to the fake filesystem, just drop a content file here (using `{{tag}}` markup as needed) — `files.ts` and `shell.ts` pick it up automatically.
   - `src/content/commands/` — content that backs a command's output but should stay invisible to `ls`/`cat`/tab-completion of _paths_ (the command itself is the only way to see it). Use this when a command isn't thematically a file in the fake filesystem (e.g. `neofetch`, `whoami`, `vim`, `projects`). Use `{{link:cmd:cat about.txt}}cat about.txt{{/link}}` markup for clickable command suggestions — it compiles to the exact same OSC 8 escape as `commandLink()`.

## Conventions worth knowing

- **Strict separation of pure logic vs. DOM**: `shell.ts` must stay framework- and DOM-free — all rendering, event-handling, and browser APIs belong in `terminal.ts`. This is intentional, not incidental (see header comments in both files).
- **Content over code, and no hand-wiring**: any command whose entire output is static text belongs in `src/content/commands/*.txt`, not hardcoded as a string in `shell.ts`. You don't need to register a handler either — `shell.ts` walks `commandOutput` at module load and auto-registers a passthrough handler for any file that doesn't already have a bespoke one (so it shows up in `complete`, aliasing, etc. like any other command). Only commands that need live state, args, or branching logic (`ls`, `cd`, `cat`, `theme`, `history`, `sudo`, …) get real handlers. `help` is a content file too (`src/content/commands/help.txt`) — its listing is hand-maintained prose, not generated from `handlers`, and uses `{{link:cmd:...}}` so each command name is clickable.
- **Colours are always exact truecolor hex**, never re-themed approximations — `{{moss}}` and `{{rgb:107,127,79}}` must compile to byte-identical escape sequences. Don't introduce an indexed-palette tier.
- Tests live alongside the modules they cover (`shell.test.ts`, `markup.test.ts`) and lean on exact-string assertions for compiled ANSI output — when adding palette colours or markup tags, add the corresponding exact-hex assertions.

## Commit messages

Use [Conventional Commits](https://www.conventionalcommits.org/) (`feat:`, `fix:`, `chore:`, `docs:`, `test:`, `refactor:`, etc.). Do not add a `Co-Authored-By` trailer or any other AI-attribution line.
