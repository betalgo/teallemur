// Reads board pages (screens, component pages, brand pages, exploration
// screens and archived HTML) and their design:* metadata.

import { join } from 'node:path';
import { metaContent, parseHtml, titleText } from '../check/html.ts';
import { downloadTarget } from '../check/index.ts';
import { compare, isFile, readText } from '../files.ts';
import { assetFile } from '../images.ts';
import { BRAND_PAGE_PATH, COMPONENT_PAGE_PATH, EXPLORATION_SCREEN_PATH, SCREEN_PATH, isHtml, pageKind, type PageKind } from '../layout.ts';
import type { AssetFile, DesignJson } from '../model.ts';

export interface PageInfo {
  path: string;
  kind: PageKind | 'archive';
  title: string;
  /** Effective viewport ids, in design.json order. */
  viewports: string[];
  /** Whether the page declares exactly one size of its own with design:viewports. */
  ownSize: boolean;
  order: number | null;
  note: string | null;
  /** The media template it names with design:frame. */
  frame: string | null;
  /** The ready file it names with design:download, when that file is under design-system/assets/ and exists. Board pages only. */
  download: AssetFile | null;
  flow?: string;
  screen?: string;
  state?: string;
  exploration?: string;
  option?: string;
  /** Path inside the option folder, for exploration screens: screens/<flow>/<file>. */
  optionPath?: string;
  /** Short name for component and brand pages. */
  name?: string;
}

export function readPage(root: string, path: string, design: DesignJson): PageInfo {
  const html = parseHtml(readText(join(root, path)));
  const all = design.viewports.map((v) => v.id);
  const meta = metaContent(html, 'design:viewports');
  let viewports = all;
  let ownSize = false;
  if (meta) {
    const wanted = new Set(meta.value.split(',').map((s) => s.trim()));
    const picked = all.filter((id) => wanted.has(id));
    if (picked.length > 0) viewports = picked;
    ownSize = picked.length === 1;
  }
  const orderMeta = metaContent(html, 'design:order');
  const order = orderMeta && orderMeta.value.trim() !== '' && Number.isFinite(Number(orderMeta.value)) ? Number(orderMeta.value) : null;
  const noteMeta = metaContent(html, 'design:note');
  const note = noteMeta && noteMeta.value.trim() ? noteMeta.value.trim() : null;
  const frame = metaContent(html, 'design:frame')?.value.trim() || null;
  const fileName = path.slice(path.lastIndexOf('/') + 1).replace(/\.html?$/i, '');
  const kind = pageKind(path);
  // Archived pages offer no download: the check does not follow them.
  const wanted = kind ? metaContent(html, 'design:download')?.value.trim() : '';
  const target = wanted ? downloadTarget(path, wanted) : null;

  const page: PageInfo = {
    path,
    kind: kind ?? 'archive',
    title: titleText(html) || fileName,
    viewports,
    ownSize,
    order,
    note,
    frame,
    download: target && isFile(join(root, target)) ? assetFile(root, target) : null,
  };
  let m = SCREEN_PATH.exec(path);
  if (m) {
    page.flow = m[1];
    page.screen = m[2];
    page.state = m[3];
  } else if ((m = EXPLORATION_SCREEN_PATH.exec(path))) {
    page.exploration = m[1];
    page.option = m[2];
    page.flow = m[3];
    page.screen = m[4];
    page.state = m[5];
    page.optionPath = path.split('/').slice(3).join('/');
  } else if ((m = COMPONENT_PAGE_PATH.exec(path) ?? BRAND_PAGE_PATH.exec(path))) {
    page.name = m[1];
  }
  return page;
}

/** Board pages of the repo, plus archived HTML pages. */
export function readPages(root: string, files: string[], design: DesignJson): { pages: PageInfo[]; archive: PageInfo[] } {
  const pages: PageInfo[] = [];
  const archive: PageInfo[] = [];
  for (const path of files) {
    if (pageKind(path)) pages.push(readPage(root, path, design));
    else if (path.startsWith('archive/') && isHtml(path)) archive.push(readPage(root, path, design));
  }
  return { pages, archive };
}

/** design:order first (lowest first), then path. */
export function byOrder(a: PageInfo, b: PageInfo): number {
  const ao = a.order ?? Number.POSITIVE_INFINITY;
  const bo = b.order ?? Number.POSITIVE_INFINITY;
  return ao !== bo ? (ao < bo ? -1 : 1) : compare(a.path, b.path);
}

/** Label without the viewport: "flow / screen / state". */
export function labelBase(page: PageInfo): string {
  switch (page.kind) {
    case 'screen':
      return `${page.flow} / ${page.screen} / ${page.state}`;
    case 'component':
      return `components / ${page.name}`;
    case 'brand':
      return `brand / ${page.name}`;
    case 'exploration':
      return `${page.option} / ${page.flow} / ${page.screen} / ${page.state}`;
    case 'archive':
      return page.path.replace(/^archive\//, '').replace(/\.html?$/i, '');
  }
}
