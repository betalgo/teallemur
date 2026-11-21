// Minimal declarations for the Node.js built-ins this project uses. The
// project has no dependency on @types/node; extend this file when code needs
// another built-in.

interface NodeBuffer extends Uint8Array {
  equals(other: Uint8Array): boolean;
  toString(encoding?: string): string;
}

declare var process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exitCode: number | undefined;
  execPath: string;
  platform: string;
  cwd(): string;
  stdout: { write(chunk: string): boolean };
  stderr: { write(chunk: string): boolean };
};

interface ImportMeta {
  readonly dirname: string;
  readonly filename: string;
}

declare module 'node:fs' {
  interface Dirent {
    name: string;
    isDirectory(): boolean;
    isFile(): boolean;
    isSymbolicLink(): boolean;
  }
  interface Stats {
    isDirectory(): boolean;
    isFile(): boolean;
    size: number;
  }
  export function readFileSync(path: string, encoding: 'utf8'): string;
  export function readFileSync(path: string): NodeBuffer;
  export function writeFileSync(path: string, data: string | Uint8Array): void;
  export function readdirSync(path: string, options: { withFileTypes: true }): Dirent[];
  export function readdirSync(path: string): string[];
  export function statSync(path: string): Stats;
  export function existsSync(path: string): boolean;
  export function mkdirSync(path: string, options?: { recursive?: boolean }): string | undefined;
  export function mkdtempSync(prefix: string): string;
  export function rmSync(path: string, options?: { recursive?: boolean; force?: boolean }): void;
  export function copyFileSync(from: string, to: string): void;
  export function cpSync(from: string, to: string, options?: { recursive?: boolean }): void;
  export function realpathSync(path: string): string;
}

declare module 'node:path' {
  export const sep: string;
  export function join(...parts: string[]): string;
  export function resolve(...parts: string[]): string;
  export function relative(from: string, to: string): string;
  export function dirname(path: string): string;
  export function basename(path: string, ext?: string): string;
}

declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}

declare module 'node:os' {
  export function tmpdir(): string;
}

declare module 'node:child_process' {
  interface ExecOptions {
    encoding: 'utf8';
    cwd?: string;
    stdio?: ('ignore' | 'pipe' | 'inherit')[];
    maxBuffer?: number;
  }
  interface ExecBufferOptions {
    encoding: 'buffer';
    stdio?: ('ignore' | 'pipe' | 'inherit')[];
    maxBuffer?: number;
  }
  interface SpawnResult {
    status: number | null;
    stdout: string;
    stderr: string;
  }
  export function execFileSync(file: string, args: string[], options: ExecOptions): string;
  export function execFileSync(file: string, args: string[], options: ExecBufferOptions): NodeBuffer;
  export function spawnSync(file: string, args: string[], options: ExecOptions): SpawnResult;
}

declare module 'node:test' {
  type Fn = () => void | Promise<void>;
  export function test(name: string, fn: Fn): void;
  export function describe(name: string, fn: () => void): void;
  export function before(fn: Fn): void;
  export function after(fn: Fn): void;
}

declare module 'node:assert/strict' {
  interface Assert {
    (value: unknown, message?: string): asserts value;
    ok(value: unknown, message?: string): asserts value;
    equal<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual<T>(actual: unknown, expected: T, message?: string): asserts actual is T;
    match(value: string, pattern: RegExp, message?: string): void;
    doesNotMatch(value: string, pattern: RegExp, message?: string): void;
    throws(fn: () => unknown, message?: string): void;
  }
  const assert: Assert;
  export default assert;
}
