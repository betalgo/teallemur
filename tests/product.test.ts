import assert from 'node:assert/strict';
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { walk } from '../src/files.ts';
import { GENERATOR, MANIFEST_FILE } from '../src/manifest.ts';
import { COMMAND, PRODUCT_NAME } from '../src/product.ts';
import { PASS, ROOT, runCli, tempDir } from './helpers.ts';

const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { name: string; bin: Record<string, string> };
const slug = (JSON.parse(readFileSync(join(PASS, 'design.json'), 'utf8')) as { slug: string }).slug;

/** The tool's names in lower case, including the product name without spaces. */
const names = [PRODUCT_NAME, COMMAND, PRODUCT_NAME.replace(/\s+/g, '')].map((n) => n.toLowerCase());

describe('the name lives in one module', () => {
  test('no other source file spells out the product name or the command', () => {
    const sources = walk(join(ROOT, 'src')).filter((p) => /\.(ts|css)$/.test(p) && p !== 'product.ts' && !p.startsWith('viewer/design/'));
    assert.ok(sources.length > 10);
    for (const p of sources) {
      const text = readFileSync(join(ROOT, 'src', p), 'utf8').toLowerCase();
      for (const n of names) assert.ok(!text.includes(n), `src/${p} contains "${n}"`);
    }
  });

  test('package.json is named after the command, installs it, and keeps the earlier commands on the same entry', () => {
    assert.equal(pkg.name, COMMAND);
    assert.equal(pkg.bin[COMMAND], 'dist/cli.js');
    for (const alias of ['designroom', 'design-viewer']) assert.equal(pkg.bin[alias], pkg.bin[COMMAND], alias);
  });

  test('help and messages name the command', () => {
    const help = runCli(['--help']);
    assert.equal(help.status, 0);
    const commands = help.stdout.split('\n').filter((l) => l.trim() !== '' && l.startsWith('  '));
    assert.ok(commands.length >= 4);
    for (const line of commands) assert.ok(line.trimStart().startsWith(`${COMMAND} `), line);
    for (const r of [runCli(['check', PASS]), runCli(['frobnicate']), runCli(['build', PASS, '--out', tempDir()])]) {
      assert.ok(r.stderr.startsWith(`${COMMAND}: `), r.stderr);
    }
  });
});

describe('the manifest contract carries no name', () => {
  test('its file name and marker are fixed and do not contain the tool\'s name', () => {
    // Hubs read exactly these. Changing either breaks every hub, so a rename must not.
    assert.equal(MANIFEST_FILE, 'board.json');
    assert.equal(GENERATOR, 'design-board');
    for (const n of names) {
      assert.ok(!MANIFEST_FILE.toLowerCase().includes(n), MANIFEST_FILE);
      assert.ok(!GENERATOR.toLowerCase().includes(n), GENERATOR);
    }
  });

  test('a build writes the manifest under its file name with its marker, and names the tool for information', () => {
    const out = tempDir();
    assert.equal(runCli(['build', PASS, '--out', out]).status, 0);
    const manifest = JSON.parse(readFileSync(join(out, slug, MANIFEST_FILE), 'utf8')) as { generator: string; tool: string };
    assert.equal(manifest.generator, GENERATOR);
    assert.equal(manifest.tool, PRODUCT_NAME);
  });

  test('the hub lists a board whatever tool name its manifest carries', () => {
    const out = tempDir();
    assert.equal(runCli(['build', PASS, '--out', out]).status, 0);
    const file = join(out, slug, MANIFEST_FILE);
    const manifest = JSON.parse(readFileSync(file, 'utf8')) as Record<string, unknown>;
    writeFileSync(file, JSON.stringify({ ...manifest, tool: 'A later name' }));
    assert.equal(runCli(['hub', '--out', out, '--title', 'Hub']).status, 0);
    assert.match(readFileSync(join(out, 'index.html'), 'utf8'), new RegExp(`data-slug="${slug}" data-status="ok"`));
  });
});
