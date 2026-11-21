// Pure helpers: frame filtering, copy references and frame URLs.

import type { Cell, Line, ViewerData } from '../model.ts';
import { mainViewport } from '../sizes.ts';

export interface Filters {
  /** Viewport ids that are shown. The size switcher shows one at a time. */
  viewports: Set<string>;
  /** Text search over titles, labels and paths. */
  query: string;
}

/** The starting filters: the board's main size (every size on a board of own sizes) and no search. */
export function allFilters(data: ViewerData): Filters {
  if (data.ownSizes) return { viewports: new Set(data.viewports.map((v) => v.id)), query: '' };
  const main = mainViewport(data.board, data.viewports);
  return { viewports: new Set(main ? [main.id] : data.viewports.map((v) => v.id)), query: '' };
}

export function matchesQuery(text: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const hay = text.toLowerCase();
  return q.split(/\s+/).every((word) => hay.includes(word));
}

export function matches(cell: Cell, f: Filters): boolean {
  if (!f.viewports.has(cell.viewport)) return false;
  return matchesCell(cell, f.query);
}

/** Whether a frame's title, path or label matches the search. */
export function matchesCell(cell: Cell, query: string): boolean {
  return matchesQuery(`${cell.title}\n${cell.path}\n${cell.label}`, query);
}

/** A page's own size: the first one it offers, in design.json order. A board of own sizes shows each page there. */
export function ownSize(cell: Pick<Cell, 'viewport' | 'viewports'>): string {
  return cell.viewports[0] ?? cell.viewport;
}

/**
 * The size a page shows at in a preview: the size picked when the page offers
 * it, else its own first size, so no change is hidden. In a preview of a board
 * of own sizes, always its own.
 */
export function previewSize(cell: Pick<Cell, 'viewport' | 'viewports'>, size: string, own: boolean): string {
  return !own && cell.viewports.includes(size) ? size : ownSize(cell);
}

/**
 * A preview section's lines at one size: each page's frames at the size it
 * shows at (previewSize). A page's heading, which sits on its first line,
 * moves to the first line left.
 */
export function linesAtSize(lines: Line[], size: string, own: boolean): Line[] {
  const out: Line[] = [];
  let heading: string | undefined;
  for (const l of lines) {
    if (l.heading !== undefined) heading = l.heading;
    const cells = l.cells.filter((c) => c.viewport === previewSize(c, size, own));
    if (cells.length === 0) continue;
    const line: Line = { cells };
    if (heading !== undefined) line.heading = heading;
    heading = undefined;
    out.push(line);
  }
  return out;
}

/** The text the copy button puts on the clipboard: "<slug> <path> @ <viewport>". */
export function reference(slug: string, cell: Pick<Cell, 'path' | 'root'>, viewport: string): string {
  return `${slug} ${cell.path} @ ${viewport}${cell.root === 'base' ? ' (base)' : ''}`;
}

/** URL of a design file, relative to the current page. */
export function fileUrl(data: ViewerData, cell: Pick<Cell, 'path' | 'root'>): string {
  const prefix = cell.root === 'base' ? data.roots.base : data.roots.head;
  return prefix + cell.path.split('/').map(encodeURIComponent).join('/');
}

/** Plain file links (archive files) show when they match the search. */
export function matchesFile(path: string, f: Filters): boolean {
  return matchesQuery(path, f.query);
}
