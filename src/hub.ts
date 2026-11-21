// `hub`: the home page listing every product built under <out>.

import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { VIEWER_CSP, head, lockupHtml } from './build/shell.ts';
import { copyViewer, VIEWER_DIR } from './build/index.ts';
import { escapeHtml } from './check/text.ts';
import { formatFinding } from './check/index.ts';
import { isFile, listDir } from './files.ts';
import { GENERATOR, MANIFEST_FILE } from './manifest.ts';
import type { Manifest, Review } from './model.ts';
import { PRODUCT_NAME } from './product.ts';
import { count, day, dayTime, prNumber, shortSha } from './viewer/format.ts';
import { iconHtml } from './viewer/icons.ts';

export interface HubResult {
  path: string;
  products: Manifest[];
}

export interface HubOptions {
  /** Directory holding the bundled viewer, copied to <out>/_viewer/. */
  viewerAssets?: string;
  /** The tool's version, shown in the footer. */
  version?: string;
  /** When the hub is built; defaults to now. */
  now?: Date;
  /**
   * Open pull requests, listed above the boards in the order given (newest
   * change first from readReviews). An empty list says nothing is waiting;
   * null or absent leaves the section out.
   */
  reviews?: Review[] | null;
}

/** Manifests of the boards (and failed builds) directly under out, sorted by name. */
export function readProducts(out: string): Manifest[] {
  const products: Manifest[] = [];
  for (const e of listDir(out)) {
    if (!e.dir) continue;
    const file = join(out, e.name, MANIFEST_FILE);
    if (!isFile(file)) continue;
    let m: Manifest;
    try {
      m = JSON.parse(readFileSync(file, 'utf8')) as Manifest;
    } catch {
      continue;
    }
    if (m.generator !== GENERATOR || (m.kind !== 'board' && m.kind !== 'error')) continue;
    if (m.product?.slug !== e.name) continue;
    products.push(m);
  }
  const key = (m: Manifest): string => (m.product.name ?? m.product.slug).toLowerCase();
  return products.sort((a, b) => (key(a) < key(b) ? -1 : key(a) > key(b) ? 1 : 0));
}

export function buildHub(out: string, title: string, options: HubOptions = {}): HubResult {
  const products = readProducts(out);
  if (options.viewerAssets) copyViewer(options.viewerAssets, join(out, VIEWER_DIR));
  const screens = products.filter((m) => m.kind === 'board').reduce((n, m) => n + m.screens, 0);
  const built = dayTime((options.now ?? new Date()).toISOString());
  const footer = `${escapeHtml(PRODUCT_NAME)}${options.version ? ` ${escapeHtml(options.version)}` : ''} · plain files, no account`;
  const reviews = options.reviews ?? null;
  const names = new Map(products.map((m) => [m.product.slug, m.product.name ?? m.product.slug]));
  // With a review list above them, the cards get a heading of their own.
  const boardsHead = reviews ? '<div class="section-head"><h2>Boards</h2></div>\n' : '';
  const listNote = reviews ? 'The review list shows the pull requests open when the hub was built.' : 'Pull request previews are not listed here.';
  const html = `${head(title, VIEWER_CSP, `${VIEWER_DIR}/`)}
<body class="dv-body dv-page-hub">
<header class="top-bar">
  ${lockupHtml(false, `${VIEWER_DIR}/`)}
  <span class="top-bar__spacer"></span>
  <span class="top-bar__meta">Hub built ${escapeHtml(built)} UTC</span>
</header>
<main class="container" data-products="${products.length}">
<section class="dv-hub-head">
  <div><h1>${escapeHtml(title)}</h1><p>One board per product, built from its design repo. Each board shows every screen at every size.</p></div>
  <p class="dv-hub-count"><span>${escapeHtml(count(products.length, 'product'))}</span><span>${escapeHtml(count(screens, 'screen'))}</span></p>
</section>
${reviews ? `${reviewSection(reviews, names)}\n` : ''}${products.length > 0 ? `${boardsHead}<section class="card-grid" aria-label="Products">\n${products.map(card).join('\n')}\n</section>` : '<p class="dv-empty">No products have been built yet.</p>'}
<footer class="page-foot dv-hub-foot"><span>${listNote}</span><span>${footer}</span></footer>
</main>
<script src="${VIEWER_DIR}/viewer.js"></script>
</body>
</html>
`;
  const path = join(out, 'index.html');
  writeFileSync(path, html);
  return { path, products };
}

/** Rows the hub shows before "Show all". */
export const REVIEW_ROWS_SHOWN = 3;

/**
 * "Waiting for review": the open pull requests, or one line when nothing is
 * waiting. The section opens and closes (`data-open="auto"`: open on
 * desktop, closed on phones until the viewer script applies the reader's
 * choice); the first REVIEW_ROWS_SHOWN rows show, then "Show all".
 */
function reviewSection(reviews: Review[], names: Map<string, string>): string {
  if (reviews.length === 0) {
    return `<section class="dv-hub-reviews" aria-labelledby="dv-reviews" data-reviews="0">
<div class="section-head"><h2 id="dv-reviews">Waiting for review</h2></div>
<div class="review-list"><p class="review-list__empty">Nothing is waiting.</p></div>
</section>`;
  }
  const n = reviews.length;
  const chevron = iconHtml('expanded', 'review-panel__chevron');
  const toggle = `<button type="button" class="review-panel__toggle" aria-expanded="true" aria-controls="dv-reviews-body" data-reviews-toggle><span class="review-panel__summary">${iconHtml('clock')}${escapeHtml(`${n} waiting for review`)}</span><span class="review-panel__hide">Hide</span><span class="review-panel__show">Show</span>${chevron}</button>`;
  const rows = reviews.map((r, i) => reviewRow(r, names.get(r.product) ?? r.product, i >= REVIEW_ROWS_SHOWN));
  const more =
    n > REVIEW_ROWS_SHOWN
      ? `<li class="review-list__more"><button type="button" aria-expanded="false" aria-controls="dv-reviews-list" data-reviews-more><span class="review-panel__show">${escapeHtml(`Show all ${n}`)}</span><span class="review-panel__hide">Show fewer</span>${chevron}</button></li>`
      : '';
  return `<section class="review-panel dv-hub-reviews" data-open="auto" aria-labelledby="dv-reviews" data-reviews="${n}">
<div class="section-head review-panel__head"><h2 id="dv-reviews">Waiting for review</h2><span class="section-head__meta">${escapeHtml(count(n, 'pull request'))}</span>${toggle}</div>
<div class="review-panel__body" id="dv-reviews-body">
<ul class="review-list" id="dv-reviews-list">
${rows.join('\n')}${more ? `\n${more}` : ''}
</ul>
</div>
</section>`;
}

/** One pull request: product, number and title, last change, then its preview and its page. Extra rows wait behind "Show all". */
function reviewRow(r: Review, product: string, extra: boolean): string {
  const number = prNumber(r.number);
  const link = (href: string, text: string, kind: string, extraClass: string): string =>
    `<a class="button${extraClass}" href="${escapeHtml(href)}" target="_blank" rel="noopener noreferrer" data-link="${kind}" aria-label="${escapeHtml(`${text}: ${number}, ${r.title} (opens in a new tab)`)}">${text}${iconHtml('external')}</a>`;
  return `<li class="review-row" data-product="${escapeHtml(r.product)}" data-number="${r.number}"${extra ? ' data-extra hidden' : ''}>
<span class="review-row__product">${escapeHtml(product)}</span>
<p class="review-row__title"><span class="review-row__number">${escapeHtml(number)}</span>${escapeHtml(r.title)}</p>
<span class="review-row__updated">${r.updatedAt ? `Updated ${escapeHtml(day(r.updatedAt))}` : ''}</span>
<span class="review-row__actions">${r.previewUrl ? link(r.previewUrl, 'Preview', 'preview', '') : ''}${link(r.url, 'Pull request', 'pull-request', ' button--quiet')}</span>
</li>`;
}

function card(m: Manifest): string {
  const slug = escapeHtml(m.product.slug);
  const name = escapeHtml(m.product.name ?? m.product.slug);
  const updated = m.commit
    ? `${m.commit.date ? `Updated ${escapeHtml(day(m.commit.date))} ` : ''}<span class="sha">${escapeHtml(shortSha(m.commit.sha))}</span>`
    : '';
  const open = (text: string): string => `<span class="product-card__open">${text}${iconHtml('forward')}</span>`;
  if (m.kind === 'error') {
    const findings = m.findings ?? [];
    const first = findings[0];
    return `<a class="product-card" href="${slug}/" data-slug="${slug}" data-status="error" data-findings="${findings.length}">
<div class="product-card__wall"><div class="product-card__problem"><b>The check found ${escapeHtml(count(findings.length, 'problem'))}</b><span>The board could not be built. Fix them and push again.</span>${first ? `<code>${escapeHtml(formatFinding(first))}</code>` : ''}</div></div>
<div class="product-card__body"><h2 class="product-card__name">${name}</h2><span class="product-card__count">Check failed</span>
<p class="product-card__meta">${updated}${open('See the problems')}</p></div>
</a>`;
  }
  const cover = m.cover;
  const tall = cover ? cover.viewport.height > cover.viewport.width : false;
  const thumb = cover
    ? `<div class="dv-cover"><div class="frame__shot dv-thumb${tall ? ' dv-thumb--tall' : ''}" style="aspect-ratio: ${cover.viewport.width} / ${cover.viewport.height}" data-width="${cover.viewport.width}"><iframe src="${slug}/${cover.path.split('/').map(encodeURIComponent).join('/')}" width="${cover.viewport.width}" height="${cover.viewport.height}" loading="lazy" tabindex="-1" aria-hidden="true" title=""></iframe></div></div>`
    : '<div class="dv-cover"></div>';
  return `<a class="product-card" href="${slug}/" data-slug="${slug}" data-status="ok" data-screens="${m.screens}">
<div class="product-card__wall">${thumb}</div>
<div class="product-card__body"><h2 class="product-card__name">${name}</h2><span class="product-card__count">${escapeHtml(count(m.screens, 'screen'))}</span>
<p class="product-card__meta">${updated}${open('Open board')}</p></div>
</a>`;
}
