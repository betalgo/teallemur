import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { walk } from '../src/files.ts';
import { COPIED_DIRS, SCREEN_PATH } from '../src/layout.ts';
import type { Manifest, ViewerData } from '../src/model.ts';
import { GENERATOR, MANIFEST_FILE } from '../src/manifest.ts';
import { PASS, cleanup, copyPass, materialise, parseFindings, readFailFixture, runCli, tempDir } from './helpers.ts';
import { lockup } from '../src/viewer/dom.ts';
import { FAVICON_FILE, MARK_FILE } from '../src/viewer/marks.ts';
import { renderPreview } from './preview-dom.ts';

after(cleanup);

const design = JSON.parse(readFileSync(join(PASS, 'design.json'), 'utf8')) as {
  slug: string;
  viewports: { id: string }[];
  flows: { id: string }[];
};

function manifest(dir: string): Manifest {
  return JSON.parse(readFileSync(join(dir, MANIFEST_FILE), 'utf8')) as Manifest;
}

/** Builds write only the current manifest, never one under an earlier contract's file name. */
function noOldManifest(dir: string): void {
  for (const old of ['design-viewer.json', 'designroom.json']) assert.equal(existsSync(join(dir, old)), false, old);
}

function viewerData(htmlFile: string): ViewerData {
  const html = readFileSync(htmlFile, 'utf8');
  const m = /<script type="application\/json" id="dv-data">([\s\S]*?)<\/script>/.exec(html);
  assert.ok(m?.[1], `no viewer data in ${htmlFile}`);
  return JSON.parse(m[1]) as ViewerData;
}

function bytesEqual(a: string, b: string): boolean {
  return readFileSync(a).equals(readFileSync(b));
}

function declaredViewports(file: string): string[] | null {
  const m = /<meta name="design:viewports" content="([^"]*)">/.exec(readFileSync(file, 'utf8'));
  return m?.[1] ? m[1].split(',').map((s) => s.trim()) : null;
}

describe('build: board', () => {
  const out = tempDir();
  const result = runCli(['build', PASS, '--out', out]);
  const dir = join(out, design.slug);

  test('exits 0 and prints no findings', () => {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, '');
  });

  test('writes the board, the manifest and the viewer under <out>/<slug>/', () => {
    for (const p of ['index.html', MANIFEST_FILE, '_viewer/viewer.js', '_viewer/viewer.css']) {
      assert.ok(existsSync(join(dir, p)), p);
    }
    assert.deepEqual(readdirSync(out), [design.slug]);
    assert.equal(manifest(dir).generator, GENERATOR);
    noOldManifest(dir);
  });

  test('copies every design file byte for byte, and nothing else', () => {
    const source = walk(PASS);
    for (const p of source) {
      const copied = COPIED_DIRS.some((d) => p.startsWith(`${d}/`));
      assert.equal(existsSync(join(dir, p)), copied, p);
      if (copied) assert.ok(bytesEqual(join(PASS, p), join(dir, p)), p);
    }
  });

  test('the manifest counts the screens', () => {
    const m = manifest(dir);
    assert.equal(m.kind, 'board');
    assert.equal(m.product.slug, design.slug);
    assert.equal(m.screens, walk(PASS).filter((p) => SCREEN_PATH.test(p)).length);
  });

  test('the design system comes first, then flows in design.json order, open options, and the archive last and collapsed', () => {
    const data = viewerData(join(dir, 'index.html'));
    const flowIds = data.board.filter((s) => s.kind === 'flow').map((s) => s.id);
    const withScreens = design.flows.map((f) => f.id).filter((id) => walk(PASS, `screens/${id}`).length > 0);
    assert.deepEqual(flowIds, withScreens.map((id) => `flow-${id}`));
    assert.deepEqual(
      data.board.map((s) => s.kind),
      ['design-system', ...flowIds.map(() => 'flow'), 'exploration', 'archive'],
    );
    // In the design system: the overview card, then brand pages, then component pages.
    const ds = data.board[0];
    assert.ok(ds?.overview);
    const kinds = ds.lines.map((l) => (l.cells[0]?.path.startsWith('design-system/brand/') ? 'brand' : 'component'));
    assert.deepEqual(kinds, [...kinds].sort());
    assert.ok(kinds.includes('brand') && kinds.includes('component'));
    const last = data.board[data.board.length - 1];
    assert.equal(last?.kind, 'archive');
    assert.equal(last?.collapsed, true);
  });

  test('writes the design system overview page next to the board, linked from its card', () => {
    const data = viewerData(join(dir, 'index.html'));
    const card = data.board[0]?.overview;
    assert.ok(card);
    const page = readFileSync(join(dir, card.href, 'index.html'), 'utf8');
    assert.ok(existsSync(join(dir, card.fonts)));
    assert.equal(Number(/data-tokens="(\d+)"/.exec(page)?.[1]), card.tokens);
    assert.ok(card.tokens > 0 && card.colours > 0 && card.palette.length > 0);
    assert.doesNotMatch(page, /https?:\/\//i);
    // Its thumbnails and links point at the product's own files and board.
    for (const m of page.matchAll(/<iframe src="([^"]+)"/g)) assert.ok(existsSync(join(dir, card.href, decodeURIComponent(m[1] ?? ''))), m[1]);
  });

  test('each screen appears at its declared viewports, or at every viewport', () => {
    const data = viewerData(join(dir, 'index.html'));
    const all = design.viewports.map((v) => v.id);
    for (const section of data.board.filter((s) => s.kind === 'flow')) {
      for (const line of section.lines) {
        const path = line.cells[0]?.path ?? '';
        assert.ok(line.cells.every((c) => c.path === path && c.root === 'head'));
        assert.deepEqual(
          line.cells.map((c) => c.viewport),
          declaredViewports(join(PASS, path)) ?? all,
          path,
        );
      }
    }
  });

  test('exploration options are shown side by side', () => {
    const data = viewerData(join(dir, 'index.html'));
    const exploration = data.board.find((s) => s.kind === 'exploration');
    assert.ok(exploration);
    for (const line of exploration.lines) {
      const options = line.cells.map((c) => c.path.split('/')[2]);
      assert.deepEqual(options, [...options].sort());
      assert.ok(options.length >= 2);
    }
  });

  test('ships the copied mark masters, uses the 16 px one as the favicon and shows the mark as an image', () => {
    for (const f of [MARK_FILE, FAVICON_FILE]) {
      const svg = readFileSync(join(dir, '_viewer', f), 'utf8');
      assert.match(svg, /^<svg xmlns="http:\/\/www\.w3\.org\/2000\/svg"/, f);
      // Browsers load an image as strict XML: a comment holding "--" breaks it.
      for (const c of svg.matchAll(/<!--([\s\S]*?)-->/g)) assert.ok(!(c[1] ?? '').includes('--'), `${f}: "--" inside a comment`);
    }
    assert.ok(readFileSync(join(dir, 'index.html'), 'utf8').includes(`<link rel="icon" type="image/svg+xml" href="_viewer/${FAVICON_FILE}">`));
    // Pages written by the CLI point the image at the viewer folder they use.
    const overview = readFileSync(join(dir, '_overview', 'index.html'), 'utf8');
    assert.ok(overview.includes(`<img class="mark" src="../_viewer/${MARK_FILE}" alt="">`), 'overview lockup');
    assert.ok(overview.includes(`href="../_viewer/${FAVICON_FILE}"`), 'overview favicon');
    // The stylesheet no longer draws the mark: it is an image in its own colours.
    assert.doesNotMatch(readFileSync(join(dir, '_viewer/viewer.css'), 'utf8'), /url\(\s*["']?assets\/mark/);
  });

  test('the generated pages reference nothing outside the site', () => {
    for (const p of ['index.html', '_viewer/viewer.js', '_viewer/viewer.css']) {
      assert.doesNotMatch(readFileSync(join(dir, p), 'utf8'), /https?:\/\//i, p);
    }
  });
});

describe('build: preview', () => {
  const base = copyPass();
  const head = copyPass();
  const changed = 'screens/auth/login--default.html';
  const added = 'screens/settings/notifications--default.html';
  const archivedFrom = 'screens/auth/signup--default.html';
  const archiveFolder = 'archive/2026-02-01-signup-merged';
  const exploration = 'explorations/2026-02-01-billing';
  const tokens = readFileSync(join(base, 'design-system/tokens.css'), 'utf8');
  const tokenMatch = /(--colour-accent):\s*([^;]+);/.exec(tokens);
  const oldValue = tokenMatch?.[2] ?? '';
  const newValue = `${oldValue}aa`;

  writeFileSync(join(head, changed), `${readFileSync(join(head, changed), 'utf8')}<!-- revised -->\n`);
  cpSync(join(head, 'screens/settings/profile--default.html'), join(head, added));
  mkdirSync(join(head, archiveFolder, dirname(archivedFrom)), { recursive: true });
  cpSync(join(head, archivedFrom), join(head, archiveFolder, archivedFrom));
  writeFileSync(join(head, archiveFolder, 'README.md'), 'Merged into login.\n');
  rmSync(join(head, archivedFrom));
  for (const opt of ['a', 'b']) {
    const target = join(head, exploration, opt, 'screens/settings/plan--default.html');
    mkdirSync(dirname(target), { recursive: true });
    cpSync(join(head, 'screens/settings/profile--default.html'), target);
  }
  writeFileSync(join(head, exploration, 'README.md'), 'Which plan page?\n');
  writeFileSync(join(head, 'design-system/tokens.css'), tokens.replace(tokenMatch?.[0] ?? '', `--colour-accent: ${newValue};`));
  // Explorations link the design system from five levels down.
  for (const opt of ['a', 'b']) {
    const f = join(head, exploration, opt, 'screens/settings/plan--default.html');
    writeFileSync(f, readFileSync(f, 'utf8').replaceAll('../../design-system/', '../../../../../design-system/'));
  }

  const out = tempDir();
  const label = 'PR 7: billing options';
  const result = runCli(['build', head, '--out', out, '--base', base, '--label', label]);
  const dir = join(out, design.slug);

  test('exits 0', () => {
    assert.equal(result.status, 0, result.stdout + result.stderr);
  });

  test('classifies changed, added, removed and archived files', () => {
    const c = manifest(dir).classification;
    assert.ok(c);
    assert.deepEqual(c.changed, [changed]);
    assert.deepEqual(c.added, [added]);
    assert.deepEqual(c.removed, [archivedFrom]);
    assert.deepEqual(c.archived, [`${archiveFolder}/README.md`, `${archiveFolder}/${archivedFrom}`].sort());
    assert.deepEqual(c.explorations, [exploration]);
    assert.ok(c.shared.includes('design-system/tokens.css'));
  });

  test('reports the token change with old and new values', () => {
    const c = manifest(dir).classification;
    const change = c?.tokens.find((t) => t.name === '--colour-accent' && t.context === ':root');
    assert.deepEqual(change && { old: change.old, new: change.new }, { old: oldValue, new: newValue });
  });

  test('writes the preview, the board at head and the base copies', () => {
    assert.equal(manifest(dir).kind, 'preview');
    assert.equal(manifest(dir).generator, GENERATOR);
    noOldManifest(dir);
    for (const p of ['index.html', 'board/index.html', MANIFEST_FILE, '_viewer/viewer.js']) {
      assert.ok(existsSync(join(dir, p)), p);
    }
    assert.ok(bytesEqual(join(base, changed), join(dir, '_base', changed)));
    assert.ok(bytesEqual(join(head, changed), join(dir, changed)));
  });

  test('the viewer shows the mark as an image found next to its own script', () => {
    const app = renderPreview(viewerData(join(dir, 'index.html')));
    const img = app.querySelector('.top-bar .lockup img.mark');
    assert.equal(img?.getAttribute('alt'), '');
    // The test page loads no viewer script, so the path is relative to the page.
    assert.equal(img?.getAttribute('src'), MARK_FILE);
    document.body.insertAdjacentHTML('beforeend', '<script src="../_viewer/viewer.js"></script>');
    assert.equal(lockup(true).querySelector('img.mark')?.getAttribute('src'), `../_viewer/${MARK_FILE}`);
  });

  test('the preview page lists sections in the specified order with before/after pairs', () => {
    const data = viewerData(join(dir, 'index.html'));
    assert.equal(data.kind, 'preview');
    assert.equal(data.preview?.label, label);
    const app = renderPreview(data);
    assert.equal(app.firstElementChild?.tagName, 'HEADER');
    assert.deepEqual(
      [...app.querySelectorAll('main > .container > [data-kind]')].map((el) => el.getAttribute('data-kind')),
      ['changed', 'added', 'archived', 'tokens'],
    );
    assert.deepEqual(
      data.preview?.sections.map((s) => s.kind),
      ['changed', 'added', 'exploration', 'archived'],
    );
    // The new exploration shows as its options, inside the added section.
    assert.equal(app.querySelectorAll('[data-kind="added"] .option-set').length, 1);
    // The full board at head is one link away.
    assert.equal(app.querySelector('header a.dv-board-link')?.getAttribute('href'), data.preview?.boardHref);
    // Archived pages show as pages; other archived files as links.
    const archivedSection = data.preview?.sections.find((s) => s.kind === 'archived');
    assert.deepEqual(archivedSection?.lines.flatMap((l) => l.cells.map((c) => c.path)), [`${archiveFolder}/${archivedFrom}`]);
    assert.deepEqual(archivedSection?.files?.map((f) => f.path), [`${archiveFolder}/README.md`]);
    const changedSection = data.preview?.sections[0];
    const declared = declaredViewports(join(head, changed)) ?? design.viewports.map((v) => v.id);
    assert.deepEqual(
      changedSection?.lines.map((l) => l.cells.map((c) => `${c.root}:${c.path}@${c.viewport}`)),
      declared.map((vp) => [`base:${changed}@${vp}`, `head:${changed}@${vp}`]),
    );
    assert.ok(data.preview?.shared?.files.includes('design-system/tokens.css'));
    assert.equal(viewerData(join(dir, 'board/index.html')).kind, 'board');
  });

  test('token changes are a closed native disclosure with the count in its summary and both values inside', () => {
    const data = viewerData(join(dir, 'index.html'));
    const app = renderPreview(data);
    const details = app.querySelector('details[data-kind="tokens"]');
    assert.ok(details);
    assert.equal(details.hasAttribute('open'), false);
    assert.equal(details.firstElementChild?.tagName, 'SUMMARY');
    assert.ok(details.querySelector('summary h2')?.textContent?.includes(String(data.preview!.shared!.tokens.length)));
    assert.ok(details.querySelector('summary .dv-warning'));
    const row = details.querySelector('[data-token="--colour-accent"]');
    const tds = [...row!.querySelectorAll('td')].map((td) => td.textContent);
    assert.deepEqual([tds[1], tds[3]], [oldValue, newValue]);
  });

  test('shared changes remain available with zero token changes; only token or component CSS triggers the summary warning', () => {
    for (const file of ['design-system/tokens.css', 'design-system/components.css', 'screens/_shared/layout.css']) {
      const data = viewerData(join(dir, 'index.html'));
      data.preview!.shared = { files: [file], tokens: [] };
      const details = renderPreview(data).querySelector('details[data-kind="tokens"]')!;
      assert.equal(details.hasAttribute('open'), false);
      assert.ok(details.querySelector('summary h2')?.textContent?.includes('0'));
      assert.equal(!!details.querySelector('summary .dv-warning'), file !== 'screens/_shared/layout.css');
      assert.equal(details.querySelector('table'), null);
      assert.equal(details.querySelector('li a')?.getAttribute('href'), file);
    }
  });

  test('without shared changes the preview has no token section', () => {
    const data = viewerData(join(dir, 'index.html'));
    data.preview!.shared = null;
    const main = renderPreview(data).querySelector('main')!;
    assert.equal(main.querySelector('[data-kind="tokens"]'), null);
    assert.equal(main.querySelector('.container')?.lastElementChild?.getAttribute('data-kind'), 'archived');
  });

  test('unchanged screens are not listed as changed', () => {
    const data = viewerData(join(dir, 'index.html'));
    const paths = new Set(data.preview?.sections[0]?.lines.flatMap((l) => l.cells.map((c) => c.path)));
    assert.deepEqual([...paths], [changed]);
  });
});

describe('build: design system overview', () => {
  test('a product without tokens gets no overview card and no overview page', () => {
    const repo = copyPass();
    writeFileSync(join(repo, 'design-system/tokens.css'), '/* No tokens yet. */\n');
    const out = tempDir();
    assert.equal(runCli(['build', repo, '--out', out]).status, 0);
    const data = viewerData(join(out, design.slug, 'index.html'));
    assert.equal(data.board.some((s) => s.overview), false);
    assert.equal(data.board[0]?.kind, 'design-system');
    assert.equal(existsSync(join(out, design.slug, '_overview')), false);
  });

  test('a preview builds the overview too, linking back to the board at head', () => {
    const out = tempDir();
    assert.equal(runCli(['build', PASS, '--out', out, '--base', PASS]).status, 0);
    const page = readFileSync(join(out, design.slug, '_overview', 'index.html'), 'utf8');
    assert.match(page, /class="button dv-back" href="\.\.\/board\/"/);
    assert.ok(viewerData(join(out, design.slug, 'board', 'index.html')).board[0]?.overview);
  });
});

describe('build: failures', () => {
  test('a repo that fails the check gets an error page and exit 1', () => {
    const repo = materialise(readFailFixture('layout-unknown-top-level'));
    const out = tempDir();
    const r = runCli(['build', repo, '--out', out]);
    assert.equal(r.status, 1);
    const findings = parseFindings(r.stdout);
    assert.deepEqual([...new Set(findings.map((f) => f.rule))], ['layout/unknown-top-level']);
    const m = manifest(join(out, design.slug));
    assert.equal(m.kind, 'error');
    assert.equal(m.generator, GENERATOR);
    noOldManifest(join(out, design.slug));
    assert.equal(m.findings?.length, findings.length);
    assert.ok(existsSync(join(out, design.slug, 'index.html')));
    // A static page: styled, but with no viewer script or board data.
    assert.doesNotMatch(readFileSync(join(out, design.slug, 'index.html'), 'utf8'), /viewer\.js|dv-data/);
  });

  test('without a usable slug nothing is written', () => {
    const repo = materialise(readFailFixture('design-json-missing'));
    const out = tempDir();
    const r = runCli(['build', repo, '--out', out]);
    assert.equal(r.status, 1);
    assert.deepEqual(readdirSync(out), []);
  });

  test('refuses to write over the repo it reads', () => {
    const parent = tempDir();
    const repo = join(parent, design.slug);
    cpSync(PASS, repo, { recursive: true });
    const r = runCli(['build', repo, '--out', parent]);
    assert.equal(r.status, 2);
    assert.ok(existsSync(join(repo, 'design.json')));
  });
});
