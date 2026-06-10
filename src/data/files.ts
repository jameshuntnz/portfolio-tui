// Build-time content loaders. Content lives in plain files under
// src/content — `import.meta.glob` (a Vite build-time feature) pulls
// them in as raw strings, and we compile their {{tag}} markup into real
// terminal escapes.
//
// Two separate trees, two separate maps:
//   - content/fs       -> `files`, the visitor-browsable fake filesystem
//                         (ls/cd/cat walk this)
//   - content/commands -> `commandOutput`, text that backs a command's output
//                         but isn't a "file" the visitor can navigate to or
//                         cat (e.g. neofetch — a system command, not a file)

import { compileMarkup } from './markup';

function loadTree(prefix: string): Record<string, string> {
    const rawModules = import.meta.glob('../content/**/*', {
        eager: true,
        query: '?raw',
        import: 'default',
    }) as Record<string, string>;

    const tree: Record<string, string> = {};
    for (const [path, raw] of Object.entries(rawModules)) {
        if (!path.startsWith(prefix)) continue;
        tree[path.slice(prefix.length)] = compileMarkup(raw);
    }
    return tree;
}

export const files = loadTree('../content/fs/');
export const commandOutput = loadTree('../content/commands/');
