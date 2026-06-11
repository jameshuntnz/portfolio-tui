# portfolio-tui

A personal portfolio site disguised as a terminal. You land in a fake SSH
session and explore everything by typing — `whoami`, `about`, `ls`,
`cat projects/wayfairer.md`, `theme`, `neofetch`, and so on.

No xterm.js, no UI framework — just Vite shipping a hand-rolled shell
interpreter, a small terminal renderer, and a build-time pipeline that
compiles plain text content into real ANSI escape sequences.

## Commands

| Command                             | Action                                       |
| :---------------------------------- | :------------------------------------------- |
| `pnpm install`                      | Install dependencies                         |
| `pnpm dev`                          | Start the dev server at `localhost:5173`     |
| `pnpm build`                        | Type-check and production build to `./dist/` |
| `pnpm preview`                      | Preview the production build                 |
| `pnpm test`                         | Run the vitest suite                         |
| `pnpm test:coverage`                | Run the vitest suite with coverage report    |
| `pnpm test:e2e`                     | Run the Playwright e2e/a11y suite            |
| `pnpm og-image`                     | Regenerate `public/og-image.png`             |
| `pnpm exec vitest run -t "pattern"` | Run tests matching a name pattern            |
| `pnpm exec tsc --noEmit`            | Type-check the project                       |
| `pnpm lint`                         | Run ESLint                                   |
| `pnpm format`                       | Format the codebase with Prettier            |

## How it's put together

The system is split into layers that are deliberately decoupled — in
particular, the interpreter knows nothing about the DOM, so it could in
theory run behind a real SSH connection one day.

### 1. Interpreter — `src/scripts/shell.ts`

A pure-function command interpreter and fake filesystem:
`(input, state) -> { output, state }`. Framework- and DOM-free by design.
All commands live in a `handlers` map (with an `aliases` table alongside),
and tab-completion mirrors real shells by completing the first word against
command names and every other word against filesystem paths.

Most commands whose entire output is static text don't need a handler at
all — see "Content over code" below.

### 2. Renderer — `src/scripts/terminal.ts`

The terminal UI: keystrokes, cursor, history navigation, the boot sequence,
theme switching, and an ANSI-escape-to-HTML parser (`ansiToHTML`). It owns
every DOM/browser concern so the interpreter doesn't have to.

### 3. Content pipeline — `src/data/`

- **`markup.ts`** — a build-time compiler that turns friendly
  `{{tag}}...{{/}}` authoring syntax into real terminal escape sequences:
  24-bit truecolor SGR codes for colours (`{{moss}}`, `{{rgb:r,g,b}}`, …)
  and OSC 8 escapes for hyperlinks, including a custom `cmd:` URI scheme
  (`{{link:cmd:about}}about{{/link}}`) that the renderer recognises and runs
  as a command instead of navigating — the same trick VS Code's `command:`
  links and iTerm2's proprietary schemes use.
- **`files.ts`** — a build-time loader that pulls every file under
  `src/content/**` in as raw text via `import.meta.glob` and compiles it
  through `markup.ts`, exposing two maps: `files` (the browsable fake
  filesystem) and `commandOutput` (text that backs a command but isn't a
  navigable file).

### 4. Content — `src/content/`

- **`fs/`** — the actual fake filesystem visitors browse with `ls`/`cd`/`cat`
  (`about.txt`, `resume.txt`, `projects/wayfairer.md`, …). Directories are
  tracked implicitly from file paths — there's no separate directory
  structure. Drop a file here and `ls`/`cd`/`cat`/tab-completion pick it up
  automatically.
- **`commands/`** — text that backs a command's output but shouldn't show up
  in `ls`/`cat`/path-completion, because the command isn't thematically a
  file (`neofetch`, `whoami`, `vim`, `projects`). Any file here without a
  matching bespoke handler in `shell.ts` is auto-registered as a passthrough
  command at load time — so adding a new "system command" is often just a
  matter of adding a `.txt` file.

## Conventions worth knowing

- **Strict separation of pure logic vs. DOM.** `shell.ts` stays
  framework- and DOM-free; all rendering and browser APIs live in
  `terminal.ts`.
- **Content over code, and no hand-wiring.** Static command output belongs
  in `src/content/commands/*.txt`, not as strings in `shell.ts`. You
  generally don't need to register a handler either — only commands that
  need live state, args, or branching logic (`ls`, `cd`, `cat`, `theme`,
  `history`, `sudo`, …) get real handlers.
- **Colours are always exact truecolor hex**, never re-themed
  approximations — there's no indexed/16-colour palette, and `{{moss}}` /
  `{{rgb:107,127,79}}` compile to byte-identical escape sequences.
- Tests live alongside the modules they cover (`shell.test.ts`,
  `markup.test.ts`) and lean on exact-string assertions for compiled ANSI
  output.
