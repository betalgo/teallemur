// State shared by every part of the viewer page.

import type { Cell, Viewport, ViewerData } from '../model.ts';
import { allFilters, fileUrl, matchesCell, matchesFile, ownSize, reference, type Filters } from './filters.ts';
import { frameHash, type FrameRoute } from './routes.ts';

type Spot = Pick<Cell, 'path' | 'root' | 'viewport'>;

export class Context {
  readonly data: ViewerData;
  readonly viewports: Map<string, Viewport>;
  /**
   * Every screen page has a size of its own: the board, and a preview of it,
   * show every page at once, each at its own size, with no size control.
   */
  readonly ownSizes: boolean;
  filters: Filters;
  focusFullHeight = false;
  /** The frame last opened or revealed; the board rings it and the sidebar marks it. */
  selected: Spot | null = null;
  private readonly listeners = new Set<() => void>();
  private readonly selectionListeners = new Set<() => void>();
  /** Opens the focus view; set by the app. */
  focus: (cell: Cell, trigger?: HTMLElement) => void = () => undefined;
  jump: (cell: Cell) => void = () => undefined;
  navigate: (cell: Cell, view: FrameRoute['view'], trigger?: HTMLElement) => void = () => undefined;

  constructor(data: ViewerData) {
    this.data = data;
    this.viewports = new Map(data.viewports.map((v) => [v.id, v]));
    this.ownSizes = data.ownSizes === true;
    this.filters = allFilters(data);
  }

  /** The size the board or preview shows; a board of own sizes shows each page at its own instead (see atSize). */
  get size(): string {
    return [...this.filters.viewports][0] ?? this.data.viewports[0]?.id ?? '';
  }

  setFilters(next: Partial<Filters>): void {
    this.filters = { ...this.filters, ...next };
    for (const fn of this.listeners) fn();
  }

  onFilters(fn: () => void): void {
    this.listeners.add(fn);
  }

  select(cell: Spot | null): void {
    this.selected = cell ? { path: cell.path, root: cell.root, viewport: cell.viewport } : null;
    for (const fn of this.selectionListeners) fn();
  }

  onSelect(fn: () => void): void {
    this.selectionListeners.add(fn);
  }

  isSelected(cell: Spot): boolean {
    const s = this.selected;
    return !!s && s.path === cell.path && s.root === cell.root && s.viewport === cell.viewport;
  }

  /** Whether the board shows a frame's size: the size picked or, on a board of own sizes, its page's own size. */
  atSize(cell: Pick<Cell, 'viewport' | 'viewports'>): boolean {
    return this.ownSizes ? cell.viewport === ownSize(cell) : this.filters.viewports.has(cell.viewport);
  }

  visible = (cell: Cell): boolean => this.atSize(cell) && matchesCell(cell, this.filters.query);

  fileVisible = (path: string): boolean => matchesFile(path, this.filters);

  url(cell: Pick<Cell, 'path' | 'root'>): string {
    return fileUrl(this.data, cell);
  }

  /** The Copy link text; `where` names one of several frames of the same page, such as "desktop, in context". */
  ref(cell: Pick<Cell, 'path' | 'root'>, viewport: string, where?: string): string {
    return `${reference(this.data.product.slug, cell, viewport)}${where ? ` · ${where}` : ''}\n${this.link({ ...cell, viewport })}`;
  }

  link(cell: Spot, view: FrameRoute['view'] = 'focus'): string {
    const url = new URL(window.location.href);
    url.hash = frameHash(cell, view);
    return url.href;
  }
}
