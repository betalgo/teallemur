// A changed page at one size in a preview: before and after side by side,
// or one over the other with a line to drag. The mode and the line's place
// survive re-renders through the state object. Given the preview's page
// heights, both show the whole page at one height, the taller page's, in
// either mode.

import type { Cell } from '../model.ts';
import type { Context } from './context.ts';
import { h, icon, px } from './dom.ts';
import { shortSha } from './format.ts';
import { captionLinks } from './downloads.ts';
import { copyButton, frameLabel, frameShot } from './frame.ts';
import type { FrameLoader } from './loader.ts';
import type { PageHeights } from './wholepage.ts';

export interface ComparisonState { overlay: boolean; split: number }

export function comparison(ctx: Context, before: Cell, after: Cell, loader: FrameLoader, state: ComparisonState, heights?: PageHeights): HTMLElement {
  const vp = ctx.viewports.get(after.viewport) ?? { id: after.viewport, width: 1, height: 1 };
  const whole = heights?.group([before, after]);
  const content = h('div');
  const side = h('button', { text: 'Side by side', attrs: { type: 'button' } });
  const overlay = h('button', { text: 'Overlay', attrs: { type: 'button' } });
  const controls = h('div', { class: 'switcher switcher--small', attrs: { role: 'group', 'aria-label': `Compare ${after.path} at ${after.viewport}` } }, side, overlay);
  const el = h(
    'article',
    { class: 'change dv-comparison', attrs: { 'data-path': after.path, 'data-viewport': after.viewport } },
    h('div', { class: 'change__head' }, frameLabel(after), controls, captionLinks(ctx, after, copyButton(() => ctx.ref(after, after.viewport)))),
    content,
  );
  const baseSha = ctx.data.preview?.base?.sha;
  const headSha = ctx.data.commit?.sha;
  const sideOf = (cell: Cell, word: string, sha: string | undefined): HTMLElement => {
    const figure = h(
      'div',
      { class: 'compare-side dv-frame', attrs: { 'data-path': cell.path, 'data-viewport': cell.viewport, 'data-root': cell.root } },
      h('p', { class: 'compare-side__label' }, word, sha ? h('span', { class: 'sha', text: shortSha(sha) }) : null),
    );
    let shot: HTMLElement | null = null;
    shot = frameShot(ctx, cell, loader, () => ctx.focus(cell, shot?.querySelector<HTMLElement>('.dv-frame-open') ?? undefined), '', whole);
    figure.append(shot);
    return figure;
  };

  const render = (): void => {
    for (const host of content.querySelectorAll<HTMLElement>('.dv-view')) loader.forget(host);
    content.replaceChildren();
    whole?.clear();
    side.setAttribute('aria-pressed', String(!state.overlay));
    overlay.setAttribute('aria-pressed', String(state.overlay));
    if (!state.overlay) {
      content.className = 'compare-pair';
      content.append(sideOf(before, 'Before', baseSha), sideOf(after, 'After', headSha));
      return;
    }
    content.className = 'overlay';
    // After underneath, before on top, cut at the line: before on the left.
    const layers = [after, before].map((cell) => {
      const host = h('div', { class: 'dv-view dv-compare-layer', style: { width: px(vp.width), height: px(vp.height) } });
      const make = (): HTMLIFrameElement => h('iframe', { class: 'dv-iframe', attrs: { src: ctx.url(cell), title: `${cell.root === 'base' ? 'Before' : 'After'}: ${cell.label}`, width: vp.width, height: vp.height, tabindex: -1 } });
      loader.observe(host, whole ? whole.frames(cell, make) : make);
      whole?.fit((tall) => { host.style.height = px(tall); });
      return host;
    });
    const top = layers[1] as HTMLElement;
    const line = h('span', { class: 'overlay__line', attrs: { 'aria-hidden': 'true' } });
    const knob = h('span', { class: 'overlay__knob', attrs: { 'aria-hidden': 'true' } }, icon('previous'), icon('next'));
    const range = h('input', {
      class: 'dv-compare-range',
      attrs: { type: 'range', min: 0, max: 100, step: 1, value: state.split, 'aria-label': `Line between before and after at ${after.viewport}` },
    });
    const stage = h(
      'div',
      { class: 'frame__shot dv-shot dv-overlay', style: { 'aspect-ratio': `${vp.width} / ${vp.height}`, 'max-width': px(vp.width) } },
      ...layers,
      line,
      range,
      knob,
      h('span', { class: 'overlay__tag overlay__tag--before', text: 'Before' }),
      h('span', { class: 'overlay__tag overlay__tag--after', text: 'After' }),
    );
    loader.scale(stage, vp.width);
    whole?.fit((tall) => { stage.style.setProperty('aspect-ratio', `${vp.width} / ${tall}`); });
    const update = (): void => {
      state.split = Math.max(0, Math.min(100, Number(range.value)));
      top.style.clipPath = `inset(0 ${100 - state.split}% 0 0)`;
      stage.style.setProperty('--reveal', `${state.split}%`);
      range.setAttribute('aria-valuetext', `${state.split}% before`);
    };
    range.addEventListener('input', update);
    update();
    const notes = h(
      'div',
      { class: 'overlay__notes' },
      h('h3', { text: 'Overlay' }),
      h('p', { text: 'Before on the left of the line, after on the right. Drag the line, or use the arrow keys.' }),
    );
    if (after.note) notes.append(h('h3', { text: 'Note' }), h('p', { text: after.note }));
    const links = h(
      'p',
      { class: 'dv-overlay-links' },
      h('a', { text: 'Open before', attrs: { href: ctx.link(before) } }),
      ' · ',
      h('a', { text: 'Open after', attrs: { href: ctx.link(after) } }),
    );
    notes.append(links);
    content.append(stage, notes);
  };
  side.addEventListener('click', () => { state.overlay = false; render(); });
  overlay.addEventListener('click', () => { state.overlay = true; render(); });
  render();
  return el;
}
