// Colour values from a token file: parsing, var() and color-mix()
// resolution, and WCAG 2 contrast. Pure; used at build time.

export interface Rgba {
  /** 0 to 255, not rounded. */
  r: number;
  g: number;
  b: number;
  /** 0 to 1. */
  a: number;
}

const NAMED =
  'aliceblue:f0f8ff,antiquewhite:faebd7,aqua:00ffff,aquamarine:7fffd4,azure:f0ffff,beige:f5f5dc,bisque:ffe4c4,black:000000,' +
  'blanchedalmond:ffebcd,blue:0000ff,blueviolet:8a2be2,brown:a52a2a,burlywood:deb887,cadetblue:5f9ea0,chartreuse:7fff00,' +
  'chocolate:d2691e,coral:ff7f50,cornflowerblue:6495ed,cornsilk:fff8dc,crimson:dc143c,cyan:00ffff,darkblue:00008b,' +
  'darkcyan:008b8b,darkgoldenrod:b8860b,darkgray:a9a9a9,darkgreen:006400,darkgrey:a9a9a9,darkkhaki:bdb76b,' +
  'darkmagenta:8b008b,darkolivegreen:556b2f,darkorange:ff8c00,darkorchid:9932cc,darkred:8b0000,darksalmon:e9967a,' +
  'darkseagreen:8fbc8f,darkslateblue:483d8b,darkslategray:2f4f4f,darkslategrey:2f4f4f,darkturquoise:00ced1,' +
  'darkviolet:9400d3,deeppink:ff1493,deepskyblue:00bfff,dimgray:696969,dimgrey:696969,dodgerblue:1e90ff,' +
  'firebrick:b22222,floralwhite:fffaf0,forestgreen:228b22,fuchsia:ff00ff,gainsboro:dcdcdc,ghostwhite:f8f8ff,' +
  'gold:ffd700,goldenrod:daa520,gray:808080,green:008000,greenyellow:adff2f,grey:808080,honeydew:f0fff0,' +
  'hotpink:ff69b4,indianred:cd5c5c,indigo:4b0082,ivory:fffff0,khaki:f0e68c,lavender:e6e6fa,lavenderblush:fff0f5,' +
  'lawngreen:7cfc00,lemonchiffon:fffacd,lightblue:add8e6,lightcoral:f08080,lightcyan:e0ffff,' +
  'lightgoldenrodyellow:fafad2,lightgray:d3d3d3,lightgreen:90ee90,lightgrey:d3d3d3,lightpink:ffb6c1,' +
  'lightsalmon:ffa07a,lightseagreen:20b2aa,lightskyblue:87cefa,lightslategray:778899,lightslategrey:778899,' +
  'lightsteelblue:b0c4de,lightyellow:ffffe0,lime:00ff00,limegreen:32cd32,linen:faf0e6,magenta:ff00ff,maroon:800000,' +
  'mediumaquamarine:66cdaa,mediumblue:0000cd,mediumorchid:ba55d3,mediumpurple:9370db,mediumseagreen:3cb371,' +
  'mediumslateblue:7b68ee,mediumspringgreen:00fa9a,mediumturquoise:48d1cc,mediumvioletred:c71585,' +
  'midnightblue:191970,mintcream:f5fffa,mistyrose:ffe4e1,moccasin:ffe4b5,navajowhite:ffdead,navy:000080,' +
  'oldlace:fdf5e6,olive:808000,olivedrab:6b8e23,orange:ffa500,orangered:ff4500,orchid:da70d6,palegoldenrod:eee8aa,' +
  'palegreen:98fb98,paleturquoise:afeeee,palevioletred:db7093,papayawhip:ffefd5,peachpuff:ffdab9,peru:cd853f,' +
  'pink:ffc0cb,plum:dda0dd,powderblue:b0e0e6,purple:800080,rebeccapurple:663399,red:ff0000,rosybrown:bc8f8f,' +
  'royalblue:4169e1,saddlebrown:8b4513,salmon:fa8072,sandybrown:f4a460,seagreen:2e8b57,seashell:fff5ee,sienna:a0522d,' +
  'silver:c0c0c0,skyblue:87ceeb,slateblue:6a5acd,slategray:708090,slategrey:708090,snow:fffafa,springgreen:00ff7f,' +
  'steelblue:4682b4,tan:d2b48c,teal:008080,thistle:d8bfd8,tomato:ff6347,turquoise:40e0d0,violet:ee82ee,wheat:f5deb3,' +
  'white:ffffff,whitesmoke:f5f5f5,yellow:ffff00,yellowgreen:9acd32';

const NAMED_MAP = new Map(NAMED.split(',').map((pair) => pair.split(':') as [string, string]));

const clamp01 = (n: number): number => Math.min(1, Math.max(0, n));

/** sRGB channel (0..1) to linear light, and back. */
const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

function hex(text: string): Rgba | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(text);
  if (!m) return null;
  let h = m[1] as string;
  if (h.length <= 4) h = [...h].map((c) => c + c).join('');
  const n = (i: number): number => parseInt(h.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: h.length === 8 ? n(6) / 255 : 1 };
}

/** Arguments of a colour function, split on commas, spaces and the alpha slash. */
function args(inner: string): { parts: string[]; alpha: string | null } {
  const [main, alpha] = inner.split('/');
  const parts = (main ?? '').split(/[\s,]+/).filter(Boolean);
  if (alpha === undefined && parts.length === 4) return { parts: parts.slice(0, 3), alpha: parts[3] ?? null };
  return { parts, alpha: alpha?.trim() || null };
}

function number(text: string, percentOf = 1): number | null {
  if (text === 'none') return 0;
  const m = /^(-?\d*\.?\d+(?:e-?\d+)?)(%|deg|rad|turn|grad)?$/i.exec(text.trim());
  if (!m) return null;
  const n = Number(m[1]);
  switch (m[2]?.toLowerCase()) {
    case '%':
      return (n / 100) * percentOf;
    case 'rad':
      return (n * 180) / Math.PI;
    case 'turn':
      return n * 360;
    case 'grad':
      return n * 0.9;
    default:
      return n;
  }
}

function alphaOf(text: string | null): number | null {
  if (text === null) return 1;
  const n = number(text);
  return n === null ? null : clamp01(n);
}

function hslToRgb(h: number, s: number, l: number): [number, number, number] {
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
  };
  return [f(0), f(8), f(4)];
}

/** OKLab to sRGB (0..1, may fall outside the gamut). */
function oklabToRgb(L: number, a: number, b: number): [number, number, number] {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [
    fromLinear(4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s),
    fromLinear(-1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s),
    fromLinear(-0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s),
  ];
}

function rgbToOklab(c: Rgba): [number, number, number] {
  const r = toLinear(c.r / 255);
  const g = toLinear(c.g / 255);
  const b = toLinear(c.b / 255);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  ];
}

/** CIE Lab (D50) to sRGB. */
function labToRgb(L: number, a: number, b: number): [number, number, number] {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;
  const e = 216 / 24389;
  const k = 24389 / 27;
  const xr = fx ** 3 > e ? fx ** 3 : (116 * fx - 16) / k;
  const yr = L > k * e ? fy ** 3 : L / k;
  const zr = fz ** 3 > e ? fz ** 3 : (116 * fz - 16) / k;
  const [X, Y, Z] = [xr * 0.96422, yr, zr * 0.82521];
  // D50 to D65 (Bradford), then XYZ to linear sRGB.
  const x = 0.9554734527 * X - 0.0230985369 * Y + 0.0632593086 * Z;
  const y = -0.0283697093 * X + 1.0099954580 * Y + 0.0210413990 * Z;
  const z = 0.0123140016 * X - 0.0205076964 * Y + 1.3303659366 * Z;
  return [
    fromLinear(3.2409699419 * x - 1.5373831776 * y - 0.4986107603 * z),
    fromLinear(-0.9692436363 * x + 1.8759675015 * y + 0.0415550574 * z),
    fromLinear(0.0556300797 * x - 0.2039769589 * y + 1.0569715142 * z),
  ];
}

const rgba = (rgb: [number, number, number], a: number): Rgba => ({ r: clamp01(rgb[0]) * 255, g: clamp01(rgb[1]) * 255, b: clamp01(rgb[2]) * 255, a });

/** A colour literal (no var()), or null when it is not one this module understands. */
export function parseColour(text: string): Rgba | null {
  const value = text.trim().toLowerCase();
  if (value === 'transparent') return { r: 0, g: 0, b: 0, a: 0 };
  if (value.startsWith('#')) return hex(value);
  const named = NAMED_MAP.get(value);
  if (named) return hex(`#${named}`);
  const fn = /^([a-z-]+)\((.*)\)$/s.exec(value);
  if (!fn) return null;
  const name = fn[1] as string;
  const inner = fn[2] as string;
  if (name === 'color-mix') return colourMix(inner);
  const { parts, alpha } = args(inner);
  const a = alphaOf(alpha);
  if (a === null) return null;
  if (name === 'rgb' || name === 'rgba') {
    const [r, g, b] = parts.map((p) => number(p, 255));
    if (parts.length !== 3 || r == null || g == null || b == null) return null;
    return { r: Math.min(255, Math.max(0, r)), g: Math.min(255, Math.max(0, g)), b: Math.min(255, Math.max(0, b)), a };
  }
  if (name === 'hsl' || name === 'hsla') {
    const h = number(parts[0] ?? '');
    const s = number(parts[1] ?? '', 1);
    const l = number(parts[2] ?? '', 1);
    if (parts.length !== 3 || h === null || s === null || l === null) return null;
    // Unitless saturation and lightness in modern syntax are 0..100.
    const pct = (t: string, n: number): number => (t.endsWith('%') ? n : n / 100);
    return rgba(hslToRgb(((h % 360) + 360) % 360, pct(parts[1] ?? '', s), pct(parts[2] ?? '', l)), a);
  }
  if (name === 'oklab' || name === 'oklch' || name === 'lab' || name === 'lch') {
    const isOk = name.startsWith('ok');
    const L = number(parts[0] ?? '', isOk ? 1 : 100);
    const c1 = number(parts[1] ?? '', isOk ? 0.4 : name === 'lab' ? 125 : 150);
    const c2 = number(parts[2] ?? '', isOk ? 0.4 : 125);
    if (parts.length !== 3 || L === null || c1 === null || c2 === null) return null;
    let A = c1;
    let B = c2;
    if (name.endsWith('lch')) {
      A = c1 * Math.cos((c2 * Math.PI) / 180);
      B = c1 * Math.sin((c2 * Math.PI) / 180);
    }
    return rgba(isOk ? oklabToRgb(L, A, B) : labToRgb(L, A, B), a);
  }
  if (name === 'color') {
    const [space, ...rest] = parts;
    if ((space === 'srgb' || space === 'srgb-linear') && rest.length === 3) {
      const ch = rest.map((p) => number(p, 1));
      if (ch.some((c) => c === null)) return null;
      const lin = space === 'srgb-linear';
      return rgba(ch.map((c) => (lin ? fromLinear(c as number) : (c as number))) as [number, number, number], a);
    }
  }
  return null;
}

function splitArgs(inner: string): string[] {
  const out: string[] = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < inner.length; i++) {
    const c = inner[i];
    if (c === '(') depth++;
    else if (c === ')') depth--;
    else if (c === ',' && depth === 0) {
      out.push(inner.slice(start, i).trim());
      start = i + 1;
    }
  }
  out.push(inner.slice(start).trim());
  return out;
}

/** color-mix() in srgb, srgb-linear, oklab or oklch, with percentages as the spec normalises them. */
function colourMix(inner: string): Rgba | null {
  const [method, first, second] = splitArgs(inner);
  const space = /^in\s+([a-z-]+)/.exec(method ?? '')?.[1];
  if (!space || !first || !second) return null;
  const part = (text: string): { colour: Rgba; pct: number | null } | null => {
    const m = /^(.*?)\s+(-?\d*\.?\d+)%$/s.exec(text) ?? /^(-?\d*\.?\d+)%\s+(.*)$/s.exec(text);
    const colourText = m ? (/%$/.test(text) ? m[1] : m[2]) : text;
    const pct = m ? Number(/%$/.test(text) ? m[2] : m[1]) / 100 : null;
    const colour = parseColour(colourText ?? '');
    return colour ? { colour, pct } : null;
  };
  const a = part(first);
  const b = part(second);
  if (!a || !b) return null;
  let p1 = a.pct;
  let p2 = b.pct;
  if (p1 === null && p2 === null) [p1, p2] = [0.5, 0.5];
  else if (p1 === null) p1 = 1 - (p2 as number);
  else if (p2 === null) p2 = 1 - p1;
  const sum = (p1 as number) + (p2 as number);
  if (sum <= 0) return null;
  const w1 = (p1 as number) / sum;
  const w2 = (p2 as number) / sum;
  const alphaScale = Math.min(1, sum);
  const alpha = a.colour.a * w1 + b.colour.a * w2;
  if (alpha === 0) return { r: 0, g: 0, b: 0, a: 0 };
  // Premultiplied interpolation.
  const mix = (x: number[], y: number[]): number[] => x.map((v, i) => (v * a.colour.a * w1 + (y[i] as number) * b.colour.a * w2) / alpha);
  let rgb: [number, number, number];
  if (space === 'srgb') {
    rgb = mix([a.colour.r, a.colour.g, a.colour.b], [b.colour.r, b.colour.g, b.colour.b]).map((v) => v / 255) as [number, number, number];
  } else if (space === 'srgb-linear') {
    const lin = (c: Rgba): number[] => [c.r, c.g, c.b].map((v) => toLinear(v / 255));
    rgb = mix(lin(a.colour), lin(b.colour)).map(fromLinear) as [number, number, number];
  } else if (space === 'oklab' || space === 'oklch') {
    const [L, A, B] = mix(rgbToOklab(a.colour), rgbToOklab(b.colour)) as [number, number, number];
    rgb = oklabToRgb(L, A, B);
  } else {
    return null;
  }
  return rgba(rgb, alpha * alphaScale);
}

/**
 * Replaces var() references with token values, following references up to
 * a depth. Unknown names use the var()'s fallback when it has one; otherwise
 * the var() stays.
 */
export function resolveVars(value: string, lookup: (name: string) => string | undefined, depth = 0): string {
  if (depth > 16 || !value.includes('var(')) return value;
  let out = '';
  let i = 0;
  while (i < value.length) {
    const start = value.indexOf('var(', i);
    if (start < 0) {
      out += value.slice(i);
      break;
    }
    out += value.slice(i, start);
    let level = 0;
    let end = start + 3;
    for (; end < value.length; end++) {
      if (value[end] === '(') level++;
      else if (value[end] === ')') {
        level--;
        if (level === 0) break;
      }
    }
    const inner = value.slice(start + 4, end);
    const comma = inner.indexOf(',');
    const name = (comma < 0 ? inner : inner.slice(0, comma)).trim();
    const fallback = comma < 0 ? undefined : inner.slice(comma + 1).trim();
    const found = lookup(name);
    if (found !== undefined) out += resolveVars(found, lookup, depth + 1);
    else if (fallback !== undefined) out += resolveVars(fallback, lookup, depth + 1);
    else out += value.slice(start, end + 1);
    i = end + 1;
  }
  return out;
}

/** "#RRGGBB", or "#RRGGBBAA" when not opaque. */
export function toHex(c: Rgba): string {
  const two = (n: number): string => Math.round(Math.min(255, Math.max(0, n))).toString(16).padStart(2, '0').toUpperCase();
  return `#${two(c.r)}${two(c.g)}${two(c.b)}${c.a < 1 ? two(c.a * 255) : ''}`;
}

/** A colour drawn over an opaque one. */
export function over(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

/** WCAG 2 relative luminance of an opaque colour. */
export function luminance(c: Rgba): number {
  const [r, g, b] = [c.r, c.g, c.b].map((v) => toLinear(v / 255)) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2 contrast ratio of text over a ground; see-through colours are drawn over the ground first. */
export function contrast(text: Rgba, ground: Rgba): number {
  const g = ground.a < 1 ? over(ground, { r: 255, g: 255, b: 255, a: 1 }) : ground;
  const t = text.a < 1 ? over(text, g) : text;
  const [hi, lo] = [luminance(t), luminance(g)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

export type Level = 'AAA' | 'AA' | 'AA large' | 'fail';

/** The WCAG 2 level for normal text, or "AA large" when only large text passes. */
export function wcagLevel(ratio: number): Level {
  if (ratio >= 7) return 'AAA';
  if (ratio >= 4.5) return 'AA';
  if (ratio >= 3) return 'AA large';
  return 'fail';
}

/** The ratio with one decimal, never rounded up across a level: 4.47 shows as 4.4, not 4.5. */
export function ratioText(ratio: number): string {
  const rounded = Math.round(ratio * 10) / 10;
  const shown = wcagLevel(rounded) === wcagLevel(ratio) ? rounded : Math.floor(ratio * 10) / 10;
  return `${shown.toFixed(1)} : 1`;
}
