// The screens sidebar, in board order: the design system (the Overview and
// Files pages, brand pages, components), every flow, screen and state with
// counts, the open options waiting for a pick, and the archive. Selecting a
// row reveals its frame on the board. On phones it is a drawer opened from
// the Screens button. Expanded rows are remembered per product.

import type { Cell, Section } from '../model.ts';
import type { Context } from './context.ts';
import { h, icon } from './dom.ts';
import { dayTime, humanize, shortSha } from './format.ts';
import { screenTree } from './navigation.ts';
import { frameHash } from './routes.ts';
import { STORAGE_PREFIX } from '../product.ts';

/** Per-product memory of which rows are expanded; storage may be unavailable. */
export class TreeMemory {
  private readonly key: string;
  private stored: Record<string, boolean> = {};

  constructor(slug: string) {
    this.key = `${STORAGE_PREFIX}:tree:${slug}`;
    try {
      const value: unknown = JSON.parse(localStorage.getItem(this.key) ?? '{}');
      if (value && typeof value === 'object' && !Array.isArray(value)) this.stored = value as Record<string, boolean>;
    } catch { /* Storage may be unavailable or corrupt. Navigation still works. */ }
  }

  get(id: string, fallback: boolean): boolean {
    return typeof this.stored[id] === 'boolean' ? (this.stored[id] as boolean) : fallback;
  }

  set(id: string, value: boolean): void {
    this.stored[id] = value;
    try { localStorage.setItem(this.key, JSON.stringify(this.stored)); } catch { /* Optional persistence. */ }
  }
}

/** A row that expands and collapses the rows in its group. */
export function branchRow(memory: TreeMemory, id: string, kind: 'flow' | 'screen', title: string, countText: string, open: boolean, children: HTMLElement[], quiet = false): HTMLElement[] {
  const expanded = memory.get(id, open);
  let chevron = icon(expanded ? 'expanded' : 'collapsed');
  const row = h(
    'button',
    { class: `tree-row tree-row--${kind}${quiet ? ' tree-row--quiet' : ''}`, attrs: { type: 'button', 'aria-expanded': String(expanded), 'data-branch': id } },
    chevron,
    h('span', { text: title }),
    countText ? h('span', { class: 'tree-row__count', text: countText }) : null,
  );
  const group = h('div', { class: 'dv-tree-group', attrs: { role: 'group', hidden: !expanded } }, ...children);
  row.addEventListener('click', () => {
    const next = row.getAttribute('aria-expanded') !== 'true';
    row.setAttribute('aria-expanded', String(next));
    group.hidden = !next;
    const turned = icon(next ? 'expanded' : 'collapsed');
    chevron.replaceWith(turned);
    chevron = turned;
    memory.set(id, next);
  });
  return [row, group];
}

/** Expands every branch above a row, so a selected row is visible. */
export function revealRow(row: Element): void {
  let group = row.closest('.dv-tree-group');
  while (group) {
    const owner = group.previousElementSibling;
    if (owner?.getAttribute('aria-expanded') === 'false') (owner as HTMLElement).click();
    group = group.parentElement?.closest('.dv-tree-group') ?? null;
  }
}

/** A row per page that reveals its frame: at the current size when it has one. */
function pageRow(ctx: Context, cells: Cell[], text: string, jump: (cell: Cell) => void, kind: 'state' | 'screen' = 'state', countText = ''): HTMLElement {
  const first = cells[0];
  const link = h(
    'a',
    {
      class: `tree-row tree-row--${kind}`,
      attrs: { 'data-path': first?.path, href: first ? frameHash(first, 'board') : '#' },
    },
    kind === 'screen' ? icon('blank') : null,
    kind === 'screen' ? h('span', { text }) : text,
    countText ? h('span', { class: 'tree-row__count', text: countText }) : null,
  );
  link.addEventListener('click', (e) => {
    e.preventDefault();
    const cell = cells.find((c) => ctx.atSize(c)) ?? first;
    if (cell) jump(cell);
  });
  return link;
}

/** Cells grouped by page, in board order. */
function byPage(cells: Cell[]): Cell[][] {
  const pages = new Map<string, Cell[]>();
  for (const c of cells) {
    const list = pages.get(c.path) ?? [];
    list.push(c);
    pages.set(c.path, list);
  }
  return [...pages.values()];
}

const separator = (): HTMLElement => h('div', { class: 'tree-sep', attrs: { role: 'separator' } });

export function sidebar(ctx: Context, jump: (cell: Cell) => void): HTMLElement {
  const memory = new TreeMemory(ctx.data.product.slug);
  const tree = h('nav', { class: 'tree', attrs: { 'aria-label': 'Screens' } });
  const sections = ctx.data.board;
  const cellsOf = (s: Section): Cell[] => s.lines.flatMap((l) => l.cells);

  // The design system: the overview and Files pages, then brand pages and components.
  const ds = sections.find((s) => s.kind === 'design-system');
  if (ds) {
    const pages = byPage(cellsOf(ds));
    const brand = pages.filter((p) => p[0]?.path.startsWith('design-system/brand/'));
    const components = pages.filter((p) => !p[0]?.path.startsWith('design-system/brand/'));
    const rows: HTMLElement[] = [];
    if (ds.overview) {
      rows.push(h('a', { class: 'tree-row tree-row--screen', attrs: { href: `${ctx.data.roots.head}${ds.overview.href}` } }, icon('blank'), h('span', { text: 'Overview' })));
    }
    const assets = ds.assets ?? [];
    const files = ds.filesHref && assets.length > 0 ? ds.filesHref : null;
    if (files) {
      rows.push(
        h(
          'a',
          { class: 'tree-row tree-row--screen', attrs: { href: `${ctx.data.roots.head}${files}`, 'data-files': '' } },
          icon('blank'),
          h('span', { text: 'Files' }),
          h('span', { class: 'tree-row__count', text: String(assets.length) }),
        ),
      );
    }
    const list = (cells: Cell[][]): HTMLElement[] => cells.map((p) => pageRow(ctx, p, p[0]?.title ?? '', jump));
    if (brand.length > 0) rows.push(...branchRow(memory, 'design:brand', 'screen', 'Brand pages', String(brand.length), false, list(brand)));
    if (components.length > 0) rows.push(...branchRow(memory, 'design:components', 'screen', 'Components', String(components.length), false, list(components)));
    const total = pages.length + (ds.overview ? 1 : 0) + (files ? 1 : 0);
    tree.append(...branchRow(memory, 'design', 'flow', 'Design system', String(total), true, rows), separator());
  }

  // Screens, flow by flow.
  const flows = screenTree(ctx.data);
  for (const flow of flows) {
    const states = flow.screens.reduce((n, s) => n + s.states.length, 0);
    const screens = flow.screens.map((screen) => {
      const rows = screen.states.map((state) => pageRow(ctx, state.cells, humanize(state.id), jump));
      return branchRow(memory, `screen:${flow.id}/${screen.id}`, 'screen', humanize(screen.id), String(screen.states.length), false, rows);
    });
    tree.append(...branchRow(memory, `flow:${flow.id}`, 'flow', flow.title, String(states), false, screens.flat()));
  }

  // Open options, waiting for a pick, then the archive.
  const options = sections.filter((s) => s.kind === 'exploration');
  const archive = sections.find((s) => s.kind === 'archive');
  if (options.length > 0 || archive) tree.append(separator());
  if (options.length > 0) {
    const rows = options.map((s) => {
      const letters = (s.exploration?.options.map((o) => o.id) ?? [...new Set(cellsOf(s).map((c) => c.col))]).map((l) => l.toUpperCase()).join(', ');
      return pageRow(ctx, cellsOf(s), humanize(s.title.replace(/^\d{4}-\d{2}-\d{2}-?/, '')) || s.title, jump, 'screen', letters);
    });
    tree.append(...branchRow(memory, 'options', 'flow', 'Open options', `${options.length} waiting`, false, rows));
  }
  if (archive) {
    const pages = byPage(cellsOf(archive));
    const files = archive.files ?? [];
    const rows = pages.map((p) => pageRow(ctx, p, p[0]?.title ?? '', jump));
    tree.append(...branchRow(memory, 'archive', 'flow', 'Archive', String(pages.length || files.length), false, rows, true));
  }

  const markSelected = (): void => {
    const s = ctx.selected;
    for (const row of tree.querySelectorAll('.tree-row--state')) {
      const on = !!s && row.getAttribute('data-path') === s.path && s.root === 'head';
      row.classList.toggle('is-selected', on);
      if (on) {
        row.setAttribute('aria-current', 'true');
        revealRow(row);
      } else row.removeAttribute('aria-current');
    }
  };
  ctx.onSelect(markSelected);

  const total = flows.reduce((n, f) => n + f.screens.reduce((m, s) => m + s.states.length, 0), 0);
  const { commit: built } = ctx.data;
  return h(
    'aside',
    { class: 'sidebar sidebar--drawer dv-sidebar', attrs: { id: 'dv-screens', 'aria-label': 'Screens' } },
    h(
      'div',
      { class: 'sidebar__head' },
      h('h2', null, 'Screens', h('span', { text: String(total) })),
      h('button', { class: 'button button--quiet button--small button--icon desktop-only', attrs: { type: 'button', 'aria-label': 'Hide the sidebar', 'data-sidebar-hide': '' } }, icon('sidebar')),
      h('button', { class: 'button button--quiet button--icon phone-only', attrs: { type: 'button', 'aria-label': 'Close the screens list', 'data-drawer-close': '' } }, icon('close')),
    ),
    tree,
    built
      ? h('div', { class: 'sidebar__foot' }, 'Built from ', h('span', { class: 'sha', text: shortSha(built.sha) }), built.date ? h('br') : null, built.date ? dayTime(built.date) : null)
      : null,
  );
}
