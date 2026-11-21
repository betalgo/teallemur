// The preview page for a design pull request: the banner with the commits
// and change counts, changed pages before and after, added pages and
// options, archived pages, and the token changes in a closed section.
// Changed and added pages show at one size at a time, picked in the top bar
// with the board's size control and opening at the product's main size; a
// page without that size shows at its own first size, so no change is
// hidden. A preview of a board of own sizes shows each page at its own size,
// with no size control. The full board at head is one click away in the top
// bar. Each changed and added page, and each option, shows its whole page
// (wholepage.ts), so a change low on a long page is seen by scrolling the
// preview; frames growing to their page's height keep the reader's place.

import type { Cell, CommitInfo, Line, PreviewData, Section, TokenChange } from '../model.ts';
import { previewOpeningSize } from '../sizes.ts';
import { fileList, optionSet, pathParts } from './board.ts';
import type { Context } from './context.ts';
import { h, icon, lockup, px } from './dom.ts';
import { linesAtSize, previewSize } from './filters.ts';
import { count, dayTime, humanize, shortSha, sizeText } from './format.ts';
import { frameElement, frameShot } from './frame.ts';
import { FrameLoader } from './loader.ts';
import { comparison, type ComparisonState } from './comparison.ts';
import { revealPressed, sizeControl } from './topbar.ts';
import { PageHeights } from './wholepage.ts';

/** The changes and frames whose place a size switch keeps on screen. */
const PLACES = '.dv-comparison, .dv-added > .dv-frame, .option-set .dv-frame';
/** What can hold the reader's place while frames grow: every frame's picture, and the parts below the frames. */
const ANCHORS = '.dv-shot, .dv-files, .dv-shared';

function commitChip(word: string, c: CommitInfo | null): HTMLElement {
  return h('span', { class: 'commit' }, h('b', { text: word }), h('span', { class: 'sha', text: c ? shortSha(c.sha) : 'unknown' }));
}

function cellsOf(s: Section | undefined): Cell[] {
  return s ? s.lines.flatMap((l) => l.cells) : [];
}

/** "A", "A and B", "A, B and C". */
function andList(words: string[]): string {
  return words.length > 1 ? `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}` : (words[0] ?? '');
}

function pageWord(cells: Cell[]): [string, string] {
  return cells.every((c) => c.path.startsWith('screens/')) ? ['screen', 'screens'] : ['page', 'pages'];
}

/**
 * A section's meta line on what it shows and what else exists: "Shown at
 * Desktop, 1440 × 900; also at Wide, Tablet and Phone." `all` holds every
 * frame of the section's pages, `shown` the frames on the page.
 */
function shownText(ctx: Context, all: Cell[], shown: Cell[], pixels: boolean): string {
  if (ctx.ownSizes) return 'Each at its own size.';
  const size = ctx.viewports.get(ctx.size);
  if (!size || shown.length === 0) return '';
  const names = (ids: Iterable<string>): string => {
    const set = new Set(ids);
    return andList(ctx.data.viewports.filter((v) => set.has(v.id)).map((v) => humanize(v.id)));
  };
  const at = new Map(shown.map((c) => [c.path, c.viewport]));
  // Pages without the size picked, shown at their own first size.
  const elsewhere = [...new Map(shown.filter((c) => c.viewport !== size.id).map((c) => [c.path, c])).values()];
  const also = all.filter((c) => at.has(c.path) && c.viewport !== at.get(c.path)).map((c) => c.viewport);
  const [one, many] = pageWord(elsewhere);
  let text: string;
  if (elsewhere.length < at.size) {
    text = `Shown at ${pixels ? sizeText(size, ', ') : humanize(size.id)}`;
    if (elsewhere.length > 0) text += `, and ${count(elsewhere.length, one, many)} without it at ${elsewhere.length === 1 ? 'its' : 'their'} own size`;
  } else {
    text = `No ${many} at ${humanize(size.id)}, so shown at ${names(at.values())}`;
  }
  return also.length > 0 ? `${text}; also at ${names(also)}.` : `${text}.`;
}

/** Grid columns wide enough for the widest frame shown, within limits. */
function columnsFor(ctx: Context, cells: Cell[]): string {
  const widest = Math.max(0, ...cells.map((c) => ctx.viewports.get(c.viewport)?.width ?? 0));
  return px(Math.max(240, Math.min(640, widest * 0.4)));
}

export function mountPreview(ctx: Context, app: HTMLElement): void {
  const p = ctx.data.preview as PreviewData;
  const { product, commit: head } = ctx.data;
  const own = ctx.ownSizes;
  const loader = new FrameLoader(null, '100% 0px');
  const byKind = (kind: Section['kind']): Section | undefined => p.sections.find((s) => s.kind === kind);
  const changedCells = cellsOf(byKind('changed')).filter((c) => c.root === 'head');
  const addedCells = cellsOf(byKind('added'));
  const explorations = p.sections.filter((s) => s.kind === 'exploration');
  // Every frame that shows at one size at a time: changes, added pages and options.
  const oneSize = [...cellsOf(byKind('changed')), ...addedCells, ...explorations.flatMap(cellsOf)];
  const archived = byKind('archived');
  const archivedPages = cellsOf(archived);
  const archivedFiles = archived?.files ?? [];
  const changedPages = new Set(changedCells.map((c) => c.path)).size;
  const addedPages = new Set(addedCells.map((c) => c.path)).size;
  const archivedCount = archivedPages.length > 0 ? new Set(archivedPages.map((c) => c.path)).size : archivedFiles.length;
  const tokens = p.shared?.tokens.length ?? 0;

  // One size at a time, always opening at the product's main size. A size
  // picked holds for this visit only: it is not kept for the next one.
  const opening = own ? null : previewOpeningSize(ctx.data.viewports)?.id;
  if (opening) ctx.filters = { ...ctx.filters, viewports: new Set([opening]) };
  // The board's size control; none when every page has a size of its own, or no page comes in sizes.
  const sizes = own || oneSize.length === 0
    ? null
    : sizeControl(ctx.data.viewports, ctx.size, (id) => ctx.setFilters({ viewports: new Set([id]) }), { extraClass: 'top-bar__center' });

  const topBar = h(
    'header',
    { class: sizes ? 'top-bar top-bar--centered top-bar--board' : 'top-bar' },
    h('div', { class: 'top-bar__start' }, lockup(true), h('div', { class: 'top-bar__product' }, h('strong', { text: product.name }), h('span', { text: 'Preview' }))),
    sizes ? sizes.el : h('span', { class: 'top-bar__spacer' }),
    h(
      'div',
      { class: 'top-bar__end' },
      h('a', { class: 'button dv-board-link', attrs: { href: p.boardHref } }, h('span', { class: 'desktop-only', text: 'Open the full board' }), h('span', { class: 'phone-only', text: 'Full board' })),
    ),
  );
  const note = `Review here, then approve by merging the pull request.${sizes && ctx.data.viewports.length > 1 ? ' Changes show at one size at a time: pick another size in the top bar.' : ''}`;

  const summaryLink = (n: number, word: string, target: string): HTMLElement =>
    n > 0 ? h('a', { attrs: { href: `#${target}` } }, h('b', { text: String(n) }), word) : h('span', { class: 'dv-summary-zero' }, h('b', { text: '0' }), word);
  const banner = h(
    'section',
    { class: 'pr-banner dv-banner' },
    h(
      'div',
      { class: 'container pr-banner__layout' },
      h(
        'div',
        null,
        h('p', { class: 'pr-banner__eyebrow' }, icon('commit'), `Pull request preview${head?.date ? ` · ${dayTime(head.date)}` : ''}`),
        h('h1', { class: 'pr-banner__title', text: p.label ?? `${product.name} design preview` }),
        h('div', { class: 'commits' }, commitChip('Base', p.base), icon('arrow', 'commits__arrow'), commitChip('Head', head)),
        h('p', { class: 'pr-banner__note', text: note }),
      ),
      h(
        'nav',
        { class: 'change-summary', attrs: { 'aria-label': 'Changes' } },
        summaryLink(changedPages, 'changed', 'changed'),
        summaryLink(addedPages + explorations.length, 'added', 'added'),
        summaryLink(archivedCount, 'archived', 'archived'),
        summaryLink(tokens, tokens === 1 ? 'token change' : 'token changes', 'tokens'),
      ),
    ),
  );

  const comparisons = new Map<string, ComparisonState>();
  const container = h('div', { class: 'container' });
  const main = h('main', { class: 'dv-content' }, container);

  /**
   * The top bar's bottom and the reading line a quarter of the way down the
   * window under it: what sits on that line is what is being read. Null
   * where there is no layout (tests).
   */
  const reading = (): { bar: number; line: number } | null => {
    if (typeof window.scrollBy !== 'function' || typeof topBar.getBoundingClientRect !== 'function') return null;
    const bar = topBar.getBoundingClientRect().bottom;
    return { bar, line: bar + Math.max(0, window.innerHeight - bar) / 4 };
  };
  /** The frame just revealed holds the reader's place until they scroll, click or type. */
  let pinned: HTMLElement | null = null;
  for (const type of ['wheel', 'touchstart', 'pointerdown', 'keydown']) {
    window.addEventListener?.(type, () => { pinned = null; }, { capture: true, passive: true });
  }
  /**
   * Applies a change of frame heights without moving what is being read: the
   * frame just revealed, else the first frame (or part below the frames)
   * reaching the reading line, stays where it is on screen.
   */
  const steady = (change: () => void): void => {
    const at = reading();
    const anchor = !at ? null : pinned?.isConnected ? pinned : [...container.querySelectorAll<HTMLElement>(ANCHORS)].find((el) => el.getBoundingClientRect().bottom > at.line);
    const top = anchor?.getBoundingClientRect().top;
    change();
    const moved = anchor && top !== undefined ? anchor.getBoundingClientRect().top - top : 0;
    if (moved) window.scrollBy(0, moved);
  };
  const heights = new PageHeights(ctx.viewports, steady);

  const head2 = (title: string, meta: string): HTMLElement => h('div', { class: 'section-head' }, h('h2', { text: title }), h('p', { class: 'section-head__meta', text: meta }));

  const render = (): void => {
    loader.clear();
    container.replaceChildren();
    const changed = byKind('changed');
    const changedLines = changed ? linesAtSize(changed.lines, ctx.size, own) : [];
    if (changedLines.length > 0) {
      const [one, many] = pageWord(changedCells);
      const shown = changedLines.flatMap((l) => l.cells).filter((c) => c.root === 'head');
      const section = h(
        'section',
        { class: 'dv-sec', attrs: { id: 'changed', 'data-kind': 'changed' } },
        head2(`${count(changedPages, one, many)} changed`, `Same file, different content. ${shownText(ctx, changedCells, shown, true)}`),
      );
      for (const l of changedLines) {
        const before = l.cells.find((c) => c.root === 'base');
        const after = l.cells.find((c) => c.root === 'head');
        if (!before || !after) continue;
        const key = `${after.path}@${after.viewport}`;
        const state = comparisons.get(key) ?? { overlay: false, split: 50 };
        comparisons.set(key, state);
        section.append(comparison(ctx, before, after, loader, state, heights));
      }
      container.append(section);
    }
    if (addedCells.length > 0 || explorations.length > 0) {
      const [one, many] = pageWord(addedCells);
      const added = linesAtSize(byKind('added')?.lines ?? [], ctx.size, own).flatMap((l) => l.cells);
      const options = explorations.map((s) => ({ s, lines: linesAtSize(s.lines, ctx.size, own) }));
      const all = [...addedCells, ...explorations.flatMap(cellsOf)];
      const shown = [...added, ...options.flatMap((o) => o.lines.flatMap((l) => l.cells))];
      const section = h(
        'section',
        { class: 'dv-sec', attrs: { id: 'added', 'data-kind': 'added' } },
        head2(
          addedCells.length > 0 ? `${count(addedPages, one, many)} added` : `${count(explorations.length, 'question')} added`,
          `New files in this pull request. ${shownText(ctx, all, shown, false)}`,
        ),
      );
      if (added.length > 0) {
        const grid = h('div', { class: 'frame-grid dv-grid dv-added', style: { '--dv-min': columnsFor(ctx, added) } });
        for (const c of added) grid.append(frameElement(ctx, c, loader, { cardTag: 'Added', whole: heights.group([c]) }));
        section.append(grid);
      }
      for (const { s, lines } of options) {
        if (lines.length === 0) continue;
        section.append(
          optionSet(ctx, s, lines as Line[], (cells, above) => {
            // Options side by side, in columns wide enough for the size shown.
            const grid = h('div', { class: 'frame-grid dv-grid', style: { '--dv-min': columnsFor(ctx, cells) } });
            for (const c of cells) grid.append(frameElement(ctx, c, loader, { above: above(c), whole: heights.group([c]) }));
            return grid;
          }),
        );
      }
      container.append(section);
    }
    if (archivedPages.length > 0 || archivedFiles.length > 0) {
      const section = h('section', { class: 'dv-sec', attrs: { id: 'archived', 'data-kind': 'archived' } }, head2(`${archivedCount} archived`, 'Moved out of the board, kept in the repo.'));
      for (const c of archivedPages) {
        let shot: HTMLElement | null = null;
        shot = frameShot(ctx, c, loader, () => ctx.focus(c, shot?.querySelector<HTMLElement>('.dv-frame-open') ?? undefined));
        section.append(
          h(
            'div',
            { class: 'archived-row dv-frame', attrs: { 'data-path': c.path, 'data-viewport': c.viewport, 'data-root': c.root } },
            shot,
            h(
              'div',
              { class: 'archived-row__text' },
              h('h3', { text: c.title }),
              h('p', { text: 'Moved to the archive in this pull request. It stays on the board under Archive.' }),
              h('span', { class: 'frame__label' }, ...pathParts(c.path)),
            ),
            h('span', { class: 'tag' }, icon('archive'), 'Archived'),
          ),
        );
      }
      if (archivedFiles.length > 0) section.append(fileList(ctx, archivedFiles));
      container.append(section);
    }
    if (p.shared) container.append(sharedSection(ctx, p));
    if (container.childElementCount === 0) container.append(h('p', { class: 'dv-empty', text: 'No design files changed in this pull request.' }));
  };

  /**
   * The change or frame being read, the first one reaching the reading line,
   * and where it sits, so a size switch keeps the reader's place: its top,
   * or, for a whole page whose top is above the window, the share of it
   * above the line.
   */
  const place = (): { path: string; top: number; share: number | null } | null => {
    const at = reading();
    if (!at) return null;
    for (const el of container.querySelectorAll<HTMLElement>(PLACES)) {
      const box = el.getBoundingClientRect();
      if (box.bottom > at.line) return { path: el.dataset.path ?? '', top: box.top, share: box.top < at.bar && box.height > 0 ? (at.line - box.top) / box.height : null };
    }
    return null;
  };
  const keep = (p: { path: string; top: number; share: number | null } | null): void => {
    const el = p && [...container.querySelectorAll<HTMLElement>(PLACES)].find((e) => e.dataset.path === p.path);
    const at = reading();
    if (!p || !el || !at) return;
    const box = el.getBoundingClientRect();
    window.scrollBy(0, box.top - (p.share === null ? p.top : at.line - p.share * box.height));
  };
  /**
   * Brings a frame into view: to the middle of the window when it fits,
   * else with its top under the top bar. A whole page taller than the window
   * that is already on screen stays where it is, so coming back from the
   * focus view returns to the part that was being read.
   */
  const reveal = (el: HTMLElement): void => {
    const at = reading();
    const box = at ? el.getBoundingClientRect() : null;
    if (!at || !box || box.height <= window.innerHeight - at.bar) el.scrollIntoView({ block: 'center', inline: 'nearest' });
    else if (box.bottom <= at.bar || box.top >= window.innerHeight) window.scrollBy(0, box.top - at.bar - 16);
    pinned = el;
  };
  // Picking a size switches every change, added page and option at once.
  ctx.onFilters(() => {
    sizes?.set(ctx.size);
    const at = place();
    render();
    keep(at);
  });

  /**
   * Reveals a frame. One at another size than the one shown switches to that
   * size; in a preview of a board of own sizes, the page's frame at its own
   * size stands in for its other sizes.
   */
  ctx.jump = (wanted) => {
    const copies = oneSize.filter((c) => c.path === wanted.path && c.root === wanted.root);
    const current = copies.find((c) => c.viewport === previewSize(c, ctx.size, own));
    const cell = own && current ? current : wanted;
    ctx.select(cell);
    if (!own && copies.length > 0 && current?.viewport !== cell.viewport) ctx.setFilters({ viewports: new Set([cell.viewport]) });
    const figure = [...app.querySelectorAll<HTMLElement>('.dv-frame')].find((el) => el.dataset.path === cell.path && el.dataset.root === cell.root && el.dataset.viewport === cell.viewport);
    const pair = [...app.querySelectorAll<HTMLElement>('.dv-comparison')].find((el) => el.dataset.path === cell.path && el.dataset.viewport === cell.viewport);
    const target = figure ?? pair;
    if (target) reveal(target);
    target?.querySelector<HTMLElement>('.dv-frame-open, button, a')?.focus({ preventScroll: true });
  };

  app.classList.add('dv-doc-app');
  app.append(topBar, banner, main);
  render();
  setTimeout(() => {
    if (sizes?.el.classList.contains('switcher')) revealPressed(sizes.el);
  }, 0);
}

function sharedSection(ctx: Context, p: PreviewData): HTMLElement {
  const shared = p.shared;
  if (!shared) return h('div');
  const swatch = (value: string | null): HTMLElement | null =>
    value && typeof CSS !== 'undefined' && CSS.supports('color', value) ? h('i', { class: 'token-table__swatch', style: { background: value }, attrs: { 'aria-hidden': 'true' } }) : null;
  const cell = (value: string | null): HTMLElement => h('td', null, value === null ? h('span', { class: 'dv-none', text: '(none)' }) : h('span', null, swatch(value), value));
  const row = (t: TokenChange): HTMLElement =>
    h(
      'tr',
      { attrs: { 'data-token': t.name } },
      h('td', null, t.name, t.context && t.context !== ':root' ? h('span', { class: 'dv-token-where', text: ` ${t.context}` }) : null, t.file !== 'design-system/tokens.css' ? h('span', { class: 'dv-token-where', text: ` (${t.file.replace(/^design-system\//, '')})` }) : null),
      cell(t.old),
      h('td', { class: 'dv-token-arrow', text: '→' }),
      cell(t.new),
    );
  const files = [...new Set(shared.tokens.map((t) => t.file.replace(/^design-system\//, '')))];
  const where = files.length > 0 ? ` in ${files.join(' and ')}` : '';
  const everyScreen = shared.files.some((f) => f === 'design-system/tokens.css' || f === 'design-system/components.css');
  const n = shared.tokens.length;
  return h(
    'details',
    { class: 'collapsed dv-shared', attrs: { id: 'tokens', 'data-kind': 'tokens' } },
    h(
      'summary',
      null,
      icon('collapsed'),
      h('h2', null, 'Token changes ', h('span', { text: `(${n})` })),
      h('p', null, n > 0 ? `${count(n, 'value')} changed${where}.` : `${count(shared.files.length, 'shared file')} changed.`, everyScreen ? h('span', { class: 'dv-warning', text: ' Every screen may be affected.' }) : null),
    ),
    h(
      'div',
      { class: 'collapsed__body' },
      n > 0 ? h('table', { class: 'token-table' }, h('tbody', null, ...shared.tokens.map(row))) : null,
      fileList(ctx, shared.files.map((path) => ({ path, root: 'head' as const }))),
    ),
  );
}
