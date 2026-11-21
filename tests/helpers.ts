import { spawnSync } from 'node:child_process';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { COMMAND } from '../src/product.ts';

export const ROOT = fileURLToPath(new URL('..', import.meta.url));
export const FIXTURES = join(ROOT, 'tests', 'fixtures');
export const PASS = join(FIXTURES, 'pass');
export const FAIL = join(FIXTURES, 'fail');
export const CLI = join(ROOT, 'dist', 'cli.js');

const temps: string[] = [];

/** A fresh temporary directory, removed by cleanup(). */
export function tempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), `${COMMAND}-test-`));
  temps.push(dir);
  return dir;
}

export function cleanup(): void {
  for (const d of temps.splice(0)) rmSync(d, { recursive: true, force: true });
}

/** Copies the passing fixture into a temporary directory and returns the copy. */
export function copyPass(): string {
  const dir = join(tempDir(), 'repo');
  cpSync(PASS, dir, { recursive: true });
  return dir;
}

export interface FailFixture {
  name: string;
  rule: string;
  line?: number;
  base: boolean;
  remove: string[];
}

export function readFailFixture(name: string): FailFixture {
  const spec = JSON.parse(readFileSync(join(FAIL, name, 'fixture.json'), 'utf8')) as Partial<FailFixture>;
  const fixture: FailFixture = { name, rule: spec.rule ?? '', base: spec.base === true, remove: spec.remove ?? [] };
  if (typeof spec.line === 'number') fixture.line = spec.line;
  return fixture;
}

/** The passing fixture with a failing fixture's removals and overlay applied. */
export function materialise(f: FailFixture): string {
  const dir = copyPass();
  for (const p of f.remove) rmSync(join(dir, p), { force: true });
  const overlay = join(FAIL, f.name, 'overlay');
  if (existsSync(overlay)) cpSync(overlay, dir, { recursive: true });
  return dir;
}

export interface CliResult {
  status: number | null;
  stdout: string;
  stderr: string;
}

export function runCli(args: string[]): CliResult {
  const r = spawnSync(process.execPath, [CLI, ...args], { encoding: 'utf8' });
  return { status: r.status, stdout: r.stdout, stderr: r.stderr };
}

/** Parses "path:line: rule-id: message" lines. */
export function parseFindings(stdout: string): { path: string; line: number; rule: string; message: string }[] {
  return stdout
    .split('\n')
    .filter((l) => l.trim() !== '')
    .map((l) => {
      const m = /^(.+?):(\d+): ([a-z0-9-]+\/[a-z0-9-]+): (.+)$/.exec(l);
      if (!m) throw new Error(`not a finding line: ${l}`);
      return { path: m[1] ?? '', line: Number(m[2]), rule: m[3] ?? '', message: m[4] ?? '' };
    });
}

export function ensureDir(p: string): string {
  mkdirSync(p, { recursive: true });
  return p;
}
