// The command line. Exit codes: 0 success, 1 check findings (or a build that
// failed the check), 2 usage or I/O error.

import { fileURLToPath } from 'node:url';
import { isDir } from './files.ts';
import { checkRepo, formatFinding } from './check/index.ts';
import { UsageError, buildProduct } from './build/index.ts';
import { buildHub } from './hub.ts';
import { COMMAND } from './product.ts';
import { readReviews, type Review } from './reviews.ts';

/** The package version, set by the bundler. */
declare const TOOL_VERSION: string;

const USAGE = `Usage:
  ${COMMAND} check <repo> [--base <dir>]
  ${COMMAND} build <repo> --out <dir> [--base <dir>] [--label <text>] [--reviews <file>]
  ${COMMAND} hub --out <dir> --title <text> [--reviews <file>]
  ${COMMAND} --version | --help
`;

/** Writes one line to stderr, prefixed with the command name. */
function say(message: string): void {
  process.stderr.write(`${COMMAND}: ${message}\n`);
}

interface Parsed {
  positionals: string[];
  flags: Map<string, string>;
}

function parse(args: string[], allowed: string[]): Parsed {
  const positionals: string[] = [];
  const flags = new Map<string, string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i] ?? '';
    if (arg.startsWith('--')) {
      const eq = arg.indexOf('=');
      const name = eq < 0 ? arg.slice(2) : arg.slice(2, eq);
      if (!allowed.includes(name)) throw new UsageError(`unknown option --${name}`);
      let value: string | undefined;
      if (eq >= 0) value = arg.slice(eq + 1);
      else {
        value = args[i + 1];
        i++;
      }
      if (value === undefined || value === '') throw new UsageError(`--${name} needs a value`);
      if (flags.has(name)) throw new UsageError(`--${name} given twice`);
      flags.set(name, value);
    } else {
      positionals.push(arg);
    }
  }
  return { positionals, flags };
}

/** The reviews file's list, or null when there is none to show; problems are printed, never fatal. */
function reviewsFrom(path: string | undefined): Review[] | null | undefined {
  if (path === undefined) return undefined;
  const file = readReviews(path);
  for (const w of file.warnings) say(w);
  return file.reviews;
}

function requireDir(path: string, what: string): string {
  if (!isDir(path)) throw new UsageError(`${what} "${path}" is not a directory`);
  return path;
}

function run(argv: string[]): number {
  const [command, ...rest] = argv;
  if (command === undefined || command === '--help' || command === '-h' || command === 'help') {
    process.stdout.write(USAGE);
    return command === undefined ? 2 : 0;
  }
  if (command === '--version' || command === '-v') {
    process.stdout.write(`${TOOL_VERSION}\n`);
    return 0;
  }

  if (command === 'check') {
    const { positionals, flags } = parse(rest, ['base']);
    if (positionals.length !== 1) throw new UsageError('check needs exactly one <repo>');
    const repo = requireDir(positionals[0] ?? '', 'repo');
    const base = flags.get('base');
    if (base !== undefined) requireDir(base, '--base');
    const { findings } = checkRepo(repo, base === undefined ? {} : { base });
    for (const f of findings) process.stdout.write(`${formatFinding(f)}\n`);
    say(findings.length === 0 ? 'check passed' : `${findings.length} error${findings.length === 1 ? '' : 's'}`);
    return findings.length === 0 ? 0 : 1;
  }

  if (command === 'build') {
    const { positionals, flags } = parse(rest, ['out', 'base', 'label', 'reviews']);
    if (positionals.length !== 1) throw new UsageError('build needs exactly one <repo>');
    const repo = requireDir(positionals[0] ?? '', 'repo');
    const out = flags.get('out');
    if (out === undefined) throw new UsageError('build needs --out <dir>');
    const base = flags.get('base');
    if (base !== undefined) requireDir(base, '--base');
    const label = flags.get('label');
    if (base !== undefined && flags.has('reviews')) throw new UsageError('--reviews is for a board; it cannot be combined with --base');
    const reviews = reviewsFrom(flags.get('reviews'));
    const result = buildProduct({
      repo,
      out,
      ...(base === undefined ? {} : { base }),
      ...(label === undefined ? {} : { label }),
      ...(reviews === undefined ? {} : { reviews }),
      viewerAssets: fileURLToPath(new URL('./viewer/', import.meta.url)),
    });
    for (const f of result.findings) process.stdout.write(`${formatFinding(f)}\n`);
    if (result.findings.length > 0) {
      say(
        `check failed with ${result.findings.length} error${result.findings.length === 1 ? '' : 's'}; ` +
          (result.productDir ? `wrote an error page to ${result.productDir}` : 'nothing written (no usable slug in design.json)'),
      );
      return 1;
    }
    say(`wrote ${result.productDir}`);
    return 0;
  }

  if (command === 'hub') {
    const { positionals, flags } = parse(rest, ['out', 'title', 'reviews']);
    if (positionals.length > 0) throw new UsageError('hub takes no positional arguments');
    const out = flags.get('out');
    const title = flags.get('title');
    if (out === undefined || title === undefined) throw new UsageError('hub needs --out <dir> and --title <text>');
    requireDir(out, '--out');
    const reviews = reviewsFrom(flags.get('reviews'));
    const result = buildHub(out, title, {
      viewerAssets: fileURLToPath(new URL('./viewer/', import.meta.url)),
      version: TOOL_VERSION,
      ...(reviews === undefined ? {} : { reviews }),
    });
    say(`wrote ${result.path} with ${result.products.length} product${result.products.length === 1 ? '' : 's'}`);
    return 0;
  }

  throw new UsageError(`unknown command "${command}"`);
}

try {
  process.exitCode = run(process.argv.slice(2));
} catch (e) {
  if (e instanceof UsageError) {
    say(`${e.message}\n`);
    process.stderr.write(USAGE);
  } else {
    say(e instanceof Error ? (e.stack ?? e.message) : String(e));
  }
  process.exitCode = 2;
}
