// `build`: writes one product's board, or a preview when a base
// is given, under <out>/<slug>/.

import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join, resolve, sep } from 'node:path';
import { checkRepo } from '../check/index.ts';
import { copyFile, isFile, readText, walk } from '../files.ts';
import { assetFiles } from '../images.ts';
import { COPIED_DIRS, SCREEN_PATH, TOKENS_CSS, isHtml } from '../layout.ts';
import { GENERATOR, MANIFEST_FILE } from '../manifest.ts';
import type { DesignJson, Finding, Manifest, OverviewCard, Review, ViewerData } from '../model.ts';
import { OVERVIEW_DIR, appliedStack, fontAliases, fontFacesCss, overviewPage, type OverviewPage } from '../overview/page.ts';
import { buildOverview } from '../overview/tokens.ts';
import { PRODUCT_NAME } from '../product.ts';
import { coverFrame, ownSizes } from '../sizes.ts';
import { FILES_DIR, filesPage } from './files-page.ts';
import { commitInfo } from './git.ts';
import { byOrder, readPage, readPages, type PageInfo } from './pages.ts';
import { changeName, classify, previewSections } from './preview.ts';
import { boardSections } from './sections.ts';
import { errorPage, viewerPage } from './shell.ts';

export interface BuildOptions {
  repo: string;
  out: string;
  base?: string;
  label?: string;
  /** Directory holding the bundled viewer: viewer.js, viewer.css and assets/. */
  viewerAssets: string;
  /**
   * Open pull requests from a reviews file (any product; this build keeps its
   * own). A board shows them as a strip at the top. Ignored for previews.
   */
  reviews?: Review[] | null;
}

export interface BuildResult {
  findings: Finding[];
  /** The product folder written, or null when nothing was written. */
  productDir: string | null;
  manifest: Manifest | null;
}

export const VIEWER_DIR = '_viewer';
export const BASE_DIR = '_base';
export const BOARD_DIR = 'board';

export class UsageError extends Error {}

export function buildProduct(options: BuildOptions): BuildResult {
  const repo = resolve(options.repo);
  const base = options.base === undefined ? undefined : resolve(options.base);
  const check = checkRepo(repo, base === undefined ? {} : { base });
  const files = check.files;
  const commit = commitInfo(repo);
  const screens = files.filter((p) => SCREEN_PATH.test(p)).length;

  if (check.findings.length > 0) {
    const slug = check.loaded.slug;
    if (!slug) return { findings: check.findings, productDir: null, manifest: null };
    const dir = productDir(options.out, slug, [repo, base]);
    const name = check.loaded.name;
    const manifest: Manifest = {
      generator: GENERATOR,
      tool: PRODUCT_NAME,
      formatVersion: 1,
      kind: 'error',
      product: { name, slug },
      commit,
      screens,
      frames: 0,
      findings: check.findings,
    };
    copyViewer(options.viewerAssets, join(dir, VIEWER_DIR));
    writeFileSync(join(dir, 'index.html'), errorPage(name ?? slug, slug, check.findings, commit));
    writeJson(join(dir, MANIFEST_FILE), manifest);
    return { findings: check.findings, productDir: dir, manifest };
  }

  const design = check.loaded.design as DesignJson;
  const dir = productDir(options.out, design.slug, [repo, base]);

  for (const p of files) {
    if (COPIED_DIRS.some((d) => p.startsWith(`${d}/`))) copyFile(join(repo, p), join(dir, p));
  }
  copyViewer(options.viewerAssets, join(dir, VIEWER_DIR));

  const { pages, archive } = readPages(repo, files, design);
  const archiveFiles = files.filter((p) => p.startsWith('archive/') && !isHtml(p));
  const read = (p: string): string | null => (isFile(join(repo, p)) ? readText(join(repo, p)) : null);
  const product = { name: design.name, slug: design.slug };
  // Pages written next to the board link back to it: in a preview, the full board under board/.
  const boardHref = base === undefined ? '../' : `../${BOARD_DIR}/`;
  const label = options.label ?? null;
  const change = base === undefined ? undefined : changeName(label);
  const overview = writeOverview(dir, read(TOKENS_CSS), design, pages, commit, boardHref);
  const assets = assetFiles(repo, files);
  if (assets.length > 0) {
    mkdirSync(join(dir, FILES_DIR), { recursive: true });
    writeFileSync(join(dir, FILES_DIR, 'index.html'), filesPage({ product, commit, files: assets, boardHref, change }));
  }
  const board = boardSections(design, pages, archive, archiveFiles, read, overview ?? undefined, assets, `${FILES_DIR}/`);
  const frames = board.reduce((n, s) => n + s.lines.reduce((m, l) => m + l.cells.length, 0), 0);
  const boardFields = { product, commit, viewports: design.viewports, flows: design.flows, board };
  // Every screen at a size of its own: the board, and a preview, show every page at once.
  const own = ownSizes(pages) ? { ownSizes: true } : {};

  const manifest: Manifest = {
    generator: GENERATOR,
    tool: PRODUCT_NAME,
    formatVersion: 1,
    kind: base === undefined ? 'board' : 'preview',
    product,
    commit,
    screens,
    frames,
    cover: coverFrame(board, design.viewports),
  };

  if (base === undefined) {
    const data: ViewerData = { kind: 'board', ...boardFields, ...own, roots: { head: '', base: `${BASE_DIR}/` } };
    const reviews = (options.reviews ?? []).filter((r) => r.product === design.slug);
    if (reviews.length > 0) data.reviews = reviews;
    writeFileSync(join(dir, 'index.html'), viewerPage(`${design.name} · design board`, data, ''));
  } else {
    const baseFiles = walk(base);
    for (const p of baseFiles) {
      if (p.startsWith('design-system/') || p.startsWith('screens/')) copyFile(join(base, p), join(dir, BASE_DIR, p));
    }
    const classification = classify(repo, base, files, baseFiles);
    const basePages = new Map<string, PageInfo>();
    for (const p of classification.changed) basePages.set(p, readPage(base, p, design));
    const sections = previewSections(design, classification, pages, basePages, board, archive);
    const baseCommit = commitInfo(base);

    const data: ViewerData = {
      kind: 'preview',
      ...boardFields,
      ...own,
      change,
      roots: { head: '', base: `${BASE_DIR}/` },
      preview: {
        label,
        base: baseCommit,
        boardHref: `${BOARD_DIR}/`,
        shared:
          classification.shared.length > 0 ? { files: classification.shared, tokens: classification.tokens } : null,
        sections,
      },
    };
    writeFileSync(join(dir, 'index.html'), viewerPage(`${label ?? design.name} · design preview`, data, ''));

    const boardData: ViewerData = { kind: 'board', ...boardFields, ...own, change, roots: { head: '../', base: `../${BASE_DIR}/` } };
    mkdirSync(join(dir, BOARD_DIR), { recursive: true });
    writeFileSync(join(dir, BOARD_DIR, 'index.html'), viewerPage(`${design.name} · design board`, boardData, '../'));

    manifest.base = baseCommit;
    manifest.label = label;
    manifest.classification = classification;
  }

  writeJson(join(dir, MANIFEST_FILE), manifest);
  return { findings: [], productDir: dir, manifest };
}

/** Empties and returns <out>/<slug>, refusing to touch the repos being read. */
function productDir(out: string, slug: string, protect: (string | undefined)[]): string {
  const dir = resolve(out, slug);
  for (const p of protect) {
    if (p === undefined) continue;
    const r = resolve(p);
    if (r === dir || r.startsWith(dir + sep)) {
      throw new UsageError(`refusing to write ${dir}: it would overwrite the repo at ${r}`);
    }
  }
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  return dir;
}

/**
 * Writes the design system overview page under <dir>/_overview/ from the
 * product's tokens.css, and returns the board's overview card; null when the
 * product has no tokens.
 */
function writeOverview(dir: string, tokensCss: string | null, design: DesignJson, pages: PageInfo[], commit: Manifest['commit'], boardHref: string): OverviewCard | null {
  if (tokensCss === null) return null;
  const overview = buildOverview(tokensCss);
  if (overview.total === 0) return null;
  const aliases = fontAliases(overview.fontFaces);
  const size = (p: PageInfo): OverviewPage => {
    const vp = design.viewports.find((v) => v.id === p.viewports[0]) ?? (design.viewports[0] as DesignJson['viewports'][number]);
    return { path: p.path, title: p.title, viewport: vp };
  };
  const brand = pages.filter((p) => p.kind === 'brand').sort(byOrder).map(size);
  const components = pages.filter((p) => p.kind === 'component').sort(byOrder).map(size);
  mkdirSync(join(dir, OVERVIEW_DIR), { recursive: true });
  writeFileSync(join(dir, OVERVIEW_DIR, 'fonts.css'), fontFacesCss(overview.fontFaces, aliases));
  writeFileSync(
    join(dir, OVERVIEW_DIR, 'index.html'),
    overviewPage({ product: { name: design.name, slug: design.slug }, commit, overview, aliases, brand, components, boardHref }),
  );
  return {
    href: `${OVERVIEW_DIR}/`,
    fonts: `${OVERVIEW_DIR}/fonts.css`,
    tokens: overview.total,
    colours: overview.colourCount,
    palette: overview.palette,
    fontStacks: overview.fonts.slice(0, 3).map((f) => appliedStack(f.css, aliases)),
  };
}

/** Copies the bundled viewer (scripts, styles, fonts and marks) into a site folder. */
export function copyViewer(from: string, to: string): void {
  for (const p of walk(from)) copyFile(join(from, p), join(to, p));
}

function writeJson(path: string, value: unknown): void {
  writeFileSync(path, `${JSON.stringify(value, null, 2)}\n`);
}
