// The tool's names, in one place. A rename changes this module, the name
// and bin entries in package.json, and the README title; nothing else.
// The manifest contract (src/manifest.ts) carries no name, so a rename never
// touches a hub that reads it.

/** The product name people see: the viewer's wordmark, page titles and the hub footer. */
export const PRODUCT_NAME = 'Teal Lemur';

/** The command people type, also the prefix of every CLI message. */
export const COMMAND = 'teallemur';

/**
 * Prefix of the browser storage keys the viewer uses for per-viewer
 * preferences. It keeps the tool's first name on purpose, so preferences
 * people have saved survive renames. Do not change it in a rename.
 */
export const STORAGE_PREFIX = 'design-viewer';
