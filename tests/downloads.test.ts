import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { parseHTML } from 'linkedom';
import { changeName } from '../src/build/preview.ts';
import { checkRepo, downloadTarget } from '../src/check/index.ts';
import { assetFile, formatOf, imageSize, isListedImage } from '../src/images.ts';
import type { AssetFile, Cell, Section, ViewerData } from '../src/model.ts';
import { Board } from '../src/viewer/board.ts';
import { Context } from '../src/viewer/context.ts';
import { openFocus } from '../src/viewer/focus.ts';
import { bytesText } from '../src/viewer/format.ts';
import { sidebar } from '../src/viewer/sidebar.ts';
import { FIXTURES, cleanup, runCli, tempDir } from './helpers.ts';

after(cleanup);

const REPO = join(FIXTURES, 'downloads');
const slug = (JSON.parse(readFileSync(join(REPO, 'design.json'), 'utf8')) as { slug: string }).slug;

function viewerData(html: string): ViewerData {
  return JSON.parse(/<script type="application\/json" id="dv-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '') as ViewerData;
}

function build(repo: string, extra: string[] = []): string {
  const out = tempDir();
  const r = runCli(['build', repo, '--out', out, ...extra]);
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return join(out, slug);
}

const boardDir = build(REPO);
const data = viewerData(readFileSync(join(boardDir, 'index.html'), 'utf8'));
const cells = data.board.flatMap((s) => s.lines.flatMap((l) => l.cells));
const ds = data.board.find((s) => s.kind === 'design-system');
const assets = ds?.assets ?? [];
const named = (path: string): Cell[] => cells.filter((c) => c.path === path);

/** The Files page a build wrote, as a document; null when it wrote none. */
function filesPage(dir: string): Document | null {
  const path = join(dir, '_files', 'index.html');
  if (!existsSync(path)) return null;
  return parseHTML(readFileSync(path, 'utf8')).document as unknown as Document;
}

const folderOf = (p: string): string => p.slice(0, p.lastIndexOf('/') + 1);
/** The images in the order the Files page lists them: folders in path order, so the top folder comes first; files by name within each. */
const listed = [...new Set(assets.map((a) => folderOf(a.path)))].sort().flatMap((f) => assets.filter((a) => folderOf(a.path) === f));

/** The page's design:download, resolved against the page as the viewer serves it. */
function namedFile(page: string): string {
  const meta = /<meta name="design:download" content="([^"]+)">/.exec(readFileSync(join(REPO, page), 'utf8'))?.[1];
  assert.ok(meta, page);
  return new URL(meta, `http://x/${page}`).pathname.slice(1);
}

function setGlobals(href = `http://localhost/${slug}/`): { document: Document; window: Window & typeof globalThis } {
  const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.assign(window, { location: { href } });
  Object.assign(globalThis, {
    document,
    window,
    localStorage: { getItem: () => null, setItem() {} },
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
    },
  });
  window.HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
    this.dataset.scrolled = 'yes';
  };
  window.HTMLElement.prototype.focus = function (this: HTMLElement) {
    this.dataset.focused = 'yes';
  };
  return { document: document as unknown as Document, window: window as unknown as Window & typeof globalThis };
}

function mount(viewport: string, view: ViewerData = data): { ctx: Context; board: Board } {
  setGlobals();
  const ctx = new Context(view);
  ctx.filters = { ...ctx.filters, viewports: new Set([viewport]) };
  const board = new Board(ctx, view.board);
  document.body.append(board.el);
  board.render();
  return { ctx, board };
}

function figure(board: Board, path: string, viewport: string): HTMLElement {
  const el = [...board.el.querySelectorAll<HTMLElement>('figure.dv-frame')].find((f) => f.dataset.path === path && f.dataset.viewport === viewport);
  assert.ok(el, `${path}@${viewport}`);
  return el;
}

/** Bytes of a minimal file of each kind, made for one size. */
const make = {
  png(width: number, height: number): Uint8Array {
    const b = new Uint8Array(33);
    b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
    new DataView(b.buffer).setUint32(16, width);
    new DataView(b.buffer).setUint32(20, height);
    return b;
  },
  jpeg(width: number, height: number, orientation?: { value: number; order: 'II' | 'MM' }): Uint8Array {
    // SOI, an APP0 segment to skip, an EXIF segment when asked, a fill byte, then a baseline frame header.
    const app0 = [0xff, 0xe0, 0x00, 0x10, ...new Array(14).fill(0)];
    const sof = [0xff, 0xff, 0xc0, 0x00, 0x11, 0x08, height >> 8, height & 0xff, width >> 8, width & 0xff, 0x03, ...new Array(9).fill(0)];
    let app1: number[] = [];
    if (orientation) {
      const le = orientation.order === 'II';
      const u16 = (n: number): number[] => (le ? [n & 0xff, n >> 8] : [n >> 8, n & 0xff]);
      const u32 = (n: number): number[] => (le ? [...u16(n & 0xffff), ...u16(n >>> 16)] : [...u16(n >>> 16), ...u16(n & 0xffff)]);
      // A TIFF header, then the first directory: a filler tag, then Orientation (0x0112, a SHORT).
      const tiff = [...[...orientation.order].map((c) => c.charCodeAt(0)), ...u16(42), ...u32(8), ...u16(2), ...u16(0x010f), ...u16(2), ...u32(1), 0, 0, 0, 0, ...u16(0x0112), ...u16(3), ...u32(1), ...u16(orientation.value), 0, 0];
      const body = [...'Exif'].map((c) => c.charCodeAt(0)).concat([0, 0], tiff);
      app1 = [0xff, 0xe1, (body.length + 2) >> 8, (body.length + 2) & 0xff, ...body];
    }
    return new Uint8Array([0xff, 0xd8, ...app0, ...app1, ...sof]);
  },
  webp(chunk: 'VP8X' | 'VP8L', width: number, height: number): Uint8Array {
    const b = new Uint8Array(32);
    const text = (at: number, s: string): void => b.set([...s].map((c) => c.charCodeAt(0)), at);
    text(0, 'RIFF');
    text(8, 'WEBP');
    text(12, chunk);
    if (chunk === 'VP8X') {
      const w = width - 1;
      const h = height - 1;
      b.set([w & 0xff, (w >> 8) & 0xff, (w >> 16) & 0xff, h & 0xff, (h >> 8) & 0xff, (h >> 16) & 0xff], 24);
    } else {
      const bits = (width - 1) | ((height - 1) << 14);
      b[20] = 0x2f;
      b.set([bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >>> 24) & 0xff], 21);
    }
    return b;
  },
  ico(sizes: number[]): Uint8Array {
    const b = new Uint8Array(6 + sizes.length * 16);
    b.set([0, 0, 1, 0, sizes.length, 0]);
    sizes.forEach((s, i) => b.set([s % 256, s % 256], 6 + i * 16));
    return b;
  },
  svg(attrs: string): Uint8Array {
    return new TextEncoder().encode(`<?xml version="1.0"?>\n<!-- a mark -->\n<svg xmlns="http://www.w3.org/2000/svg" ${attrs}><rect width="4" height="4"/></svg>`);
  },
};

describe('downloads: reading a file', () => {
  test('the size in pixels comes from the file itself, for every image type the Files list shows', () => {
    assert.deepEqual(imageSize(make.png(1512, 256), 'PNG'), { width: 1512, height: 256 });
    assert.deepEqual(imageSize(make.jpeg(2880, 1800), 'JPG'), { width: 2880, height: 1800 });
    assert.deepEqual(imageSize(make.webp('VP8X', 1080, 1350), 'WebP'), { width: 1080, height: 1350 });
    assert.deepEqual(imageSize(make.webp('VP8L', 400, 300), 'WebP'), { width: 400, height: 300 });
    // An icon holds several sizes; 0 in its directory means 256.
    assert.deepEqual(imageSize(make.ico([16, 256, 32]), 'ICO'), { width: 256, height: 256 });
  });

  test('an SVG gives its width and height, else its viewBox; lengths that depend on where it is drawn are not sizes', () => {
    assert.deepEqual(imageSize(make.svg('width="32" height="32" viewBox="0 0 64 64"'), 'SVG'), { width: 32, height: 32 });
    assert.deepEqual(imageSize(make.svg('width="148px" height="32px"'), 'SVG'), { width: 148, height: 32 });
    assert.deepEqual(imageSize(make.svg('viewBox="0 0 296 64"'), 'SVG'), { width: 296, height: 64 });
    assert.deepEqual(imageSize(make.svg('width="100%" height="2em" viewBox="0,0,48,24"'), 'SVG'), { width: 48, height: 24 });
    assert.deepEqual(imageSize(make.svg('width="96" viewBox="0 0 48 24"'), 'SVG'), { width: 96, height: 48 });
    assert.equal(imageSize(make.svg('width="100%"'), 'SVG'), null);
  });

  test('an SVG sized in physical units is the size a browser draws it, at 96 px to the inch', () => {
    // An A4 page as drawing programs save it.
    assert.deepEqual(imageSize(make.svg('width="210mm" height="297mm" viewBox="0 0 210 297"'), 'SVG'), { width: 794, height: 1123 });
    assert.deepEqual(imageSize(make.svg('width="595.28pt" height="841.89pt"'), 'SVG'), { width: 794, height: 1123 });
    assert.deepEqual(imageSize(make.svg('width="1in" height="2.54cm"'), 'SVG'), { width: 96, height: 96 });
  });

  test('a photo the camera saved turned a quarter shows its width and height swapped, as browsers draw it', () => {
    for (const order of ['II', 'MM'] as const) {
      assert.deepEqual(imageSize(make.jpeg(4032, 3024, { value: 6, order }), 'JPG'), { width: 3024, height: 4032 }, order);
      assert.deepEqual(imageSize(make.jpeg(4032, 3024, { value: 1, order }), 'JPG'), { width: 4032, height: 3024 }, order);
      assert.deepEqual(imageSize(make.jpeg(4032, 3024, { value: 3, order }), 'JPG'), { width: 4032, height: 3024 }, order);
    }
  });

  test('a file that is not the image it claims, or is cut short, has no size', () => {
    assert.equal(imageSize(make.png(10, 10).subarray(0, 20), 'PNG'), null);
    assert.equal(imageSize(make.jpeg(10, 10), 'PNG'), null);
    assert.equal(imageSize(make.png(10, 10), 'JPG'), null);
    assert.equal(imageSize(make.jpeg(10, 10).subarray(0, 12), 'JPG'), null);
    assert.equal(imageSize(make.png(0, 10), 'PNG'), null);
    assert.equal(imageSize(new Uint8Array([0, 1, 0, 0]), 'TTF'), null);
  });

  test('Files lists only images under design-system/assets/: fonts, licences and other files are not listed', () => {
    for (const p of ['design-system/assets/a.svg', 'design-system/assets/x/b.PNG', 'design-system/assets/c.jpeg', 'design-system/assets/d.webp', 'design-system/assets/e.ico']) assert.ok(isListedImage(p), p);
    for (const p of ['design-system/assets/fonts/inter.ttf', 'design-system/assets/fonts/OFL.txt', 'design-system/assets/f.woff2', 'design-system/brand/a.svg', 'screens/a.png', 'design-system/assets/noext']) assert.ok(!isListedImage(p), p);
    assert.equal(formatOf('a/b.jpeg'), formatOf('a/b.JPG'));
    assert.equal(formatOf('a/b.pdf'), 'PDF');
  });

  test('a file\'s facts come from the file: its format from its name, its size in pixels from its header, its size in bytes from its length', () => {
    const root = tempDir();
    const bytes = make.png(640, 360);
    mkdirSync(join(root, 'design-system/assets'), { recursive: true });
    writeFileSync(join(root, 'design-system/assets/cover.png'), bytes);
    assert.deepEqual(assetFile(root, 'design-system/assets/cover.png'), { path: 'design-system/assets/cover.png', format: 'PNG', width: 640, height: 360, bytes: bytes.length });
  });

  test('sizes in bytes round to whole KB, never below 1 KB, and to one decimal in MB', () => {
    assert.equal(bytesText(0), '0 KB');
    assert.equal(bytesText(158), '1 KB');
    assert.equal(bytesText(186_368), '182 KB');
    assert.equal(bytesText(1_468_006), '1.4 MB');
    assert.equal(bytesText(2 * 1024 * 1024), '2 MB');
  });
});

describe('downloads: check', () => {
  test('a repo whose pages name files that exist under design-system/assets/ passes', () => {
    assert.deepEqual(checkRepo(REPO).findings, []);
  });

  test('a named file resolves against the page; anything that is not a relative path into design-system/assets/ is outside it', () => {
    assert.equal(downloadTarget('screens/auth/login--default.html', '../../design-system/assets/exports/a.png'), 'design-system/assets/exports/a.png');
    assert.equal(downloadTarget('design-system/brand/logo.html', ' ../assets/mark.svg '), 'design-system/assets/mark.svg');
    // Percent escapes are decoded, as a browser does for a src.
    assert.equal(downloadTarget('screens/auth/login--default.html', '../../design-system/assets/my%20cover.png'), 'design-system/assets/my cover.png');
    for (const value of [
      '/design-system/assets/a.png',
      'https://example.com/a.png',
      '//example.com/a.png',
      '../../design-system/tokens.css',
      '../../design-system/assets/',
      '../../design-system/assets/a.png?v=2',
      '../../../../outside.png',
      // Escapes and backslashes that would name another path than the one checked.
      '../../design-system/assets/x%2F..%2F..%2Ftokens.css',
      '../../design-system/assets/%2e%2e/tokens.css',
      '../../design-system/assets/..\\..\\tokens.css',
      '../../design-system/assets/bad%E0%A4%A.png',
    ]) {
      assert.equal(downloadTarget('screens/auth/login--default.html', value), null, value);
    }
  });

  test('naming a folder under design-system/assets/ is outside the rule, not a missing file', () => {
    const repo = join(tempDir(), 'repo');
    cpSync(REPO, repo, { recursive: true });
    const page = 'screens/auth/login--default.html';
    const folder = namedFile(page).slice(0, namedFile(page).lastIndexOf('/'));
    writeFileSync(join(repo, page), readFileSync(join(repo, page), 'utf8').replace(/(name="design:download" content=")[^"]+/, `$1../../${folder}`));
    assert.deepEqual(checkRepo(repo).findings.map((f) => `${f.rule} ${f.path}`), [`downloads/outside-assets ${page}`]);
  });

  test('a page whose named file was removed fails, and archived pages are not held to it', () => {
    const repo = join(tempDir(), 'repo');
    cpSync(REPO, repo, { recursive: true });
    const page = 'screens/auth/login--default.html';
    const moved = `archive/2026-11-01-old/${page}`;
    cpSync(join(repo, page), join(repo, moved));
    writeFileSync(join(repo, page), readFileSync(join(repo, page), 'utf8').replace(namedFile(page).split('/').pop()!, 'gone.png'));
    const findings = checkRepo(repo).findings;
    assert.deepEqual(findings.map((f) => `${f.rule} ${f.path}`), [`downloads/missing ${page}`]);
  });
});

describe('downloads: build', () => {
  test('a page that names its file carries the file\'s facts on every frame; a page that names none carries none', () => {
    for (const page of ['screens/auth/login--default.html', 'screens/linkedin/company-cover--default.html', 'design-system/brand/logo.html']) {
      const frames = named(page);
      assert.ok(frames.length > 0, page);
      for (const c of frames) {
        assert.equal(c.download?.path, namedFile(page), `${page}@${c.viewport}`);
        assert.equal(c.download?.bytes, statSync(join(REPO, namedFile(page))).size);
      }
    }
    assert.ok(named('screens/auth/login--error.html').every((c) => c.download === undefined));
  });

  test('a frame\'s download facts are those of the file the page names, read at build time', () => {
    const repo = join(tempDir(), 'repo');
    cpSync(REPO, repo, { recursive: true });
    const page = 'screens/auth/login--default.html';
    const bytes = make.png(1280, 720);
    writeFileSync(join(repo, namedFile(page)), bytes);
    const view = viewerData(readFileSync(join(build(repo), 'index.html'), 'utf8'));
    const frames = view.board.flatMap((s) => s.lines.flatMap((l) => l.cells)).filter((c) => c.path === page);
    assert.ok(frames.length > 0);
    for (const c of frames) assert.deepEqual(c.download, { path: namedFile(page), format: 'PNG', width: 1280, height: 720, bytes: bytes.length });
  });

  test('Files holds every SVG, PNG, JPG, WebP and ICO under design-system/assets/, in path order, and nothing else', () => {
    const found: string[] = [];
    const visit = (dir: string): void => {
      for (const e of readdirSync(join(REPO, dir), { withFileTypes: true })) {
        if (e.isDirectory()) visit(`${dir}/${e.name}`);
        else if (/\.(svg|png|jpe?g|webp|ico)$/i.test(e.name)) found.push(`${dir}/${e.name}`);
      }
    };
    visit('design-system/assets');
    const paths = assets.map((a) => a.path);
    assert.deepEqual(paths, [...found].sort());
    for (const a of assets) assert.equal(a.bytes, statSync(join(REPO, a.path)).size, a.path);
  });

  test('every file a board offers is in the built site, byte for byte', () => {
    const offered = new Set([...assets.map((a) => a.path), ...cells.flatMap((c) => (c.download ? [c.download.path] : []))]);
    for (const p of offered) assert.ok(readFileSync(join(boardDir, p)).equals(readFileSync(join(REPO, p))), p);
  });

  test('a repo with no images has no Files page, card or row', () => {
    const repo = join(tempDir(), 'repo');
    cpSync(REPO, repo, { recursive: true });
    for (const page of ['screens/auth/login--default.html', 'screens/linkedin/company-cover--default.html', 'design-system/brand/logo.html']) {
      writeFileSync(join(repo, page), readFileSync(join(repo, page), 'utf8').replace(/<meta name="design:download"[^>]*>\n/, ''));
    }
    for (const a of assets) rmSync(join(repo, a.path));
    const dir = join(tempDir(), 'out');
    assert.equal(runCli(['build', repo, '--out', dir]).status, 0);
    const view = viewerData(readFileSync(join(dir, slug, 'index.html'), 'utf8'));
    const section = view.board.find((s) => s.kind === 'design-system');
    assert.ok(section);
    assert.equal(section.assets, undefined);
    assert.equal(section.filesHref, undefined);
    assert.equal(filesPage(join(dir, slug)), null);
  });

  test('the Files page lists every image the board has, each once, with Download next to it', () => {
    const page = filesPage(boardDir);
    assert.ok(page);
    assert.equal(ds?.filesHref, '_files/');
    const rows = [...page.querySelectorAll<HTMLElement>('.file-row')];
    assert.deepEqual(rows.map((r) => r.getAttribute('data-path')), listed.map((a) => a.path));
    for (const [i, row] of rows.entries()) {
      const a = listed[i] as AssetFile;
      // The Files page sits one folder down from the board.
      assert.equal(row.querySelector('img')?.getAttribute('src'), `../${a.path}`);
      const download = row.querySelector('a[download]');
      assert.equal(download?.getAttribute('href'), `../${a.path}`);
      assert.equal(download?.getAttribute('download'), a.path.split('/').pop());
      // Download is the row's last part, right after the file's name and facts.
      assert.equal(row.lastElementChild, download);
      assert.ok((row.querySelector('.file-row__facts')?.textContent ?? '').includes(a.format));
      assert.ok(!(download?.getAttribute('aria-label') ?? '').includes(' from '));
      // The file it offers is in the built site, byte for byte.
      assert.ok(readFileSync(join(boardDir, a.path)).equals(readFileSync(join(REPO, a.path))), a.path);
    }
  });

  test('the Files page has one card per folder, the top folder first, and a link to each from the top', () => {
    const page = filesPage(boardDir)!;
    const folders = [...new Set(listed.map((a) => folderOf(a.path)))];
    assert.equal(folders[0], 'design-system/assets/');
    const groups = [...page.querySelectorAll<HTMLElement>('.file-group')];
    assert.deepEqual(groups.map((g) => g.getAttribute('aria-label')), folders);
    for (const [i, g] of groups.entries()) {
      assert.deepEqual([...g.querySelectorAll('.file-row')].map((r) => r.getAttribute('data-path')), listed.filter((a) => folderOf(a.path) === folders[i]).map((a) => a.path));
    }
    const links = [...page.querySelectorAll('nav a')].map((a) => a.getAttribute('href'));
    assert.deepEqual(links, groups.map((g) => `#${g.id}`));
    assert.equal(new Set(links).size, links.length);
  });

  test('the Files page goes back to the board and loads nothing but the site', () => {
    const page = filesPage(boardDir)!;
    assert.equal(page.querySelector('a.dv-back')?.getAttribute('href'), '../');
    assert.equal(page.querySelector('script'), null);
    const csp = page.querySelector('meta[http-equiv="Content-Security-Policy"]')?.getAttribute('content') ?? '';
    assert.match(csp, /default-src 'none'/);
    for (const el of page.querySelectorAll('[src], link[href]')) assert.ok(!/^(https?:)?\/\//.test(el.getAttribute('src') ?? el.getAttribute('href') ?? ''));
  });

  test('the change\'s short name is the label up to its first colon, else "this preview"', () => {
    assert.equal(changeName('PR 12: onboarding options'), 'PR 12');
    assert.equal(changeName('PR 7'), 'PR 7');
    assert.equal(changeName(null), 'this preview');
    assert.equal(changeName(': no name'), 'this preview');
    assert.equal(changeName('A very long label without any colon in it at all'), 'this preview');
  });
});

describe('downloads: preview', () => {
  const base = join(tempDir(), 'base');
  const head = join(tempDir(), 'head');
  cpSync(REPO, base, { recursive: true });
  cpSync(REPO, head, { recursive: true });
  const changed = 'screens/auth/login--default.html';
  writeFileSync(join(head, changed), readFileSync(join(head, changed), 'utf8').replace('</h1>', ', now with a hint</h1>'));
  const dir = build(head, ['--base', base, '--label', 'PR 12: a hint under the password']);
  const preview = viewerData(readFileSync(join(dir, 'index.html'), 'utf8'));
  const board = viewerData(readFileSync(join(dir, 'board', 'index.html'), 'utf8'));

  test('the preview and the board built with it name the change; only the pull request\'s (head) frames offer a file', () => {
    assert.equal(preview.change, 'PR 12');
    assert.equal(board.change, 'PR 12');
    const pair = preview.preview?.sections.find((s) => s.kind === 'changed')?.lines.flatMap((l) => l.cells) ?? [];
    assert.ok(pair.some((c) => c.root === 'base') && pair.some((c) => c.root === 'head'));
    for (const c of pair) assert.equal(c.download !== undefined, c.root === 'head', `${c.root} ${c.viewport}`);
  });

  test('a board that is not part of a preview names no change', () => {
    assert.equal(data.change, undefined);
  });

  test('in the preview\'s board, downloads say whose file it is and point at the head copy', () => {
    const { board: b } = mount('desktop', board);
    const link = figure(b, changed, 'desktop').querySelector<HTMLAnchorElement>('a.download-link');
    assert.match(link?.textContent ?? '', /PR 12/);
    assert.equal(link?.getAttribute('href'), `../${named(changed)[0]?.download?.path}`);
  });

  test('a preview writes one Files page, linked from its board and going back to it, whose downloads say whose file it is', () => {
    const { board: b } = mount('desktop', board);
    // The board sits under board/; the Files page next to it, in the product folder.
    assert.equal(b.el.querySelector('.files-card')?.getAttribute('href'), '../_files/');
    const page = filesPage(dir);
    assert.ok(page);
    assert.equal(filesPage(join(dir, 'board')), null);
    assert.equal(page.querySelector('a.dv-back')?.getAttribute('href'), '../board/');
    const downloads = [...page.querySelectorAll('.file-row a[download]')];
    assert.equal(downloads.length, assets.length);
    for (const a of downloads) {
      assert.match(a.getAttribute('aria-label') ?? '', /PR 12/);
      assert.ok(existsSync(join(dir, '_files', a.getAttribute('href') ?? '')), a.getAttribute('href') ?? '');
    }
  });
});

describe('downloads: viewer', () => {
  test('a frame whose page names a file has Download before Copy link, linking the file under its own name', () => {
    const { board } = mount('desktop');
    const caption = figure(board, 'screens/auth/login--default.html', 'desktop').querySelector('.frame__caption')!;
    const links = caption.querySelector('.frame__links');
    assert.ok(links);
    const [download, copy] = [...links.children];
    assert.ok(download?.classList.contains('download-link'));
    assert.ok(copy?.classList.contains('copy-link'));
    const file = named('screens/auth/login--default.html')[0]!.download!;
    assert.equal(download?.getAttribute('href'), file.path);
    assert.equal(download?.getAttribute('download'), file.path.split('/').pop());
    assert.match(download?.textContent ?? '', new RegExp(file.format));
    assert.ok(!(download?.textContent ?? '').includes(' from '));
  });

  test('no file named, no button: a frame without one keeps just Copy link', () => {
    const { board } = mount('desktop');
    const caption = figure(board, 'screens/auth/login--error.html', 'desktop').querySelector('.frame__caption')!;
    assert.equal(caption.querySelector('[download]'), null);
    assert.equal(caption.querySelector('.frame__links'), null);
    assert.ok(caption.querySelector('.copy-link'));
  });

  test('a media image offers its file in the group\'s heading, not in each frame', () => {
    const { board } = mount('linkedin-company-cover');
    const group = board.el.querySelector<HTMLElement>('.dv-media')!;
    const button = group.querySelector('.media-group__head > a.media-group__download');
    const file = named('screens/linkedin/company-cover--default.html')[0]!.download!;
    assert.equal(button?.getAttribute('href'), file.path);
    assert.equal(group.querySelectorAll('[download]').length, 1);
    assert.match(button?.getAttribute('aria-label') ?? '', new RegExp(`${file.width} × ${file.height}`));
  });

  test('a Files card sits next to the Overview card, with the first four images as the Files page lists them, and opens the Files page', () => {
    for (const size of ['desktop', 'phone']) {
      const { board } = mount(size);
      const grid = board.el.querySelector('[data-kind="design-system"] .dv-grid')!;
      assert.deepEqual([...grid.children].slice(0, 2).map((el) => el.getAttribute('data-kind')), ['overview', 'files'], size);
      const card = grid.querySelector<HTMLAnchorElement>('a.files-card')!;
      assert.equal(card.getAttribute('href'), `${data.roots.head}${ds?.filesHref}`);
      const thumbs = [...card.querySelectorAll<HTMLElement>('.files-card__thumb')];
      assert.deepEqual(thumbs.map((t) => t.dataset.path), listed.slice(0, 4).map((a) => a.path));
      assert.deepEqual(thumbs.map((t) => t.querySelector('img')?.getAttribute('src')), listed.slice(0, 4).map((a) => a.path));
      assert.ok(grid.querySelector('[data-kind="files"] .copy-link'));
    }
    // The board itself lists no files.
    const { board } = mount('desktop');
    assert.equal(board.el.querySelector('.file-row, .file-list'), null);
  });

  test('a search that matches a file keeps the Files card and counts it; one that matches nothing hides it', () => {
    const { ctx, board } = mount('phone');
    const one = assets[0]!.path.split('/').pop()!;
    ctx.setFilters({ query: one });
    assert.ok(board.el.querySelector('.files-card'));
    assert.equal(board.found, board.frames + 1);
    ctx.setFilters({ query: 'nothing-is-called-this' });
    assert.equal(board.el.querySelector('.files-card'), null);
    assert.equal(board.found, 0);
  });

  test('a board without images has no Files card and no Files row', () => {
    const plain: Section[] = data.board.map((s) => ({ ...s, assets: undefined, filesHref: undefined }));
    const view = { ...data, board: plain };
    const { board } = mount('desktop', view);
    assert.equal(board.el.querySelector('.files-card'), null);
    assert.equal(sidebar(new Context(view), () => undefined).querySelector('[data-files]'), null);
  });

  test('the sidebar has a Files row under Overview that counts the images and opens the Files page', () => {
    setGlobals();
    const nav = sidebar(new Context(data), () => undefined);
    const rows = [...nav.querySelectorAll('[data-branch="design"] + .dv-tree-group > *')];
    const at = rows.findIndex((r) => r.hasAttribute('data-files'));
    assert.ok(at > 0);
    const row = rows[at]!;
    assert.equal(rows[at - 1]?.getAttribute('href'), `${data.roots.head}${ds?.overview?.href}`);
    assert.equal(row.getAttribute('href'), `${data.roots.head}${ds?.filesHref}`);
    assert.equal(Number(row.querySelector('.tree-row__count')?.textContent), assets.length);
  });

  test('the focus view offers the page\'s file before Open in a new tab, and nothing for a page without one', () => {
    const { document } = setGlobals();
    const ctx = new Context(data);
    const withFile = named('screens/auth/login--default.html')[0]!;
    let close = openFocus(ctx, withFile);
    const end = [...document.querySelector('.dv-focus .top-bar__end')!.children];
    const download = end.findIndex((el) => el.hasAttribute('download'));
    const external = end.findIndex((el) => el.getAttribute('target') === '_blank');
    assert.ok(download >= 0 && download === external - 1);
    assert.equal(end[download]?.getAttribute('href'), withFile.download?.path);
    assert.match(end[download]?.getAttribute('aria-label') ?? '', new RegExp(`${withFile.download?.width} × ${withFile.download?.height}`));
    close();
    close = openFocus(ctx, named('screens/auth/login--error.html')[0]!);
    assert.equal(document.querySelector('.dv-focus [download]'), null);
    close();
  });
});
