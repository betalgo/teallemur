import { SCREEN_PATH } from '../layout.ts';
import type { Cell, ViewerData } from '../model.ts';

export interface FrameRoute {
  path: string;
  viewport: string;
  root: 'head' | 'base';
  view: 'focus' | 'board';
}

export function frameHash(cell: Pick<Cell, 'path' | 'viewport' | 'root'>, view: FrameRoute['view'] = 'focus'): string {
  const screen = SCREEN_PATH.exec(cell.path);
  const path = screen ? `${screen[1]}/${screen[2]}--${screen[3]}` : `file/${cell.path.split('/').map(encodeURIComponent).join('/')}`;
  const params = new URLSearchParams();
  if (cell.root === 'base') params.set('root', 'base');
  if (view === 'board') params.set('view', 'board');
  return `#/${path}@${encodeURIComponent(cell.viewport)}${params.size ? `?${params}` : ''}`;
}

/** Parse only local frame addresses; resolution also requires an existing cell. */
export function parseFrameHash(hash: string): FrameRoute | null {
  try {
    const match = /^#\/([^?]+)@([^@/?]+)(?:\?(.*))?$/.exec(hash);
    if (!match) return null;
    const address = match[1] as string;
    const params = new URLSearchParams(match[3]);
    if ([...params.keys()].some((k) => k !== 'root' && k !== 'view')) return null;
    if (params.has('root') && params.get('root') !== 'base') return null;
    if (params.has('view') && params.get('view') !== 'board') return null;
    const path = address.startsWith('file/') ? address.slice(5).split('/').map(decodeURIComponent).join('/') : `screens/${decodeURIComponent(address)}.html`;
    if (path.split('/').some((s) => s === '.' || s === '..' || !s) || path.includes('\\')) return null;
    return { path, viewport: decodeURIComponent(match[2] as string), root: params.has('root') ? 'base' : 'head', view: params.has('view') ? 'board' : 'focus' };
  } catch { return null; }
}

export function resolveFrame(data: ViewerData, route: FrameRoute): Cell | null {
  const sections = [...data.board, ...(data.preview?.sections ?? [])];
  return sections.flatMap((s) => s.lines.flatMap((l) => l.cells)).find((c) => c.path === route.path && c.root === route.root && c.viewport === route.viewport) ?? null;
}

/** Keep reload, paste, and back/forward on the same route as direct UI actions. */
export function mountRoutes(ctx: import('./context.ts').Context, focus: (cell: Cell, trigger?: HTMLElement) => () => void): void {
  let close: (() => void) | undefined;
  let lastHash: string | undefined;
  let trigger: HTMLElement | undefined;
  const render = (): void => {
    if (lastHash === window.location.hash) return;
    lastHash = window.location.hash;
    close?.();
    close = undefined;
    const route = parseFrameHash(window.location.hash);
    const cell = route && resolveFrame(ctx.data, route);
    if (!cell || !route) return;
    ctx.jump(cell);
    if (route.view === 'focus') close = focus(cell, trigger);
    trigger = undefined;
  };
  ctx.navigate = (cell, view, source) => {
    trigger = source;
    const hash = frameHash(cell, view);
    if (hash === window.location.hash) return;
    window.history.pushState(null, '', hash);
    render();
  };
  ctx.focus = (cell, source) => ctx.navigate(cell, 'focus', source);
  window.addEventListener('hashchange', render);
  window.addEventListener('popstate', render);
  render();
}
