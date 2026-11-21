// Viewer entry point. Reads the page's embedded data and mounts the board or
// the preview; on pages without data (the hub) it scales the thumbnails and
// wires the review list. It only loads files from the site itself.

import type { ViewerData } from '../model.ts';
import { Board } from './board.ts';
import { Context } from './context.ts';
import { h } from './dom.ts';
import { openFocus } from './focus.ts';
import { mountPreview } from './preview.ts';
import { boardTopBar, rememberedSize } from './topbar.ts';
import { TreeMemory, sidebar } from './sidebar.ts';
import { mountRoutes } from './routes.ts';
import { scaleThumbs } from './thumbs.ts';
import { mountReviewPanel } from './reviews.ts';

function mountBoard(ctx: Context, app: HTMLElement): void {
  const remembered = rememberedSize(ctx);
  if (remembered) ctx.filters = { ...ctx.filters, viewports: new Set([remembered]) };
  const board = new Board(ctx, ctx.data.board);
  const bar = boardTopBar(ctx, () => board.found);
  const scrim = h('div', { class: 'drawer-scrim' });
  const memory = new TreeMemory(ctx.data.product.slug);

  const side = sidebar(ctx, (cell) => {
    setDrawer(false);
    ctx.navigate(cell, 'board');
  });
  const setDrawer = (open: boolean): void => {
    side.classList.toggle('is-open', open);
    scrim.classList.toggle('is-open', open);
    bar.screens.setAttribute('aria-expanded', String(open));
    if (open) side.querySelector<HTMLElement>('[data-drawer-close]')?.focus();
  };
  const setSidebar = (shown: boolean): void => {
    app.dataset.sidebar = shown ? 'shown' : 'hidden';
    memory.set('sidebar', shown);
  };
  app.dataset.sidebar = memory.get('sidebar', true) ? 'shown' : 'hidden';
  bar.screens.addEventListener('click', () => setDrawer(true));
  scrim.addEventListener('click', () => setDrawer(false));
  side.querySelector('[data-drawer-close]')?.addEventListener('click', () => {
    setDrawer(false);
    bar.screens.focus();
  });
  side.querySelector('[data-sidebar-hide]')?.addEventListener('click', () => {
    setSidebar(false);
    bar.showSidebar.focus();
  });
  bar.showSidebar.addEventListener('click', () => setSidebar(true));

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey || document.querySelector('.dv-focus')) return;
    const target = e.target as Element | null;
    if (typeof target?.closest === 'function' && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if (e.key === 'Escape' && side.classList.contains('is-open')) {
      setDrawer(false);
      bar.screens.focus();
    } else if (e.key === '/') {
      e.preventDefault();
      bar.focusSearch();
    }
  });

  ctx.jump = (cell) => board.jump(cell);
  app.classList.add('dv-board-app');
  app.append(bar.el, bar.searchRow, h('div', { class: 'dv-main' }, side, scrim, board.el));
  board.render();
}

function start(): void {
  const app = document.getElementById('dv-app');
  const raw = document.getElementById('dv-data')?.textContent;
  if (!app || !raw) {
    scaleThumbs(document);
    mountReviewPanel(document);
    return;
  }
  const ctx = new Context(JSON.parse(raw) as ViewerData);
  if (ctx.data.kind === 'preview' && ctx.data.preview) mountPreview(ctx, app);
  else mountBoard(ctx, app);
  mountRoutes(ctx, (cell, trigger) => openFocus(ctx, cell, trigger));
}

start();
