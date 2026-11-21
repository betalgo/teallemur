// One frame: the design file drawn at its real size and scaled to its box,
// loaded lazily, with its label, a Download link when its page names a ready
// file, and a Copy link button. In a preview a frame can show its whole page
// (wholepage.ts); on the board it shows its size's first screen.

import type { Cell } from '../model.ts';
import type { Context } from './context.ts';
import { copyText, h, icon, px } from './dom.ts';
import { captionLinks } from './downloads.ts';
import type { FrameLoader } from './loader.ts';
import type { PageGroup } from './wholepage.ts';

export interface FrameOptions {
  /** Called when the frame is clicked; return false to ignore the click. */
  canOpen?: () => boolean;
  /** Shown above the shot, for example an option's letter and name. */
  above?: HTMLElement | null;
  /** Caption on top in a card (added pages in a preview), with this tag. */
  cardTag?: string;
  /** Shows the whole page, at this group's height, instead of its first screen. */
  whole?: PageGroup;
}

/** The Copy link button: copies the frame's reference and link, then says "Copied". */
export function copyButton(getText: () => string, label = 'Copy link'): HTMLButtonElement {
  const btn = h('button', { class: 'copy-link', text: label, attrs: { type: 'button', title: 'Copy a reference and link to this frame' } });
  let timer: ReturnType<typeof setTimeout> | undefined;
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    void copyText(getText()).then((ok) => {
      btn.replaceChildren(...(ok ? [icon('check'), 'Copied'] : ['Copy failed']));
      btn.classList.toggle('is-copied', ok);
      btn.dataset.state = ok ? 'ok' : 'failed';
      if (timer !== undefined) clearTimeout(timer);
      timer = setTimeout(() => {
        btn.replaceChildren(label);
        btn.classList.remove('is-copied');
        delete btn.dataset.state;
      }, 2000);
    });
  });
  return btn;
}

/** "flow / screen / <b>state</b> <i>· viewport</i>" from a cell's label. */
export function frameLabel(cell: Pick<Cell, 'label'>, showViewport = true): HTMLElement {
  const m = / · ([^·]+)$/.exec(cell.label);
  const base = m ? cell.label.slice(0, m.index) : cell.label;
  const parts = base.split(' / ');
  const last = parts.pop() ?? '';
  return h(
    'span',
    { class: 'frame__label', attrs: { title: cell.label } },
    parts.length ? `${parts.join(' / ')} / ` : '',
    h('b', { text: last }),
    m && showViewport ? h('i', { text: ` · ${m[1]}` }) : null,
  );
}

/**
 * The frame's picture: a box with the frame's proportions, holding the design
 * file at its real size, scaled to the box. Clicking it opens the focus view
 * unless `open` is false. With `whole`, the box grows from the size's height
 * to the group's, the whole page, once its page is measured.
 */
export function frameShot(ctx: Context, cell: Cell, loader: FrameLoader, open?: () => void, extraClass = '', whole?: PageGroup): HTMLElement {
  const vp = ctx.viewports.get(cell.viewport);
  const width = vp?.width ?? 1;
  const height = vp?.height ?? 1;
  const view = h('div', { class: 'dv-view', style: { width: px(width), height: px(height) } });
  const shot = h(
    'div',
    {
      class: `frame__shot dv-shot${extraClass ? ` ${extraClass}` : ''}${ctx.isSelected(cell) ? ' is-selected' : ''}`,
      // Never drawn larger than the frame's real size.
      style: { 'aspect-ratio': `${width} / ${height}`, 'max-width': px(width) },
      attrs: { 'data-path': cell.path, 'data-viewport': cell.viewport, 'data-root': cell.root },
    },
    h('span', { class: 'dv-placeholder', text: cell.title }),
    view,
  );
  if (open) {
    const button = h('button', {
      class: 'dv-frame-open',
      attrs: { type: 'button', 'aria-label': `Open ${cell.caption ? `${cell.caption}: ` : ''}${cell.label}` },
    });
    button.addEventListener('click', open);
    shot.append(button);
  }
  loader.scale(shot, width);
  const src = ctx.url(cell);
  const make = (): HTMLIFrameElement =>
    h('iframe', { class: 'dv-iframe', attrs: { src, title: cell.label, width, height, tabindex: -1, 'aria-hidden': 'true' } });
  loader.observe(view, whole ? whole.frames(cell, make) : make);
  whole?.fit((tall) => {
    view.style.height = px(tall);
    shot.style.setProperty('aspect-ratio', `${width} / ${tall}`);
  });
  return shot;
}

export function frameElement(ctx: Context, cell: Cell, loader: FrameLoader, opts: FrameOptions = {}): HTMLElement {
  let open: HTMLElement | null = null;
  const shot = frameShot(ctx, cell, loader, () => {
    if (opts.canOpen && !opts.canOpen()) return;
    ctx.focus(cell, open ?? undefined);
  }, '', opts.whole);
  open = shot.querySelector('.dv-frame-open');
  const caption = h(
    'figcaption',
    { class: 'frame__caption' },
    frameLabel(cell),
    captionLinks(ctx, cell, opts.cardTag ? h('span', { class: 'tag', text: opts.cardTag }) : copyButton(() => ctx.ref(cell, cell.viewport))),
  );
  return h(
    'figure',
    {
      class: `frame dv-frame${opts.cardTag ? ' frame--card' : ''}`,
      attrs: { 'data-path': cell.path, 'data-viewport': cell.viewport, 'data-root': cell.root },
    },
    opts.above ?? null,
    shot,
    caption,
    cell.note ? h('p', { class: 'dv-note', text: cell.note }) : null,
  );
}
