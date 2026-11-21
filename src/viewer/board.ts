// The board: the wall the frames hang on, one size at a time, or on a board
// of own sizes (every screen page declares one size of its own) every page
// at once, each at its own size. Open pull requests, when the build was given
// them, sit in a strip at the top; then the design system (the Overview and
// Files cards, brand pages, components), then the flows, where a media page
// shows as a group in its template (media.ts); open options wait in dashed
// cards and the archive is closed at the end.

import type { Cell, FileLink, Line, Section } from '../model.ts';
import { mediaTemplate } from '../media/templates.ts';
import type { Context } from './context.ts';
import { h, icon, onWidthChange, px } from './dom.ts';
import { matchesQuery, ownSize } from './filters.ts';
import { filesCard } from './downloads.ts';
import { copyButton } from './frame.ts';
import { count, humanize, prNumber, sizeText } from './format.ts';
import { frameElement, frameLabel } from './frame.ts';
import { minColumn } from './layout.ts';
import { FrameLoader } from './loader.ts';
import { mediaGroup } from './media.ts';

export const PHONE_QUERY = '(max-width: 767px)';

/** Frames of a section's lines that pass the filters, line by line. */
export function visibleLines(ctx: Context, s: Section): Line[] {
  return s.lines
    .map((l) => {
      const line: Line = { cells: l.cells.filter((c) => ctx.viewports.has(c.viewport) && ctx.visible(c)) };
      if (l.heading) line.heading = l.heading;
      return line;
    })
    .filter((l) => l.cells.length > 0);
}

export class Board {
  private readonly ctx: Context;
  private readonly sections: Section[];
  readonly el: HTMLElement;
  private loader: FrameLoader;
  private shown = 0;
  private cardsShown = 0;
  private archiveOpen = false;

  constructor(ctx: Context, sections: Section[]) {
    this.ctx = ctx;
    this.sections = sections;
    this.el = h('main', { class: 'dv-wall', attrs: { id: 'dv-wall', tabindex: -1 } });
    this.loader = new FrameLoader(this.el, '50% 0px');
    ctx.onFilters(() => this.render());
    ctx.onSelect(() => this.markSelected());
    onWidthChange(() => this.loader.refreshSoon());
  }

  /** Number of frames shown. */
  get frames(): number {
    return this.shown;
  }

  /** What the search found: frames, and the Files card when the search matches it. */
  get found(): number {
    return this.shown + this.cardsShown;
  }

  /**
   * Shows a frame: switches to its size, clears the search, opens the archive
   * if needed. On a board of own sizes the page's frame at its own size stands
   * in for its other sizes.
   */
  jump(target: Cell): void {
    const cell = this.ctx.ownSizes ? this.ownFrame(target) : target;
    const inArchive = this.sections.some((s) => s.kind === 'archive' && s.lines.some((l) => l.cells.some((c) => c.path === cell.path)));
    if (inArchive) this.archiveOpen = true;
    this.ctx.select(cell);
    if ((!this.ctx.ownSizes && this.ctx.size !== cell.viewport) || this.ctx.filters.query) {
      this.ctx.setFilters(this.ctx.ownSizes ? { query: '' } : { query: '', viewports: new Set([cell.viewport]) });
    } else if (inArchive) {
      this.render();
    }
    const figure = [...this.el.querySelectorAll<HTMLElement>('.dv-frame')].find(
      (el) => el.dataset.path === cell.path && el.dataset.viewport === cell.viewport && el.dataset.root === cell.root,
    );
    if (!figure) return;
    const group = figure.closest<HTMLElement>('.dv-media');
    (group ?? figure).scrollIntoView({ block: group ? 'start' : 'center', inline: 'nearest' });
    // A media page has three frames: keep focus on the one it came back to.
    if (group?.contains(document.activeElement)) return;
    figure.querySelector<HTMLElement>('.dv-frame-open')?.focus({ preventScroll: true });
  }

  /** The frame a board of own sizes shows for a page: the same page and copy at its own size. */
  private ownFrame(cell: Cell): Cell {
    if (cell.viewport === ownSize(cell)) return cell;
    for (const s of this.sections) {
      for (const l of s.lines) {
        const own = l.cells.find((c) => c.path === cell.path && c.root === cell.root && c.viewport === ownSize(c));
        if (own) return own;
      }
    }
    return cell;
  }

  render(): void {
    const top = this.el.scrollTop;
    this.loader.clear();
    this.el.replaceChildren();
    this.shown = 0;
    this.cardsShown = 0;
    const size = this.ctx.ownSizes ? undefined : this.ctx.viewports.get(this.ctx.size);
    if (size) this.el.style.setProperty('--dv-min', px(minColumn(size.width)));

    const strip = reviewStrip(this.ctx);
    if (strip) this.el.append(strip);
    let options: HTMLElement | null = null;
    let questions = 0;
    for (const s of this.sections) {
      if (s.kind === 'exploration') {
        const set = this.optionSet(s);
        if (!set) continue;
        if (!options) {
          options = h('section', { class: 'dv-section', attrs: { 'data-kind': 'exploration', id: 'dv-options' } });
          this.el.append(options);
        }
        options.append(set);
        questions++;
        continue;
      }
      const el = s.kind === 'archive' ? this.archive(s) : s.kind === 'design-system' ? this.designSystem(s) : this.section(s);
      if (el) this.el.append(el);
    }
    if (options) {
      const waiting = h('span', { class: 'tag tag--strong' }, icon('clock'), 'Waiting for a pick');
      options.prepend(this.head('Open options', count(questions, 'question'), 'explorations/', [waiting]));
    }
    if (this.el.childElementCount === (strip ? 1 : 0)) {
      this.el.append(h('p', { class: 'dv-empty', text: this.ctx.filters.query ? 'No frames match the search.' : 'Nothing is drawn at this size.' }));
    }
    this.el.scrollTop = top;
  }

  private markSelected(): void {
    for (const el of this.el.querySelectorAll('.dv-shot.is-selected')) el.classList.remove('is-selected');
    const s = this.ctx.selected;
    if (!s) return;
    for (const el of this.el.querySelectorAll<HTMLElement>('.dv-shot')) {
      if (el.dataset.path === s.path && el.dataset.viewport === s.viewport && el.dataset.root === s.root) el.classList.add('is-selected');
    }
  }

  private head(title: string, meta: string, aside: string, extra: (Node | null)[] = []): HTMLElement {
    return h(
      'div',
      { class: 'section-head' },
      h('h2', { text: title }),
      ...extra,
      meta ? h('span', { class: 'section-head__meta', text: meta }) : null,
      aside ? h('span', { class: 'section-head__aside', text: aside }) : null,
    );
  }

  private sizeAside(): string {
    if (this.ctx.ownSizes) return 'Each at its own size';
    const vp = this.ctx.viewports.get(this.ctx.size);
    return vp ? sizeText(vp) : '';
  }

  private grid(cells: Cell[], above?: (cell: Cell) => HTMLElement | null): HTMLElement {
    const grid = h('div', { class: 'frame-grid dv-grid' });
    if (this.ctx.ownSizes) {
      // Each frame at its own size: columns wide enough for the widest of them.
      const widest = Math.max(0, ...cells.map((c) => this.ctx.viewports.get(c.viewport)?.width ?? 0));
      if (widest > 0) grid.style.setProperty('--dv-min', px(minColumn(widest)));
    }
    for (const c of cells) {
      grid.append(frameElement(this.ctx, c, this.loader, { above: above?.(c) ?? null }));
      this.shown++;
    }
    return grid;
  }

  private section(s: Section): HTMLElement | null {
    const cells = visibleLines(this.ctx, s).flatMap((l) => l.cells);
    if (cells.length === 0) return null;
    let meta = '';
    let aside = this.sizeAside();
    if (s.kind === 'flow') {
      const plain = cells.filter((c) => !mediaTemplate(c.frame));
      const images = cells.length - plain.length;
      const screens = new Set(plain.map((c) => c.path.replace(/--[^/]*$/, '')));
      const states = new Set(plain.map((c) => c.path));
      meta = [plain.length > 0 ? `${count(screens.size, 'screen')} · ${count(states.size, 'state')}` : '', images > 0 ? count(images, 'image') : ''].filter(Boolean).join(' · ');
      if (plain.length === 0 && !this.ctx.ownSizes) aside = 'In context and on its own';
    } else if (s.kind === 'components') meta = count(cells.length, 'component');
    else meta = count(cells.length, 'page');
    return h(
      'section',
      { class: 'dv-section', attrs: { 'data-kind': s.kind, id: `dv-${s.id}` } },
      this.head(s.title, meta, aside),
      ...this.framesAndGroups(cells),
    );
  }

  /** Frames in grids, and each media page in a group of its own, in board order. */
  private framesAndGroups(cells: Cell[]): HTMLElement[] {
    const out: HTMLElement[] = [];
    let run: Cell[] = [];
    const flush = (): void => {
      if (run.length > 0) out.push(this.grid(run));
      run = [];
    };
    for (const c of cells) {
      const template = mediaTemplate(c.frame);
      if (!template) {
        run.push(c);
        continue;
      }
      flush();
      out.push(mediaGroup(this.ctx, c, template, this.loader));
      this.shown++;
    }
    flush();
    return out;
  }

  private designSystem(s: Section): HTMLElement | null {
    const cells = visibleLines(this.ctx, s).flatMap((l) => l.cells);
    const query = this.ctx.filters.query;
    const card = s.overview && matchesQuery('design system overview tokens colours colors type fonts', query) ? this.overviewCard(s) : null;
    // The Files card is not drawn at a size: it shows while the search matches it or one of its files' paths.
    const assets = s.assets ?? [];
    const shown = !!s.filesHref && assets.length > 0 && (matchesQuery('design system files images downloads', query) || assets.some((f) => this.ctx.fileVisible(f.path)));
    const files = shown && s.filesHref ? filesCard(this.ctx, s.filesHref, assets, this.cardSize()) : null;
    if (files && query.trim()) this.cardsShown++;
    if (cells.length === 0 && !card && !files) return null;
    const brand = cells.filter((c) => c.path.startsWith('design-system/brand/')).length;
    const components = cells.length - brand;
    const meta = [card ? 'Overview' : '', files ? count(assets.length, 'file') : '', brand ? count(brand, 'brand page') : '', components ? count(components, 'component') : ''].filter(Boolean).join(' · ');
    const grid = this.grid(cells);
    grid.prepend(...[card, files].filter((el): el is HTMLElement => el !== null));
    return h('section', { class: 'dv-section', attrs: { 'data-kind': s.kind, id: `dv-${s.id}` } }, this.head(s.title, meta, this.sizeAside()), grid);
  }

  /** The cards' proportions: the size shown, so the grid stays even; on a board of own sizes, the cards' own. */
  private cardSize(): { width: number; height: number } | undefined {
    return this.ctx.ownSizes ? undefined : this.ctx.viewports.get(this.ctx.size);
  }

  /** The overview card: the product's colours and fonts, opening the overview page. */
  private overviewCard(s: Section): HTMLElement | null {
    const o = s.overview;
    if (!o) return null;
    const href = `${this.ctx.data.roots.head}${o.href}`;
    const size = this.cardSize();
    const meta = [count(o.tokens, 'token'), count(o.colours, 'colour'), count(o.fontStacks.length, 'font')].filter((t) => !t.startsWith('0 ')).join(' · ');
    return h(
      'figure',
      { class: 'frame dv-overview', attrs: { 'data-kind': 'overview' } },
      h(
        'a',
        { class: 'overview-card', attrs: { href, 'aria-label': 'Open the design system overview' }, style: size ? { 'aspect-ratio': `${size.width} / ${size.height}` } : {} },
        h('span', { class: 'overview-card__palette', attrs: { 'aria-hidden': 'true' } }, ...o.palette.map((c) => h('i', { style: { background: c } }))),
        h(
          'span',
          { class: 'overview-card__body' },
          h('span', { class: 'overview-card__title', text: 'Overview' }),
          h('span', { class: 'overview-card__meta', text: meta }),
          o.fontStacks.length > 0
            ? h('span', { class: 'overview-card__fonts', attrs: { 'aria-hidden': 'true' } }, ...o.fontStacks.slice(0, 2).map((f) => h('span', { text: 'Aa', style: { 'font-family': f } })))
            : null,
        ),
      ),
      h(
        'figcaption',
        { class: 'frame__caption' },
        h('span', { class: 'frame__label' }, 'design-system / ', h('b', { text: 'overview' })),
        copyButton(() => `${this.ctx.data.product.slug} design-system/tokens.css (overview)\n${new URL(href, window.location.href).href}`),
      ),
    );
  }

  private optionSet(s: Section): HTMLElement | null {
    const lines = visibleLines(this.ctx, s);
    if (lines.length === 0) return null;
    return optionSet(this.ctx, s, lines, (cells, above) => this.grid(cells, above));
  }

  private archive(s: Section): HTMLElement | null {
    const cells = visibleLines(this.ctx, s).flatMap((l) => l.cells);
    const files = (s.files ?? []).filter((f) => this.ctx.fileVisible(f.path));
    if (cells.length === 0 && files.length === 0) return null;
    const pages = new Set(cells.map((c) => c.path)).size;
    const details = h(
      'details',
      { class: 'collapsed dv-archive', attrs: { 'data-kind': 'archive', id: 'dv-archive', open: this.archiveOpen } },
      h(
        'summary',
        null,
        icon('collapsed'),
        h('h2', null, `${s.title} `, h('span', { text: `(${pages || files.length})` })),
        h('p', { text: pages > 0 ? `${count(pages, 'screen')} kept from earlier work` : `${count(files.length, 'file')} kept from earlier work` }),
      ),
    );
    details.addEventListener('toggle', () => {
      this.archiveOpen = details.open;
      this.loader.refreshSoon();
    });
    const body = h('div', { class: 'collapsed__body dv-archive__body' });
    if (cells.length > 0) body.append(this.grid(cells));
    if (files.length > 0) body.append(fileList(this.ctx, files));
    details.append(body);
    return details;
  }
}


/** Only http(s) links leave the board; anything else in the data is not a link. */
const WEB_URL = /^https?:\/\//i;

/** The product's open pull requests: the count in a waiting tag, then a link to each preview (or the pull request, before it has one). */
export function reviewStrip(ctx: Context): HTMLElement | null {
  const links = (ctx.data.reviews ?? []).flatMap((r) => {
    const preview = typeof r.previewUrl === 'string' && WEB_URL.test(r.previewUrl);
    const href = preview ? r.previewUrl : WEB_URL.test(r.url) ? r.url : null;
    return href ? [{ r, href, preview }] : [];
  });
  if (links.length === 0) return null;
  return h(
    'aside',
    { class: 'review-strip dv-reviews', attrs: { 'aria-label': 'Waiting for review', 'data-reviews': links.length } },
    h('span', { class: 'tag tag--strong' }, icon('clock'), `${links.length} waiting for review`),
    h(
      'ul',
      { class: 'review-strip__list' },
      ...links.map(({ r, href, preview }) => {
        const number = prNumber(r.number);
        return h(
          'li',
          null,
          h(
            'a',
            {
              class: 'review-strip__link',
              attrs: {
                href,
                target: '_blank',
                rel: 'noopener noreferrer',
                'data-link': preview ? 'preview' : 'pull-request',
                title: `${number}: ${r.title}`,
                'aria-label': `${preview ? 'Preview' : 'Pull request'}: ${number}, ${r.title} (opens in a new tab)`,
              },
            },
            h('b', { text: number }),
            h('span', { text: r.title }),
            icon('external'),
          ),
        );
      }),
    ),
  );
}

/** One exploration waiting for a pick: its question, how long it has waited, and its options side by side. */
export function optionSet(ctx: Context, s: Section, lines: Line[], grid: (cells: Cell[], above: (cell: Cell) => HTMLElement | null) => HTMLElement): HTMLElement {
  const info = s.exploration;
  const topic = humanize((s.title || '').replace(/^\d{4}-\d{2}-\d{2}-?/, '')) || s.title;
  const options = info?.options ?? [];
  const metaParts: (Node | string)[] = [];
  const since = info?.since ? sinceText(info.since) : null;
  if (since) metaParts.push(`Waiting since ${since} · `);
  metaParts.push(count(options.length || new Set(lines.flatMap((l) => l.cells.map((c) => c.col))).size, 'option'));
  if (s.readme) {
    metaParts.push(' · ', h('a', { class: 'dv-quiet-link', text: 'Notes', attrs: { href: ctx.url({ path: s.readme, root: 'head' }), target: '_blank', rel: 'noopener' } }));
  }
  const label = (cell: Cell): HTMLElement => {
    const option = options.find((o) => o.id === cell.col);
    const letter = (cell.col || '?').toUpperCase();
    const words = h('span', null, h('b', { text: option?.title ?? `Option ${letter}` }));
    if (option?.text) words.append(`${/^[a-z]/.test(option.text) ? ', ' : '. '}${option.text}`);
    return h('p', { class: 'option__label' }, h('span', { class: 'option__letter', text: letter }), words);
  };
  const set = h(
    'article',
    { class: 'option-set', attrs: { 'data-exploration': s.title } },
    h('div', { class: 'option-set__head' }, h('h3', { class: 'option-set__question', text: info?.question ?? topic }), h('p', { class: 'option-set__meta' }, ...metaParts)),
  );
  for (const l of lines) {
    if (lines.length > 1 && l.heading) set.append(h('h4', { class: 'dv-line-heading frame__label', text: l.heading.replace(/^screens\//, '').replace(/\.html?$/i, '') }));
    set.append(grid(l.cells, label));
  }
  return set;
}

/** "14 Oct" from "2026-10-14". */
function sinceText(date: string): string | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!m) return null;
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  return `${Number(m[3])} ${months[Number(m[2]) - 1] ?? m[2]}`;
}

export function fileList(ctx: Context, files: FileLink[]): HTMLElement {
  return h(
    'ul',
    { class: 'dv-files' },
    ...files.map((f) => h('li', null, h('a', { class: 'frame__label', attrs: { href: ctx.url(f), target: '_blank', rel: 'noopener' } }, ...pathParts(f.path)))),
  );
}

/** A path with its file name in bold, for labels. */
export function pathParts(path: string): (Node | string)[] {
  const i = path.lastIndexOf('/');
  return [path.slice(0, i + 1), h('b', { text: path.slice(i + 1) })];
}

export { frameLabel };
