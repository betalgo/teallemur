import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import type { Manifest } from '../src/model.ts';
import { GENERATOR, MANIFEST_FILE } from '../src/manifest.ts';
import { PASS, cleanup, copyPass, runCli, tempDir } from './helpers.ts';

after(cleanup);

function withSlug(repo: string, slug: string): string {
  const file = join(repo, 'design.json');
  const json = JSON.parse(readFileSync(file, 'utf8')) as { slug: string; name: string };
  json.slug = slug;
  json.name = `${json.name} ${slug}`;
  writeFileSync(file, JSON.stringify(json, null, 2));
  return repo;
}

interface Card {
  href: string;
  slug: string;
  status: string;
  screens: number | null;
  findings: number | null;
}

function cards(html: string): Card[] {
  const re = /<a class="product-card" href="([^"]*)" data-slug="([^"]*)" data-status="([^"]*)"(?: data-screens="(\d+)")?(?: data-findings="(\d+)")?>/g;
  return [...html.matchAll(re)].map((m) => ({
    href: m[1] ?? '',
    slug: m[2] ?? '',
    status: m[3] ?? '',
    screens: m[4] === undefined ? null : Number(m[4]),
    findings: m[5] === undefined ? null : Number(m[5]),
  }));
}

describe('hub', () => {
  const out = tempDir();
  const good = PASS;
  const goodSlug = (JSON.parse(readFileSync(join(PASS, 'design.json'), 'utf8')) as { slug: string }).slug;
  const broken = withSlug(copyPass(), 'broken-app');
  writeFileSync(join(broken, 'scratch.txt'), 'not part of the layout\n');
  const preview = withSlug(copyPass(), 'preview-only');

  assert.equal(runCli(['build', good, '--out', out]).status, 0);
  assert.equal(runCli(['build', broken, '--out', out]).status, 1);
  assert.equal(runCli(['build', preview, '--out', out, '--base', preview]).status, 0);
  const result = runCli(['hub', '--out', out, '--title', 'Design hub']);
  const html = readFileSync(join(out, 'index.html'), 'utf8');
  const found = cards(html);

  test('exits 0', () => {
    assert.equal(result.status, 0, result.stderr);
  });

  test('shows one card per built product, linking to its folder, and skips previews', () => {
    assert.deepEqual(found.map((c) => c.slug).sort(), ['broken-app', goodSlug].sort());
    for (const c of found) assert.equal(c.href, `${c.slug}/`);
  });

  test('a product that failed the check shows an error card with its finding count', () => {
    const card = found.find((c) => c.slug === 'broken-app');
    const m = JSON.parse(readFileSync(join(out, 'broken-app', MANIFEST_FILE), 'utf8')) as Manifest;
    assert.equal(card?.status, 'error');
    assert.equal(card?.findings, m.findings?.length);
  });

  test('a built product shows its screen count from the manifest', () => {
    const card = found.find((c) => c.slug === goodSlug);
    const m = JSON.parse(readFileSync(join(out, goodSlug, MANIFEST_FILE), 'utf8')) as Manifest;
    assert.equal(card?.status, 'ok');
    assert.equal(card?.screens, m.screens);
  });

  test('the hub page loads nothing from outside the site', () => {
    assert.doesNotMatch(html, /https?:\/\//i);
  });

  test('the hub shows the mark as an image from its viewer folder, and the 16 px mark as its favicon', () => {
    assert.ok(html.includes('<img class="mark" src="_viewer/assets/mark.svg" alt="">'), 'lockup');
    assert.ok(html.includes('<link rel="icon" type="image/svg+xml" href="_viewer/assets/mark-16.svg">'), 'favicon');
    for (const f of ['mark.svg', 'mark-16.svg']) assert.ok(existsSync(join(out, '_viewer/assets', f)), f);
  });

  test('ignores earlier manifest file names and generator markers', () => {
    const target = tempDir();
    const template = JSON.parse(readFileSync(join(out, goodSlug, MANIFEST_FILE), 'utf8')) as Manifest;
    for (const [slug, filename, generator] of [
      ['first-filename', 'design-viewer.json', GENERATOR],
      ['second-filename', 'designroom.json', GENERATOR],
      ['second-contract', 'designroom.json', 'designroom'],
      ['first-marker', MANIFEST_FILE, 'design-viewer'],
      ['second-marker', MANIFEST_FILE, 'designroom'],
      ['current', MANIFEST_FILE, GENERATOR],
    ] as const) {
      const dir = join(target, slug);
      mkdirSync(dir);
      writeFileSync(join(dir, filename), JSON.stringify({ ...template, generator, product: { ...template.product, slug } }));
    }
    assert.equal(runCli(['hub', '--out', target, '--title', 'Contract']).status, 0);
    assert.deepEqual(cards(readFileSync(join(target, 'index.html'), 'utf8')).map((c) => c.slug), ['current']);
  });
});
