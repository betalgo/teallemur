// The per-product manifest contract between `build` and whatever reads its
// output (this tool's `hub`, and hubs that wrap it). It is name-neutral on
// purpose: renaming the tool must not change it, or every hub breaks.

/** Per-product manifest written by `build` and read by `hub`. */
export const MANIFEST_FILE = 'board.json';

/** The manifest's generator marker. The hub only lists manifests that carry it. */
export const GENERATOR = 'design-board';
