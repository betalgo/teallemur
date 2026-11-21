// The design system overview page: the tool's own chrome (paper and ink),
// with the product's colours and fonts only inside chips, samples and
// thumbnails. Written at build time; the viewer script only scales the
// thumbnails.

import { escapeHtml } from '../check/text.ts';
import type { CommitInfo, Viewport } from '../model.ts';
import { VIEWER_CSP, head, lockupHtml } from '../build/shell.ts';
import { count, dayTime, shortSha } from '../viewer/format.ts';
import { iconHtml } from '../viewer/icons.ts';
import { ratioText } from './colour.ts';
import { families, type ColourGroupView, type FontFace, type Overview, type Row, type Swatch } from './tokens.ts';

export const OVERVIEW_DIR = '_overview';

const GENERIC = new Set(['serif', 'sans-serif', 'monospace', 'cursive', 'fantasy', 'system-ui', 'ui-serif', 'ui-sans-serif', 'ui-monospace', 'ui-rounded', 'emoji', 'math', 'fangsong']);
const PANGRAM = 'Sphinx of black quartz, judge my vow';
const LINES = 'Line height is the space between these lines, so a paragraph set at this value reads like this one.';

/** Each product font family gets a name of its own, so it can never replace one of the tool's fonts. */
export function fontAliases(faces: FontFace[]): Map<string, string> {
  const out = new Map<string, string>();
  for (const f of faces) if (!out.has(f.family)) out.set(f.family, `dv-product-font-${out.size + 1}`);
  return out;
}

/** A product font stack with its self-hosted families replaced by their aliases. */
export function appliedStack(stack: string, aliases: Map<string, string>): string {
  return families(stack)
    .map((f) => (aliases.has(f) ? `"${aliases.get(f)}"` : GENERIC.has(f.toLowerCase()) ? f : `"${f.replace(/"/g, '')}"`))
    .join(', ');
}

/** The product's @font-face rules under their aliases, with URLs relative to <slug>/_overview/. */
export function fontFacesCss(faces: FontFace[], aliases: Map<string, string>): string {
  const rewrite = (value: string): string =>
    value.replace(/url\(\s*(["']?)([^"')]+)\1\s*\)/g, (_m, _q: string, url: string) => {
      if (/^([a-z][a-z0-9+.-]*:|\/)/i.test(url)) return `url("${url}")`;
      return `url("../design-system/${url.replace(/^\.\//, '')}")`;
    });
  return faces
    .map((f) => `@font-face {\n  font-family: "${aliases.get(f.family)}";\n${f.descriptors.map((d) => `  ${d.prop}: ${d.prop === 'src' ? rewrite(d.value) : d.value};`).join('\n')}\n}\n`)
    .join('\n');
}

export interface OverviewPage {
  path: string;
  title: string;
  viewport: Viewport;
}

export interface OverviewInput {
  product: { name: string; slug: string };
  commit: CommitInfo | null;
  overview: Overview;
  aliases: Map<string, string>;
  brand: OverviewPage[];
  components: OverviewPage[];
  /** The board, relative to the overview page. */
  boardHref: string;
}

const e = escapeHtml;
const attr = (s: string): string => escapeHtml(s).replace(/`/g, '&#96;');

function levelHtml(s: Swatch): string {
  const t = s.text;
  if (!t || t.ratio === null || t.level === null) return '';
  const on = t.pointed && t.ground ? ` <i>on ${e(t.ground)}</i>` : '';
  if (t.level === 'fail') return `<span class="swatch__contrast swatch__contrast--low"><b>${e(ratioText(t.ratio))}</b><span>Below AA</span>${on}</span>`;
  const word = t.level === 'AA large' ? 'Large text only' : t.level;
  return `<span class="swatch__contrast"><b>${e(ratioText(t.ratio))}</b>${e(word)}${on}</span>`;
}

function chip(css: string | null, extra = ''): string {
  return css ? `style="background: ${attr(css)}${extra}"` : 'data-unknown=""';
}

function swatchHtml(s: Swatch, uiStack: string | null): string {
  const caption =
    `<code class="swatch__name">${e(s.name)}</code><span class="swatch__value">${e(s.value)}</span>` +
    (s.source ? `<span class="swatch__value dv-swatch-source">${e(s.source)}</span>` : '') +
    (s.role ? `<span class="swatch__role">${e(s.role)}</span>` : '') +
    levelHtml(s);
  if (s.text) {
    const sample = `<span class="swatch__sample"${uiStack ? ` style="font-family: ${attr(uiStack)}"` : ''}>Aa</span>`;
    const style = `style="background: ${attr(s.text.groundCss)}${s.css ? `; color: ${attr(s.css)}` : ''}"`;
    return `<figure class="swatch"><span class="swatch__chip" ${style}>${sample}</span><figcaption>${caption}</figcaption></figure>`;
  }
  return `<figure class="swatch"><span class="swatch__chip" ${chip(s.css)}></span><figcaption>${caption}</figcaption></figure>`;
}

function group(title: string, n: number, body: string, note = ''): string {
  return `<div class="token-group">
<div class="token-group__head"><h3>${e(title)}<span>${n}</span></h3>${note ? `<p>${note}</p>` : ''}</div>
<div>${body}</div>
</div>`;
}

function colourGroupHtml(g: ColourGroupView, uiStack: string | null): string {
  const swatches = g.swatches.length > 0 ? `<div class="swatch-grid">${g.swatches.map((s) => swatchHtml(s, uiStack)).join('')}</div>` : '';
  const ramps = g.ramps
    .map(
      (r) =>
        `<div class="ramp"><p class="ramp__head"><code>${e(r.base)}</code><span>${e(count(r.steps.length, 'step'))}${r.role ? ` · ${e(r.role)}` : ''}</span></p><ol class="ramp__steps">${r.steps
          .map((s) => `<li title="${attr(s.name)}"><i class="ramp__chip" ${chip(s.css)}></i><code>${e(s.step)}</code><span>${e(s.value)}</span></li>`)
          .join('')}</ol></div>`,
    )
    .join('');
  const note =
    g.id === 'text'
      ? 'Contrast on the main ground, or on the ground the name points to.'
      : g.id === 'other'
        ? g.ramps.length > 0
          ? 'Scales, and colours whose name or comment gives no role.'
          : 'Colours whose name or comment gives no role.'
        : '';
  return group(g.title, g.count, swatches + ramps, note);
}

function rows(list: Row[], sample: (r: Row) => string): string {
  return `<div class="token-rows">${list
    .map((r) => `<div class="token-row"><code class="token-row__name">${e(r.name)}</code><span class="token-row__value">${e(r.value)}</span>${sample(r)}</div>`)
    .join('')}</div>`;
}

function shapes(list: Row[], shadow: boolean): string {
  return `<div class="shapes">${list
    .map(
      (r) =>
        `<figure class="shape${shadow ? ' shape--shadow' : ''}"><i class="shape__box" style="${shadow ? 'box-shadow' : 'border-radius'}: ${attr(r.css)}"></i><code class="shape__name">${e(r.name)}</code><span class="shape__value">${e(r.value)}</span></figure>`,
    )
    .join('')}</div>`;
}

function tiles(pages: OverviewPage[], boardHref: string): string {
  return `<div class="page-index">${pages
    .map((p) => {
      const route = `#/file/${p.path.split('/').map(encodeURIComponent).join('/')}@${encodeURIComponent(p.viewport.id)}`;
      const src = `../${p.path.split('/').map(encodeURIComponent).join('/')}`;
      const tall = p.viewport.height > p.viewport.width;
      return `<a class="page-tile" href="${attr(boardHref + route)}"><span class="dv-tile-wall"><span class="frame__shot dv-thumb${tall ? ' dv-thumb--tall' : ''}" style="aspect-ratio: ${p.viewport.width} / ${p.viewport.height}" data-width="${p.viewport.width}"><iframe src="${attr(src)}" width="${p.viewport.width}" height="${p.viewport.height}" loading="lazy" tabindex="-1" aria-hidden="true" title=""></iframe></span></span><span><span class="page-tile__name">${e(p.title)}</span><span class="page-tile__file">${e(p.path.replace(/^design-system\//, ''))}</span></span></a>`;
    })
    .join('')}</div>`;
}

function section(id: string, title: string, meta: string, aside: string, body: string): string {
  return `<section class="dv-ds-section" id="${id}">
<div class="section-head"><h2>${e(title)}</h2><span class="section-head__meta">${e(meta)}</span>${aside ? `<span class="section-head__aside">${e(aside)}</span>` : ''}</div>
${body}
</section>`;
}

export function overviewPage(input: OverviewInput): string {
  const { overview: o, product, commit, aliases, boardHref } = input;
  const ui = o.uiFont ? appliedStack(o.uiFont.css, aliases) : null;
  const typeCount = o.fonts.length + o.sizes.length + o.lineHeights.length;
  const shapeCount = o.radii.length + o.spacing.length + o.shadows.length;
  const pageCount = input.brand.length + input.components.length;
  const sha = commit ? shortSha(commit.sha) : '';
  const when = commit?.date ? dayTime(commit.date) : '';

  const parts: string[] = [];
  if (o.colourCount > 0) {
    const aside = o.mainGround ? `Text contrast on ${o.mainGround}` : 'Text contrast on white';
    parts.push(section('colours', 'Colours', `${count(o.colourCount, 'token')} in ${count(o.groups.length, 'group')}`, o.groups.some((g) => g.swatches.some((s) => s.text)) ? aside : '', o.groups.map((g) => colourGroupHtml(g, ui)).join('\n')));
  }
  if (typeCount > 0) {
    const body: string[] = [];
    if (o.fonts.length > 0) {
      body.push(
        group(
          'Fonts',
          o.fonts.length,
          `<div class="type-specimens">${o.fonts
            .map((f) => {
              const stack = appliedStack(f.css, aliases);
              return `<article class="type-specimen"><div class="type-specimen__head"><h4 class="type-specimen__name" style="font-family: ${attr(stack)}">${e(families(f.css)[0] ?? f.name)}</h4><code class="type-specimen__token">${e(f.name)}</code><span class="type-specimen__stack">${e(f.value)}</span>${f.role ? `<span class="type-specimen__role">${e(f.role)}</span>` : ''}</div><ol class="type-specimen__lines">${[32, 20, 15, 12]
                .map((size) => `<li><span>${size}</span><p style="font-family: ${attr(stack)}; font-size: ${size}px">${PANGRAM}</p></li>`)
                .join('')}</ol></article>`;
            })
            .join('')}</div>`,
        ),
      );
    }
    const setIn = o.uiFont ? `Set in <code>${e(o.uiFont.name)}</code>.` : '';
    const font = ui ? `font-family: ${attr(ui)}; ` : '';
    if (o.sizes.length > 0) body.push(group('Sizes', o.sizes.length, rows(o.sizes, (r) => `<p class="token-row__sample" style="${font}font-size: ${attr(r.css)}">${PANGRAM}</p>`), setIn));
    if (o.lineHeights.length > 0) {
      body.push(group('Line heights', o.lineHeights.length, rows(o.lineHeights, (r) => `<p class="token-row__sample token-row__sample--lines" style="${font}line-height: ${attr(r.css)}">${LINES}</p>`), setIn));
    }
    parts.push(section('type', 'Type', count(typeCount, 'token'), '', body.join('\n')));
  }
  if (shapeCount > 0) {
    const body: string[] = [];
    if (o.radii.length > 0) body.push(group('Radii', o.radii.length, shapes(o.radii, false)));
    if (o.spacing.length > 0) body.push(group('Spacing', o.spacing.length, rows(o.spacing, (r) => `<span class="token-row__sample"><i class="space-bar" style="width: ${attr(r.css)}"></i></span>`)));
    if (o.shadows.length > 0) body.push(group('Shadows', o.shadows.length, shapes(o.shadows, true)));
    parts.push(section('shape', 'Shape and space', count(shapeCount, 'token'), '', body.join('\n')));
  }
  if (pageCount > 0) {
    const body: string[] = [];
    if (input.brand.length > 0) body.push(group('Brand pages', input.brand.length, tiles(input.brand, boardHref)));
    if (input.components.length > 0) body.push(group('Components', input.components.length, tiles(input.components, boardHref)));
    parts.push(section('pages', 'Brand and components', `${count(pageCount, 'page')} in design-system/`, '', body.join('\n')));
  }
  if (o.other.length > 0) {
    parts.push(`<details class="collapsed dv-other-tokens">
<summary>${iconHtml('collapsed')}<h2>Other tokens <span>(${o.other.length})</span></h2><p>Not colours, type, shape or space</p></summary>
<div class="collapsed__body"><table class="token-table">${o.other.map((r) => `<tr><td>${e(r.name)}</td><td>${e(r.value)}</td></tr>`).join('')}</table></div>
</details>`);
  }

  const summary = [
    [o.colourCount, o.colourCount === 1 ? 'colour' : 'colours', 'colours'],
    [typeCount, 'type', 'type'],
    [shapeCount, 'shape and space', 'shape'],
    [pageCount, pageCount === 1 ? 'page' : 'pages', 'pages'],
  ] as const;

  return `${head(`${product.name} · design system`, VIEWER_CSP, '../_viewer/', '<link rel="stylesheet" href="fonts.css">\n')}
<body class="dv-body dv-page-overview">
<header class="top-bar">
  <div class="top-bar__start">${lockupHtml(true, '../_viewer/')}<div class="top-bar__product"><strong>${e(product.name)}</strong><span>Design system</span></div></div>
  <span class="top-bar__spacer"></span>
  <a class="button dv-back" href="${attr(boardHref)}">${iconHtml('back')}<span class="desktop-only">Back to the board</span><span class="phone-only">Board</span></a>
</header>
<section class="pr-banner">
  <div class="container pr-banner__layout">
    <div>
      <p class="pr-banner__eyebrow">Overview · ${e(count(o.total, 'token'))}</p>
      <h1 class="pr-banner__title">Design system</h1>
      <div class="commits"><span class="commit"><b>Made from</b><span class="commit__branch">design-system/tokens.css</span>${sha ? `<span class="sha">${e(sha)}</span>` : ''}</span></div>
      <p class="pr-banner__note">Every token, grouped by what it is for. This page is made from tokens.css each time the board is built.</p>
    </div>
    <nav class="change-summary" aria-label="Sections">${summary
      .filter(([n]) => n > 0)
      .map(([n, word, id]) => `<a href="#${id}"><b>${n}</b>${e(word)}</a>`)
      .join('')}</nav>
  </div>
</section>
<main class="container dv-ds" data-tokens="${o.total}">
${parts.join('\n')}
<footer class="page-foot">
  <span>Made from design-system/tokens.css${sha ? ` at ${e(sha)}` : ''}${when ? `, ${e(when)}` : ''}.</span>
  <span>Roles come from token names and the comments next to them.</span>
</footer>
</main>
<script src="../_viewer/viewer.js"></script>
</body>
</html>
`;
}
