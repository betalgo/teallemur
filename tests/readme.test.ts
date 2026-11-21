import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { explorationInfo } from '../src/build/readme.ts';

// The exploration README template from the agent skill's reference.
const TEMPLATE = `# Harbor onboarding, 2 March

## What I think you are asking for

New accounts land on an empty inbox and many leave before writing anything.

## The question

Which first screen should new accounts see? Pick A, B or C.

## Options

- **A, Start in the shared notebook:** opens the teammate's notebook with a
  one-line hint.
- **B, Three-step checklist:** a short list that ends with writing a note.
- **C, A blank note with prompts:** opens straight into an editor.

Each option shows \`screens/onboarding/welcome--default.html\`.
`;

describe('exploration README', () => {
  test('reads the question, each option\'s name and line, and the folder date', () => {
    const info = explorationInfo('2026-03-02-onboarding', TEMPLATE, ['a', 'b', 'c']);
    assert.equal(info.since, '2026-03-02');
    assert.ok(info.question?.endsWith('?'));
    assert.ok(info.question?.startsWith('Which first screen'));
    assert.deepEqual(info.options.map((o) => o.id), ['a', 'b', 'c']);
    assert.equal(info.options[0]?.title, 'Start in the shared notebook');
    assert.ok(info.options[0]?.text?.includes('one-line hint'));
    assert.equal(info.options[2]?.title, 'A blank note with prompts');
  });

  test('accepts other option styles and leaves out what the README does not say', () => {
    const info = explorationInfo('toolbar', '- **A** Above the text: next to where you type\n- B) Under the top bar\n- a list item that is not an option', ['a', 'b', 'c']);
    assert.equal(info.since, null);
    assert.equal(info.question, null);
    assert.deepEqual(info.options.map((o) => [o.id, o.title, o.text]), [
      ['a', 'Above the text', 'next to where you type'],
      ['b', 'Under the top bar', null],
      ['c', null, null],
    ]);
  });

  test('works without a README', () => {
    const info = explorationInfo('2026-01-15-onboarding', null, ['a', 'b']);
    assert.equal(info.question, null);
    assert.equal(info.since, '2026-01-15');
    assert.equal(info.options.length, 2);
  });
});
