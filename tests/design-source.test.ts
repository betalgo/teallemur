import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { chromeTokens, stripComments, transcribe } from '../scripts/design-transform.ts';
import { customProperties } from '../src/build/preview.ts';
import { ROOT } from './helpers.ts';

interface Source {
  repository: string;
  commit: string;
  files: { from: string; to: string }[];
  transcribed: { from: string; to: string; transform: 'tokens' | 'styles' }[];
}

const source = JSON.parse(readFileSync(join(ROOT, 'design-source.json'), 'utf8')) as Source;

const TOKENS = `/* A product's tokens */
@font-face { font-family: "Ui"; src: url("assets/fonts/ui.ttf") format("truetype"); }
@font-face { font-family: "Sample"; src: url("assets/fonts/sample.ttf") format("truetype"); }
:root {
  --color-ground: #F4F1EA; /* page */
  --sample-harbor-ink: #121826;
  --font-ui: "Ui", sans-serif;
  --shadow: 0 1px 2px color-mix(in srgb, var(--color-ground) 5%, transparent);
}
`;

describe('design source', () => {
  test('pins a full commit and lists files that exist in this repo', () => {
    assert.match(source.commit, /^[0-9a-f]{40}$/);
    for (const f of [...source.files, ...source.transcribed]) assert.ok(existsSync(join(ROOT, f.to)), f.to);
  });

  test('the tokens transform keeps every token but the design mocks\' samples, and only font faces it ships', () => {
    const out = chromeTokens(TOKENS, new Set(['assets/fonts/ui.ttf']));
    const props = [...customProperties(out).values()].map((p) => p.name);
    assert.deepEqual(props, ['--color-ground', '--font-ui', '--shadow']);
    assert.match(out, /font-family: "Ui"/);
    assert.doesNotMatch(out, /Sample|sample/);
    assert.doesNotMatch(out, /\/\*/);
  });

  test('the styles transform only removes comments', () => {
    const css = '/* a */\n.a { color: var(--x); } /* b */\n\n\n\n.b{}\n';
    assert.equal(stripComments(css).replace(/\s+/g, ''), '.a{color:var(--x);}.b{}');
  });

  test('transcribed files start with where they came from, and are stable', () => {
    const once = transcribe('tokens', 'design-system/tokens.css', source.commit, TOKENS, new Set());
    assert.ok(once.includes(source.commit));
    assert.equal(transcribe('tokens', 'design-system/tokens.css', source.commit, TOKENS, new Set()), once);
  });

  test('the review list\'s styles come from the design repo, not from the viewer\'s own CSS', () => {
    const components = readFileSync(join(ROOT, 'src/viewer/design/components.css'), 'utf8');
    const viewer = stripComments(readFileSync(join(ROOT, 'src/viewer/viewer.css'), 'utf8'));
    for (const block of ['.review-panel', '.review-list', '.review-row', '.review-strip']) {
      assert.ok(components.includes(`${block} `) || components.includes(`${block}__`), `components.css styles ${block}`);
      assert.doesNotMatch(viewer, new RegExp(`\\${block}[\\w-]*[^{}]*\\{`), `viewer.css restyles ${block}`);
    }
  });

  test('the viewer ships no sample tokens, and every font its tokens load', () => {
    const tokens = readFileSync(join(ROOT, 'src/viewer/design/tokens.css'), 'utf8');
    assert.doesNotMatch(tokens, /--sample-/);
    const urls = [...tokens.matchAll(/url\("([^"]+)"\)/g)].map((m) => m[1] ?? '');
    assert.ok(urls.length > 0);
    for (const u of urls) assert.ok(existsSync(join(ROOT, 'src/viewer/design', u)), u);
  });
});
