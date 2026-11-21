import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { after, describe, test } from 'node:test';
import { RULES } from '../src/check/rules.ts';
import { PASS, ROOT, cleanup, materialise, parseFindings, readFailFixture, runCli, tempDir } from './helpers.ts';

after(cleanup);

describe('cli', () => {
  test('check exits 0 and prints nothing on a passing repo', () => {
    const r = runCli(['check', PASS]);
    assert.equal(r.status, 0);
    assert.equal(r.stdout, '');
  });

  test('check exits 1 and prints one "path:line: rule-id: message" line per finding', () => {
    const repo = materialise(readFailFixture('tokens-colour-literal'));
    const r = runCli(['check', repo]);
    assert.equal(r.status, 1);
    const findings = parseFindings(r.stdout);
    assert.ok(findings.length > 0);
    assert.ok(findings.every((f) => f.rule in RULES));
  });

  test('check --base applies the archive rule', () => {
    const fixture = readFailFixture('archive-removed-without-archive');
    const repo = materialise(fixture);
    assert.equal(runCli(['check', repo]).status, 0);
    const r = runCli(['check', repo, '--base', PASS]);
    assert.equal(r.status, 1);
    assert.deepEqual(
      parseFindings(r.stdout).map((f) => f.rule),
      [fixture.rule],
    );
  });

  test('usage errors exit 2', () => {
    assert.equal(runCli([]).status, 2);
    assert.equal(runCli(['frobnicate']).status, 2);
    assert.equal(runCli(['check']).status, 2);
    assert.equal(runCli(['check', join(tempDir(), 'missing')]).status, 2);
    assert.equal(runCli(['check', PASS, '--colour']).status, 2);
    assert.equal(runCli(['build', PASS]).status, 2);
    assert.equal(runCli(['hub', '--out', tempDir()]).status, 2);
  });

  test('--version prints the package version', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string };
    assert.equal(runCli(['--version']).stdout.trim(), pkg.version);
  });

  test('every declared command runs the CLI and checks a design repo', () => {
    const pkg = JSON.parse(readFileSync(join(ROOT, 'package.json'), 'utf8')) as { version: string; bin: Record<string, string> };
    for (const [command, entry] of Object.entries(pkg.bin)) {
      const version = spawnSync(process.execPath, [join(ROOT, entry), '--version'], { encoding: 'utf8' });
      assert.equal(version.status, 0, command);
      assert.equal(version.stdout.trim(), pkg.version, command);
      const check = spawnSync(process.execPath, [join(ROOT, entry), 'check', PASS], { encoding: 'utf8' });
      assert.equal(check.status, 0, command);
      assert.equal(check.stdout, '', command);
    }
  });
});
