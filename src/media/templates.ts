// Media templates: outlines of the pages a media image lives on, such as a
// profile banner on a profile or a feed image in a post. A media page is made
// at its upload size and names its template with
// <meta name="design:frame" content="linkedin-profile">; the board shows it in
// the outline at desktop and phone width, with what covers it and its safe
// area marked, and on its own.
//
// A template is data only: where each shape of the page sits, in CSS px of
// the page at that width. How the shapes look is the media template family in
// the design repo's components.css. Shared by check (known ids), build and the
// viewer (the drawing).

import { LINKEDIN } from './linkedin.ts';

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Size {
  width: number;
  height: number;
}

/**
 * How a shape looks: a class family of the media templates ("bar strong" is
 * `.shape-bar.shape-bar--strong`), the image area ("image", or "image card"
 * with the card's top corners), or what covers the image ("cover photo").
 */
export type Look =
  | 'nav'
  | 'card'
  | 'card flat'
  | 'bar'
  | 'bar strong'
  | 'bar faint'
  | 'pill'
  | 'pill primary'
  | 'field'
  | 'chip'
  | 'dot'
  | 'rule'
  | 'block'
  | 'image'
  | 'image card'
  | 'cover photo'
  | 'cover logo'
  | 'cover icon';

/** [name, look, x, y, width, height], in CSS px of the page at the outline's width. Drawn in order. */
export type Shape = readonly [name: string, look: Look, x: number, y: number, w: number, h: number];

export interface Outline {
  /** The page's width in CSS px, and how much of its height the outline shows. */
  width: number;
  height: number;
  shapes: readonly Shape[];
  /** Custom properties for the shapes, such as rounder logo corners on a phone. */
  style?: Readonly<Record<string, string>>;
}

/** An aspect ratio as width and height, such as [4, 5]. */
export type Ratio = readonly [number, number];

export interface MediaTemplate {
  /** What a page names in design:frame. */
  id: string;
  /** The page it outlines, for example "LinkedIn profile". */
  name: string;
  /** When the sizes and positions were last checked against the site (yyyy-mm-dd). */
  checked: string;
  /** The upload size the outline is measured for, or null when any size from `ratios` shows whole. */
  upload: Size | null;
  /** The widest and tallest image shown whole; anything outside is cut from the centre to the nearest. */
  ratios?: { widest: Ratio; tallest: Ratio };
  /** Wide images put the phone frame on the left; tall ones put all three frames in a row. */
  layout: 'wide' | 'tall';
  /** A wide group's grid columns: the phone, then the desktop above the image on its own. */
  columns?: string;
  /** The safe area for text and key marks: SVG polygon points in upload px. */
  safe?: string;
  /** The key's words for what covers the image. */
  covered?: string;
  /** The key's words when nothing is marked. */
  whole?: string;
  desktop: Outline;
  phone: Outline;
}

export const TEMPLATES: readonly MediaTemplate[] = [...LINKEDIN];

export function mediaTemplate(id: string | null | undefined): MediaTemplate | null {
  return TEMPLATES.find((t) => t.id === id) ?? null;
}

export function shapeBox(s: Shape): Box {
  return { x: s[2], y: s[3], w: s[4], h: s[5] };
}

export function isImageArea(s: Shape): boolean {
  return s[1] === 'image' || s[1] === 'image card';
}

export interface Placement {
  /** The outline's height once its image area fits the image. */
  height: number;
  /** The outline's shapes, moved for the image area. */
  shapes: Shape[];
  /** The image area. */
  area: Box;
  /** Where the whole image is drawn: the area itself, unless the image is cut. */
  image: Box;
  /** Upload px cut off at each end, top and bottom or left and right; null when the image shows whole. */
  cut: { axis: 'x' | 'y'; px: number } | null;
}

const round = (n: number): number => Math.round(n * 100) / 100;

/**
 * Where an image of this size goes in an outline. Templates with fixed upload
 * sizes keep their image area; an image of other proportions covers it from
 * the centre. Templates with a range of ratios give the image area the image's
 * proportions within the range, moving the shapes below it and stretching the
 * ones around it; an image beyond the range is cut from the centre.
 */
export function placeImage(t: MediaTemplate, o: Outline, page: Size): Placement {
  const row = o.shapes.find(isImageArea);
  if (!row) throw new Error(`${t.id}: an outline has no image area`);
  const base = shapeBox(row);
  const ratio = page.width / page.height;
  let area = base;
  let cut: Placement['cut'] = null;
  if (t.ratios) {
    const widest = t.ratios.widest[0] / t.ratios.widest[1];
    const tallest = t.ratios.tallest[0] / t.ratios.tallest[1];
    const shown = Math.min(widest, Math.max(tallest, ratio));
    area = { ...base, h: round(base.w / shown) };
    if (ratio < tallest) cut = { axis: 'y', px: Math.round((page.height - page.width / tallest) / 2) };
    else if (ratio > widest) cut = { axis: 'x', px: Math.round((page.width - page.height * widest) / 2) };
  }
  const grow = round(area.h - base.h);
  const bottom = base.y + base.h;
  const shapes = o.shapes.map((s): Shape => {
    if (grow === 0) return s;
    if (s[3] >= bottom) return [s[0], s[1], s[2], round(s[3] + grow), s[4], s[5]];
    if (s[3] <= base.y && s[3] + s[5] >= bottom) return [s[0], s[1], s[2], s[3], s[4], round(s[5] + grow)];
    return s;
  });
  const scale = Math.max(area.w / page.width, area.h / page.height);
  const w = round(page.width * scale);
  const h = round(page.height * scale);
  const image = { x: round(area.x + (area.w - w) / 2), y: round(area.y + (area.h - h) / 2), w, h };
  return { height: round(o.height + grow), shapes, area, image, cut };
}

/** "4:5" for a ratio that reads as one (both terms 16 or less), else null. */
export function ratioText(width: number, height: number): string | null {
  const gcd = (a: number, b: number): number => (b === 0 ? a : gcd(b, a % b));
  const d = gcd(width, height);
  const a = width / d;
  const b = height / d;
  return a <= 16 && b <= 16 ? `${a}:${b}` : null;
}
