import assert from 'node:assert/strict';
import { cpSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { parseHTML } from 'linkedom';
import { checkRepo } from '../src/check/index.ts';
import { TEMPLATES, isImageArea, mediaTemplate, placeImage, ratioText, shapeBox, type Shape } from '../src/media/templates.ts';
import type { Cell, Section, ViewerData } from '../src/model.ts';
import { Board } from '../src/viewer/board.ts';
import { Context } from '../src/viewer/context.ts';
import { FIXTURES, cleanup, runCli, tempDir } from './helpers.ts';

after(cleanup);

const MEDIA = join(FIXTURES, 'media');
const out = tempDir();
assert.equal(runCli(['build', MEDIA, '--out', out]).status, 0);
const html = readFileSync(join(out, 'harbor-media', 'index.html'), 'utf8');
const data = JSON.parse(/<script type="application\/json" id="dv-data">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? '') as ViewerData;
const cells = data.board.flatMap((s) => s.lines.flatMap((l) => l.cells));

const profile = mediaTemplate('linkedin-profile')!;
const company = mediaTemplate('linkedin-company')!;
const feed = mediaTemplate('linkedin-feed-post')!;

function shape(shapes: readonly Shape[], name: string): Shape {
  const s = shapes.find((x) => x[0] === name);
  assert.ok(s, name);
  return s;
}

/**
 * The media board as built: every page declares one size of its own, so the
 * board shows every page at once. `perSize` mounts it as a board of one size
 * at a time instead, showing only `viewport`.
 */
function mount(viewport: string, board: Section[] = data.board, perSize = false): { ctx: Context; board: Board; opened: Cell[] } {
  const { document, window } = parseHTML('<!doctype html><html><body></body></html>');
  Object.assign(window, { location: { href: 'http://localhost/harbor-media/' } });
  Object.assign(globalThis, {
    document,
    window,
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
    },
  });
  window.HTMLElement.prototype.scrollIntoView = function (this: HTMLElement) {
    this.dataset.scrolled = 'yes';
  };
  let active: Element | null = null;
  Object.defineProperty(document, 'activeElement', { get: () => active, configurable: true });
  window.HTMLElement.prototype.focus = function (this: HTMLElement) {
    active = this;
  };
  const ctx = new Context({ ...data, board, ownSizes: data.ownSizes === true && !perSize });
  const opened: Cell[] = [];
  ctx.focus = (cell) => opened.push(cell);
  ctx.filters = { ...ctx.filters, viewports: new Set([viewport]) };
  const b = new Board(ctx, board);
  document.body.append(b.el);
  b.render();
  return { ctx, board: b, opened };
}

const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

/** A media page's group on the board. */
function group(board: Board, path: string): HTMLElement {
  const el = board.el.querySelector<HTMLElement>(`.dv-media[data-path="${path}"]`);
  assert.ok(el, path);
  return el;
}

const PROFILE = 'screens/linkedin/profile-banner--default.html';
const COVER = 'screens/linkedin/company-cover--default.html';
const POST = 'screens/linkedin/launch-post--default.html';

describe('media templates', () => {
  test('there are the three LinkedIn templates, each with the date its sizes were checked', () => {
    assert.deepEqual(TEMPLATES.map((t) => t.id), ['linkedin-profile', 'linkedin-company', 'linkedin-feed-post']);
    for (const t of TEMPLATES) assert.equal(t.checked, '2026-10-25', t.id);
    assert.equal(mediaTemplate('linkedin-banner'), null);
    assert.equal(mediaTemplate(undefined), null);
  });

  test('every outline has one image area, and fixed sizes keep the upload\'s proportions in it', () => {
    for (const t of TEMPLATES) {
      for (const o of [t.desktop, t.phone]) {
        const areas = o.shapes.filter(isImageArea);
        assert.equal(areas.length, 1, t.id);
        assert.equal(new Set(o.shapes.map((s) => s[0])).size, o.shapes.length, `${t.id}: shape names are unique`);
        if (!t.upload) continue;
        const area = shapeBox(areas[0]!);
        const ratio = area.w / area.h / (t.upload.width / t.upload.height);
        assert.ok(Math.abs(ratio - 1) < 0.005, `${t.id} ${o.width}: image area ${area.w} × ${area.h}`);
      }
    }
  });

  test('safe areas sit inside the upload, and what covers the image is named in the key', () => {
    for (const t of [profile, company]) {
      assert.ok(t.safe && t.upload && t.covered);
      for (const point of t.safe.split(' ')) {
        const [x, y] = point.split(',').map(Number);
        assert.ok(x! >= 0 && x! <= t.upload.width && y! >= 0 && y! <= t.upload.height, `${t.id} ${point}`);
      }
    }
    // The numbers the designer chose where the ticket gave none.
    assert.match(profile.safe!, /1544,40/);
    assert.equal(company.safe, '430,28 1472,28 1472,128 1300,128 1300,200 430,200');
    assert.deepEqual(shape(profile.phone.shapes, 'gear').slice(1), ['cover icon', 346, 58, 32, 32]);
    assert.equal(feed.safe, undefined);
  });

  test('an image at the upload size fills the image area untouched', () => {
    const placed = placeImage(profile, profile.desktop, { width: 1584, height: 396 });
    assert.deepEqual(placed.area, { x: 26, y: 76, w: 792, h: 198 });
    assert.deepEqual(placed.image, placed.area);
    assert.equal(placed.cut, null);
    assert.equal(placed.height, 560);
    assert.deepEqual(placed.shapes, profile.desktop.shapes);
  });

  test('an image of other proportions covers a fixed image area from the centre', () => {
    const placed = placeImage(profile, profile.desktop, { width: 1500, height: 500 });
    assert.equal(placed.cut, null);
    assert.equal(placed.image.w, 792);
    assert.equal(placed.image.h, 264);
    assert.equal(placed.image.y, 76 - 33);
  });

  test('a feed image taller than 4:5 is centred on the 4:5 area and cut above and below', () => {
    const placed = placeImage(feed, feed.desktop, { width: 1080, height: 1920 });
    assert.deepEqual(placed.cut, { axis: 'y', px: 285 });
    assert.equal(placed.area.h, 693.75);
    assert.equal(placed.image.w, 555);
    assert.ok(Math.abs(placed.image.y + placed.image.h / 2 - (placed.area.y + placed.area.h / 2)) < 0.01);
    assert.deepEqual(placeImage(feed, feed.phone, { width: 1080, height: 1920 }).cut, { axis: 'y', px: 285 });
  });

  test('a feed image wider than 3:1 is cut at the sides', () => {
    const placed = placeImage(feed, feed.phone, { width: 1600, height: 400 });
    assert.deepEqual(placed.cut, { axis: 'x', px: 200 });
    assert.equal(placed.area.h, 130);
    assert.equal(placed.image.h, 130);
    assert.equal(placed.image.x, -65);
  });

  test('a feed image between 3:1 and 4:5 shows whole, moving what is below it', () => {
    const placed = placeImage(feed, feed.desktop, { width: 1080, height: 1080 });
    assert.equal(placed.cut, null);
    assert.deepEqual(placed.area, { x: 152, y: 196, w: 555, h: 555 });
    assert.equal(placed.height, 1000 - 139);
    assert.equal(shape(placed.shapes, 'reaction-1')[3], 902 - 139);
    assert.equal(shape(placed.shapes, 'post')[5], 904 - 139);
    assert.deepEqual(shape(placed.shapes, 'right-card-2'), shape(feed.desktop.shapes, 'right-card-2'));
    assert.deepEqual(shape(placed.shapes, 'post-line-2'), shape(feed.desktop.shapes, 'post-line-2'));
  });

  test('ratios read as words only when they are short', () => {
    assert.equal(ratioText(1080, 1350), '4:5');
    assert.equal(ratioText(1080, 1080), '1:1');
    assert.equal(ratioText(1200, 627), null);
  });
});

describe('media pages', () => {
  test('a page naming a fixed-size template fails the check when it is shown at another size', () => {
    const repo = join(tempDir(), 'media');
    cpSync(MEDIA, repo, { recursive: true });
    const page = join(repo, 'screens/linkedin/profile-banner--default.html');
    writeFileSync(page, readFileSync(page, 'utf8').replace(/<meta name="design:viewports"[^>]*>\n/, ''));
    const findings = checkRepo(repo).findings;
    assert.deepEqual(findings.map((f) => [f.rule, f.path]), [['frames/size', 'screens/linkedin/profile-banner--default.html']]);
    assert.match(findings[0]!.message, /linkedin-company-cover \(1512 × 256\)/);
    assert.doesNotMatch(findings[0]!.message, /linkedin-profile-banner/);
    // A feed image may be any size.
    rmSync(page);
    const feedPage = join(repo, 'screens/linkedin/launch-post--default.html');
    writeFileSync(feedPage, readFileSync(feedPage, 'utf8').replace(/<meta name="design:viewports"[^>]*>\n/, ''));
    assert.deepEqual(checkRepo(repo).findings, []);
  });

  test('the media fixture passes the check, and pages carry the template they name', () => {
    assert.deepEqual(checkRepo(MEDIA).findings, []);
    const frames = Object.fromEntries(cells.map((c) => [c.path.replace('screens/linkedin/', ''), c.frame ?? null]));
    assert.equal(frames['profile-banner--default.html'], 'linkedin-profile');
    assert.equal(frames['launch-post--tall.html'], 'linkedin-feed-post');
    assert.equal(frames['company-logo--default.html'], null);
  });

  test('a profile banner shows as one group: the head, then desktop and phone in context and the page on its own', () => {
    const { board } = mount('linkedin-profile-banner', data.board, true);
    const groups = board.el.querySelectorAll('.dv-media');
    assert.equal(groups.length, 1);
    const group = groups[0]!;
    assert.equal(group.getAttribute('data-frame'), 'linkedin-profile');
    assert.equal(text(group.querySelector('h3')), 'Profile banner');
    assert.equal(text(group.querySelector('.media-group__title p')), 'LinkedIn profile · linkedin-profile · upload 1584 × 396 · sizes checked 25 Oct 2026');
    assert.deepEqual([...group.querySelectorAll('.legend li')].map((li) => li.getAttribute('data-key')), ['covered', 'safe']);
    const figures = [...group.querySelectorAll('.media-grid > figure')];
    assert.deepEqual(figures.map((f) => text(f.querySelector('.frame__label'))), ['desktop · in context', 'phone · in context', 'on its own · 1584 × 396']);
    assert.ok(figures.every((f) => f.querySelector('.copy-link')));
    const grid = group.querySelector<HTMLElement>('.media-grid')!;
    assert.ok(grid.classList.contains('media-grid--wide'));
    assert.equal(grid.style.getPropertyValue('--media-columns'), '332px minmax(0, 1fr)');
    // One frame per page, as for screens.
    assert.equal(board.frames, 1);
    assert.equal(board.el.querySelectorAll('figure.dv-frame').length, 1);
    const section = group.closest('section')!;
    assert.equal(text(section.querySelector('.section-head__meta')), '1 image');
    assert.equal(text(section.querySelector('.section-head__aside')), 'In context and on its own');
  });

  test('the outline marks the photo and the safe area in upload px; the page on its own is untouched', () => {
    const { board } = mount('linkedin-profile-banner');
    const [desktop, phone, own] = [...group(board, PROFILE).querySelectorAll<HTMLElement>('.media-grid > figure')];
    for (const f of [desktop!, phone!]) {
      assert.equal(f.querySelector('.outline [data-at="photo"] .mark-label')?.textContent, 'Photo');
      const svg = f.querySelector('.outline__image svg.safe-area')!;
      assert.equal(svg.getAttribute('viewBox'), '0 0 1584 396');
      assert.equal(svg.getAttribute('preserveAspectRatio'), 'none');
      assert.equal(svg.querySelector('.safe-area__line')?.getAttribute('points'), profile.safe);
      assert.ok(f.querySelector('.outline__image .mark-label--safe'));
      assert.ok(f.querySelector('.outline__image .dv-view'));
    }
    assert.ok(phone!.querySelector('.outline--phone [data-at="gear"].cover--icon'));
    assert.equal(phone!.querySelector('[data-at="gear"] .mark-label'), null);
    assert.equal(desktop!.querySelector<HTMLElement>('.outline')!.style.getPropertyValue('--u'), 'calc(100cqw / 1180)');
    assert.equal(desktop!.querySelector<HTMLElement>('[data-at="image"]')!.style.getPropertyValue('--safe-left'), '39.14%');
    assert.equal(own!.querySelector('.outline, .safe-area, .mark-label, .cover'), null);
    assert.ok(own!.querySelector('.dv-view'));
  });

  test('a company cover marks the logo, with rounder corners on the phone', () => {
    const { board } = mount('linkedin-company-cover');
    const cover = group(board, COVER);
    assert.match(text(cover.querySelector('.media-group__title p')), /^LinkedIn company page · linkedin-company · upload 1512 × 256 ·/);
    assert.equal(text(cover.querySelector('.legend li')), 'Covered by the logo');
    assert.equal(cover.querySelector<HTMLElement>('.outline--phone')?.style.getPropertyValue('--logo-radius'), 'var(--outline-radius-logo-phone)');
    assert.equal(cover.querySelectorAll('[data-at="logo"] .mark-label').length, 2);
  });

  test('a feed image sits in one row in proportion, with nothing marked when it shows whole', () => {
    const { board } = mount('linkedin-feed-post');
    const post = group(board, POST);
    assert.match(text(post.querySelector('.media-group__title p')), /· 1080 × 1350, 4:5 · sizes checked 25 Oct 2026$/);
    assert.deepEqual([...post.querySelectorAll('.legend li')].map(text), ['Nothing covers a feed image. From 3:1 to 4:5 it shows whole.']);
    assert.equal(post.querySelector('.legend .key'), null);
    const grid = post.querySelector<HTMLElement>('.media-grid')!;
    assert.equal(grid.classList.contains('media-grid--wide'), false);
    const size = { width: 1080, height: 1350 };
    const fr = [feed.desktop, feed.phone].map((o) => Math.round((o.width / placeImage(feed, o, size).height) * 10000) / 10000);
    assert.equal(grid.style.getPropertyValue('--media-columns'), `minmax(0, ${fr[0]}fr) minmax(0, ${fr[1]}fr) minmax(0, 0.8fr)`);
    assert.equal(post.querySelector('.outline__cut, .crop-edge, .safe-area'), null);
  });

  test('a feed image taller than 4:5 shows what is cut off, faint beyond the image, in the key and on the drawing', () => {
    const { board } = mount('linkedin-feed-post-tall');
    const tall = group(board, 'screens/linkedin/launch-post--tall.html');
    assert.match(text(tall.querySelector('.media-group__title p')), /· 1080 × 1920, shown cut to 4:5 ·/);
    assert.deepEqual([...tall.querySelectorAll('.legend li')].map((li) => [li.getAttribute('data-key'), text(li)]), [['cut', 'Cut off: 285 px top and bottom']]);
    for (const f of [...tall.querySelectorAll('.media-grid > figure')].slice(0, 2)) {
      const cut = f.querySelector('.outline__cut')!;
      assert.ok(cut.querySelector('.dv-view.media'));
      assert.deepEqual([...cut.querySelectorAll('.mark-label')].map((l) => [l.className, l.textContent]), [
        ['mark-label mark-label--top', 'Cut off: 285 px'],
        ['mark-label mark-label--bottom', 'Cut off: 285 px'],
      ]);
      // The cut part comes right before the image area, so the image covers its middle.
      assert.equal(cut.nextElementSibling?.getAttribute('data-at'), 'image');
      // As drawn in the design, the post's later shapes stay over a top and bottom cut.
      assert.equal((cut as HTMLElement).style.getPropertyValue('z-index'), '');
      assert.deepEqual([...f.querySelectorAll('.outline__image--cut .crop-edge')].map((e) => e.className), ['crop-edge crop-edge--top', 'crop-edge crop-edge--bottom']);
    }
  });

  test('a feed image wider than 3:1 is cut at the sides', () => {
    const { board } = mount('linkedin-feed-post-wide');
    const wide = group(board, 'screens/linkedin/launch-post--wide.html');
    assert.equal(text(wide.querySelector('.legend li')), 'Cut off: 200 px left and right');
    assert.deepEqual([...wide.querySelectorAll('[data-media-frame="desktop"] .crop-edge')].map((e) => e.className), ['crop-edge crop-edge--left', 'crop-edge crop-edge--right']);
    assert.ok(wide.querySelector('[data-media-frame="desktop"] .outline__cut .mark-label--left'));
    // Over the columns beside the post, which are drawn after it.
    for (const at of ['cut', 'image']) assert.equal(wide.querySelector<HTMLElement>(`[data-media-frame="desktop"] [data-at="${at}"]`)?.style.getPropertyValue('z-index'), '1');
  });

  test('each frame opens the page in the focus view and copies a link that names it', () => {
    const { ctx, board, opened } = mount('linkedin-profile-banner');
    const cell = cells.find((c) => c.frame === 'linkedin-profile')!;
    for (const button of group(board, PROFILE).querySelectorAll<HTMLButtonElement>('.dv-frame-open')) button.click();
    assert.equal(opened.length, 3);
    assert.ok(opened.every((c) => c.path === cell.path && c.viewport === cell.viewport));
    assert.match(ctx.ref(cell, cell.viewport, 'desktop, in context'), /^harbor-media screens\/linkedin\/profile-banner--default\.html @ linkedin-profile-banner · desktop, in context\nhttp/);
    assert.match(ctx.ref(cell, cell.viewport), /^harbor-media screens\/linkedin\/profile-banner--default\.html @ linkedin-profile-banner\nhttp/);
  });

  test('revealing a media page scrolls to its group and rings its frames', () => {
    const { board } = mount('linkedin-company-cover');
    const cell = cells.find((c) => c.frame === 'linkedin-profile')!;
    board.jump(cell);
    const shown = group(board, cell.path);
    assert.equal(shown.dataset.scrolled, 'yes');
    assert.equal(shown.querySelectorAll('.dv-shot.is-selected').length, 3);
    assert.equal(board.el.querySelectorAll('.dv-shot.is-selected').length, 3);
  });

  test('coming back from the focus view keeps focus on the frame that opened it', () => {
    const { board } = mount('linkedin-profile-banner');
    const cell = cells.find((c) => c.frame === 'linkedin-profile')!;
    const phone = group(board, cell.path).querySelector<HTMLElement>('[data-media-frame="phone"] .dv-frame-open')!;
    phone.focus();
    board.jump(cell);
    assert.equal(document.activeElement, phone);
    // Revealed from elsewhere (the sidebar), the page's own frame takes focus.
    (document.body as HTMLElement).focus();
    board.jump(cell);
    assert.equal(document.activeElement, group(board, cell.path).querySelector('[data-media-frame="own"] .dv-frame-open'));
  });

  test('in a flow with screens too, frames stay in grids and each media page gets its own group', () => {
    const vp = 'linkedin-profile-banner';
    const media = cells.find((c) => c.viewport === vp)!;
    const plain: Cell = { ...media, path: 'screens/linkedin/banner-notes--default.html', label: 'linkedin / banner-notes / default · linkedin-profile-banner' };
    delete plain.frame;
    const board = data.board.map((s) => (s.kind === 'flow' ? { ...s, lines: [{ cells: [plain] }, ...s.lines] } : s));
    const { board: b } = mount(vp, board, true);
    const section = b.el.querySelector('section[data-kind="flow"]')!;
    assert.deepEqual([...section.children].map((el) => el.className.split(' ').pop()), ['section-head', 'dv-grid', 'dv-media']);
    assert.equal(text(section.querySelector('.section-head__meta')), '1 screen · 1 state · 1 image');
    assert.equal(b.frames, 2);
  });
});
