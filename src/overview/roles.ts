// How the design system overview reads a token's role from its name and the
// comment next to it. The rules are keyword lists, so they work for any
// product's naming; anything they do not recognise goes under Other.

/** Colour groups, in page order. */
export const COLOUR_GROUPS = [
  { id: 'grounds', title: 'Grounds and surfaces' },
  { id: 'text', title: 'Text' },
  { id: 'accent', title: 'Accent' },
  { id: 'lines', title: 'Lines' },
  { id: 'status', title: 'Status' },
  { id: 'other', title: 'Other' },
] as const;

export type ColourGroup = (typeof COLOUR_GROUPS)[number]['id'];

/**
 * Words that give a colour its group, checked in this order: a status word
 * wins over a text word ("warning-text" is a status colour shown as text),
 * a text word over a line or accent word ("text-on-accent" is text), and so on.
 */
export const COLOUR_WORDS: [Exclude<ColourGroup, 'other'>, string[]][] = [
  ['status', ['success', 'warning', 'warn', 'danger', 'error', 'info', 'positive', 'negative', 'critical', 'caution', 'notice', 'alert', 'status', 'destructive']],
  ['text', ['text', 'ink', 'fg', 'foreground', 'on', 'placeholder']],
  ['lines', ['border', 'line', 'rule', 'divider', 'stroke', 'outline', 'separator', 'hairline', 'edge']],
  ['accent', ['accent', 'brand', 'primary', 'secondary', 'tertiary', 'focus', 'link', 'action', 'interactive', 'cta']],
  ['grounds', ['bg', 'background', 'backdrop', 'surface', 'panel', 'ground', 'canvas', 'page', 'wall', 'well', 'sunken', 'raised', 'elevated', 'card', 'sheet', 'nav', 'navbar', 'sidebar', 'toolbar', 'header', 'overlay', 'scrim', 'paper', 'shell']],
];

/** Words that only say which family a name belongs to. */
const NAMESPACE = new Set(['color', 'colour', 'clr', 'colors', 'colours']);

/** Words that adjust a role without naming a ground. */
const MODIFIERS = new Set(['strong', 'stronger', 'soft', 'softer', 'muted', 'faint', 'subtle', 'weak', 'secondary', 'tertiary', 'primary', 'light', 'lighter', 'dark', 'darker', 'hover', 'active', 'pressed', 'disabled', 'placeholder', 'default', 'emphasis', 'high', 'low', 'medium', 'base']);

/** Words that mark a pale variant meant to sit behind text. */
const GROUND_LIKE = new Set(['subtle', 'tint', 'bg', 'background', 'surface', 'soft', 'light', 'muted', 'wash', 'weak']);

/** A token name's words: "--colorTextMuted" and "--color-text-muted" both give color, text, muted. */
export function nameWords(name: string): string[] {
  return name
    .replace(/^--/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .toLowerCase()
    .split(/[-_\s]+/)
    .filter(Boolean);
}

/** A comment's words, without "on", which is too common in sentences. */
export function commentWords(comment: string | null): string[] {
  return (comment ?? '').toLowerCase().split(/[^a-z0-9]+/).filter((w) => w && w !== 'on');
}

function groupFromWords(words: string[]): ColourGroup | null {
  for (const [group, list] of COLOUR_WORDS) if (words.some((w) => list.includes(w))) return group;
  return null;
}

/** The group of a colour token: from its name, else its comment, else Other. */
export function colourGroup(name: string, comment: string | null = null): ColourGroup {
  return groupFromWords(nameWords(name)) ?? groupFromWords(commentWords(comment)) ?? 'other';
}

/** A colour used for text: shown as "Aa" with its contrast. */
export function isTextColour(name: string): boolean {
  const list = COLOUR_WORDS.find(([g]) => g === 'text')?.[1] ?? [];
  return nameWords(name).some((w) => list.includes(w));
}

export interface GroundCandidate {
  name: string;
  group: ColourGroup;
}

/**
 * The ground a text colour's name points to: "on-accent" points to the
 * accent, "nav-text" to the nav, "warning-text" to a pale warning colour.
 * Null when the name points nowhere, which means the main ground.
 *
 * When several colours share the name's words ("brand-ink" with "brand"
 * and "brand-soft"), `contrastOn` (the text's contrast on a candidate) picks
 * the one the text reads on best: text is made for the ground it sits on.
 * Without it, grounds, then pale variants, then exact names win.
 */
export function pointedGround(textName: string, candidates: GroundCandidate[], contrastOn?: (name: string) => number | null): string | null {
  const words = nameWords(textName).filter((w) => !NAMESPACE.has(w));
  const others = candidates.filter((c) => c.name !== textName && !isTextColour(c.name));
  const own = (c: GroundCandidate): string[] => nameWords(c.name).filter((w) => !NAMESPACE.has(w));
  const on = words.indexOf('on');
  if (on >= 0) {
    const target = words.slice(on + 1);
    if (target.length === 0) return null;
    const ends = others.filter((c) => {
      const w = own(c);
      return w.length >= target.length && target.every((t, i) => w[w.length - target.length + i] === t);
    });
    ends.sort((a, b) => own(a).length - own(b).length);
    return ends[0]?.name ?? null;
  }
  const textWords = COLOUR_WORDS.find(([g]) => g === 'text')?.[1] ?? [];
  const rest = words.filter((w) => !textWords.includes(w) && !MODIFIERS.has(w));
  if (rest.length === 0) return null;
  let best: { name: string; contrast: number; score: number; length: number } | null = null;
  for (const c of others) {
    const w = own(c);
    if (!rest.every((r) => w.includes(r))) continue;
    const exact = w.length === rest.length;
    const score = (c.group === 'grounds' ? 4 : 0) + (w.some((x) => GROUND_LIKE.has(x)) ? 2 : 0) + (exact ? 1 : 0);
    const contrast = contrastOn?.(c.name) ?? 0;
    const better =
      !best ||
      contrast > best.contrast + 0.05 ||
      (Math.abs(contrast - best.contrast) <= 0.05 && (score > best.score || (score === best.score && w.length < best.length)));
    if (better) best = { name: c.name, contrast, score, length: w.length };
  }
  return best?.name ?? null;
}

/** "--palette-blue-500" is step "500" of "--palette-blue". */
export function rampStep(name: string): { base: string; step: string } | null {
  const m = /^(--.*?)[-_]?(\d+)$/.exec(name);
  if (!m || !m[1] || m[1] === '--') return null;
  return { base: m[1].replace(/[-_]$/, ''), step: m[2] as string };
}

export type TokenKind = 'colour' | 'font' | 'size' | 'line-height' | 'radius' | 'spacing' | 'shadow' | 'other';

const GENERIC_FAMILIES = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong']);
const LENGTH = /^(-?\d*\.?\d+(px|rem|em|pt|pc|vw|vh|vmin|vmax|ch|ex|cap|lh|rlh|%)|0)$/i;
const MATH = /^(calc|clamp|min|max)\(/i;

function isLength(value: string): boolean {
  return LENGTH.test(value) || MATH.test(value);
}

/** A font-family list: a quoted name, or a list that ends in a generic family. */
export function isFontStack(value: string): boolean {
  if (/^\s*(["']).+?\1/.test(value)) return true;
  const items = value.split(',').map((s) => s.trim().toLowerCase());
  return items.length > 0 && GENERIC_FAMILIES.has(items[items.length - 1] ?? '');
}

const has = (words: string[], ...list: string[]): boolean => words.some((w) => list.includes(w));

/**
 * What kind of token this is. `colour` says whether the (resolved) value is a
 * colour; `resolved` is the value with var() references replaced.
 */
export function tokenKind(name: string, resolved: string, colour: boolean): TokenKind {
  const words = nameWords(name);
  const value = resolved.trim();
  if (colour) return 'colour';
  if (has(words, 'shadow', 'shadows', 'elevation')) return 'shadow';
  if (isFontStack(value) && !isLength(value)) return 'font';
  const lineHeight = has(words, 'leading', 'lh') || words.join('-').includes('line-height');
  if (lineHeight && (isLength(value) || /^-?\d*\.?\d+$/.test(value))) return 'line-height';
  if (!isLength(value)) return 'other';
  if (has(words, 'radius', 'radii', 'rounded', 'round', 'corner', 'corners')) return 'radius';
  if (has(words, 'space', 'spacing', 'gap', 'gutter', 'inset', 'padding', 'margin', 'pad', 'stack')) return 'spacing';
  if (has(words, 'icon', 'avatar', 'width', 'height', 'max', 'min', 'border', 'stroke', 'weight', 'tracking', 'letter', 'layer', 'z')) return 'other';
  if (has(words, 'text', 'font', 'size', 'fs', 'type', 'heading', 'display', 'title', 'body')) return 'size';
  return 'other';
}

/** A colour by its name alone, when its value cannot be read (for example a var() to a missing token). */
export function looksLikeColourName(name: string): boolean {
  return nameWords(name).some((w) => NAMESPACE.has(w));
}
