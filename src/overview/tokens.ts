// Reads a product's tokens.css into the design system overview: colours by
// role (with text contrast and ramps), type, shape and space, and the rest.

import { blankComments, scanCss, splitTopLevel } from '../check/css.ts';
import { contrast, parseColour, resolveVars, toHex, wcagLevel, type Level, type Rgba } from './colour.ts';
import { COLOUR_GROUPS, colourGroup, isTextColour, looksLikeColourName, nameWords, pointedGround, rampStep, tokenKind, type ColourGroup, type TokenKind } from './roles.ts';

export interface Token {
  name: string;
  /** The value as written. */
  value: string;
  /** The value with var() references replaced where they resolve. */
  resolved: string;
  /** The comment next to the token, on the same line. */
  comment: string | null;
  kind: TokenKind;
  /** The colour, when the value is one this tool can read. */
  rgba: Rgba | null;
}

export interface FontFace {
  family: string;
  /** Declarations other than font-family, as written. */
  descriptors: { prop: string; value: string }[];
}

export interface TextContrast {
  /** The ground token, or null for white when the product has no ground. */
  ground: string | null;
  /** Whether the ground comes from the name rather than being the main ground. */
  pointed: boolean;
  groundCss: string;
  ratio: number | null;
  level: Level | null;
}

export interface Swatch {
  name: string;
  /** "#2F5BD3", or the value as written when it cannot be read. */
  value: string;
  /** The value as written, when it differs from `value` (a var() or color-mix()). */
  source: string | null;
  /** CSS colour for the chip, or null when unknown. */
  css: string | null;
  role: string | null;
  text: TextContrast | null;
}

export interface Ramp {
  base: string;
  role: string | null;
  steps: { step: string; name: string; value: string; css: string | null }[];
}

export interface ColourGroupView {
  id: ColourGroup;
  title: string;
  swatches: Swatch[];
  ramps: Ramp[];
  count: number;
}

export interface Row {
  name: string;
  value: string;
  /** The value with var() references replaced, for drawing samples. */
  css: string;
  role: string | null;
}

export interface Overview {
  total: number;
  colourCount: number;
  groups: ColourGroupView[];
  /** The main ground: the first grounds token. */
  mainGround: string | null;
  fonts: Row[];
  /** The font the size rows are set in. */
  uiFont: Row | null;
  sizes: Row[];
  lineHeights: Row[];
  radii: Row[];
  spacing: Row[];
  shadows: Row[];
  other: Row[];
  fontFaces: FontFace[];
  /** Up to eight colours for the overview card: the first ones of each group. */
  palette: string[];
}

const ROOT = /^(:root|html|:host)$/i;

/** The comment that starts on the same line, after the declaration's semicolon. */
function trailingComment(source: string, blanked: string, valueOffset: number): string | null {
  const semi = blanked.indexOf(';', valueOffset);
  if (semi < 0) return null;
  const lineEnd = source.indexOf('\n', semi);
  const rest = source.slice(semi + 1, lineEnd < 0 ? source.length : lineEnd);
  const start = rest.indexOf('/*');
  if (start < 0 || rest.slice(0, start).trim() !== '') return null;
  const from = semi + 1 + start + 2;
  const end = source.indexOf('*/', from);
  const text = source.slice(from, end < 0 ? source.length : end).replace(/\s+/g, ' ').trim();
  return text || null;
}

/** Custom properties in source order, the first definition in a :root block winning. */
export function parseTokens(css: string): { tokens: Token[]; fontFaces: FontFace[] } {
  const blanked = blankComments(css);
  const scanned = scanCss(css);
  const found = new Map<string, { value: string; comment: string | null; root: boolean; order: number }>();
  const faces = new Map<string, FontFace>();
  let order = 0;
  for (const d of scanned.declarations) {
    const last = d.context[d.context.length - 1] ?? '';
    if (last.toLowerCase() === '@font-face' || !d.prop.startsWith('--')) continue;
    const root = d.context.length === 1 && ROOT.test(last);
    const prev = found.get(d.prop);
    if (prev && (prev.root || !root)) continue;
    found.set(d.prop, { value: d.value.replace(/\s+/g, ' ').trim(), comment: trailingComment(css, blanked, d.offset), root, order: prev?.order ?? order++ });
  }
  // @font-face blocks: every declaration of each block.
  let faceIndex = 0;
  for (const b of scanned.blocks) {
    if ((b.context[b.context.length - 1] ?? '').toLowerCase() !== '@font-face') continue;
    const decls = scanCss(b.body, true).declarations;
    const family = decls.find((d) => d.prop === 'font-family')?.value.replace(/^["']|["']$/g, '').trim();
    if (!family) continue;
    faces.set(`${faceIndex++}`, { family, descriptors: decls.filter((d) => d.prop !== 'font-family').map((d) => ({ prop: d.prop, value: d.value })) });
  }

  const raw = new Map([...found.entries()].map(([k, v]) => [k, v.value]));
  const tokens: Token[] = [...found.entries()]
    .sort((a, b) => a[1].order - b[1].order)
    .map(([name, t]) => {
      const resolved = resolveVars(t.value, (n) => raw.get(n));
      const rgba = parseColour(resolved);
      // Shadows and borders hold a colour among lengths; they are not colours.
      const lengths = /\d*\.?\d+px\b/.test(resolved);
      const colourCall = /#[0-9a-f]{3,8}\b|\b(rgba?|hsla?|oklch|oklab|lab|lch|hwb|color|color-mix)\(/i.test(resolved);
      const isColour = rgba !== null || (!lengths && (colourCall || (resolved.includes('var(') && looksLikeColourName(name))));
      return { name, value: t.value, resolved, comment: t.comment, kind: tokenKind(name, resolved, isColour), rgba };
    });
  return { tokens, fontFaces: [...faces.values()] };
}

function cssOf(t: Token): string | null {
  if (t.rgba) return toHex(t.rgba);
  return t.resolved.includes('var(') ? null : t.resolved;
}

function display(t: Token): { value: string; source: string | null } {
  const literal = parseColour(t.value) !== null;
  if (literal) return { value: t.value, source: null };
  if (t.rgba) return { value: toHex(t.rgba), source: t.value };
  return { value: t.value, source: null };
}

const WHITE: Rgba = { r: 255, g: 255, b: 255, a: 1 };

export function buildOverview(css: string): Overview {
  const { tokens, fontFaces } = parseTokens(css);
  const colours = tokens.filter((t) => t.kind === 'colour');

  // Ramps: two or more colours whose names differ only by a trailing number.
  const bases = new Map<string, Token[]>();
  for (const t of colours) {
    const step = rampStep(t.name);
    if (!step) continue;
    const list = bases.get(step.base) ?? [];
    list.push(t);
    bases.set(step.base, list);
  }
  const inRamp = new Set<string>();
  const ramps: { group: ColourGroup; ramp: Ramp }[] = [];
  for (const [base, list] of bases) {
    if (list.length < 2) continue;
    for (const t of list) inRamp.add(t.name);
    const role = list.find((t) => t.comment)?.comment ?? null;
    ramps.push({
      group: colourGroup(base, role),
      ramp: { base, role, steps: list.map((t) => ({ step: rampStep(t.name)?.step ?? '', name: t.name, value: display(t).value, css: cssOf(t) })) },
    });
  }

  const singles = colours.filter((t) => !inRamp.has(t.name)).map((t) => ({ t, group: colourGroup(t.name, t.comment) }));
  const byName = new Map(colours.map((t) => [t.name, t]));
  const mainGroundToken = singles.find((s) => s.group === 'grounds')?.t ?? null;
  const mainRgba = mainGroundToken?.rgba && mainGroundToken.rgba.a === 1 ? mainGroundToken.rgba : WHITE;
  const candidates = singles.map((s) => ({ name: s.t.name, group: s.group }));

  const swatch = (t: Token): Swatch => {
    const shown = display(t);
    let text: TextContrast | null = null;
    if (isTextColour(t.name)) {
      const contrastOn = (name: string): number | null => {
        const g = byName.get(name)?.rgba;
        return t.rgba && g ? contrast(t.rgba, g.a < 1 ? blend(g, mainRgba) : g) : null;
      };
      const pointedName = pointedGround(t.name, candidates, contrastOn);
      const ground = pointedName ? byName.get(pointedName) ?? null : mainGroundToken;
      const groundRgba = ground?.rgba ?? (ground ? null : WHITE);
      const solidGround = groundRgba && groundRgba.a < 1 ? blend(groundRgba, mainRgba) : groundRgba;
      const ratio = t.rgba && solidGround ? contrast(t.rgba, solidGround) : null;
      text = {
        ground: ground?.name ?? null,
        pointed: !!pointedName,
        groundCss: solidGround ? toHex(solidGround) : ground ? (cssOf(ground) ?? toHex(WHITE)) : toHex(WHITE),
        ratio,
        level: ratio === null ? null : wcagLevel(ratio),
      };
    }
    return { name: t.name, value: shown.value, source: shown.source, css: cssOf(t), role: t.comment, text };
  };

  const groups: ColourGroupView[] = COLOUR_GROUPS.map((g) => {
    const swatches = singles.filter((s) => s.group === g.id).map((s) => swatch(s.t));
    const own = ramps.filter((r) => r.group === g.id).map((r) => r.ramp);
    return { id: g.id, title: g.title, swatches, ramps: own, count: swatches.length + own.reduce((n, r) => n + r.steps.length, 0) };
  }).filter((g) => g.count > 0);

  const row = (t: Token): Row => ({ name: t.name, value: t.value, css: t.resolved, role: t.comment });
  const of = (kind: TokenKind): Row[] => tokens.filter((t) => t.kind === kind).map(row);
  const fonts = of('font');
  const uiFont = fonts.find((f) => nameWords(f.name).some((w) => ['ui', 'body', 'text', 'sans', 'base', 'default', 'interface', 'primary'].includes(w))) ?? fonts[0] ?? null;

  // The card's colours: three grounds, two accents, two status colours and one other, then any.
  const quota: [ColourGroup, number][] = [['grounds', 3], ['accent', 2], ['status', 2], ['other', 1]];
  const pick: string[] = [];
  const used = new Set<string>();
  const take = (s: Swatch): void => {
    if (s.css && !used.has(s.name) && !pick.includes(s.css) && pick.length < 8) {
      pick.push(s.css);
      used.add(s.name);
    }
  };
  for (const [id, n] of quota) for (const s of (groups.find((g) => g.id === id)?.swatches ?? []).slice(0, n)) take(s);
  for (const g of groups) for (const s of g.swatches) if (!s.text) take(s);
  for (const g of groups) for (const r of g.ramps) {
    const middle = r.steps[Math.floor(r.steps.length / 2)];
    if (middle?.css && !pick.includes(middle.css) && pick.length < 8) pick.push(middle.css);
  }

  return {
    total: tokens.length,
    colourCount: colours.length,
    groups,
    mainGround: mainGroundToken?.name ?? null,
    fonts,
    uiFont,
    sizes: of('size'),
    lineHeights: of('line-height'),
    radii: of('radius'),
    spacing: of('spacing'),
    shadows: of('shadow'),
    other: of('other'),
    fontFaces,
    palette: pick,
  };
}

function blend(top: Rgba, bottom: Rgba): Rgba {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

/** The families of a font-family list, unquoted, in order. */
export function families(stack: string): string[] {
  return splitTopLevel(stack, ',').map((p) => p.text.replace(/^["']|["']$/g, '').trim());
}
