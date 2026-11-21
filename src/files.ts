import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** Directories never read, checked or copied. */
const SKIPPED_DIRS = new Set(['.git', 'node_modules']);

export interface Entry {
  name: string;
  dir: boolean;
}

/** Lists one directory, without .git and node_modules, sorted by name. Symlinks are skipped. */
export function listDir(dir: string): Entry[] {
  if (!isDir(dir)) return [];
  const out: Entry[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (d.isSymbolicLink()) continue;
    if (d.isDirectory()) {
      if (!SKIPPED_DIRS.has(d.name)) out.push({ name: d.name, dir: true });
    } else if (d.isFile()) {
      out.push({ name: d.name, dir: false });
    }
  }
  return out.sort((a, b) => compare(a.name, b.name));
}

/** All files under root as sorted repo-relative POSIX paths. */
export function walk(root: string, prefix = ''): string[] {
  const out: string[] = [];
  const visit = (rel: string): void => {
    for (const e of listDir(rel ? join(root, rel) : root)) {
      const p = rel ? `${rel}/${e.name}` : e.name;
      if (e.dir) visit(p);
      else out.push(p);
    }
  };
  visit(prefix);
  return out.sort(compare);
}

export function isDir(p: string): boolean {
  try {
    return statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function isFile(p: string): boolean {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

export function readText(p: string): string {
  return readFileSync(p, 'utf8');
}

export function sameBytes(a: string, b: string): boolean {
  if (!existsSync(a) || !existsSync(b)) return false;
  return readFileSync(a).equals(readFileSync(b));
}

export function copyFile(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

/** Stable, locale-independent string order. */
export function compare(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0;
}
