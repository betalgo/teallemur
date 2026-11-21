// Words and numbers shown in the interface. Pure, shared by the viewer and
// the pages the CLI writes.

import type { AssetFile, Viewport } from '../model.ts';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "list" -> "List", "email-digest" -> "Email digest". */
export function humanize(id: string): string {
  const words = id.replace(/[-_]+/g, ' ').trim();
  return words ? words[0]!.toUpperCase() + words.slice(1) : id;
}

/** "3 screens", "1 screen". */
export function count(n: number, one: string, many = `${one}s`): string {
  return `${n} ${n === 1 ? one : many}`;
}

/** "16 Oct 2026" from an ISO 8601 date, in the date's own time zone. */
export function day(iso: string | null | undefined): string {
  const m = iso ? /^(\d{4})-(\d{2})-(\d{2})/.exec(iso) : null;
  if (!m) return '';
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1] ?? m[2]} ${m[1]}`;
}

/** "16 Oct 2026, 14:32" from an ISO 8601 date and time, in its own time zone. */
export function dayTime(iso: string | null | undefined): string {
  const d = day(iso);
  const t = iso ? /T(\d{2}):(\d{2})/.exec(iso) : null;
  return d && t ? `${d}, ${t[1]}:${t[2]}` : d;
}

/** "Desktop · 1440 × 900". */
export function sizeText(vp: Viewport, sep = ' · '): string {
  return `${humanize(vp.id)}${sep}${vp.width} × ${vp.height}`;
}

/** "PR 12". */
export function prNumber(n: number): string {
  return `PR ${n}`;
}

export function shortSha(sha: string): string {
  return sha.slice(0, 7);
}

/** "1 KB", "182 KB", "1.4 MB": rounded, never below 1 KB for a file with any bytes. */
export function bytesText(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1).replace(/\.0$/, '')} MB`;
  return `${bytes > 0 ? Math.max(1, Math.round(bytes / 1024)) : 0} KB`;
}

/** "1512 × 256", or null when the file does not say. */
export function pixelText(file: Pick<AssetFile, 'width' | 'height'>): string | null {
  return file.width !== null && file.height !== null ? `${file.width} × ${file.height}` : null;
}

/** A file's facts: "PNG · 1512 × 256 · 182 KB". */
export function factsText(file: AssetFile): string {
  return [file.format, pixelText(file), bytesText(file.bytes)].filter(Boolean).join(' · ');
}

/** The file name at the end of a path. */
export function fileName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1);
}
