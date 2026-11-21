import { execFileSync } from 'node:child_process';
import { realpathSync } from 'node:fs';
import type { CommitInfo } from '../model.ts';

function git(dir: string, args: string[]): string {
  return execFileSync('git', ['-C', dir, ...args], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
}

/**
 * The commit checked out in dir, when dir is the top of a git work tree.
 * Returns null otherwise (not a repo, a folder inside another repo, or no git).
 */
export function commitInfo(dir: string): CommitInfo | null {
  try {
    const top = git(dir, ['rev-parse', '--show-toplevel']);
    if (realpathSync(top).toLowerCase() !== realpathSync(dir).toLowerCase()) return null;
    const [sha, date] = git(dir, ['log', '-1', '--format=%H%n%cI']).split('\n');
    if (!sha || !/^[0-9a-f]{40,64}$/.test(sha)) return null;
    return { sha, date: date || null };
  } catch {
    return null;
  }
}
