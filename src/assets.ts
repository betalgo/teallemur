// The design system's images grouped by folder, as the Files page lists them
// and the Files card counts them. Pure; shared by the viewer and the build.

import type { AssetFile } from './model.ts';

const compare = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0);

/** The folder part of a path, with its trailing slash. */
export function folderOf(path: string): string {
  return path.slice(0, path.lastIndexOf('/') + 1);
}

/** Folders in path order, so the top folder comes first, each with its files by path. */
export function byFolder(files: AssetFile[]): [string, AssetFile[]][] {
  const folders = new Map<string, AssetFile[]>();
  for (const f of [...files].sort((a, b) => compare(folderOf(a.path), folderOf(b.path)) || compare(a.path, b.path))) {
    const list = folders.get(folderOf(f.path)) ?? [];
    list.push(f);
    folders.set(folderOf(f.path), list);
  }
  return [...folders];
}

/** The files in the order the Files page lists them. */
export function inFolderOrder(files: AssetFile[]): AssetFile[] {
  return byFolder(files).flatMap(([, list]) => list);
}
