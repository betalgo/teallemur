// The board's sizes: the main size (the one it opens at, and the hub
// thumbnail's size), the size a preview opens at, and whether every page has
// a size of its own.

import type { Section, Viewport } from './model.ts';

/** The viewport with the most frames outside the archive; ties go to design.json order. */
export function mainViewport(board: Section[], viewports: Viewport[]): Viewport | null {
  const frames = new Map<string, number>();
  for (const s of board) {
    if (s.kind === 'archive') continue;
    for (const line of s.lines) for (const c of line.cells) frames.set(c.viewport, (frames.get(c.viewport) ?? 0) + 1);
  }
  let best: Viewport | null = null;
  for (const vp of viewports) {
    if (best === null || (frames.get(vp.id) ?? 0) > (frames.get(best.id) ?? 0)) best = vp;
  }
  return best;
}

/**
 * The size a preview always opens at: the product's main size, the viewport
 * named `desktop` when there is one, else the first in design.json.
 */
export function previewOpeningSize(viewports: Viewport[]): Viewport | null {
  return viewports.find((v) => v.id === 'desktop') ?? viewports[0] ?? null;
}

/** The first screen of the first flow at the main size, else the first frame on the board. */
export function coverFrame(board: Section[], viewports: Viewport[]): { path: string; viewport: Viewport } | null {
  const main = mainViewport(board, viewports);
  if (!main) return null;
  const cells = board.filter((s) => s.kind !== 'archive').flatMap((s) => s.lines.flatMap((l) => l.cells));
  const flowCells = board.filter((s) => s.kind === 'flow').flatMap((s) => s.lines.flatMap((l) => l.cells));
  const pick = flowCells.find((c) => c.viewport === main.id) ?? flowCells[0] ?? cells.find((c) => c.viewport === main.id) ?? cells[0];
  const vp = pick && viewports.find((v) => v.id === pick.viewport);
  return pick && vp ? { path: pick.path, viewport: vp } : null;
}

/**
 * Whether every screen page declares exactly one size of its own (images for
 * other sites, each made at its upload size). Such a board shows every page at
 * once, each at its own size, and has no size control. False without screens.
 */
export function ownSizes(pages: { kind: string; ownSize: boolean }[]): boolean {
  const screens = pages.filter((p) => p.kind === 'screen');
  return screens.length > 0 && screens.every((p) => p.ownSize);
}
