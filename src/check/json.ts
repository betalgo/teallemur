// A small JSON parser that also records the line of every value, keyed by
// JSON pointer, so schema errors can name a line.

import { lineIndex } from './text.ts';

export class JsonSyntaxError extends Error {
  readonly line: number;
  constructor(message: string, line: number) {
    super(message);
    this.line = line;
  }
}

export interface ParsedJson {
  value: unknown;
  /** JSON pointer ("" for the root, "/viewports/0/id") to 1-based line. */
  lines: Map<string, number>;
}

const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parseJson(source: string): ParsedJson {
  const text = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const lineAt = lineIndex(text);
  const lines = new Map<string, number>();
  let i = 0;

  const fail = (message: string): never => {
    throw new JsonSyntaxError(message, lineAt(Math.min(i, text.length)));
  };
  const ws = (): void => {
    while (i < text.length) {
      const c = text[i];
      if (c === ' ' || c === '\t' || c === '\n' || c === '\r') i++;
      else break;
    }
  };
  const str = (): string => {
    const start = i;
    i++;
    while (i < text.length) {
      const c = text[i];
      if (c === '\\') i += 2;
      else if (c === '"') {
        i++;
        try {
          return JSON.parse(text.slice(start, i)) as string;
        } catch {
          i = start;
          return fail('invalid string');
        }
      } else if (c === '\n') {
        return fail('unterminated string');
      } else i++;
    }
    return fail('unterminated string');
  };
  const value = (ptr: string): unknown => {
    ws();
    lines.set(ptr, lineAt(i));
    const c = text[i];
    if (c === '{') {
      i++;
      const obj: Record<string, unknown> = {};
      ws();
      if (text[i] === '}') {
        i++;
        return obj;
      }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('expected a property name');
        const key = str();
        ws();
        if (text[i] !== ':') fail('expected ":"');
        i++;
        obj[key] = value(`${ptr}/${escapePointer(key)}`);
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === '}') {
          i++;
          return obj;
        }
        fail('expected "," or "}"');
      }
    }
    if (c === '[') {
      i++;
      const arr: unknown[] = [];
      ws();
      if (text[i] === ']') {
        i++;
        return arr;
      }
      for (;;) {
        arr.push(value(`${ptr}/${arr.length}`));
        ws();
        if (text[i] === ',') {
          i++;
          continue;
        }
        if (text[i] === ']') {
          i++;
          return arr;
        }
        fail('expected "," or "]"');
      }
    }
    if (c === '"') return str();
    if (text.startsWith('true', i)) {
      i += 4;
      return true;
    }
    if (text.startsWith('false', i)) {
      i += 5;
      return false;
    }
    if (text.startsWith('null', i)) {
      i += 4;
      return null;
    }
    NUMBER.lastIndex = i;
    const m = NUMBER.exec(text);
    if (m) {
      i += m[0].length;
      return Number(m[0]);
    }
    return fail(i >= text.length ? 'unexpected end of file' : `unexpected character "${c}"`);
  };

  const result = value('');
  ws();
  if (i < text.length) fail('unexpected content after the JSON value');
  return { value: result, lines };
}

export function escapePointer(key: string): string {
  return key.replace(/~/g, '~0').replace(/\//g, '~1');
}

/** Line for a pointer, falling back to the nearest parent that has one. */
export function lineForPointer(lines: Map<string, number>, ptr: string): number {
  let p = ptr;
  for (;;) {
    const line = lines.get(p);
    if (line !== undefined) return line;
    if (p === '') return 1;
    p = p.slice(0, p.lastIndexOf('/'));
  }
}
