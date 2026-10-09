// Builds dist/bfs-test-data-filler-<version>.zip with only the files Chrome needs
// (for the Chrome Web Store or an enterprise policy install). Needs the `zip` command.
import { execFileSync } from 'node:child_process';
import { mkdirSync, readFileSync, rmSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { version } = JSON.parse(readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const out = path.join(root, 'dist', `bfs-test-data-filler-${version}.zip`);
const files = ['manifest.json', 'background.js', 'lib', 'content', 'sidepanel', 'welcome', 'icons/icon16.png', 'icons/icon32.png', 'icons/icon48.png', 'icons/icon128.png'];

mkdirSync(path.dirname(out), { recursive: true });
rmSync(out, { force: true });
execFileSync('zip', ['-r', '-X', out, ...files], { cwd: root, stdio: 'inherit' });
console.log(`Packaged ${out}`);
