// How design-source.json's "transcribed" files are made from the design
// repo's files. Both transforms are deterministic, so design:check can
// rebuild them from the pinned commit and compare bytes.

export type Transform = 'tokens' | 'styles';

/** Removes CSS comments, trailing spaces and runs of blank lines. */
export function stripComments(css: string): string {
  return tidy(css.replace(/\/\*[\s\S]*?\*\//g, ''));
}

function tidy(css: string): string {
  return `${css
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((line) => line.replace(/[ \t]+$/, ''))
    .join('\n')
    .replace(/\{\n(?:[ \t]*\n)+/g, '{\n')
    .replace(/\n(?:[ \t]*\n)+([ \t]*\})/g, '\n$1')
    .replace(/\n{3,}/g, '\n\n')
    .trim()}\n`;
}

/** url() paths inside a CSS block, as written. */
function urls(block: string): string[] {
  return [...block.matchAll(/url\(\s*(["']?)([^"')]+)\1\s*\)/g)].map((m) => m[2] ?? '');
}

/**
 * The viewer's tokens: comments removed, the design mocks' sample-product
 * tokens (`--sample-*`) removed, and @font-face rules removed unless every
 * font file they load is among `shipped` (paths relative to tokens.css).
 */
export function chromeTokens(css: string, shipped: Set<string>): string {
  const plain = stripComments(css)
    .replace(/^[ \t]*--sample-[A-Za-z0-9_-]+[ \t]*:[^;{}]*;[ \t]*\n/gm, '')
    .replace(/@font-face\s*\{[^}]*\}\s*/g, (block) => {
      const files = urls(block);
      return files.length > 0 && files.every((f) => shipped.has(f)) ? block : '';
    });
  return tidy(plain);
}

export function header(from: string, commit: string): string {
  return `/* Made by design:sync from ${from} at ${commit}. Do not edit; see design-source.json. */\n`;
}

/** The transcribed file's content for a source file at a commit. */
export function transcribe(transform: Transform, from: string, commit: string, source: string, shipped: Set<string>): string {
  const body = transform === 'tokens' ? chromeTokens(source, shipped) : stripComments(source);
  return `${header(from, commit)}${body}`;
}
