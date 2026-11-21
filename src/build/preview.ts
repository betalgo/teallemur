// Before/after classification for a preview: what changed, what was added,
// what moved to the archive, and which tokens changed.

import { join } from 'node:path';
import { scanCss } from '../check/css.ts';
import { compare, isFile, readText, sameBytes } from '../files.ts';
import { ASSET_PATH, COMPONENTS_CSS, SHARED_CSS_PATH, TOKENS_CSS, pageKind } from '../layout.ts';
import type { Classification, DesignJson, Line, Section, TokenChange } from '../model.ts';
import { labelBase, type PageInfo } from './pages.ts';
import { boardOrder, cellsFor } from './sections.ts';

/** A page that has frames on the board outside explorations. */
function isBoardPage(path: string): boolean {
  const kind = pageKind(path);
  return kind === 'screen' || kind === 'component' || kind === 'brand';
}

function isShared(path: string): boolean {
  return path === TOKENS_CSS || path === COMPONENTS_CSS || SHARED_CSS_PATH.test(path) || ASSET_PATH.test(path);
}

export function classify(head: string, base: string, headFiles: string[], baseFiles: string[]): Classification {
  const headSet = new Set(headFiles);
  const baseSet = new Set(baseFiles);
  const differs = (p: string): boolean => !sameBytes(join(head, p), join(base, p));

  const headPages = headFiles.filter(isBoardPage);
  const basePages = baseFiles.filter(isBoardPage);
  const changed = headPages.filter((p) => baseSet.has(p) && differs(p));
  const added = headPages.filter((p) => !baseSet.has(p));
  const removed = basePages.filter((p) => !headSet.has(p));
  const archived = headFiles.filter((p) => p.startsWith('archive/') && !baseSet.has(p));

  const explorations = new Set<string>();
  for (const p of headFiles) {
    const m = /^(explorations\/[^/]+)\//.exec(p);
    if (m?.[1] && (!baseSet.has(p) || differs(p))) explorations.add(m[1]);
  }

  const shared = [...new Set([...headFiles, ...baseFiles])]
    .filter(isShared)
    .filter((p) => !headSet.has(p) || !baseSet.has(p) || differs(p))
    .sort(compare);

  const tokens: TokenChange[] = [];
  for (const file of [TOKENS_CSS, COMPONENTS_CSS]) {
    if (shared.includes(file)) tokens.push(...diffCustomProperties(file, readIfFile(join(base, file)), readIfFile(join(head, file))));
  }

  return { changed, added, removed, archived, explorations: [...explorations].sort(compare), shared, tokens };
}

function readIfFile(p: string): string {
  return isFile(p) ? readText(p) : '';
}

/** Custom properties keyed by context and name, in source order. */
export function customProperties(css: string): Map<string, { context: string; name: string; value: string }> {
  const out = new Map<string, { context: string; name: string; value: string }>();
  for (const d of scanCss(css).declarations) {
    if (!d.prop.startsWith('--')) continue;
    const context = d.context.join(' ');
    out.set(`${context}\0${d.prop}`, { context, name: d.prop, value: d.value.replace(/\s+/g, ' ').trim() });
  }
  return out;
}

export function diffCustomProperties(file: string, before: string, after: string): TokenChange[] {
  const a = customProperties(before);
  const b = customProperties(after);
  const out: TokenChange[] = [];
  for (const [key, now] of b) {
    const was = a.get(key);
    if (!was) out.push({ file, context: now.context, name: now.name, old: null, new: now.value });
    else if (was.value !== now.value) out.push({ file, context: now.context, name: now.name, old: was.value, new: now.value });
  }
  for (const [key, was] of a) {
    if (!b.has(key)) out.push({ file, context: was.context, name: was.name, old: was.value, new: null });
  }
  return out;
}

/**
 * Sections of the preview page: changed pages, added pages, the new or
 * changed explorations (as on the board), and archived pages and files.
 */
export function previewSections(
  design: DesignJson,
  c: Classification,
  headPages: PageInfo[],
  basePages: Map<string, PageInfo>,
  board: Section[],
  archivePages: PageInfo[] = [],
): Section[] {
  const order = boardOrder(board);
  const byPath = new Map(headPages.map((p) => [p.path, p]));
  const inBoardOrder = (paths: string[]): string[] =>
    [...paths].sort((x, y) => (order.get(x) ?? Infinity) - (order.get(y) ?? Infinity) || compare(x, y));

  const changedLines: Line[] = [];
  for (const path of inBoardOrder(c.changed)) {
    const after = byPath.get(path);
    if (!after) continue;
    const before = basePages.get(path) ?? after;
    let first = true;
    for (const vp of after.viewports) {
      const [b] = cellsFor({ ...before, viewports: after.viewports }, 'base', 'Before', [vp]);
      const [a] = cellsFor(after, 'head', 'After', [vp]);
      if (!a || !b) continue;
      const line: Line = { cells: [b, a] };
      if (first) line.heading = `${labelBase(after)} · ${path}`;
      first = false;
      changedLines.push(line);
    }
  }

  const addedLines: Line[] = [];
  for (const path of inBoardOrder(c.added)) {
    const page = byPath.get(path);
    if (page) addedLines.push({ heading: `${labelBase(page)} · ${path}`, cells: cellsFor(page, 'head', 'Added') });
  }
  const explorations = board.filter((s) => s.kind === 'exploration' && s.subtitle !== undefined && c.explorations.includes(s.subtitle));

  const archived = new Set(c.archived);
  const first = design.viewports[0]?.id;
  const archivedLines: Line[] = archivePages
    .filter((p) => archived.has(p.path))
    .map((p) => ({ cells: cellsFor(p, 'head', 'Archived', [p.viewports.includes(first ?? '') ? (first ?? '') : (p.viewports[0] ?? first ?? '')]) }));
  const shown = new Set(archivedLines.flatMap((l) => l.cells.map((cell) => cell.path)));

  return [
    { id: 'changed', kind: 'changed', title: 'Changed', align: false, columns: [], lines: changedLines },
    { id: 'added', kind: 'added', title: 'Added', align: false, columns: [], lines: addedLines },
    ...explorations,
    {
      id: 'archived',
      kind: 'archived',
      title: 'Archived',
      align: false,
      columns: [],
      lines: archivedLines,
      files: c.archived.filter((path) => !shown.has(path)).map((path) => ({ path, root: 'head' as const })),
    },
  ];
}

/**
 * The short name downloads in a preview give their files: the label up to its
 * first colon ("PR 12" from "PR 12: onboarding options"), or "this preview"
 * when there is no label or that part is long.
 */
export function changeName(label: string | null): string {
  const name = (label ?? '').split(':')[0]?.replace(/\s+/g, ' ').trim() ?? '';
  return name && name.length <= 24 ? name : 'this preview';
}
