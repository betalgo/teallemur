// Turns pages into board sections: the design system first (the overview
// and Files cards, brand pages, component pages), then flows in design.json
// order, open explorations, and the collapsed archive.

import { compare } from '../files.ts';
import { OPTIONS } from '../layout.ts';
import type { AssetFile, Cell, DesignJson, FileLink, Line, OverviewCard, Root, Section } from '../model.ts';
import { byOrder, labelBase, type PageInfo } from './pages.ts';
import { explorationInfo } from './readme.ts';

/** Reads a repo file as text, or null when it does not exist. */
export type ReadFile = (path: string) => string | null;

export function cellsFor(page: PageInfo, root: Root, caption?: string, viewports = page.viewports): Cell[] {
  const base = labelBase(page);
  return viewports.map((vp) => {
    const cell: Cell = {
      path: page.path,
      root,
      viewport: vp,
      col: vp,
      label: `${base} · ${vp}`,
      title: page.title,
      viewports: page.viewports,
    };
    if (page.flow) cell.flow = page.flow;
    if (caption) cell.caption = caption;
    if (page.note) cell.note = page.note;
    if (page.frame) cell.frame = page.frame;
    // Only the built (head) copy is offered: in a preview, the pull request's file.
    if (page.download && root === 'head') cell.download = page.download;
    return cell;
  });
}

export function boardSections(
  design: DesignJson,
  pages: PageInfo[],
  archive: PageInfo[],
  archiveFiles: string[],
  read: ReadFile = () => null,
  overview?: OverviewCard,
  assets: AssetFile[] = [],
  filesHref?: string,
): Section[] {
  const vpIds = design.viewports.map((v) => v.id);
  const sections: Section[] = [];

  const brand = pages.filter((p) => p.kind === 'brand').sort(byOrder);
  const components = pages.filter((p) => p.kind === 'component').sort(byOrder);
  if (overview || brand.length > 0 || components.length > 0 || assets.length > 0) {
    const section: Section = {
      id: 'design-system',
      kind: 'design-system',
      title: 'Design system',
      subtitle: 'design-system',
      align: true,
      columns: vpIds,
      lines: [...brand, ...components].map((p) => ({ cells: cellsFor(p, 'head') })),
    };
    if (overview) section.overview = overview;
    if (assets.length > 0) {
      section.assets = assets;
      if (filesHref) section.filesHref = filesHref;
    }
    sections.push(section);
  }

  for (const flow of design.flows) {
    const screens = pages.filter((p) => p.kind === 'screen' && p.flow === flow.id).sort(byOrder);
    if (screens.length === 0) continue;
    sections.push({
      id: `flow-${flow.id}`,
      kind: 'flow',
      title: flow.title,
      subtitle: `screens/${flow.id}`,
      align: true,
      columns: vpIds,
      lines: screens.map((p) => ({ cells: cellsFor(p, 'head') })),
    });
  }

  const explorations = [...new Set(pages.filter((p) => p.kind === 'exploration').map((p) => p.exploration ?? ''))].sort(compare);
  for (const name of explorations) {
    const own = pages.filter((p) => p.exploration === name);
    const optionIds = OPTIONS.filter((o) => own.some((p) => p.option === o));
    sections.push({
      id: `exploration-${name}`,
      kind: 'exploration',
      title: name,
      subtitle: `explorations/${name}`,
      align: false,
      columns: OPTIONS,
      lines: explorationLines(design, own, false),
      readme: `explorations/${name}/README.md`,
      exploration: explorationInfo(name, read(`explorations/${name}/README.md`), optionIds),
    });
  }

  if (archive.length > 0 || archiveFiles.length > 0) {
    const files: FileLink[] = archiveFiles.map((path) => ({ path, root: 'head' }));
    const section: Section = {
      id: 'archive',
      kind: 'archive',
      title: 'Archive',
      subtitle: 'archive',
      align: true,
      collapsible: true,
      collapsed: true,
      columns: vpIds,
      lines: [...archive].sort(byOrderPath).map((p) => ({ cells: cellsFor(p, 'head') })),
    };
    if (files.length > 0) section.files = files;
    sections.push(section);
  }
  return sections;
}

function byOrderPath(a: PageInfo, b: PageInfo): number {
  return compare(a.path, b.path);
}

/**
 * Lines for one exploration: for each screen path and viewport, the options
 * side by side. With prefix=true each heading names the exploration folder.
 */
export function explorationLines(design: DesignJson, pages: PageInfo[], prefix: boolean): Line[] {
  const byPath = new Map<string, PageInfo[]>();
  for (const p of pages) {
    const key = p.optionPath ?? p.path;
    const list = byPath.get(key) ?? [];
    list.push(p);
    byPath.set(key, list);
  }
  const lines: Line[] = [];
  for (const key of [...byPath.keys()].sort(compare)) {
    const options = (byPath.get(key) ?? []).sort((a, b) => compare(a.option ?? '', b.option ?? ''));
    let first = true;
    for (const vp of design.viewports) {
      const cells = options
        .filter((p) => p.viewports.includes(vp.id))
        .map((p) => {
          const [cell] = cellsFor(p, 'head', `Option ${p.option}`, [vp.id]);
          return { ...(cell as Cell), col: p.option ?? '' };
        });
      if (cells.length === 0) continue;
      const exploration = options[0]?.exploration ?? '';
      const line: Line = { cells };
      if (first) line.heading = prefix ? `explorations/${exploration} · ${key}` : key;
      lines.push(line);
      first = false;
    }
  }
  return lines;
}

/** Position of every page on the board, for ordering preview sections the same way. */
export function boardOrder(sections: Section[]): Map<string, number> {
  const order = new Map<string, number>();
  for (const s of sections) {
    for (const line of s.lines) {
      for (const cell of line.cells) {
        if (!order.has(cell.path)) order.set(cell.path, order.size);
      }
    }
  }
  return order;
}
