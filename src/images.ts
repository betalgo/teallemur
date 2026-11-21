// Facts about a ready file for the Download buttons and the Files list: its
// format, its size in pixels where the file says, and its size in bytes.
// Read from the file's own bytes; nothing is converted or made.

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { attrValue, parseHtml } from './check/html.ts';
import { ASSET_PATH } from './layout.ts';
import type { AssetFile } from './model.ts';

/** The image types the Files list shows, by extension, with the name people see. Fonts and other files are not images. */
export const IMAGE_FORMATS: Readonly<Record<string, string>> = {
  svg: 'SVG',
  png: 'PNG',
  jpg: 'JPG',
  jpeg: 'JPG',
  webp: 'WebP',
  ico: 'ICO',
};

function extension(path: string): string {
  const name = path.slice(path.lastIndexOf('/') + 1);
  const dot = name.lastIndexOf('.');
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : '';
}

/** Whether a repo path is an image the Files list shows. */
export function isListedImage(path: string): boolean {
  return ASSET_PATH.test(path) && extension(path) in IMAGE_FORMATS;
}

/** "PNG" for an image; the extension in capitals for any other file; "File" without one. */
export function formatOf(path: string): string {
  const ext = extension(path);
  return IMAGE_FORMATS[ext] ?? (ext ? ext.toUpperCase() : 'File');
}

export interface PixelSize {
  width: number;
  height: number;
}

const ascii = (b: Uint8Array, at: number, n: number): string => String.fromCharCode(...b.subarray(at, at + n));
const u16be = (b: Uint8Array, at: number): number => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0);
const u16le = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8);
const u24le = (b: Uint8Array, at: number): number => u16le(b, at) | ((b[at + 2] ?? 0) << 16);
const u32be = (b: Uint8Array, at: number): number => ((u16be(b, at) << 16) >>> 0) + u16be(b, at + 2);
const u32le = (b: Uint8Array, at: number): number => ((u16le(b, at + 2) << 16) >>> 0) + u16le(b, at);

const sized = (width: number, height: number): PixelSize | null =>
  Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0 ? { width, height } : null;

function pngSize(b: Uint8Array): PixelSize | null {
  if (b.length < 24 || ascii(b, 1, 3) !== 'PNG' || b[0] !== 0x89 || ascii(b, 12, 4) !== 'IHDR') return null;
  return sized(u32be(b, 16), u32be(b, 20));
}

/**
 * The EXIF orientation in an APP1 segment starting at `at` (its 0xff), or
 * null. Orientations 5 to 8 turn the picture a quarter, so width and height
 * swap where it is shown.
 */
function exifOrientation(b: Uint8Array, at: number): number | null {
  if (ascii(b, at + 4, 6) !== 'Exif\0\0') return null;
  const tiff = at + 10;
  const order = ascii(b, tiff, 2);
  if (order !== 'II' && order !== 'MM') return null;
  const u16 = order === 'II' ? u16le : u16be;
  const u32 = order === 'II' ? u32le : u32be;
  const ifd = tiff + u32(b, tiff + 4);
  const entries = u16(b, ifd);
  for (let n = 0; n < entries; n++) {
    const entry = ifd + 2 + n * 12;
    if (entry + 12 > b.length) return null;
    if (u16(b, entry) === 0x0112) return u16(b, entry + 8);
  }
  return null;
}

/**
 * The first start-of-frame marker holds the size; other segments are skipped
 * by their length. A camera's EXIF orientation turns it as browsers show it.
 */
function jpegSize(b: Uint8Array): PixelSize | null {
  if (b[0] !== 0xff || b[1] !== 0xd8) return null;
  let turned = false;
  let i = 2;
  while (i + 3 < b.length) {
    if (b[i] !== 0xff) return null;
    const marker = b[i + 1] ?? 0;
    if (marker === 0xff) {
      i++;
      continue;
    }
    if (marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      i += 2;
      continue;
    }
    const length = u16be(b, i + 2);
    const frame = marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
    if (frame) {
      if (i + 8 >= b.length) return null;
      const [width, height] = [u16be(b, i + 7), u16be(b, i + 5)];
      return turned ? sized(height, width) : sized(width, height);
    }
    if (length < 2) return null;
    if (marker === 0xe1) turned ||= (exifOrientation(b, i) ?? 1) >= 5;
    i += 2 + length;
  }
  return null;
}

function webpSize(b: Uint8Array): PixelSize | null {
  if (b.length < 30 || ascii(b, 0, 4) !== 'RIFF' || ascii(b, 8, 4) !== 'WEBP') return null;
  const chunk = ascii(b, 12, 4);
  if (chunk === 'VP8X') return sized(u24le(b, 24) + 1, u24le(b, 27) + 1);
  if (chunk === 'VP8 ') return sized(u16le(b, 26) & 0x3fff, u16le(b, 28) & 0x3fff);
  if (chunk === 'VP8L' && b[20] === 0x2f) {
    const [b1, b2, b3, b4] = [b[21] ?? 0, b[22] ?? 0, b[23] ?? 0, b[24] ?? 0];
    return sized(1 + (((b2 & 0x3f) << 8) | b1), 1 + (((b4 & 0x0f) << 10) | (b3 << 2) | ((b2 & 0xc0) >> 6)));
  }
  return null;
}

/** An icon file holds several sizes; the largest is the one people mean. A 0 in the directory means 256. */
function icoSize(b: Uint8Array): PixelSize | null {
  if (b.length < 6 || u16le(b, 0) !== 0 || u16le(b, 2) !== 1) return null;
  let best: PixelSize | null = null;
  for (let n = 0; n < u16le(b, 4); n++) {
    const at = 6 + n * 16;
    if (at + 2 > b.length) break;
    const width = b[at] || 256;
    const height = b[at + 1] || 256;
    if (!best || width * height > best.width * best.height) best = { width, height };
  }
  return best;
}

/** CSS px per absolute unit. em, ex and % depend on where the SVG is drawn, so they give no size. */
const SVG_UNITS: Readonly<Record<string, number>> = { '': 1, px: 1, in: 96, cm: 96 / 2.54, mm: 96 / 25.4, q: 96 / 101.6, pt: 96 / 72, pc: 16 };

/** A length in CSS px from an SVG width or height, as a browser draws it. */
function svgLength(value: string | null): number | null {
  const m = value === null ? null : /^\s*(\d+(?:\.\d+)?|\.\d+)\s*([a-z]*)\s*$/i.exec(value);
  const unit = m ? SVG_UNITS[(m[2] ?? '').toLowerCase()] : undefined;
  return m && unit !== undefined ? Number(m[1]) * unit : null;
}

/** The root <svg>'s width and height, else its viewBox, rounded to whole px. */
function svgSize(b: Uint8Array): PixelSize | null {
  const root = parseHtml(new TextDecoder().decode(b)).tags.find((t) => t.name === 'svg');
  if (!root) return null;
  const box = (attrValue(root, 'viewbox') ?? '').trim().split(/[\s,]+/).map(Number);
  const boxW = box.length === 4 ? box[2] : undefined;
  const boxH = box.length === 4 ? box[3] : undefined;
  let width = svgLength(attrValue(root, 'width'));
  let height = svgLength(attrValue(root, 'height'));
  // One of the two given: the other follows the viewBox's proportions.
  if (width !== null && height === null && boxW && boxH) height = (width * boxH) / boxW;
  if (height !== null && width === null && boxW && boxH) width = (height * boxW) / boxH;
  if (width === null || height === null) [width, height] = [boxW ?? NaN, boxH ?? NaN];
  return sized(Math.round(width), Math.round(height));
}

/** The image's size in pixels from its bytes, or null when the format is not an image or the file does not say. */
export function imageSize(bytes: Uint8Array, format: string): PixelSize | null {
  switch (format) {
    case 'PNG':
      return pngSize(bytes);
    case 'JPG':
      return jpegSize(bytes);
    case 'WebP':
      return webpSize(bytes);
    case 'ICO':
      return icoSize(bytes);
    case 'SVG':
      return svgSize(bytes);
    default:
      return null;
  }
}

/** Facts about one repo file, read from `root`. */
export function assetFile(root: string, path: string): AssetFile {
  const bytes = readFileSync(join(root, path));
  const format = formatOf(path);
  const size = imageSize(bytes, format);
  return { path, format, width: size?.width ?? null, height: size?.height ?? null, bytes: bytes.length };
}

/** Every image the Files list shows, in path order, from a repo's sorted file list. */
export function assetFiles(root: string, files: string[]): AssetFile[] {
  return files.filter(isListedImage).map((p) => assetFile(root, p));
}
