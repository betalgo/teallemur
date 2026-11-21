// Detection of colour literals, font family names and external URLs.

import { splitTopLevel } from './css.ts';

// CSS Color Module Level 4 named colours. "transparent" and "currentcolor"
// are keywords, not literals, and are allowed.
const NAMED_COLOURS = new Set(
  (
    'aliceblue antiquewhite aqua aquamarine azure beige bisque black blanchedalmond blue blueviolet brown ' +
    'burlywood cadetblue chartreuse chocolate coral cornflowerblue cornsilk crimson cyan darkblue darkcyan ' +
    'darkgoldenrod darkgray darkgreen darkgrey darkkhaki darkmagenta darkolivegreen darkorange darkorchid ' +
    'darkred darksalmon darkseagreen darkslateblue darkslategray darkslategrey darkturquoise darkviolet ' +
    'deeppink deepskyblue dimgray dimgrey dodgerblue firebrick floralwhite forestgreen fuchsia gainsboro ' +
    'ghostwhite gold goldenrod gray green greenyellow grey honeydew hotpink indianred indigo ivory khaki ' +
    'lavender lavenderblush lawngreen lemonchiffon lightblue lightcoral lightcyan lightgoldenrodyellow ' +
    'lightgray lightgreen lightgrey lightpink lightsalmon lightseagreen lightskyblue lightslategray ' +
    'lightslategrey lightsteelblue lightyellow lime limegreen linen magenta maroon mediumaquamarine ' +
    'mediumblue mediumorchid mediumpurple mediumseagreen mediumslateblue mediumspringgreen mediumturquoise ' +
    'mediumvioletred midnightblue mintcream mistyrose moccasin navajowhite navy oldlace olive olivedrab ' +
    'orange orangered orchid palegoldenrod palegreen paleturquoise palevioletred papayawhip peachpuff peru ' +
    'pink plum powderblue purple rebeccapurple red rosybrown royalblue saddlebrown salmon sandybrown seagreen ' +
    'seashell sienna silver skyblue slateblue slategray slategrey snow springgreen steelblue tan teal thistle ' +
    'tomato turquoise violet wheat white whitesmoke yellow yellowgreen'
  ).split(' '),
);

const GENERIC_FAMILIES = new Set([
  'serif',
  'sans-serif',
  'monospace',
  'cursive',
  'fantasy',
  'system-ui',
  'ui-serif',
  'ui-sans-serif',
  'ui-monospace',
  'ui-rounded',
  'emoji',
  'math',
  'fangsong',
]);

const WIDE_KEYWORDS = new Set(['inherit', 'initial', 'unset', 'revert', 'revert-layer']);

/** Properties whose values may name a colour keyword. */
const COLOUR_PROPERTY =
  /^--|color|background|border|outline|fill|stroke|shadow|text-decoration|text-emphasis|column-rule|caret|accent|scrollbar/;

const COLOUR_FUNCTION = /\b(rgba?|hsla?|hwb|lab|lch|oklab|oklch|color)\(/gi;

/** Colour attributes that SVG and legacy HTML accept. */
export const COLOUR_ATTRIBUTES = new Set(['fill', 'stroke', 'stop-color', 'flood-color', 'lighting-color', 'color', 'bgcolor']);

export interface Hit {
  text: string;
  /** Offset within the scanned value. */
  offset: number;
}

/** Masks strings and url(...) contents with spaces, keeping offsets. */
function maskValue(value: string): string {
  let out = value.replace(/"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'/g, (m) => ' '.repeat(m.length));
  out = out.replace(/\burl\([^)]*\)/gi, (m) => ' '.repeat(m.length));
  return out;
}

function closingParen(s: string, open: number): number {
  let depth = 0;
  for (let i = open; i < s.length; i++) {
    if (s[i] === '(') depth++;
    else if (s[i] === ')') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return s.length;
}

/** Colour literals in a CSS value: hex, colour functions without var(), and named colours. */
export function colourLiterals(prop: string, value: string): Hit[] {
  const hits: Hit[] = [];
  const v = maskValue(value);

  const hex = /#([0-9a-fA-F]+)(?![\w-])/g;
  let m: RegExpExecArray | null;
  while ((m = hex.exec(v))) {
    const len = (m[1] ?? '').length;
    if (len === 3 || len === 4 || len === 6 || len === 8) hits.push({ text: m[0], offset: m.index });
  }

  COLOUR_FUNCTION.lastIndex = 0;
  while ((m = COLOUR_FUNCTION.exec(v))) {
    const open = m.index + m[0].length - 1;
    const close = closingParen(v, open);
    const text = v.slice(m.index, close + 1);
    if (!/\bvar\(/i.test(text)) hits.push({ text, offset: m.index });
    COLOUR_FUNCTION.lastIndex = close;
  }

  if (COLOUR_PROPERTY.test(prop)) {
    const ident = /-{0,2}[a-zA-Z_][\w-]*/g;
    while ((m = ident.exec(v))) {
      const word = m[0];
      if (word.startsWith('-')) continue;
      if (v[m.index + word.length] === '(') continue;
      const before = v[m.index - 1];
      if (before === '#' || before === '.' || before === '-') continue;
      if (NAMED_COLOURS.has(word.toLowerCase())) hits.push({ text: word, offset: m.index });
    }
  }
  return hits.sort((a, b) => a.offset - b.offset);
}

/** Colour literal in an SVG or HTML colour attribute value. */
export function attributeColourLiteral(value: string): Hit | null {
  const v = value.trim();
  const lower = v.toLowerCase();
  if (!v || lower === 'none' || lower === 'currentcolor' || lower === 'transparent' || lower === 'inherit') return null;
  if (lower.startsWith('url(') || lower.startsWith('var(')) return null;
  const hits = colourLiterals('color', v);
  return hits[0] ?? null;
}

/** Font family names in a font-family or font declaration. */
export function fontFamilyLiterals(prop: string, value: string): Hit[] {
  let familyStart: number;
  if (prop === 'font-family') {
    familyStart = 0;
  } else if (prop === 'font') {
    const tokens = splitTopLevel(value, ' ');
    const size = /^(?:[\d.]+(?:px|r?em|%|pt|pc|cm|mm|in|q|ex|r?ch|vw|vh|vmin|vmax|lh|rlh|cap|ic)|xx-small|x-small|small|medium|large|x-large|xx-large|xxx-large|larger|smaller)(?:\/.*)?$/i;
    let idx = tokens.findIndex((t) => size.test(t.text));
    if (idx < 0) return [];
    const sizeToken = tokens[idx];
    if (sizeToken && !sizeToken.text.includes('/') && tokens[idx + 1]?.text.startsWith('/')) {
      idx += tokens[idx + 1]?.text === '/' ? 2 : 1;
    }
    const first = tokens[idx + 1];
    if (!first) return [];
    familyStart = first.offset;
  } else {
    return [];
  }

  const hits: Hit[] = [];
  for (const part of splitTopLevel(value.slice(familyStart), ',')) {
    const t = part.text;
    const lower = t.toLowerCase();
    if (/\bvar\(/i.test(t) || GENERIC_FAMILIES.has(lower) || WIDE_KEYWORDS.has(lower)) continue;
    hits.push({ text: t, offset: familyStart + part.offset });
  }
  return hits;
}

/** True for http(s) and protocol-relative URLs. */
export function isExternalUrl(url: string): boolean {
  return /^\s*(?:https?:)?\/\//i.test(url);
}
