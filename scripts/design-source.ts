// design:sync and design:check. They copy and compare the files that
// design-source.json pins, reading the design repo at the pinned commit with
// `git show` from a local clone. A working tree is never read.
//
//   node scripts/design-source.ts sync  <path to a clone of the design repo>
//   node scripts/design-source.ts check <path to a clone of the design repo>
//
// The clone path can also come from the DESIGN_REPO environment variable.
//
// The design repo is private, so only Teal Lemur's maintainers can run these
// two scripts. CI never runs them. See docs/development.md#design-source.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { transcribe, type Transform } from './design-transform.ts';

interface Entry {
  from: string;
  to: string;
}

interface Transcribed extends Entry {
  transform: Transform;
}

interface Source {
  repository: string;
  commit: string;
  files: Entry[];
  transcribed: Transcribed[];
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');

const MAINTAINERS_ONLY = 'The design repo is private, so only Teal Lemur\'s maintainers can run design:sync and design:check. To suggest a change to the viewer\'s look, open an issue.';

function fail(message: string, hint = ''): never {
  process.stderr.write(`design-source: ${message}\n${hint ? `${hint}\n` : ''}`);
  process.exitCode = 1;
  throw new Error(message);
}

function show(clone: string, commit: string, path: string): NodeBuffer {
  try {
    return execFileSync('git', ['-C', clone, 'show', `${commit}:${path}`], { encoding: 'buffer', stdio: ['ignore', 'pipe', 'pipe'], maxBuffer: 256 * 1024 * 1024 });
  } catch {
    return fail(`${path} does not exist at ${commit} in ${clone}`);
  }
}

function main(): void {
  const [mode, arg] = process.argv.slice(2);
  if (mode !== 'sync' && mode !== 'check') fail('usage: design-source.ts sync|check <clone path> (or set DESIGN_REPO)');
  const clone = arg ?? process.env.DESIGN_REPO;
  if (!clone) fail('give the path to a local clone of the design repo, or set DESIGN_REPO', MAINTAINERS_ONLY);
  const source = JSON.parse(readFileSync(join(root, 'design-source.json'), 'utf8')) as Source;
  if (!/^[0-9a-f]{40}$/.test(source.commit)) fail(`commit must be a full 40-character SHA, got "${source.commit}"`);
  try {
    execFileSync('git', ['-C', clone, 'cat-file', '-e', `${source.commit}^{commit}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch {
    fail(`${clone} has no commit ${source.commit}; fetch the design repo first`, MAINTAINERS_ONLY);
  }

  // Font files the viewer ships, relative to tokens.css (design-system/).
  const shipped = new Set(source.files.map((f) => relative('design-system', f.from).replace(/\\/g, '/')));
  const wanted: { to: string; bytes: Uint8Array }[] = [
    ...source.files.map((f) => ({ to: f.to, bytes: show(clone, source.commit, f.from) as Uint8Array })),
    ...source.transcribed.map((t) => ({
      to: t.to,
      bytes: new TextEncoder().encode(transcribe(t.transform, t.from, source.commit, show(clone, source.commit, t.from).toString('utf8'), shipped)),
    })),
  ];

  let differ = 0;
  for (const { to, bytes } of wanted) {
    const target = join(root, to);
    if (mode === 'sync') {
      mkdirSync(dirname(target), { recursive: true });
      writeFileSync(target, bytes);
      process.stdout.write(`wrote ${to}\n`);
      continue;
    }
    const same = existsSync(target) && readFileSync(target).equals(bytes);
    if (!same) {
      differ++;
      process.stdout.write(`${existsSync(target) ? 'differs' : 'missing'}: ${to}\n`);
    }
  }
  if (mode === 'check') {
    if (differ > 0) fail(`${differ} file${differ === 1 ? '' : 's'} do not match ${source.repository} at ${source.commit}; run npm run design:sync`);
    process.stdout.write(`design-source: ${wanted.length} files match ${source.repository} at ${source.commit}\n`);
  }
}

try {
  main();
} catch {
  process.exitCode = 1;
}
