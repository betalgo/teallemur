// `check`: validates a design repo against the design repo standard.

import { join } from 'node:path';
import { compare, isFile, listDir, readText, walk } from '../files.ts';
import {
  ASSET_PATH,
  COMPONENT_PAGE_PATH,
  COMPONENTS_CSS,
  EXPLORATION_SCREEN_PATH,
  OPTIONS,
  SCREEN_PATH,
  SHARED_CSS_PATH,
  SHARED_DIR,
  TOKENS_CSS,
  TOP_LEVEL_DIRS,
  TOP_LEVEL_FILES,
  isHtml,
  isLinted,
  pageKind,
} from '../layout.ts';
import { TEMPLATES, mediaTemplate } from '../media/templates.ts';
import type { DesignJson, Finding } from '../model.ts';
import { cssUrls, scanCss } from './css.ts';
import { loadDesignJson, type LoadedDesign } from './design-json.ts';
import { attrValue, metaContent, parseHtml, titleText } from './html.ts';
import { COLOUR_ATTRIBUTES, attributeColourLiteral, colourLiterals, fontFamilyLiterals, isExternalUrl } from './literals.ts';
import type { RuleId } from './rules.ts';
import { decodeEntities, lineIndex } from './text.ts';

export interface CheckOptions {
  /** Directory of the base checkout, for the archive rule. */
  base?: string;
}

export interface CheckResult {
  findings: Finding[];
  loaded: LoadedDesign;
  /** Repo-relative paths of every file in the repo. */
  files: string[];
}

type Report = (path: string, line: number, rule: RuleId, message: string) => void;

export function checkRepo(root: string, options: CheckOptions = {}): CheckResult {
  const findings: Finding[] = [];
  const report: Report = (path, line, rule, message) => {
    findings.push({ path, line, rule, message });
  };

  const loaded = loadDesignJson(root);
  findings.push(...loaded.findings);
  const design = loaded.design;
  const files = walk(root);

  checkTopLevel(root, report);
  checkScreenPaths(root, design, report);
  checkExplorations(root, files, report);

  const present = new Set(files);
  for (const path of files) {
    if (!isLinted(path)) continue;
    const text = readText(join(root, path));
    if (path.endsWith('.css')) {
      lintCss(path, text, lineIndex(text), 0, false, path !== TOKENS_CSS, report);
    } else {
      lintMarkup(path, text, design, present, report);
    }
  }

  if (options.base !== undefined) checkArchive(options.base, new Set(files), report);

  return { findings: sortFindings(findings), loaded, files };
}

export function sortFindings(findings: Finding[]): Finding[] {
  const seen = new Set<string>();
  return findings
    .filter((f) => {
      const key = `${f.path}\0${f.line}\0${f.rule}\0${f.message}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => compare(a.path, b.path) || a.line - b.line || compare(a.rule, b.rule) || compare(a.message, b.message));
}

export function formatFinding(f: Finding): string {
  return `${f.path}:${f.line}: ${f.rule}: ${f.message}`;
}

function checkTopLevel(root: string, report: Report): void {
  for (const e of listDir(root)) {
    const allowed = e.dir ? TOP_LEVEL_DIRS.has(e.name) : TOP_LEVEL_FILES.has(e.name);
    if (!allowed) {
      report(e.name, 1, 'layout/unknown-top-level', `${e.dir ? 'directory' : 'file'} "${e.name}" is not part of the standard layout`);
    }
  }
}

function checkScreenPaths(root: string, design: DesignJson | null, report: Report): void {
  const flows = new Set(design?.flows.map((f) => f.id));
  for (const e of listDir(join(root, 'screens'))) {
    const rel = `screens/${e.name}`;
    if (!e.dir) {
      report(rel, 1, 'screens/bad-path', 'screens are screens/<flow>/<screen>--<state>.html');
      continue;
    }
    const inside = walk(root, rel);
    if (e.name === SHARED_DIR) {
      for (const p of inside) {
        if (!SHARED_CSS_PATH.test(p)) report(p, 1, 'screens/bad-path', 'screens/_shared/ holds only <name>.css files');
      }
      continue;
    }
    if (design && !flows.has(e.name)) {
      report(rel, 1, 'screens/unknown-flow', `flow folder "${e.name}" is not listed in design.json flows`);
    }
    for (const p of inside) {
      if (!SCREEN_PATH.test(p)) {
        report(p, 1, 'screens/bad-path', 'not screens/<flow>/<screen>--<state>.html in lowercase kebab-case');
      }
    }
  }
}

function checkExplorations(root: string, files: string[], report: Report): void {
  for (const e of listDir(join(root, 'explorations'))) {
    if (!e.dir) continue;
    const rel = `explorations/${e.name}`;
    if (!isFile(join(root, rel, 'README.md'))) {
      report(rel, 1, 'explorations/missing-readme', 'exploration has no README.md');
    }
    for (const sub of listDir(join(root, rel))) {
      if (sub.dir && !OPTIONS.includes(sub.name)) {
        report(`${rel}/${sub.name}`, 1, 'explorations/bad-option', `option folder "${sub.name}" is not a, b, c or d`);
      }
    }
  }
  const optionScreens = /^explorations\/[^/]+\/[a-d]\/screens\/(?!_shared\/).*\.html$/;
  for (const p of files) {
    if (optionScreens.test(p) && !EXPLORATION_SCREEN_PATH.test(p)) {
      report(p, 1, 'screens/bad-path', 'option screens mirror screens/<flow>/<screen>--<state>.html');
    }
  }
}

function checkArchive(base: string, head: Set<string>, report: Report): void {
  const archived = new Set<string>();
  for (const p of head) {
    const m = /^archive\/[^/]+\/(.+)$/.exec(p);
    if (m?.[1]) archived.add(m[1]);
  }
  const protectedFile = (p: string): boolean =>
    /^screens\/(?!_shared\/).+\.html$/.test(p) || COMPONENT_PAGE_PATH.test(p) || ASSET_PATH.test(p);
  for (const p of walk(base)) {
    if (!protectedFile(p) || head.has(p) || archived.has(p)) continue;
    report(p, 1, 'archive/removed-without-archive', `removed without moving it to archive/<yyyy-mm-dd>-<reason>/${p}`);
  }
}

/** Lints an HTML page or SVG file: URLs everywhere; colours, fonts and page rules for HTML. */
function lintMarkup(path: string, text: string, design: DesignJson | null, files: Set<string>, report: Report): void {
  const html = parseHtml(text);
  const lineAt = lineIndex(text);
  const tokenRules = isHtml(path);

  for (const tag of html.tags) {
    for (const a of tag.attrs) {
      if (a.value === null) continue;
      const value = decodeEntities(a.value);
      const line = lineAt(a.offset);
      if (a.name === 'src' || a.name === 'href' || a.name === 'xlink:href' || a.name === 'poster') {
        if (!isExternalUrl(value)) continue;
        if (tag.name === 'script' && a.name === 'src') {
          report(path, line, 'urls/external-script', `external script "${value.trim()}"`);
        } else {
          report(path, line, 'urls/external-url', `external URL "${value.trim()}" in ${a.name}`);
        }
      } else if (a.name === 'srcset' || a.name === 'imagesrcset') {
        for (const candidate of value.split(',')) {
          const url = candidate.trim().split(/\s+/)[0] ?? '';
          if (isExternalUrl(url)) report(path, line, 'urls/external-url', `external URL "${url}" in ${a.name}`);
        }
      } else if (a.name === 'style') {
        lintCss(path, a.value, lineAt, a.offset, true, tokenRules, report);
      } else if (tokenRules && COLOUR_ATTRIBUTES.has(a.name)) {
        const hit = attributeColourLiteral(value);
        if (hit) report(path, line, 'tokens/colour-literal', colourMessage(hit.text));
      } else if (tokenRules && a.name === 'font-family') {
        for (const hit of fontFamilyLiterals('font-family', value)) {
          report(path, line, 'tokens/font-family-literal', fontMessage(hit.text));
        }
      }
    }
  }

  for (const raw of html.raws) {
    if (raw.tag === 'style') lintCss(path, raw.text, lineAt, raw.offset, false, tokenRules, report);
  }

  const kind = pageKind(path);
  if (!kind) return;

  if (!titleText(html)) report(path, 1, 'html/missing-title', 'page has no <title>');

  const linked = new Set<string>();
  for (const tag of html.tags) {
    if (tag.name !== 'link') continue;
    const rel = (attrValue(tag, 'rel') ?? '').toLowerCase().split(/\s+/);
    const href = attrValue(tag, 'href');
    if (!rel.includes('stylesheet') || href === null) continue;
    const target = resolveRelative(path, href);
    if (target) linked.add(target);
  }
  if (!linked.has(TOKENS_CSS)) {
    report(path, 1, 'html/missing-tokens-link', `page does not link ${TOKENS_CSS} with a relative <link rel="stylesheet">`);
  }
  if (!linked.has(COMPONENTS_CSS)) {
    report(path, 1, 'html/missing-components-link', `page does not link ${COMPONENTS_CSS} with a relative <link rel="stylesheet">`);
  }

  const meta = metaContent(html, 'design:viewports');
  if (meta && design) {
    const known = new Set(design.viewports.map((v) => v.id));
    for (const id of meta.value.split(',').map((s) => s.trim())) {
      if (id && !known.has(id)) {
        report(path, lineAt(meta.offset), 'viewports/unknown', `design:viewports names unknown viewport "${id}"`);
      }
    }
  }

  const frame = metaContent(html, 'design:frame');
  const template = frame ? mediaTemplate(frame.value.trim()) : null;
  if (frame && !template) {
    const known = TEMPLATES.map((t) => t.id).join(', ');
    report(path, lineAt(frame.offset), 'frames/unknown', `design:frame names unknown template "${frame.value.trim()}"; known: ${known}`);
  }
  // A template measured for one upload size outlines a page only at that size:
  // every size the page is shown at must be it.
  const upload = template?.upload;
  if (frame && template && upload && design) {
    const wanted = meta ? new Set(meta.value.split(',').map((s) => s.trim())) : null;
    const offered = design.viewports.filter((v) => wanted?.has(v.id));
    const sizes = offered.length > 0 ? offered : design.viewports;
    const other = sizes.filter((v) => v.width !== upload.width || v.height !== upload.height);
    if (other.length > 0) {
      const list = other.map((v) => `${v.id} (${v.width} × ${v.height})`).join(', ');
      report(path, lineAt(frame.offset), 'frames/size', `${template.id} is for ${upload.width} × ${upload.height} uploads, but the page is shown at ${list}; set design:viewports to a viewport of that size`);
    }
  }

  // The ready file the page offers for download: a file in the repo, under
  // design-system/assets/, so the board serves it exactly as committed.
  const download = metaContent(html, 'design:download');
  const wanted = download?.value.trim() ?? '';
  if (download && wanted) {
    const target = downloadTarget(path, wanted);
    if (target === null) {
      report(path, lineAt(download.offset), 'downloads/outside-assets', `design:download "${wanted}" is not a relative path to a file under design-system/assets/`);
    } else if (!files.has(target)) {
      const folder = [...files].some((f) => f.startsWith(`${target}/`));
      if (folder) report(path, lineAt(download.offset), 'downloads/outside-assets', `design:download names the folder ${target}; name one file in it`);
      else report(path, lineAt(download.offset), 'downloads/missing', `design:download names ${target}, which is not in the repo`);
    }
  }
}

/**
 * The repo path a page's design:download names, resolved against the page
 * like a src (percent escapes decoded); null when it is not a relative path
 * to a file under design-system/assets/.
 */
export function downloadTarget(pagePath: string, value: string): string | null {
  const v = value.trim();
  if (/[?#\\]/.test(v) || v.endsWith('/')) return null;
  const target = resolveRelative(pagePath, v);
  if (target === null) return null;
  let parts: string[];
  try {
    parts = target.split('/').map(decodeURIComponent);
  } catch {
    return null;
  }
  // An escaped slash, backslash or dot segment would name another path than the one checked.
  if (parts.some((s) => s === '' || s === '.' || s === '..' || /[/\\]/.test(s))) return null;
  const decoded = parts.join('/');
  return ASSET_PATH.test(decoded) ? decoded : null;
}

function lintCss(
  path: string,
  css: string,
  lineAt: (offset: number) => number,
  base: number,
  inline: boolean,
  tokenRules: boolean,
  report: Report,
): void {
  const scanned = scanCss(css, inline);
  for (const d of scanned.declarations) {
    for (const u of cssUrls(d.value)) {
      if (isExternalUrl(u.url)) {
        report(path, lineAt(base + d.offset + u.offset), 'urls/external-url', `external URL "${u.url.trim()}" in url()`);
      }
    }
    if (!tokenRules) continue;
    for (const hit of colourLiterals(d.prop, d.value)) {
      report(path, lineAt(base + d.offset + hit.offset), 'tokens/colour-literal', colourMessage(hit.text));
    }
    for (const hit of fontFamilyLiterals(d.prop, d.value)) {
      report(path, lineAt(base + d.offset + hit.offset), 'tokens/font-family-literal', fontMessage(hit.text));
    }
  }
  for (const s of scanned.atStatements) {
    if (!/^@import\b/i.test(s.text)) continue;
    const m = /^@import\s+(?:url\(\s*)?["']?([^"')\s]+)/i.exec(s.text);
    if (m?.[1] && isExternalUrl(m[1])) {
      report(path, lineAt(base + s.offset), 'urls/external-url', `external URL "${m[1]}" in @import`);
    }
  }
}

function colourMessage(text: string): string {
  return `colour literal "${text}" outside ${TOKENS_CSS}; use a var(--...) token`;
}

function fontMessage(text: string): string {
  return `font family ${text.startsWith('"') || text.startsWith("'") ? text : `"${text}"`} outside ${TOKENS_CSS}; use a var(--...) token`;
}

/** Resolves a relative href against a repo path; null for absolute or external URLs. */
export function resolveRelative(fromPath: string, href: string): string | null {
  const clean = href.trim().replace(/[?#].*$/, '');
  if (!clean || clean.startsWith('/') || /^[a-z][a-z0-9+.-]*:/i.test(clean)) return null;
  const parts = fromPath.split('/').slice(0, -1);
  for (const seg of clean.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') {
      if (parts.length === 0) return null;
      parts.pop();
    } else {
      parts.push(seg);
    }
  }
  return parts.join('/');
}
