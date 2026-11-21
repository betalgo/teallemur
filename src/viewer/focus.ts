// Focus view: one frame, whole and in scale on the wall, with the sizes (up
// to four as buttons, more as the Size menu; none for a page with one size of
// its own on a board of own sizes), a state stepper, a full-height toggle,
// Download when the page names a ready file, "Open in a new tab" and the
// keyboard help. Shortcuts also work inside the same-origin frame.

import type { Cell } from '../model.ts';
import type { Context } from './context.ts';
import { cssPx, h, icon, media, px, usingKeyboard } from './dom.ts';
import { humanize, sizeText } from './format.ts';
import { focusDownload } from './downloads.ts';
import { copyButton } from './frame.ts';
import { fitScale } from './layout.ts';
import { statePosition, stepFrame } from './navigation.ts';
import { bindDesignLinks } from './links.ts';
import { PHONE_QUERY } from './board.ts';
import { revealPressed, sizeControl } from './topbar.ts';
import { holdScreen, pageHeight } from './wholepage.ts';
import { EXPLORATION_SCREEN_PATH, SCREEN_PATH } from '../layout.ts';

/** Breadcrumb parts before the last one; the first ones show on desktop only. */
function crumbs(ctx: Context, cell: Cell): { desktop: string[]; both: string[]; last: string } {
  const product = ctx.data.product.name;
  let m = SCREEN_PATH.exec(cell.path);
  if (m) {
    const flow = ctx.data.flows.find((f) => f.id === m?.[1])?.title ?? humanize(m[1] ?? '');
    return { desktop: [product, flow], both: [humanize(m[2] ?? '')], last: humanize(m[3] ?? '') };
  }
  if ((m = EXPLORATION_SCREEN_PATH.exec(cell.path))) {
    return { desktop: [product, `Option ${(m[2] ?? '').toUpperCase()}`], both: [humanize(m[4] ?? '')], last: humanize(m[5] ?? '') };
  }
  const area = cell.path.startsWith('design-system/brand/')
    ? 'Brand'
    : cell.path.startsWith('design-system/components/')
      ? 'Components'
      : cell.path.startsWith('archive/')
        ? 'Archive'
        : '';
  return { desktop: [product], both: area ? [area] : [], last: cell.title };
}

function keyRow(keys: (string | Element)[], text: string): HTMLElement {
  return h(
    'li',
    null,
    h('span', { class: 'key-list__keys' }, ...keys.map((k) => h('kbd', { class: 'kbd kbd--large' }, k))),
    h('span', { text }),
  );
}

export function openFocus(ctx: Context, cell: Cell, trigger?: HTMLElement): () => void {
  const viewport = cell.viewport;
  let fullHeight = ctx.focusFullHeight;
  const vp = ctx.viewports.get(viewport) ?? { id: viewport, width: 1, height: 1 };
  const offered = new Set(cell.viewports.length > 0 ? cell.viewports : [viewport]);
  const phone = media(PHONE_QUERY);
  ctx.select(cell);

  const frame = h('iframe', { class: 'dv-focus-frame', attrs: { src: ctx.url(cell), title: cell.title, width: vp.width, height: vp.height } });
  const shot = h('div', { class: 'frame__shot dv-focus-shot' }, frame);
  const shown = h('i');
  const stage = h('div', { class: 'dv-stage' });
  const cap = h(
    'div',
    { class: 'stage__cap desktop-only' },
    cell.root === 'base' ? h('span', { class: 'tag', text: 'Before' }) : null,
    h('span', { class: 'frame__label' }, cell.path.slice(0, cell.path.lastIndexOf('/') + 1), h('b', { text: cell.path.slice(cell.path.lastIndexOf('/') + 1) }), shown),
    copyButton(() => ctx.ref(cell, viewport)),
  );
  stage.append(cap, h('figure', { class: 'frame dv-focus-figure' }, shot));

  let docHeight = vp.height;
  const measure = (): void => {
    // The page's full height at this size, measured as previews measure their whole pages.
    if (fullHeight && !phone.matches) docHeight = pageHeight(frame, vp.height) ?? vp.height;
    const availW = stage.clientWidth - cssPx(stage, 'padding-left') - cssPx(stage, 'padding-right');
    const capH = cap.offsetHeight ? cap.offsetHeight + cssPx(cap, 'margin-bottom') : 0;
    const availH = stage.clientHeight - cssPx(stage, 'padding-top') - cssPx(stage, 'padding-bottom') - capH;
    const tall = fullHeight && !phone.matches;
    const scale = availW > 0 && availH > 0 ? (tall ? fitScale(vp.width, 1, availW, Number.POSITIVE_INFINITY) : fitScale(vp.width, vp.height, availW, availH)) : 1;
    const height = tall ? docHeight : vp.height;
    frame.style.height = px(height);
    frame.setAttribute('height', String(height));
    frame.style.transform = scale === 1 ? '' : `scale(${scale})`;
    shot.style.width = px(vp.width * scale);
    shot.style.height = px(height * scale);
    stage.classList.toggle('dv-stage--tall', tall);
    shown.textContent = ` · ${sizeText(vp, ' ')} · shown at ${Math.round(scale * 100)}%`;
    // Measure the path at its natural width; drop the product and flow when it does not fit.
    crumb.classList.remove('dv-crumb--short');
    crumb.classList.add('dv-crumb--measure');
    const tight = crumb.scrollWidth > crumb.clientWidth + 1;
    crumb.classList.remove('dv-crumb--measure');
    crumb.classList.toggle('dv-crumb--short', tight);
  };
  // Parts sized to the screen stay this size's screen high when Full height draws the frame taller.
  const loaded = (): void => {
    holdScreen(frame, vp.width, vp.height);
    measure();
  };
  frame.addEventListener('load', loaded);

  // Top bar.
  const close = h(
    'button',
    { class: 'button button--quiet top-bar__close', attrs: { type: 'button', 'aria-label': 'Close and go back to the board' } },
    icon('close'),
    h('span', { class: 'desktop-only', text: 'Close' }),
    h('kbd', { class: 'kbd kbd--small desktop-only', text: 'Esc' }),
  );
  const c = crumbs(ctx, cell);
  const crumb = h('nav', { class: 'crumb', attrs: { 'aria-label': 'Screen' } });
  for (const part of c.desktop) crumb.append(h('span', { class: 'desktop-only', text: part }), h('span', { class: 'crumb__sep desktop-only', text: '/' }));
  for (const part of c.both) crumb.append(h('span', { text: part }), h('span', { class: 'crumb__sep', text: '/' }));
  crumb.append(h('b', { text: c.last }));

  const position = statePosition(ctx.data, cell);
  const step = (key: string): void => {
    const next = stepFrame(ctx.data, { ...cell, viewport }, key);
    if (next) ctx.focus(next);
  };
  const stepButton = (key: string, label: string, name: 'previous' | 'next', disabled: boolean): HTMLButtonElement => {
    const b = h('button', { class: 'button button--small button--icon', attrs: { type: 'button', 'aria-label': label, disabled } }, icon(name));
    b.addEventListener('click', () => step(key));
    return b;
  };
  const stepper = position
    ? h(
        'div',
        { class: 'stepper' },
        stepButton('ArrowLeft', 'Previous state', 'previous', position.index === 0),
        stepButton('ArrowRight', 'Next state', 'next', position.index >= position.total - 1),
        h('span', { class: 'stepper__count' }, h('span', { class: 'desktop-only', text: 'State ' }), `${position.index + 1} of ${position.total}`),
      )
    : null;

  const pick = (id: string): void => {
    if (id !== viewport && offered.has(id)) ctx.focus({ ...cell, viewport: id });
  };
  // On a board of own sizes a page with one size has nothing to pick: no size control.
  const sizes = !(ctx.ownSizes && offered.size <= 1);
  const disabled = (id: string): boolean => !offered.has(id);
  const switcher = sizes ? sizeControl(ctx.data.viewports, viewport, pick, { extraClass: 'desktop-only', disabled }) : null;
  const bottomSwitcher = sizes ? sizeControl(ctx.data.viewports, viewport, pick, { fill: true, disabled }) : null;
  const bottom = bottomSwitcher ? h('div', { class: 'bottom-bar bottom-bar--fixed phone-only' }, bottomSwitcher.el) : null;

  const fullButton = h(
    'button',
    { class: 'button button--quiet desktop-only', attrs: { type: 'button', 'aria-pressed': String(fullHeight) } },
    icon('height'),
    'Full height',
  );
  fullButton.addEventListener('click', () => {
    fullHeight = !fullHeight;
    ctx.focusFullHeight = fullHeight;
    fullButton.setAttribute('aria-pressed', String(fullHeight));
    measure();
  });
  const external = h(
    'a',
    { class: 'button button--icon-on-phone', attrs: { href: ctx.url(cell), target: '_blank', rel: 'noopener', 'aria-label': 'Open in a new tab' } },
    icon('external'),
    h('span', { class: 'desktop-only', text: 'Open in a new tab' }),
  );

  // Keyboard help.
  const helpClose = h('button', { class: 'button button--quiet button--small button--icon', attrs: { type: 'button', 'aria-label': 'Close' } }, icon('close'));
  const help = h(
    'section',
    { class: 'key-help key-help--anchored dv-shortcuts desktop-only', attrs: { hidden: true, id: 'dv-shortcuts', role: 'dialog', 'aria-labelledby': 'dv-shortcuts-title' } },
    h('div', { class: 'key-help__head' }, h('div', null, h('h2', { text: 'Keyboard shortcuts', attrs: { id: 'dv-shortcuts-title' } }), h('p', { text: 'They work in this view.' })), helpClose),
    h(
      'ul',
      { class: 'key-list' },
      keyRow([icon('keyLeft'), icon('keyRight')], 'Previous or next state'),
      keyRow([icon('keyUp'), icon('keyDown')], 'Previous or next screen'),
      sizes ? keyRow(['V'], 'Change the size') : null,
      keyRow(['Esc'], 'Back to the board'),
      keyRow(['?'], 'Show or hide this help'),
    ),
    h('p', { class: 'key-help__foot', text: 'Shortcuts also work inside the frame, except while you type in a field.' }),
  );
  const helpButton = h('button', {
    class: 'button button--icon desktop-only',
    text: '?',
    attrs: { type: 'button', 'aria-label': 'Keyboard shortcuts', 'aria-pressed': 'false', 'aria-expanded': 'false', 'aria-controls': 'dv-shortcuts' },
  });
  const toggleHelp = (): void => {
    help.hidden = !help.hidden;
    helpButton.setAttribute('aria-expanded', String(!help.hidden));
    helpButton.setAttribute('aria-pressed', String(!help.hidden));
  };
  helpButton.addEventListener('click', toggleHelp);
  helpClose.addEventListener('click', toggleHelp);

  const overlay = h(
    'div',
    { class: `dv-focus${bottom ? '' : ' dv-focus--one-size'}`, attrs: { role: 'dialog', 'aria-modal': 'true', 'aria-label': cell.label } },
    h(
      'header',
      { class: 'top-bar top-bar--centered top-bar--focus' },
      h('div', { class: 'top-bar__start' }, close, h('span', { class: 'top-bar__divider desktop-only' }), crumb, stepper),
      // Without sizes, an empty middle column keeps the end of the bar at the right on desktop.
      switcher ? switcher.el : h('span', { class: 'top-bar__spacer desktop-only' }),
      h('div', { class: 'top-bar__end' }, fullButton, cell.download ? focusDownload(ctx, cell.download) : null, external, helpButton),
    ),
    stage,
    bottom,
    help,
  );

  const previousOverflow = document.documentElement.style.overflow;
  let frameDocument: Document | null = null;
  let unbindLinks: (() => void) | undefined;
  let closed = false;
  const cleanup = (): void => {
    closed = true;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    frameDocument?.removeEventListener('keydown', onKey, true);
    unbindLinks?.();
    frame.removeEventListener('load', loaded);
    frame.removeEventListener('load', attachFrame);
    document.documentElement.style.overflow = previousOverflow;
    trigger?.focus({ preventScroll: true });
  };
  const shut = (): void => ctx.navigate({ ...cell, viewport }, 'board');
  const onKey = (e: KeyboardEvent): void => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    // The Size menu keeps its own keys while it has focus: arrows move in its list, Escape closes it.
    const menu = typeof (e.target as Element | null)?.closest === 'function' ? (e.target as Element).closest('.size-menu') : null;
    if (menu && (e.key !== 'Escape' || menu.querySelector('.size-menu__list:not([hidden])'))) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (!help.hidden) toggleHelp();
      else shut();
      return;
    }
    const target = e.target as Element | null;
    if (typeof target?.closest === 'function' && target.closest('input, textarea, select, [contenteditable]:not([contenteditable="false"])')) return;
    if (e.key === '?') {
      e.preventDefault();
      toggleHelp();
      return;
    }
    const next = stepFrame(ctx.data, { ...cell, viewport }, e.key);
    if (next) {
      e.preventDefault();
      ctx.focus(next);
    } else if (['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'v', 'V'].includes(e.key)) e.preventDefault();
  };
  const attachFrame = (): void => {
    frameDocument?.removeEventListener('keydown', onKey, true);
    unbindLinks?.();
    unbindLinks = undefined;
    try {
      frameDocument = frame.contentDocument;
      frameDocument?.addEventListener('keydown', onKey, true);
      if (frameDocument) unbindLinks = bindDesignLinks(frameDocument, ctx.data, { ...cell, viewport }, (next) => ctx.focus(next));
    } catch { frameDocument = null; }
  };
  frame.addEventListener('load', attachFrame);
  close.addEventListener('click', shut);
  document.addEventListener('keydown', onKey, true);
  document.documentElement.style.overflow = 'hidden';
  document.body.append(overlay);
  if (typeof ResizeObserver !== 'undefined') {
    const ro = new ResizeObserver(() => {
      if (closed) ro.disconnect();
      else measure();
    });
    ro.observe(stage);
  }
  measure();
  if (bottomSwitcher?.el.classList.contains('switcher')) revealPressed(bottomSwitcher.el);
  // Focus lands on Close; its ring shows only when the view was opened from the keyboard.
  close.focus({ focusVisible: usingKeyboard() } as FocusOptions);
  return cleanup;
}
