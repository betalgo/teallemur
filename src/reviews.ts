// The optional reviews file: open pull requests waiting for review, each with
// its preview. `hub --reviews` lists them all on the home page; `build
// --reviews` shows a product's own as a strip at the top of its board.
//
// The file is a JSON array of
//   { "product": "<slug>", "title": "…", "number": 12, "url": "https://…",
//     "previewUrl": "https://…" | null, "updatedAt": "<ISO 8601>" | null }
//
// The list is optional by design: a missing, blank or unreadable file means
// "no list", never an error, so whoever writes it can simply leave it out
// when the pull requests cannot be read. Entries that do not fit the shape
// are skipped, each with a warning.

import { readFileSync } from 'node:fs';
import { isFile } from './files.ts';
import type { Review } from './model.ts';

export type { Review };

export interface ReviewsFile {
  /** The open pull requests, newest change first; null when there is no list to show. */
  reviews: Review[] | null;
  /** One line per problem: an unreadable file or a skipped entry. */
  warnings: string[];
}

const SLUG = /^[a-z0-9]+(-[a-z0-9]+)*$/;
const ISO_DATE = /^\d{4}-\d{2}-\d{2}(T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:?\d{2})?)?$/;
const TITLE_MAX = 300;

/** An http(s) URL, or null for anything else (a `javascript:` link, a relative path, garbage). */
function webUrl(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** One entry of the file as a Review, or the reason it is skipped. */
export function parseReview(value: unknown): Review | string {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return 'not an object';
  const v = value as Record<string, unknown>;
  if (typeof v.product !== 'string' || !SLUG.test(v.product)) return 'product must be a product slug';
  const title = typeof v.title === 'string' ? v.title.replace(/\s+/g, ' ').trim() : '';
  if (!title) return 'title must be a non-empty string';
  if (typeof v.number !== 'number' || !Number.isSafeInteger(v.number) || v.number <= 0) return 'number must be a positive whole number';
  const url = webUrl(v.url);
  if (!url) return 'url must be an http(s) URL';
  let previewUrl: string | null = null;
  if (v.previewUrl !== undefined && v.previewUrl !== null) {
    previewUrl = webUrl(v.previewUrl);
    if (!previewUrl) return 'previewUrl must be an http(s) URL or null';
  }
  let updatedAt: string | null = null;
  if (v.updatedAt !== undefined && v.updatedAt !== null) {
    if (typeof v.updatedAt !== 'string' || !ISO_DATE.test(v.updatedAt)) return 'updatedAt must be an ISO 8601 date or null';
    updatedAt = v.updatedAt;
  }
  return {
    product: v.product,
    title: title.length > TITLE_MAX ? `${title.slice(0, TITLE_MAX - 1)}…` : title,
    number: v.number,
    url,
    previewUrl,
    updatedAt,
  };
}

/** Newest change first; then by product and number, so the order never depends on the file's. */
export function sortReviews(reviews: Review[]): Review[] {
  const time = (r: Review): number => {
    const t = r.updatedAt ? Date.parse(r.updatedAt) : Number.NaN;
    return Number.isNaN(t) ? Number.NEGATIVE_INFINITY : t;
  };
  return [...reviews].sort((a, b) => time(b) - time(a) || (a.product < b.product ? -1 : a.product > b.product ? 1 : 0) || b.number - a.number);
}

/** Parses the text of a reviews file. Blank text means no list. */
export function parseReviews(text: string, source = 'reviews file'): ReviewsFile {
  if (text.trim() === '') return { reviews: null, warnings: [] };
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch (e) {
    return { reviews: null, warnings: [`${source} is not valid JSON (${e instanceof Error ? e.message : String(e)}); the review list is left out`] };
  }
  if (!Array.isArray(json)) return { reviews: null, warnings: [`${source} must hold a JSON array; the review list is left out`] };
  const reviews: Review[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  json.forEach((entry, i) => {
    const r = parseReview(entry);
    if (typeof r === 'string') {
      warnings.push(`${source} entry ${i + 1} skipped: ${r}`);
      return;
    }
    const key = `${r.product}#${r.number}`;
    if (seen.has(key)) {
      warnings.push(`${source} entry ${i + 1} skipped: ${key} is listed twice`);
      return;
    }
    seen.add(key);
    reviews.push(r);
  });
  return { reviews: sortReviews(reviews), warnings };
}

/** Reads a reviews file. A missing file means no list, with a warning. */
export function readReviews(path: string): ReviewsFile {
  if (!isFile(path)) return { reviews: null, warnings: [`no reviews file at ${path}; the review list is left out`] };
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch (e) {
    return { reviews: null, warnings: [`could not read ${path} (${e instanceof Error ? e.message : String(e)}); the review list is left out`] };
  }
  return parseReviews(text, path);
}
