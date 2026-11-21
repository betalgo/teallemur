// A media page on the board (a page that names a template with design:frame):
// one group with its name, its template, its size and a key, then three
// frames. Two show the page in its template's outline, at desktop and at phone
// width, with what covers it, its safe area and what is cut off marked; the
// third is the page on its own, untouched. The outline is drawn at the page's
// CSS px size and scaled with --u, so its labels stay at reading size; the
// page sits in the image area at its upload size, scaled to fit.

import type { Cell } from '../model.ts';
import { isImageArea, placeImage, ratioText, shapeBox, type Box, type Look, type MediaTemplate, type Outline, type Placement, type Shape, type Size } from '../media/templates.ts';
import type { Context } from './context.ts';
import { h, px } from './dom.ts';
import { day } from './format.ts';
import { mediaDownload } from './downloads.ts';
import { copyButton, frameShot } from './frame.ts';
import type { FrameLoader } from './loader.ts';

type Width = 'desktop' | 'phone';

/** What covers the image is named in the middle; a small icon goes unnamed and the key says what it is. */
const COVER_NAMES: Partial<Record<string, string>> = { photo: 'Photo', logo: 'Logo' };

/** CSS px a cut part needs to hold its "Cut off: N px" label: the label's height across a top or bottom part, its width across a side. */
const LABEL_ROOM = { y: 22, x: 120 };

const pct = (n: number): string => `${Math.round(n * 10000) / 100}%`;

/** ".shape-bar.shape-bar--strong" for "bar strong", ".cover.cover--photo" for "cover photo". */
function lookClass(look: Look): string {
  const [family, kind] = look.split(' ');
  if (family === 'cover') return `cover cover--${kind}`;
  if (family === 'image') return `outline__image${kind ? ` outline__image--${kind}` : ''}`;
  return `shape-${family}${kind ? ` shape-${family}--${kind}` : ''}`;
}

function at(box: Box): Partial<Record<string, string>> {
  return { '--x': String(box.x), '--y': String(box.y), '--w': String(box.w), '--h': String(box.h) };
}

function frameData(cell: Cell): Record<string, string> {
  return { 'data-path': cell.path, 'data-viewport': cell.viewport, 'data-root': cell.root };
}

/** "<b>desktop</b> <i>· in context</i>". */
function label(name: string, detail: string): HTMLElement {
  return h('span', { class: 'frame__label' }, h('b', { text: name }), h('i', { text: ` · ${detail}` }));
}

/** The page at its upload size in `box`, scaled as if `box` were `width` px wide, and loaded lazily. */
function pageView(ctx: Context, cell: Cell, page: Size, loader: FrameLoader, box: HTMLElement, width: number, place: { left?: string; top?: string } = {}): HTMLElement {
  const view = h('div', { class: 'dv-view', style: { width: px(page.width), height: px(page.height), ...place } });
  loader.scale(box, width);
  const src = ctx.url(cell);
  loader.observe(view, () =>
    h('iframe', { class: 'dv-iframe', attrs: { src, title: cell.label, width: page.width, height: page.height, tabindex: -1, 'aria-hidden': 'true' } }),
  );
  return view;
}

/**
 * The safe area: a polygon in upload px over the image area, stretched to it
 * with a line that does not scale. Parsed from markup, as icons are, so the
 * bundle names no namespace URL; the points are template data.
 */
function safeArea(points: string, upload: Size): Element {
  const holder = document.createElement('span');
  const polygons = ['halo', 'line'].map((part) => `<polygon class="safe-area__${part}" points="${points}"/>`).join('');
  holder.innerHTML = `<svg class="safe-area" viewBox="0 0 ${upload.width} ${upload.height}" preserveAspectRatio="none" aria-hidden="true">${polygons}</svg>`;
  return holder.firstElementChild as Element;
}

/** Where the safe area's name goes: its top left corner, as a share of the image area. */
function safeCorner(points: string, upload: Size): Partial<Record<string, string>> {
  const xy = points.trim().split(/\s+/).map((p) => p.split(',').map(Number));
  const left = Math.min(...xy.map(([x]) => x ?? 0));
  const top = Math.min(...xy.map(([, y]) => y ?? 0));
  return { '--safe-left': pct(left / upload.width), '--safe-top': pct(top / upload.height) };
}

/** The image area, with the page in it; when the image is cut, the dashed lines where the cut falls. */
function imageArea(ctx: Context, cell: Cell, t: MediaTemplate, s: Shape, placed: Placement, page: Size, loader: FrameLoader): HTMLElement {
  const { area, image, cut } = placed;
  const safe = t.safe && t.upload ? { points: t.safe, upload: t.upload } : null;
  const el = h('span', {
    class: `outline__shape ${lookClass(s[1])}${cut ? ' outline__image--cut' : ''}`,
    attrs: { 'data-at': s[0] },
    style: { ...at(area), ...(safe ? safeCorner(safe.points, safe.upload) : {}) },
  });
  const place = { left: pct((image.x - area.x) / area.w), top: pct((image.y - area.y) / area.h) };
  el.append(pageView(ctx, cell, page, loader, el, (page.width * area.w) / image.w, place));
  if (safe) el.append(safeArea(safe.points, safe.upload), h('span', { class: 'mark-label mark-label--safe', text: 'Safe area' }));
  if (cut) {
    const [a, b] = cut.axis === 'y' ? ['top', 'bottom'] : ['left', 'right'];
    el.append(h('span', { class: `crop-edge crop-edge--${a}` }), h('span', { class: `crop-edge crop-edge--${b}` }));
  }
  return el;
}

/** What a feed cuts off: the whole image, faint and hatched under the image area, with how much is cut at each end. */
function cutOff(ctx: Context, cell: Cell, placed: Placement, page: Size, loader: FrameLoader): HTMLElement | null {
  const { area, image, cut } = placed;
  if (!cut) return null;
  const el = h('span', { class: 'outline__shape outline__cut', attrs: { 'data-at': 'cut' }, style: at(image) });
  // The cut box is the whole image, so the page scales with its width. As
  // `.media`, the design's faint image under the hatch.
  const view = pageView(ctx, cell, page, loader, el, page.width);
  view.classList.add('media');
  el.append(view);
  // Each label sits in the middle of its cut part, placed as a share of the
  // cut box so it holds at any scale. It shows only while the part is big
  // enough to hold it (the part is cut px × --dv-scale on screen); otherwise
  // the key names the cut, as it names a small icon.
  const text = `Cut off: ${cut.px} px`;
  const [a, b] = cut.axis === 'y' ? ['top', 'bottom'] : ['left', 'right'];
  const end = cut.axis === 'y' ? pct((area.y - image.y) / 2 / image.h) : pct((area.x - image.x) / 2 / image.w);
  const opacity = `clamp(0, (var(--dv-scale) * ${cut.px} - ${LABEL_ROOM[cut.axis]}) * 100, 1)`;
  for (const [side, place] of [[a, end], [b, `calc(100% - ${end})`]] as const) {
    el.append(h('span', { class: `mark-label mark-label--${side}`, text, style: { [cut.axis === 'y' ? 'top' : 'left']: place, opacity } }));
  }
  return el;
}

/** One of the in-context frames: the outline at desktop or phone width, with the page in it. */
function inContext(ctx: Context, cell: Cell, t: MediaTemplate, width: Width, page: Size, loader: FrameLoader): HTMLElement {
  const o: Outline = t[width];
  const placed = placeImage(t, o, page);
  const outline = h('div', {
    class: `outline${width === 'phone' ? ' outline--phone' : ''}`,
    attrs: { role: 'img', 'aria-label': `${t.name} at ${width} width, with the image in place`, 'data-outline': `${t.id}-${width}` },
    style: { '--u': `calc(100cqw / ${o.width})`, ...o.style },
  });
  for (const s of placed.shapes) {
    if (isImageArea(s)) {
      const cut = cutOff(ctx, cell, placed, page, loader);
      const area = imageArea(ctx, cell, t, s, placed, page, loader);
      // Cut at the sides, the image reaches over the columns beside the post,
      // which are drawn later: lift it over them so both cut parts show.
      if (placed.cut?.axis === 'x') for (const el of [cut, area]) el?.style.setProperty('z-index', '1');
      if (cut) outline.append(cut);
      outline.append(area);
      continue;
    }
    const [family, kind] = s[1].split(' ');
    const name = family === 'cover' ? COVER_NAMES[kind ?? ''] : undefined;
    outline.append(
      h(
        'span',
        { class: `outline__shape ${lookClass(s[1])}`, attrs: { 'data-at': s[0] }, style: at(shapeBox(s)) },
        name ? h('span', { class: 'mark-label', text: name }) : null,
      ),
    );
  }
  const shot = h(
    'div',
    {
      class: `frame__shot dv-shot${ctx.isSelected(cell) ? ' is-selected' : ''}`,
      style: { 'aspect-ratio': `${o.width} / ${placed.height}` },
      attrs: frameData(cell),
    },
    outline,
  );
  const open = h('button', { class: 'dv-frame-open', attrs: { type: 'button', 'aria-label': `Open ${cell.label} (${width}, in context)` } });
  open.addEventListener('click', () => ctx.focus(cell, open));
  shot.append(open);
  return h(
    'figure',
    { class: `frame frame--${width}`, attrs: { 'data-media-frame': width } },
    shot,
    h('figcaption', { class: 'frame__caption' }, label(width, 'in context'), copyButton(() => ctx.ref(cell, cell.viewport, `${width}, in context`))),
  );
}

/** The page on its own, untouched: no outline and no marks. */
function onItsOwn(ctx: Context, cell: Cell, page: Size, loader: FrameLoader): HTMLElement {
  let open: HTMLElement | null = null;
  const shot = frameShot(ctx, cell, loader, () => ctx.focus(cell, open ?? undefined));
  open = shot.querySelector('.dv-frame-open');
  return h(
    'figure',
    { class: 'frame frame--own dv-frame', attrs: { ...frameData(cell), 'data-media-frame': 'own' } },
    shot,
    h('figcaption', { class: 'frame__caption' }, label('on its own', `${page.width} × ${page.height}`), copyButton(() => ctx.ref(cell, cell.viewport))),
    cell.note ? h('p', { class: 'dv-note', text: cell.note }) : null,
  );
}

/**
 * The group's head: the page's title, its template, its size and when the
 * sizes were checked, then a key to the marks that apply; at the top right,
 * Download when the page names its exported file.
 */
function groupHead(ctx: Context, cell: Cell, t: MediaTemplate, page: Size, cut: Placement['cut']): HTMLElement {
  let size = `${page.width} × ${page.height}`;
  if (t.upload) size = `upload ${size}`;
  else if (cut && t.ratios) size += `, shown cut to ${(cut.axis === 'y' ? t.ratios.tallest : t.ratios.widest).join(':')}`;
  else {
    const ratio = ratioText(page.width, page.height);
    if (ratio) size += `, ${ratio}`;
  }
  const keys: [string | null, string][] = [];
  if (t.covered) keys.push(['covered', t.covered]);
  if (t.safe) keys.push(['safe', 'Safe for text and key marks']);
  if (cut) keys.push(['cut', `Cut off: ${cut.px} px ${cut.axis === 'y' ? 'top and bottom' : 'left and right'}`]);
  if (keys.length === 0 && t.whole) keys.push([null, t.whole]);
  return h(
    'div',
    { class: 'media-group__head' },
    h(
      'div',
      { class: 'media-group__title' },
      h('h3', { text: cell.title }),
      h('p', null, `${t.name} · `, h('code', { text: t.id }), ` · ${size} · sizes checked ${day(t.checked)}`),
    ),
    h('ul', { class: 'legend' }, ...keys.map(([key, text]) => h('li', { attrs: key ? { 'data-key': key } : {} }, key ? h('span', { class: `key key--${key}` }) : null, text))),
    cell.download ? mediaDownload(ctx, cell, cell.download) : null,
  );
}

/** Grid columns of a tall group: in proportion to each frame's aspect ratio, so the three heights match. */
function tallColumns(t: MediaTemplate, page: Size): string {
  const ratio = (o: Outline): number => o.width / placeImage(t, o, page).height;
  return [ratio(t.desktop), ratio(t.phone), page.width / page.height].map((r) => `minmax(0, ${Math.round(r * 10000) / 10000}fr)`).join(' ');
}

export function mediaGroup(ctx: Context, cell: Cell, t: MediaTemplate, loader: FrameLoader): HTMLElement {
  const vp = ctx.viewports.get(cell.viewport);
  const page = { width: vp?.width ?? 1, height: vp?.height ?? 1 };
  const wide = t.layout === 'wide';
  const grid = h(
    'div',
    { class: `media-grid${wide ? ' media-grid--wide' : ''}`, style: { '--media-columns': wide ? t.columns : tallColumns(t, page) } },
    inContext(ctx, cell, t, 'desktop', page, loader),
    inContext(ctx, cell, t, 'phone', page, loader),
    onItsOwn(ctx, cell, page, loader),
  );
  return h(
    'article',
    { class: 'media-group dv-media', attrs: { ...frameData(cell), 'data-frame': t.id } },
    groupHead(ctx, cell, t, page, placeImage(t, t.desktop, page).cut),
    grid,
  );
}
