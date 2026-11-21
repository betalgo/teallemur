import assert from 'node:assert/strict';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { checkRepo } from '../src/check/index.ts';
import { ROOT } from './helpers.ts';

// The example design repo is what the README shows and tells people to copy,
// so it must always pass the check.
describe('the example design repo', () => {
  test('examples/harbor has no findings', () => {
    assert.deepEqual(checkRepo(join(ROOT, 'examples', 'harbor')).findings, []);
  });
});
