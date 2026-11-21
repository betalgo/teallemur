// A forgiving HTML (and SVG) tokenizer. It finds start tags with their
// attributes and the raw text of <style>, <script>, <title> and <textarea>,
// with character offsets so findings can name a line. It does not build a tree.

import { decodeEntities } from './text.ts';

export interface Attr {
  /** Lowercased attribute name. */
  name: string;
  /** Raw (undecoded) value, or null for a bare attribute. */
  value: string | null;
  /** Offset of the value's first character (or of the name for bare attributes). */
  offset: number;
}

export interface Tag {
  /** Lowercased tag name. */
  name: string;
  attrs: Attr[];
  offset: number;
}

export interface RawText {
  /** Lowercased name of the element that holds the text. */
  tag: string;
  /** The start tag of that element. */
  open: Tag;
  text: string;
  offset: number;
}

export interface ParsedHtml {
  tags: Tag[];
  raws: RawText[];
}

const RAW_TEXT = new Set(['script', 'style', 'title', 'textarea']);

export function parseHtml(src: string): ParsedHtml {
  const tags: Tag[] = [];
  const raws: RawText[] = [];
  const n = src.length;
  let i = 0;

  while (i < n) {
    const lt = src.indexOf('<', i);
    if (lt < 0) break;
    i = lt;
    if (src.startsWith('<!--', i)) {
      const end = src.indexOf('-->', i + 4);
      i = end < 0 ? n : end + 3;
      continue;
    }
    if (src.startsWith('<![CDATA[', i)) {
      const end = src.indexOf(']]>', i + 9);
      i = end < 0 ? n : end + 3;
      continue;
    }
    const next = src[i + 1] ?? '';
    if (next === '!' || next === '?' || next === '/') {
      const end = src.indexOf('>', i + 1);
      i = end < 0 ? n : end + 1;
      continue;
    }
    if (!/[a-zA-Z]/.test(next)) {
      i++;
      continue;
    }

    // Start tag.
    const start = i;
    i++;
    let nameEnd = i;
    while (nameEnd < n && !/[\s/>]/.test(src[nameEnd] ?? '')) nameEnd++;
    const name = src.slice(i, nameEnd).toLowerCase();
    i = nameEnd;
    const attrs: Attr[] = [];
    let selfClosing = false;
    while (i < n) {
      while (i < n && /\s/.test(src[i] ?? '')) i++;
      const c = src[i];
      if (c === undefined) break;
      if (c === '>') {
        i++;
        break;
      }
      if (c === '/') {
        if (src[i + 1] === '>') {
          selfClosing = true;
          i += 2;
          break;
        }
        i++;
        continue;
      }
      const attrStart = i;
      while (i < n && !/[\s=/>]/.test(src[i] ?? '')) i++;
      if (i === attrStart) {
        i++;
        continue;
      }
      const attrName = src.slice(attrStart, i).toLowerCase();
      let j = i;
      while (j < n && /\s/.test(src[j] ?? '')) j++;
      if (src[j] === '=') {
        j++;
        while (j < n && /\s/.test(src[j] ?? '')) j++;
        const q = src[j];
        if (q === '"' || q === "'") {
          const close = src.indexOf(q, j + 1);
          const end = close < 0 ? n : close;
          attrs.push({ name: attrName, value: src.slice(j + 1, end), offset: j + 1 });
          i = close < 0 ? n : close + 1;
        } else {
          let k = j;
          while (k < n && !/[\s>]/.test(src[k] ?? '')) k++;
          attrs.push({ name: attrName, value: src.slice(j, k), offset: j });
          i = k;
        }
      } else {
        attrs.push({ name: attrName, value: null, offset: attrStart });
      }
    }
    const tag: Tag = { name, attrs, offset: start };
    tags.push(tag);

    if (RAW_TEXT.has(name) && !selfClosing) {
      const close = indexOfCloseTag(src, name, i);
      const end = close < 0 ? n : close;
      raws.push({ tag: name, open: tag, text: src.slice(i, end), offset: i });
      i = end;
    }
  }
  return { tags, raws };
}

function indexOfCloseTag(src: string, name: string, from: number): number {
  const lower = src.toLowerCase();
  let at = from;
  for (;;) {
    const idx = lower.indexOf(`</${name}`, at);
    if (idx < 0) return -1;
    const after = lower[idx + 2 + name.length];
    if (after === undefined || after === '>' || /\s/.test(after)) return idx;
    at = idx + 1;
  }
}

export function attr(tag: Tag, name: string): Attr | undefined {
  return tag.attrs.find((a) => a.name === name);
}

export function attrValue(tag: Tag, name: string): string | null {
  const a = attr(tag, name);
  return a && a.value !== null ? decodeEntities(a.value) : null;
}

/** Content of <meta name="..."> or null. */
export function metaContent(html: ParsedHtml, name: string): { value: string; offset: number } | null {
  for (const t of html.tags) {
    if (t.name !== 'meta') continue;
    if ((attrValue(t, 'name') ?? '').trim().toLowerCase() !== name) continue;
    const content = attr(t, 'content');
    return { value: content && content.value !== null ? decodeEntities(content.value) : '', offset: content?.offset ?? t.offset };
  }
  return null;
}

/** Text of the first <title>, whitespace-collapsed, or null when there is none. */
export function titleText(html: ParsedHtml): string | null {
  const raw = html.raws.find((r) => r.tag === 'title' && !insideSvg(html, r.open));
  if (!raw) return null;
  return decodeEntities(raw.text.replace(/<[^>]*>/g, '')).replace(/\s+/g, ' ').trim();
}

// An SVG <title> is an accessible name, not the document title. The document
// title sits in <head>, before any <svg>.
function insideSvg(html: ParsedHtml, tag: Tag): boolean {
  return html.tags.some((t) => t.name === 'svg' && t.offset < tag.offset);
}
