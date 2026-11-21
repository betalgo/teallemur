// The design repo standard's layout, as path tests shared by check and build.

/** Allowed top-level files and directories. */
export const TOP_LEVEL_FILES = new Set([
  'README.md',
  'AGENTS.md',
  'design.json',
  'package.json',
  'package-lock.json',
  '.gitignore',
  '.gitattributes',
]);
export const TOP_LEVEL_DIRS = new Set(['design-system', 'screens', 'explorations', 'archive', 'docs', 'scripts', '.github']);

export const TOKENS_CSS = 'design-system/tokens.css';
export const COMPONENTS_CSS = 'design-system/components.css';
export const SHARED_DIR = '_shared';
export const OPTIONS = ['a', 'b', 'c', 'd'];

const NAME = '[a-z0-9]+(?:-[a-z0-9]+)*';
/** screens/<flow>/<screen>--<state>.html */
export const SCREEN_PATH = new RegExp(`^screens/(${NAME})/(${NAME})--(${NAME})\\.html$`);
/** explorations/<folder>/<option>/screens/<flow>/<screen>--<state>.html */
export const EXPLORATION_SCREEN_PATH = new RegExp(
  `^explorations/([^/]+)/([a-d])/screens/(${NAME})/(${NAME})--(${NAME})\\.html$`,
);
export const SHARED_CSS_PATH = /^screens\/_shared\/[^/]+\.css$/;
export const COMPONENT_PAGE_PATH = /^design-system\/components\/([^/]+)\.html$/;
export const BRAND_PAGE_PATH = /^design-system\/brand\/([^/]+)\.html$/;
export const ASSET_PATH = /^design-system\/assets\//;

export type PageKind = 'screen' | 'component' | 'brand' | 'exploration';

/** Board pages: the HTML files that get frames and must follow the page rules. */
export function pageKind(path: string): PageKind | null {
  if (SCREEN_PATH.test(path)) return 'screen';
  if (COMPONENT_PAGE_PATH.test(path)) return 'component';
  if (BRAND_PAGE_PATH.test(path)) return 'brand';
  if (EXPLORATION_SCREEN_PATH.test(path)) return 'exploration';
  return null;
}

/** Files whose colours, fonts and URLs are linted. */
export function isLinted(path: string): boolean {
  return /^(design-system|screens|explorations)\//.test(path) && /\.(html?|css|svg)$/i.test(path);
}

export function isHtml(path: string): boolean {
  return /\.html?$/i.test(path);
}

/** Directories copied into the built site. */
export const COPIED_DIRS = ['design-system', 'screens', 'explorations', 'archive'];
