// Bundles the CLI (Node) and the viewer (browser) with esbuild into dist/.
// The viewer's stylesheet is the design system's tokens and components
// (src/viewer/design/, copied by design:sync) followed by the viewer's own
// layout rules; its fonts and marks are copied next to it.

import { build } from 'esbuild';
import { copyFileSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');
const design = join(root, 'src/viewer/design');
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));

rmSync(dist, { recursive: true, force: true });
mkdirSync(join(dist, 'viewer'), { recursive: true });

await build({
  entryPoints: [join(root, 'src/cli.ts')],
  outfile: join(dist, 'cli.js'),
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node24',
  packages: 'external',
  banner: { js: '#!/usr/bin/env node' },
  define: { TOOL_VERSION: JSON.stringify(pkg.version) },
  legalComments: 'none',
  logLevel: 'warning',
});

await build({
  entryPoints: [join(root, 'src/viewer/main.ts')],
  outfile: join(dist, 'viewer/viewer.js'),
  bundle: true,
  platform: 'browser',
  format: 'iife',
  target: ['es2022'],
  minify: true,
  legalComments: 'none',
  logLevel: 'warning',
});

const css = ['tokens.css', 'components.css'].map((f) => readFileSync(join(design, f), 'utf8'));
css.push(readFileSync(join(root, 'src/viewer/viewer.css'), 'utf8'));
writeFileSync(join(dist, 'viewer/viewer.css'), css.join('\n'));

/** Copies a folder's files, keeping their relative paths. */
function copyTree(from, to) {
  for (const entry of readdirSync(from, { withFileTypes: true })) {
    const source = join(from, entry.name);
    const target = join(to, entry.name);
    if (entry.isDirectory()) copyTree(source, target);
    else {
      mkdirSync(dirname(target), { recursive: true });
      copyFileSync(source, target);
    }
  }
}

copyTree(join(design, 'assets'), join(dist, 'viewer/assets'));
