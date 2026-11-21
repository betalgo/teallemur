// Data shapes shared by the CLI and the viewer. The viewer reads ViewerData
// from the page; the hub reads Manifest from each product folder.

import type { GENERATOR } from './manifest.ts';

export interface Viewport {
  id: string;
  width: number;
  height: number;
}

export interface Flow {
  id: string;
  title: string;
}

export interface DesignJson {
  schemaVersion: 1;
  name: string;
  slug: string;
  viewports: Viewport[];
  flows: Flow[];
}

export interface Finding {
  /** Repo-relative POSIX path. */
  path: string;
  line: number;
  rule: string;
  message: string;
}

export interface CommitInfo {
  sha: string;
  /** ISO 8601 commit date, or null when unknown. */
  date: string | null;
}

/** Which copy of the repo a frame shows: the head (built) one or the base of a preview. */
export type Root = 'head' | 'base';

export interface Cell {
  /** Repo-relative path of the design file. */
  path: string;
  root: Root;
  /** Viewport id the frame is shown at. */
  viewport: string;
  /** Column key; cells with the same key line up in aligned sections. */
  col: string;
  /** Frame label, for example "auth / login / error · phone". */
  label: string;
  /** The page's <title>. */
  title: string;
  /** Viewports this page can be shown at (focus view switcher). */
  viewports: string[];
  /** Flow id, for screens and exploration screens. */
  flow?: string;
  /** Short qualifier, for example "Before", "After" or "Option b". */
  caption?: string;
  /** One line from design:note. */
  note?: string;
  /** The media template from design:frame, for example "linkedin-profile" (src/media/templates.ts). */
  frame?: string;
  /** The ready file the page names with design:download; head frames only. */
  download?: AssetFile;
}

/** A file under design-system/assets/: one a page names for download, or an image on the Files page. */
export interface AssetFile {
  /** Repo-relative path. */
  path: string;
  /** What the button and the facts call it: "PNG", "SVG", "JPG", "WebP", "ICO", else the extension in capitals. */
  format: string;
  /** Size in pixels, when the file says (images only). */
  width: number | null;
  height: number | null;
  /** Size in bytes. */
  bytes: number;
}

export interface Line {
  heading?: string;
  cells: Cell[];
}

export interface FileLink {
  path: string;
  root: Root;
}

export type SectionKind =
  | 'design-system'
  | 'flow'
  | 'brand'
  | 'components'
  | 'exploration'
  | 'archive'
  | 'changed'
  | 'added'
  | 'archived';

export interface Section {
  id: string;
  kind: SectionKind;
  title: string;
  subtitle?: string;
  /** Aligned sections line cells up in columns by Cell.col. */
  align: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  /** Column order for aligned sections. */
  columns: string[];
  lines: Line[];
  /** Plain file links: archived files, or non-HTML archive content. */
  files?: FileLink[];
  /** Repo path of an exploration's README.md. */
  readme?: string;
  /** What an exploration asks, read from its README.md. */
  exploration?: ExplorationInfo;
  /** The design system section's overview card. */
  overview?: OverviewCard;
  /** The design system's images: every image under design-system/assets/, in path order. The Files card and the Files page show them. */
  assets?: AssetFile[];
  /** The Files page, relative to the product folder; set when there are images. */
  filesHref?: string;
}

/** The first card on the board: the product's design system overview at a glance. */
export interface OverviewCard {
  /** The overview page, relative to the product folder. */
  href: string;
  /** Stylesheet with the product's fonts under their own names, relative to the product folder. */
  fonts: string;
  tokens: number;
  colours: number;
  /** Up to eight CSS colours from the product's tokens. */
  palette: string[];
  /** Font stacks for the "Aa" samples, one per font token (at most three). */
  fontStacks: string[];
}

export interface OptionInfo {
  /** "a" to "d". */
  id: string;
  /** Short name from the README, for example "Above the text". */
  title: string | null;
  /** The rest of the README's line for the option. */
  text: string | null;
}

export interface ExplorationInfo {
  /** The question the reviewer answers, from the README. */
  question: string | null;
  /** The exploration folder's date (yyyy-mm-dd), when its name starts with one. */
  since: string | null;
  options: OptionInfo[];
}

export interface TokenChange {
  /** File the custom property lives in. */
  file: string;
  /** Enclosing selector and at-rules, for example ":root". */
  context: string;
  name: string;
  old: string | null;
  new: string | null;
}

export interface SharedChanges {
  /** Shared files whose bytes differ: tokens.css, components.css, screens/_shared, assets. */
  files: string[];
  tokens: TokenChange[];
}

export interface PreviewData {
  label: string | null;
  base: CommitInfo | null;
  /** Link from the preview page to the standalone board at head. */
  boardHref: string;
  shared: SharedChanges | null;
  /** Changed, added and archived sections, in page order. */
  sections: Section[];
}

/** An open pull request waiting for review, from the optional reviews file (src/reviews.ts). */
export interface Review {
  /** The product's slug, as in its design.json. */
  product: string;
  title: string;
  number: number;
  /** The pull request page (http or https). */
  url: string;
  /** The pull request's preview (http or https), or null when it has none yet. */
  previewUrl: string | null;
  /** When the pull request last changed (ISO 8601), or null when unknown. */
  updatedAt: string | null;
}

export interface ViewerData {
  kind: 'board' | 'preview';
  product: { name: string; slug: string };
  commit: CommitInfo | null;
  viewports: Viewport[];
  flows: Flow[];
  /** URL prefixes, relative to the page, of the head and base file copies. */
  roots: { head: string; base: string };
  board: Section[];
  preview?: PreviewData;
  /** The product's open pull requests, newest change first (boards built with a reviews file). */
  reviews?: Review[];
  /**
   * Boards whose every screen page declares one size of its own: the board,
   * and a preview of it, show every page at once, each at its own size, with
   * no size control.
   */
  ownSizes?: boolean;
  /**
   * A preview, and the full board built with it: the change's short name, for
   * example "PR 12", so downloads say whose file they are.
   */
  change?: string;
}

export interface Classification {
  /** Pages whose bytes differ between base and head. */
  changed: string[];
  /** Pages that exist only in head. */
  added: string[];
  /** Pages that exist only in base (moved to archive/). */
  removed: string[];
  /** Files under archive/ that exist only in head. */
  archived: string[];
  /** Exploration folders with added or changed files. */
  explorations: string[];
  /** Shared files whose bytes differ. */
  shared: string[];
  tokens: TokenChange[];
}

export interface Manifest {
  generator: typeof GENERATOR;
  formatVersion: 1;
  /** The tool's product name, for information only: readers must not depend on it. */
  tool: string;
  kind: 'board' | 'preview' | 'error';
  product: { name: string | null; slug: string };
  commit: CommitInfo | null;
  /** Number of screen state files. */
  screens: number;
  /** Number of frames on the board. */
  frames: number;
  /** The first screen at the board's main size: the hub's thumbnail. */
  cover?: { path: string; viewport: Viewport } | null;
  base?: CommitInfo | null;
  label?: string | null;
  classification?: Classification;
  findings?: Finding[];
}
