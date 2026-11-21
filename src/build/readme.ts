// Reads what an exploration asks from its README.md (the "here is what I
// think you mean" page): the question and a line per option. Anything the
// README does not say stays null, and the viewer falls back to plain names.

import type { ExplorationInfo, OptionInfo } from '../model.ts';

/** Markdown inline formatting removed: emphasis, code and links. */
export function plainText(md: string): string {
  return md
    .replace(/!?\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[\s(])[*_](\S(?:.*?\S)?)[*_](?=[\s).,:;!?]|$)/g, '$1$2')
    .replace(/\s+/g, ' ')
    .trim();
}

interface Block {
  heading: string | null;
  level: number;
  lines: string[];
}

function blocks(md: string): Block[] {
  const out: Block[] = [{ heading: null, level: 0, lines: [] }];
  for (const line of md.replace(/\r\n?/g, '\n').split('\n')) {
    const m = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line);
    if (m) out.push({ heading: plainText(m[2] ?? ''), level: (m[1] ?? '').length, lines: [] });
    else out[out.length - 1]?.lines.push(line);
  }
  return out;
}

/** The first paragraph of a block. */
function firstParagraph(lines: string[]): string {
  const para: string[] = [];
  for (const line of lines) {
    if (line.trim() === '') {
      if (para.length > 0) break;
      continue;
    }
    if (/^\s*([-*+]|\d+[.)])\s/.test(line) && para.length === 0) return plainText(line.replace(/^\s*([-*+]|\d+[.)])\s+/, ''));
    para.push(line.trim());
  }
  return plainText(para.join(' '));
}

function question(all: Block[]): string | null {
  const block =
    all.find((b) => b.heading !== null && /question/i.test(b.heading)) ??
    all.find((b) => b.heading !== null && /decid|decision to make|\bpick\b/i.test(b.heading) && !/^decision$/i.test(b.heading));
  const inline = all.flatMap((b) => b.lines).map((l) => /^\s*(?:\*\*|__)?(?:the\s+)?question(?:\*\*|__)?\s*:\s*(?:\*\*|__)?\s*(.+)$/i.exec(l)?.[1]).find((q) => q);
  const para = block ? firstParagraph(block.lines) : inline ? plainText(inline) : '';
  if (para) {
    const asked = /^[^?]*\?/.exec(para);
    return (asked ? asked[0] : para).trim();
  }
  const title = all.find((b) => b.level === 1)?.heading;
  return title || null;
}

const OPTION_LINE = /^\s*[-*+]\s+(\*\*|__)?(?:option\s+)?([a-d])(?![a-z0-9])\s*(\*\*|__|[,.:)–—-])\s*(.*)$/i;

function options(md: string): OptionInfo[] {
  const found = new Map<string, OptionInfo>();
  const lines = md.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const m = OPTION_LINE.exec(lines[i] ?? '');
    if (!m) continue;
    const id = (m[2] ?? '').toLowerCase();
    if (found.has(id)) continue;
    let rest = m[4] ?? '';
    // Continuation lines of the same list item.
    while (i + 1 < lines.length && /^\s{2,}\S/.test(lines[i + 1] ?? '') && !OPTION_LINE.test(lines[i + 1] ?? '')) {
      rest += ` ${(lines[++i] ?? '').trim()}`;
    }
    // An option letter inside the bold run ("**A, Title:**") keeps the run open.
    const raw = `${m[1] && m[3] !== m[1] ? '**' : ''}${rest}`;
    let title: string | null = null;
    let text: string | null = null;
    // "**A, Title:** text" or "**A** Title: text": the bold part is the title.
    const bold = /^(?:\*\*|__)(.*?)(?:\*\*|__)\s*[:,.–—-]?\s*(.*)$/.exec(raw);
    if (bold) {
      title = plainText(bold[1] ?? '').replace(/[:,.\s]+$/, '') || null;
      text = plainText(bold[2] ?? '') || null;
      if (!title && text) {
        const split = /^([^:–—]+)[:–—]\s*(.*)$/.exec(text);
        title = split ? (split[1] ?? '').trim() : text;
        text = split ? (split[2] ?? '').trim() || null : null;
      }
    } else {
      const plain = plainText(raw);
      const split = /^([^:–—]+)[:–—]\s*(.*)$/.exec(plain);
      title = (split ? split[1] : plain)?.trim() || null;
      text = split ? (split[2] ?? '').trim() || null : null;
    }
    found.set(id, { id, title, text });
  }
  return [...found.values()];
}

/** The exploration's question and options, from its folder name and README. */
export function explorationInfo(folder: string, readme: string | null, optionIds: string[]): ExplorationInfo {
  const since = /^(\d{4}-\d{2}-\d{2})(?:-|$)/.exec(folder)?.[1] ?? null;
  const all = readme ? blocks(readme) : [];
  const listed = readme ? options(readme) : [];
  const asked = readme ? question(all) : null;
  return {
    question: asked ? sentenceCase(asked) : null,
    since,
    options: optionIds.map((id) => {
      const o = listed.find((x) => x.id === id);
      return o ? { ...o, title: o.title ? sentenceCase(o.title.replace(/\.$/, '')) : null } : { id, title: null, text: null };
    }),
  };
}

/** The first letter in upper case, as a heading or a name starts. */
function sentenceCase(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}
