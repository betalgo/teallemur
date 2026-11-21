// The Files page: every image under design-system/assets/, one card per
// folder, each row with the image itself, its facts and its own Download.
// Written at build time, like the design system overview; it needs no
// script. The board links to it with the Files card and the sidebar's Files
// row. Each Download is the file as it is in the built site, which holds the
// repo's files from the commit the board was built from.

import { byFolder } from '../assets.ts';
import { escapeHtml } from '../check/text.ts';
import type { AssetFile, CommitInfo } from '../model.ts';
import { count, dayTime, factsText, fileName, shortSha } from '../viewer/format.ts';
import { iconHtml } from '../viewer/icons.ts';
import { STATIC_CSP, head, lockupHtml } from './shell.ts';

export const FILES_DIR = '_files';

export interface FilesInput {
  product: { name: string; slug: string };
  commit: CommitInfo | null;
  /** The images, in any order; the page groups them by folder. */
  files: AssetFile[];
  /** The board, relative to the Files page. */
  boardHref: string;
  /** A preview's short name, for example "PR 12": the files are that pull request's. */
  change?: string | undefined;
}

const e = escapeHtml;
const attr = (s: string): string => escapeHtml(s).replace(/`/g, '&#96;');
const ROOT = 'design-system/assets/';

/** A repo file's URL from the Files page (one folder down from the product). */
function fileHref(path: string): string {
  return `../${path.split('/').map(encodeURIComponent).join('/')}`;
}

/** "assets" for the top folder, "exports / social" for design-system/assets/exports/social/. */
export function folderName(folder: string): string {
  const inner = folder.startsWith(ROOT) ? folder.slice(ROOT.length).replace(/\/$/, '') : folder.replace(/\/$/, '');
  return inner ? inner.split('/').join(' / ') : 'assets';
}

/** One id per folder for the page's links: "assets", "exports-social", unique on the page. */
function folderIds(folders: string[]): string[] {
  const used = new Set<string>();
  return folders.map((folder) => {
    const base = folderName(folder).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'folder';
    let id = base;
    for (let n = 2; used.has(id); n++) id = `${base}-${n}`;
    used.add(id);
    return id;
  });
}

function rowHtml(file: AssetFile, from: string): string {
  const name = fileName(file.path);
  const href = attr(fileHref(file.path));
  return `<div class="file-row" data-path="${attr(file.path)}"><span class="file-row__thumb" aria-hidden="true"><img src="${href}" alt="" loading="lazy" decoding="async"></span><span class="file-row__body"><span class="file-row__name" title="${attr(name)}">${e(name)}</span><span class="file-row__facts">${e(factsText(file))}</span></span><a class="button button--small button--icon-on-phone" href="${href}" download="${attr(name)}" data-download="${attr(file.path)}" aria-label="${attr(`Download ${name}${from}`)}">${iconHtml('download')}<span class="desktop-only">Download</span></a></div>`;
}

export function filesPage(input: FilesInput): string {
  const { product, commit, files, boardHref, change } = input;
  const folders = byFolder(files);
  const ids = folderIds(folders.map(([folder]) => folder));
  const sha = commit ? shortSha(commit.sha) : '';
  const when = commit?.date ? dayTime(commit.date) : '';
  const from = change ? ` from ${change}` : '';
  const where = change ? `in ${change}` : sha ? `at ${sha}` : 'in the repo';
  const made = [change, sha].filter(Boolean).join(' · ');

  const groups = folders
    .map(
      ([folder, list], i) => `<section class="file-group" id="${attr(ids[i] ?? '')}" aria-label="${attr(folder)}">
<div class="file-group__head"><span class="file-group__path" title="${attr(folder)}">${e(folder)}</span><span class="file-group__count">${e(count(list.length, 'file'))}</span></div>
<div class="file-group__rows">
${list.map((f) => rowHtml(f, from)).join('\n')}
</div>
</section>`,
    )
    .join('\n');

  return `${head(`${product.name} · files`, STATIC_CSP, '../_viewer/')}
<body class="dv-body dv-page-files">
<header class="top-bar">
  <div class="top-bar__start">${lockupHtml(true, '../_viewer/')}<div class="top-bar__product"><strong>${e(product.name)}</strong><span>Files</span></div></div>
  <span class="top-bar__spacer"></span>
  <a class="button dv-back" href="${attr(boardHref)}">${iconHtml('back')}<span class="desktop-only">Back to the board</span><span class="phone-only">Board</span></a>
</header>
<section class="pr-banner">
  <div class="container pr-banner__layout">
    <div>
      <p class="pr-banner__eyebrow">Files · ${e(count(files.length, 'image'))}</p>
      <h1 class="pr-banner__title">Files</h1>
      <div class="commits"><span class="commit"><b>Made from</b><span class="commit__branch">${ROOT}</span>${made ? `<span class="sha">${e(made)}</span>` : ''}</span></div>
      <p class="pr-banner__note">Every image in design-system/assets, exactly as it is ${e(where)}. Fonts are not listed.</p>
    </div>
    <nav class="change-summary dv-folders" aria-label="Folders" style="--dv-folder-columns: ${Math.min(4, folders.length)}">${folders.map(([, list], i) => `<a href="#${attr(ids[i] ?? '')}"><b>${list.length}</b>${e(folderName(folders[i]?.[0] ?? ''))}</a>`).join('')}</nav>
  </div>
</section>
<main class="container dv-file-page" data-files="${files.length}">
<div class="file-list">
${groups}
</div>
<footer class="page-foot">
  <span>Made from design-system/assets${sha ? ` at ${e(sha)}` : ''}${when ? `, ${e(when)}` : ''}.</span>
  <span>Each Download gives the file as it is ${change ? `in ${e(change)}` : 'in the repo'}.</span>
</footer>
</main>
</body>
</html>
`;
}
