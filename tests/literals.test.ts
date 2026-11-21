import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { scanCss } from '../src/check/css.ts';
import { parseJson } from '../src/check/json.ts';
import { attributeColourLiteral, colourLiterals, fontFamilyLiterals, isExternalUrl } from '../src/check/literals.ts';
import { validate } from '../src/check/schema.ts';

const texts = (hits: { text: string }[]): string[] => hits.map((h) => h.text);

describe('colour literals', () => {
  test('finds hex, colour functions and named colours', () => {
    assert.deepEqual(texts(colourLiterals('background', '#fff linear-gradient(red, rgb(0 0 0 / .5))')), ['#fff', 'red', 'rgb(0 0 0 / .5)']);
  });

  test('allows tokens, keywords and token-built colour functions', () => {
    for (const value of ['var(--accent)', 'transparent', 'currentColor', 'rgb(var(--accent-rgb) / 0.4)', 'none', 'inherit']) {
      assert.deepEqual(colourLiterals('color', value), [], value);
    }
  });

  test('ignores colour words inside strings, urls and custom property names', () => {
    assert.deepEqual(colourLiterals('background', 'url(#red) var(--red-500)'), []);
    assert.deepEqual(colourLiterals('content', '"red #fff"'), []);
  });

  test('a var() fallback literal still counts', () => {
    assert.deepEqual(texts(colourLiterals('color', 'var(--accent, #3355ff)')), ['#3355ff']);
  });

  test('named colours only count in colour properties', () => {
    assert.deepEqual(colourLiterals('animation-name', 'tan'), []);
    assert.deepEqual(texts(colourLiterals('border', '1px solid tan')), ['tan']);
  });

  test('SVG colour attributes', () => {
    assert.equal(attributeColourLiteral('currentColor'), null);
    assert.equal(attributeColourLiteral('url(#gradient)'), null);
    assert.equal(attributeColourLiteral('#000')?.text, '#000');
  });
});

describe('font family literals', () => {
  test('flags family names but not tokens or generic families', () => {
    assert.deepEqual(texts(fontFamilyLiterals('font-family', 'var(--font-body), "Inter", sans-serif')), ['"Inter"']);
    assert.deepEqual(fontFamilyLiterals('font-family', 'ui-monospace, monospace'), []);
  });

  test('reads the family from the font shorthand', () => {
    assert.deepEqual(texts(fontFamilyLiterals('font', 'italic 600 1rem/1.5 Georgia, serif')), ['Georgia']);
    assert.deepEqual(texts(fontFamilyLiterals('font', '16px / 1.4 "Fira Sans"')), ['"Fira Sans"']);
    assert.deepEqual(fontFamilyLiterals('font', '600 1rem/1.5 var(--font-body)'), []);
    assert.deepEqual(fontFamilyLiterals('font', 'inherit'), []);
  });
});

describe('urls', () => {
  test('http(s) and protocol-relative URLs are external', () => {
    assert.ok(isExternalUrl('https://example.com/a.png'));
    assert.ok(isExternalUrl('HTTP://example.com'));
    assert.ok(isExternalUrl('//example.com/x.js'));
    for (const local of ['../a.png', '#top', 'mailto:a@example.com', 'data:image/png;base64,AA==', '/abs.css']) {
      assert.ok(!isExternalUrl(local), local);
    }
  });
});

describe('css scanner', () => {
  test('reports declarations with their enclosing selectors', () => {
    const { declarations } = scanCss('@media (min-width: 40em) { :root { --a: 1px; } }\n.b { color: red; }');
    assert.deepEqual(
      declarations.map((d) => [d.context.join(' > '), d.prop, d.value]),
      [
        ['@media (min-width: 40em) > :root', '--a', '1px'],
        ['.b', 'color', 'red'],
      ],
    );
  });

  test('ignores comments and semicolons inside url()', () => {
    const { declarations } = scanCss('/* a: b; */ .x { background: url(data:image/png;base64,AA==); }');
    assert.deepEqual(
      declarations.map((d) => d.prop),
      ['background'],
    );
  });
});

describe('design.json parsing and schema', () => {
  test('records the line of every value', () => {
    const { lines } = parseJson('{\n  "a": [\n    1,\n    2\n  ]\n}');
    assert.equal(lines.get('/a/1'), 4);
  });

  test('the validator rejects schema keywords it does not implement', () => {
    assert.throws(() => validate({ oneOf: [] }, {}));
  });
});
