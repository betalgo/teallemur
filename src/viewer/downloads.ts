// Downloads: a page that names a ready file with design:download gets a
// Download button that names the format, and the design system starts with a
// Files card next to the Overview card, opening the Files page (written by
// the build, src/build/files-page.ts) with every image under
// design-system/assets/. The file comes down exactly as it is on the site,
// which holds the repo's files from the commit the board was built from; the
// viewer never makes or converts it. In a preview, and on the board built
// with it, the button says whose file it is.

import { byFolder } from '../assets.ts';
import type { AssetFile, Cell } from '../model.ts';
import type { Context } from './context.ts';
import { h, icon } from './dom.ts';
import { count, fileName, pixelText } from './format.ts';
import { copyButton } from './frame.ts';

/** The site URL of a repo file. Downloads are always the built (head) copy. */
function href(ctx: Context, file: AssetFile): string {
  return ctx.url({ path: file.path, root: 'head' });
}

/** " from PR 12" in a preview and on the board built with it; empty otherwise. */
function fromChange(ctx: Context): string {
  return ctx.data.change ? ` from ${ctx.data.change}` : '';
}

/** "Download PNG", or "Download PNG from PR 12" in a preview. */
export function downloadText(ctx: Context, file: AssetFile): string {
  return `Download ${file.format}${fromChange(ctx)}`;
}

/** The parts every Download shares: the file's URL and its own name when saved. */
function linkAttrs(ctx: Context, file: AssetFile, label?: string): Record<string, string> {
  const attrs: Record<string, string> = { href: href(ctx, file), download: fileName(file.path), 'data-download': file.path };
  if (label) attrs['aria-label'] = label;
  return attrs;
}

/** ", 1512 × 256" when the file says its size. */
function sizeSuffix(file: AssetFile): string {
  const size = pixelText(file);
  return size ? `, ${size}` : '';
}

/** In a frame caption, before Copy link: the same quiet underline. */
export function captionDownload(ctx: Context, file: AssetFile): HTMLElement {
  return h('a', { class: 'download-link', attrs: { ...linkAttrs(ctx, file), title: fileName(file.path) } }, icon('download'), downloadText(ctx, file));
}

/** A frame caption's links: Download, then Copy link (or the card's tag). */
export function captionLinks(ctx: Context, cell: Cell, last: HTMLElement): HTMLElement {
  if (!cell.download) return last;
  return h('span', { class: 'frame__links' }, captionDownload(ctx, cell.download), last);
}

/** A media image's heading, top right: an outlined button. */
export function mediaDownload(ctx: Context, cell: Cell, file: AssetFile): HTMLElement {
  const label = `Download ${file.format} of ${cell.title}${fromChange(ctx)}${sizeSuffix(file)}`;
  return h('a', { class: 'button media-group__download', attrs: linkAttrs(ctx, file, label) }, icon('download'), downloadText(ctx, file));
}

/** The focus view's top bar, before Open in a new tab. On phones only its icon shows; its label names the file and size. */
export function focusDownload(ctx: Context, file: AssetFile): HTMLElement {
  return h(
    'a',
    { class: 'button button--icon-on-phone', attrs: linkAttrs(ctx, file, `${downloadText(ctx, file)}${sizeSuffix(file)}`) },
    icon('download'),
    h('span', { class: 'desktop-only', text: downloadText(ctx, file) }),
  );
}

/**
 * The Files card, next to the Overview card: the first four images as the
 * Files page lists them, and how many there are. It opens the Files page.
 * `size` gives the card the proportions of the frames beside it.
 */
export function filesCard(ctx: Context, filesHref: string, files: AssetFile[], size?: { width: number; height: number }): HTMLElement {
  const href = `${ctx.data.roots.head}${filesHref}`;
  const folders = byFolder(files);
  const first = folders.flatMap(([, list]) => list).slice(0, 4);
  return h(
    'figure',
    { class: 'frame dv-files-card', attrs: { 'data-kind': 'files' } },
    h(
      'a',
      { class: 'files-card', attrs: { href, 'aria-label': `Open Files: ${count(files.length, 'image')} to download` }, style: size ? { 'aspect-ratio': `${size.width} / ${size.height}` } : {} },
      h(
        'span',
        { class: 'files-card__thumbs', attrs: { 'aria-hidden': 'true' } },
        ...first.map((f) => h('span', { class: 'files-card__thumb', attrs: { 'data-path': f.path } }, h('img', { attrs: { src: ctx.url({ path: f.path, root: 'head' }), alt: '', loading: 'lazy', decoding: 'async' } }))),
      ),
      h(
        'span',
        { class: 'files-card__body' },
        h('span', { class: 'files-card__title', text: 'Files' }),
        h('span', { class: 'files-card__meta', text: `${count(files.length, 'image')} in ${count(folders.length, 'folder')}, ready to download` }),
      ),
    ),
    h(
      'figcaption',
      { class: 'frame__caption' },
      h('span', { class: 'frame__label' }, 'design-system / ', h('b', { text: 'files' })),
      copyButton(() => `${ctx.data.product.slug} design-system/assets/ (files)\n${new URL(href, window.location.href).href}`),
    ),
  );
}
