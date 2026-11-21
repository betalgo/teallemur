import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { after, describe, test } from 'node:test';
import { checkRepo } from '../src/check/index.ts';
import { RULES } from '../src/check/rules.ts';
import { FAIL, PASS, cleanup, copyPass, materialise, readFailFixture } from './helpers.ts';

after(cleanup);

const failNames = readdirSync(FAIL).sort();

function copyInto(from: string, to: string): void {
  mkdirSync(dirname(to), { recursive: true });
  copyFileSync(from, to);
}

describe('check', () => {
  test('the passing fixture has no findings', () => {
    assert.deepEqual(checkRepo(PASS).findings, []);
  });

  test('the passing fixture also passes against itself as the base', () => {
    assert.deepEqual(checkRepo(PASS, { base: PASS }).findings, []);
  });

  for (const name of failNames) {
    const fixture = readFailFixture(name);
    test(`fixture ${name} fails with ${fixture.rule} only`, () => {
      const repo = materialise(fixture);
      const { findings } = checkRepo(repo, fixture.base ? { base: PASS } : {});
      assert.ok(findings.length > 0, 'expected at least one finding');
      assert.deepEqual([...new Set(findings.map((f) => f.rule))], [fixture.rule]);
      if (fixture.line !== undefined) assert.equal(findings[0]?.line, fixture.line);
    });
  }

  test('every rule has a failing fixture', () => {
    const covered = new Set(failNames.map((n) => readFailFixture(n).rule));
    assert.deepEqual(
      Object.keys(RULES).filter((rule) => !covered.has(rule)),
      [],
    );
  });

  test('every failing fixture names a known rule', () => {
    assert.deepEqual(
      failNames.map((n) => readFailFixture(n).rule).filter((rule) => !(rule in RULES)),
      [],
    );
  });

  test('removing a screen passes when it moves to archive/ under its old path', () => {
    const screen = 'screens/auth/signup--default.html';
    const head = copyPass();
    rmSync(join(head, screen));
    assert.equal(checkRepo(head, { base: PASS }).findings[0]?.rule, 'archive/removed-without-archive');
    copyInto(join(PASS, screen), join(head, 'archive', '2026-02-01-merged', screen));
    assert.deepEqual(checkRepo(head, { base: PASS }).findings, []);
  });

  test('removing an asset without archiving it fails', () => {
    const head = copyPass();
    rmSync(join(head, 'design-system/assets/logo.svg'));
    // The pages that showed the logo still link it; only the archive rule fires.
    const rules = checkRepo(head, { base: PASS }).findings.map((f) => `${f.rule} ${f.path}`);
    assert.deepEqual(rules, ['archive/removed-without-archive design-system/assets/logo.svg']);
  });

  test('archive/ content is exempt from the token and URL rules', () => {
    const repo = materialise(readFailFixture('tokens-colour-literal'));
    const paths = checkRepo(repo).findings.map((f) => f.path);
    assert.ok(paths.every((p) => !p.startsWith('archive/')));
  });

  test('findings name the offending file', () => {
    const repo = materialise(readFailFixture('urls-external-url'));
    assert.deepEqual(
      checkRepo(repo).findings.map((f) => f.path),
      ['screens/settings/billing--default.html'],
    );
  });
});
