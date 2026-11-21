import { SCREEN_PATH } from '../layout.ts';
import type { Cell, ViewerData } from '../model.ts';

export interface DesignLink { selector: string; target: string }

/** A mapping ends after its target, so selector groups and quoted commas work. */
export function parseDesignLinks(content: string): DesignLink[] {
  const links: DesignLink[] = [];
  let start = 0;
  let quote = '';
  let escaped = false;
  for (let i = 0; i < content.length; i++) {
    const c = content[i]!;
    if (escaped) { escaped = false; continue; }
    if (c === '\\') { escaped = true; continue; }
    if (quote) { if (c === quote) quote = ''; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c !== '-' || content[i + 1] !== '>') continue;
    const end = /^->\s*([^,]*)(?:,|$)/.exec(content.slice(i));
    if (!end) continue;
    const selector = content.slice(start, i).trim();
    const target = end[1]?.trim() ?? '';
    if (selector && SCREEN_PATH.test(`screens/${target}.html`)) links.push({ selector, target });
    i += end[0].length - 1;
    start = i + 1;
  }
  return links;
}

export function linkTarget(data: ViewerData, current: Cell, target: string): Cell | null {
  const path = `screens/${target}.html`;
  if (!SCREEN_PATH.test(path)) return null;
  const cells = [...data.board, ...(data.preview?.sections ?? [])].flatMap((s) => s.lines.flatMap((l) => l.cells)).filter((c) => c.path === path);
  const sameRoot = cells.filter((c) => c.root === current.root);
  const candidates = sameRoot.length ? sameRoot : cells.filter((c) => c.root === 'head');
  return candidates.find((c) => c.viewport === current.viewport) ?? candidates[0] ?? null;
}

/** Listen from the viewer; never insert a script or change the design document. */
export function bindDesignLinks(doc: Document, data: ViewerData, current: Cell, navigate: (cell: Cell) => void): () => void {
  const links = [...doc.querySelectorAll<HTMLMetaElement>('meta[name="design:links"]')].flatMap((meta) => parseDesignLinks(meta.content));
  const onClick = (event: MouseEvent): void => {
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return;
    const target = event.target as Element | null;
    if (typeof target?.closest !== 'function') return;
    for (const link of links) {
      try {
        if (!target.closest(link.selector)) continue;
      } catch { continue; } // An invalid optional selector must not break focus view.
      const next = linkTarget(data, current, link.target);
      if (!next) continue;
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(next);
      return;
    }
  };
  doc.addEventListener('click', onClick, true);
  return () => doc.removeEventListener('click', onClick, true);
}
