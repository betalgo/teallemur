// Static HTML written by the CLI: the viewer page shell, the error page for a
// product that fails the check, and the shared page head.

import { escapeHtml } from '../check/text.ts';
import type { CommitInfo, Finding, ViewerData } from '../model.ts';
import { formatFinding } from '../check/index.ts';
import { COMMAND, PRODUCT_NAME } from '../product.ts';
import { count, dayTime, shortSha } from '../viewer/format.ts';
import { FAVICON_FILE, MARK_FILE } from '../viewer/marks.ts';

/** Viewer pages may only load files from the site itself. */
export const VIEWER_CSP =
  "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; " +
  "frame-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'";

/** Pages without scripts (the error page) load styles, fonts and images from the site only. */
export const STATIC_CSP =
  "default-src 'none'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self'; base-uri 'none'; form-action 'none'";

/** The page head. `assets` is the relative URL of the viewer folder, ending in a slash. */
export function head(title: string, csp: string, assets: string, extra = ''): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta http-equiv="Content-Security-Policy" content="${escapeHtml(csp)}">
<meta name="referrer" content="no-referrer">
<meta name="robots" content="noindex, nofollow">
<meta name="color-scheme" content="light">
<title>${escapeHtml(title)}</title>
<link rel="icon" type="image/svg+xml" href="${assets}${FAVICON_FILE}">
<link rel="stylesheet" href="${assets}viewer.css">
${extra}</head>`;
}

/** JSON safe to embed in a <script type="application/json"> element. */
export function embedJson(value: unknown): string {
  return JSON.stringify(value).replace(/</g, '\\u003c');
}

export function viewerPage(title: string, data: ViewerData, assetPrefix: string): string {
  // The board's overview card shows the product's fonts.
  const fonts = data.kind === 'board' ? data.board.find((s) => s.overview)?.overview?.fonts : undefined;
  const extra = fonts ? `<link rel="stylesheet" href="${assetPrefix}${fonts}">\n` : '';
  return `${head(title, VIEWER_CSP, `${assetPrefix}_viewer/`, extra)}
<body class="dv-body dv-page-${data.kind}">
<noscript><p class="dv-noscript">This page needs JavaScript to show the design frames.</p></noscript>
<div id="dv-app"></div>
<script type="application/json" id="dv-data">${embedJson(data)}</script>
<script src="${assetPrefix}_viewer/viewer.js"></script>
</body>
</html>
`;
}

/**
 * The mark and wordmark as markup, for pages written by the CLI. `assets` is
 * the relative URL of the viewer folder, ending in a slash, as for `head`.
 */
export function lockupHtml(markOnPhone: boolean, assets: string): string {
  return `<span class="lockup${markOnPhone ? ' lockup--mark-on-phone' : ''}" title="${escapeHtml(PRODUCT_NAME)}"><img class="mark" src="${escapeHtml(`${assets}${MARK_FILE}`)}" alt=""><span class="wordmark">${escapeHtml(PRODUCT_NAME)}</span></span>`;
}

export function errorPage(name: string, slug: string, findings: Finding[], commit: CommitInfo | null): string {
  const lines = findings.map((f) => escapeHtml(formatFinding(f))).join('\n');
  const built = commit
    ? `<span class="top-bar__meta desktop-only">${escapeHtml(commit.date ? `${dayTime(commit.date)} · ` : '')}<span class="sha">${escapeHtml(shortSha(commit.sha))}</span></span>`
    : '';
  return `${head(`${name} · check failed`, STATIC_CSP, '_viewer/')}
<body class="dv-body dv-page-error">
<header class="top-bar">
  <div class="top-bar__start">${lockupHtml(true, '_viewer/')}<div class="top-bar__product"><strong>${escapeHtml(name)}</strong><span>Check failed</span></div></div>
  <span class="top-bar__spacer"></span>
  ${built}
</header>
<main class="container dv-error" data-status="error" data-slug="${escapeHtml(slug)}" data-findings="${findings.length}">
<h1 class="dv-error__title">The design check found ${escapeHtml(count(findings.length, 'problem'))}</h1>
<p class="dv-error__lead">The board is built again once every problem below is fixed. Run <code class="sha">${escapeHtml(COMMAND)} check</code> on the repo to see the same list.</p>
<pre class="dv-findings">${lines}</pre>
</main>
</body>
</html>
`;
}
