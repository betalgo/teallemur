// A forgiving CSS scanner: finds declarations and block-less at-rules with
// their offsets and enclosing selectors. Comments are blanked out first so
// offsets stay exact.

export interface Declaration {
  /** Lowercased property name (custom properties keep their case). */
  prop: string;
  value: string;
  /** Offset of the first character of the value. */
  offset: number;
  /** Enclosing preludes, outermost first, for example ["@media (min-width: 40em)", ":root"]. */
  context: string[];
}

export interface AtStatement {
  text: string;
  offset: number;
}

export interface ScannedCss {
  declarations: Declaration[];
  atStatements: AtStatement[];
  /** Selector or at-rule preludes of every block, with their contents, for rule-level diffs. */
  blocks: { context: string[]; body: string }[];
}

/** Replaces comments with spaces, keeping newlines, so offsets do not move. */
export function blankComments(css: string): string {
  return css.replace(/\/\*[\s\S]*?(\*\/|$)/g, (m) => m.replace(/[^\n]/g, ' '));
}

/**
 * Scans a stylesheet. With inline=true the input is a declaration list (a
 * style attribute) and the text after the last ";" is a declaration too.
 */
export function scanCss(source: string, inline = false): ScannedCss {
  const css = blankComments(source);
  const declarations: Declaration[] = [];
  const atStatements: AtStatement[] = [];
  const blocks: ScannedCss['blocks'] = [];
  const stack: { prelude: string; start: number }[] = [];
  let segStart = 0;
  let depth = 0;
  let quote: string | null = null;

  const segment = (end: number): void => {
    const raw = css.slice(segStart, end);
    const lead = raw.length - raw.trimStart().length;
    const text = raw.trim();
    if (!text) return;
    if (text.startsWith('@')) {
      atStatements.push({ text, offset: segStart + lead });
      return;
    }
    const colon = raw.indexOf(':');
    if (colon < 0) return;
    const name = raw.slice(0, colon).trim();
    if (!/^-?-?[a-zA-Z_][\w-]*$/.test(name)) return;
    const valueRaw = raw.slice(colon + 1);
    const valueLead = valueRaw.length - valueRaw.trimStart().length;
    declarations.push({
      prop: name.startsWith('--') ? name : name.toLowerCase(),
      value: valueRaw.trim().replace(/\s*!important$/i, ''),
      offset: segStart + colon + 1 + valueLead,
      context: stack.map((s) => s.prelude),
    });
  };

  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote || c === '\n') quote = null;
      continue;
    }
    if (c === '"' || c === "'") {
      quote = c;
    } else if (c === '(') {
      depth++;
    } else if (c === ')') {
      if (depth > 0) depth--;
    } else if (depth > 0) {
      continue;
    } else if (c === '{') {
      stack.push({ prelude: css.slice(segStart, i).trim().replace(/\s+/g, ' '), start: i + 1 });
      segStart = i + 1;
    } else if (c === '}') {
      segment(i);
      const open = stack.pop();
      if (open) blocks.push({ context: [...stack.map((s) => s.prelude), open.prelude], body: css.slice(open.start, i) });
      segStart = i + 1;
    } else if (c === ';') {
      segment(i);
      segStart = i + 1;
    }
  }
  if (inline || stack.length > 0) segment(css.length);
  return { declarations, atStatements, blocks };
}

/** Splits on a separator at the top level (outside strings and parentheses). */
export function splitTopLevel(value: string, sep: ',' | ' '): { text: string; offset: number }[] {
  const parts: { text: string; offset: number }[] = [];
  let depth = 0;
  let quote: string | null = null;
  let start = 0;
  const push = (end: number): void => {
    const raw = value.slice(start, end);
    const lead = raw.length - raw.trimStart().length;
    if (raw.trim()) parts.push({ text: raw.trim(), offset: start + lead });
  };
  for (let i = 0; i < value.length; i++) {
    const c = value[i] ?? '';
    if (quote) {
      if (c === '\\') i++;
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === '(') depth++;
    else if (c === ')') depth = Math.max(0, depth - 1);
    else if (depth === 0 && (sep === ',' ? c === ',' : /\s/.test(c))) {
      push(i);
      start = i + 1;
    }
  }
  push(value.length);
  return parts;
}

/** Contents of every url(...) in a value, with offsets of the URL text. */
export function cssUrls(value: string): { url: string; offset: number }[] {
  const out: { url: string; offset: number }[] = [];
  const re = /\burl\(\s*/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(value))) {
    let i = m.index + m[0].length;
    const q = value[i];
    let url: string;
    let start: number;
    if (q === '"' || q === "'") {
      start = i + 1;
      const end = value.indexOf(q, start);
      url = value.slice(start, end < 0 ? value.length : end);
    } else {
      start = i;
      while (i < value.length && value[i] !== ')') i++;
      url = value.slice(start, i).trim();
    }
    out.push({ url, offset: start });
  }
  return out;
}
