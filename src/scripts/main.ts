// Desktop entry point: wires up the window manager and polybar, opens the
// default (boot-sequence) terminal window, and owns the global
// Ctrl/Cmd+Enter "open new window" shortcut.

import { createWindowManager } from './window-manager';
import { createPolybar } from './polybar';
import { runSplash } from './splash';

const desktopEl = document.getElementById('desktop') as HTMLElement;
const polybarEl = document.getElementById('polybar') as HTMLElement;
const windowTemplate = document.getElementById('window-template') as HTMLTemplateElement;
const splashEl = document.getElementById('splash') as HTMLElement;

const wm = createWindowManager(desktopEl, windowTemplate);
createPolybar(polybarEl, wm);

runSplash(splashEl).then(() => {
    wm.createWindow({ skipBoot: false });
});

document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        wm.createWindow({ skipBoot: true });
    }
});
