import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { contrast, parseColour, ratioText, resolveVars, toHex, wcagLevel } from '../src/overview/colour.ts';
import { colourGroup, isTextColour, pointedGround, rampStep, tokenKind } from '../src/overview/roles.ts';
import { buildOverview, parseTokens, type Overview } from '../src/overview/tokens.ts';
import { appliedStack, fontAliases, fontFacesCss, overviewPage } from '../src/overview/page.ts';
import { FIXTURES } from './helpers.ts';

const tokensOf = (name: string): string => readFileSync(join(FIXTURES, 'tokens', `${name}.css`), 'utf8');
const names = (o: Overview, group: string): string[] => o.groups.find((g) => g.id === group)?.swatches.map((s) => s.name) ?? [];
const swatch = (o: Overview, name: string) => o.groups.flatMap((g) => g.swatches).find((s) => s.name === name);

describe('contrast maths', () => {
  test('follows WCAG 2: black on white is 21, a colour on itself is 1, and the order does not matter', () => {
    const black = parseColour('#000')!;
    const white = parseColour('white')!;
    assert.equal(contrast(black, white), 21);
    assert.equal(contrast(white, black), 21);
    assert.equal(contrast(white, white), 1);
    assert.equal(Math.round(contrast(parseColour('#767676')!, white) * 100) / 100, 4.54);
  });

  test('levels: 7 is AAA, 4.5 AA, 3 large text only, below 3 fails', () => {
    assert.deepEqual([7, 6.99, 4.5, 4.49, 3, 2.99].map(wcagLevel), ['AAA', 'AA', 'AA', 'AA large', 'AA large', 'fail']);
  });

  test('the ratio shows one decimal and never rounds up across a level', () => {
    assert.equal(ratioText(17.731), '17.7 : 1');
    assert.equal(ratioText(4.967), '5.0 : 1');
    assert.equal(ratioText(4.47), '4.4 : 1');
    assert.equal(ratioText(2.97), '2.9 : 1');
  });

  test('see-through text is drawn over its ground first', () => {
    const half = parseColour('rgb(0 0 0 / 50%)')!;
    const white = parseColour('#fff')!;
    assert.equal(contrast(half, white), contrast({ r: 127.5, g: 127.5, b: 127.5, a: 1 }, white));
    assert.equal(contrast(parseColour('transparent')!, white), 1);
  });
});

describe('colour values', () => {
  test('reads hex, rgb, hsl, oklch, named colours and transparent', () => {
    assert.equal(toHex(parseColour('#abc')!), '#AABBCC');
    assert.equal(toHex(parseColour('rgb(18, 24, 38)')!), '#121826');
    assert.equal(toHex(parseColour('rgb(18 24 38 / 8%)')!), '#12182614');
    assert.equal(toHex(parseColour('hsl(0 100% 50%)')!), '#FF0000');
    assert.equal(toHex(parseColour('oklch(100% 0 0)')!), '#FFFFFF');
    assert.equal(toHex(parseColour('rebeccapurple')!), '#663399');
    assert.equal(parseColour('transparent')?.a, 0);
    assert.equal(parseColour('var(--x)'), null);
    assert.equal(parseColour('12px'), null);
  });

  test('resolves var() references, with fallbacks, and color-mix()', () => {
    const tokens = new Map([['--ink', '#1E1C19'], ['--edge', 'color-mix(in srgb, var(--ink) 13%, transparent)'], ['--loop', 'var(--loop)']]);
    const lookup = (n: string): string | undefined => tokens.get(n);
    assert.equal(resolveVars('var(--ink)', lookup), '#1E1C19');
    assert.equal(resolveVars('var(--missing, red)', lookup), 'red');
    assert.equal(resolveVars('var(--missing)', lookup), 'var(--missing)');
    assert.ok(resolveVars('var(--loop)', lookup).includes('var(--loop)'));
    const edge = parseColour(resolveVars('var(--edge)', lookup))!;
    assert.equal(toHex({ ...edge, a: 1 }), '#1E1C19');
    assert.equal(Math.round(edge.a * 100), 13);
    assert.equal(toHex(parseColour('color-mix(in srgb, #000 50%, #fff)')!), '#808080');
  });
});

describe('roles from names and comments', () => {
  test('group words, in order: status, text, lines, accent, grounds, else other', () => {
    assert.equal(colourGroup('--color-status-warning-text'), 'status');
    assert.equal(colourGroup('--color-text-on-accent'), 'text');
    assert.equal(colourGroup('--colorBorderStrong'), 'lines');
    assert.equal(colourGroup('--brand-tint'), 'accent');
    assert.equal(colourGroup('--bg-panel'), 'grounds');
    assert.equal(colourGroup('--site'), 'other');
    assert.equal(colourGroup('--c1', 'sidebar'), 'grounds');
    assert.equal(colourGroup('--c1', 'text on buttons'), 'text');
  });

  test('text colours point at the ground in their name, else the main ground', () => {
    const candidates = [
      { name: '--color-background', group: 'grounds' as const },
      { name: '--color-nav', group: 'grounds' as const },
      { name: '--color-accent', group: 'accent' as const },
      { name: '--color-status-warning', group: 'status' as const },
      { name: '--color-status-warning-subtle', group: 'status' as const },
    ];
    assert.equal(pointedGround('--color-text-on-accent', candidates), '--color-accent');
    assert.equal(pointedGround('--color-nav-text-strong', candidates), '--color-nav');
    assert.equal(pointedGround('--color-status-warning-text', candidates), '--color-status-warning-subtle');
    assert.equal(pointedGround('--color-text-muted', candidates), null);
    // When several colours share the words, the text goes where it reads best.
    const brand = [{ name: '--color-brand', group: 'accent' as const }, { name: '--color-brand-soft', group: 'accent' as const }];
    const dark = parseColour('#190713')!;
    const on = (n: string): number => contrast(dark, parseColour(n === '--color-brand' ? '#FF4FA3' : '#3A1530')!);
    assert.equal(pointedGround('--color-brand-ink', brand, on), '--color-brand');
    assert.equal(pointedGround('--color-brand-ink', brand), '--color-brand-soft');
    assert.ok(isTextColour('--onGold') && isTextColour('--fgMuted') && !isTextColour('--brand'));
  });

  test('kinds come from the value first, then the name', () => {
    assert.equal(tokenKind('--font-ui', '"Inter", system-ui, sans-serif', false), 'font');
    assert.equal(tokenKind('--text-sm', '13px', false), 'size');
    assert.equal(tokenKind('--weight-bold', '650', false), 'other');
    assert.equal(tokenKind('--leading-tight', '1.15', false), 'line-height');
    assert.equal(tokenKind('--radius-card', '10px', false), 'radius');
    assert.equal(tokenKind('--space-4', '16px', false), 'spacing');
    assert.equal(tokenKind('--sidebar-width', '236px', false), 'other');
    assert.equal(tokenKind('--shadow-menu', '0 6px 18px -4px rgb(18 24 38 / 16%)', false), 'shadow');
    assert.deepEqual(rampStep('--palette-blue-500'), { base: '--palette-blue', step: '500' });
    assert.equal(rampStep('--brand'), null);
  });

  test('a comment on the same line is the role; a comment above is not', () => {
    const { tokens } = parseTokens(':root {\n  /* Group */\n  --a: #fff; /* page */\n  --b: #000;\n}\n');
    assert.deepEqual(tokens.map((t) => [t.name, t.comment]), [['--a', 'page'], ['--b', null]]);
  });
});

describe('overview of the sample token sets', () => {
  test('a large product: colours grouped as the approved overview shows them', () => {
    const o = buildOverview(tokensOf('harbor'));
    assert.equal(o.total, 109);
    assert.equal(o.colourCount, 70);
    assert.deepEqual(o.groups.map((g) => [g.id, g.count]), [['grounds', 5], ['text', 6], ['accent', 4], ['lines', 2], ['status', 6], ['other', 47]]);
    assert.equal(o.mainGround, '--color-background');
    assert.deepEqual(names(o, 'grounds'), ['--color-background', '--color-nav', '--color-surface-muted', '--color-surface-sunken', '--color-nav-selected']);
    assert.deepEqual(names(o, 'accent'), ['--color-accent', '--color-accent-hover', '--color-accent-subtle', '--color-focus-ring']);
    assert.deepEqual(o.groups.find((g) => g.id === 'other')?.ramps.map((r) => [r.base, r.steps.length]), [
      ['--color-notebook', 6], ['--palette-blue', 10], ['--palette-gray', 10], ['--palette-green', 10], ['--palette-red', 10],
    ]);
    const contrastOf = (name: string): [string, string | null, string | null] => {
      const t = swatch(o, name)?.text;
      return [t?.ratio ? ratioText(t.ratio) : '', t?.level ?? null, t?.pointed ? t.ground : null];
    };
    assert.deepEqual(contrastOf('--color-text'), ['17.7 : 1', 'AAA', null]);
    assert.deepEqual(contrastOf('--color-text-placeholder'), ['2.6 : 1', 'fail', null]);
    assert.deepEqual(contrastOf('--color-text-on-accent'), ['5.9 : 1', 'AA', '--color-accent']);
    assert.deepEqual(contrastOf('--color-nav-text'), ['8.4 : 1', 'AAA', '--color-nav']);
    assert.deepEqual(contrastOf('--color-status-warning-text'), ['6.2 : 1', 'AA', '--color-status-warning-subtle']);
    assert.deepEqual([o.fonts.length, o.sizes.length, o.lineHeights.length], [2, 8, 3]);
    assert.equal(o.uiFont?.name, '--font-ui');
    assert.deepEqual([o.radii.length, o.spacing.length, o.shadows.length, o.other.length], [5, 10, 3, 8]);
    assert.ok(o.palette.length > 0 && o.palette.length <= 8);
  });

  test('a small product with other names: empty sections drop out', () => {
    const o = buildOverview(tokensOf('fieldwork'));
    assert.equal(o.total, 20);
    assert.deepEqual(o.groups.map((g) => [g.id, g.count]), [['grounds', 2], ['text', 3], ['accent', 2], ['lines', 1], ['status', 2], ['other', 2]]);
    assert.equal(o.mainGround, '--bg');
    const onBrand = swatch(o, '--on-brand')?.text;
    assert.deepEqual([onBrand?.ground, onBrand?.level, onBrand ? ratioText(onBrand.ratio ?? 0) : ''], ['--brand', 'AA large', '3.9 : 1']);
    assert.deepEqual([o.fonts.length, o.sizes.length, o.lineHeights.length, o.radii.length, o.spacing.length, o.shadows.length], [1, 3, 0, 2, 0, 0]);
    assert.deepEqual(o.other.map((r) => r.name), ['--row-height', '--header-height']);
    const page = overviewPage({ product: { name: 'Fieldwork', slug: 'fieldwork' }, commit: null, overview: o, aliases: new Map(), brand: [], components: [], boardHref: '../' });
    assert.deepEqual([...page.matchAll(/<section class="dv-ds-section" id="([a-z]+)"/g)].map((m) => m[1]), ['colours', 'type', 'shape']);
    assert.ok(!page.includes('<h3>Spacing') && !page.includes('<h3>Shadows') && !page.includes('<h3>Line heights'));
    assert.ok(page.includes('dv-other-tokens'));
  });

  test('a product of our own: camelCase, references, modern colours, a theme override and a self-hosted font', () => {
    const css = tokensOf('lumen');
    const o = buildOverview(css);
    assert.deepEqual(names(o, 'grounds'), ['--canvas', '--raised']);
    assert.deepEqual(names(o, 'text'), ['--fgPrimary', '--fgMuted', '--onGold']);
    assert.deepEqual(names(o, 'accent'), ['--cta']);
    assert.deepEqual(names(o, 'status'), ['--danger']);
    // The :root value wins over the theme override; references resolve.
    assert.equal(swatch(o, '--canvas')?.value, toHex(parseColour('oklch(0.2 0.03 285)')!));
    assert.equal(swatch(o, '--canvas')?.source, 'var(--gray-900)');
    assert.equal(swatch(o, '--onGold')?.text?.ground, '--gold');
    assert.equal(swatch(o, '--fgPrimary')?.text?.level, 'AAA');
    // A reference that does not resolve keeps its raw value and an unknown chip.
    assert.deepEqual([swatch(o, '--missing-colour')?.css, swatch(o, '--missing-colour')?.value], [null, 'var(--does-not-exist)']);
    assert.deepEqual(o.groups.find((g) => g.id === 'other')?.ramps.map((r) => r.base), ['--gray']);
    assert.deepEqual([o.fonts.map((f) => f.name), o.sizes.map((r) => r.name), o.lineHeights.map((r) => r.name)], [['--typeface-body', '--typeface-title'], ['--fs-1', '--fs-2'], ['--lh-tight']]);
    assert.deepEqual([o.radii.length, o.spacing.length, o.shadows.length], [1, 1, 1]);
    assert.deepEqual(o.other.map((r) => r.name), ['--z-dialog', '--ease']);
    assert.equal(new Set(o.palette).size, o.palette.length);

    // The product's own font gets a name of its own and a URL from the overview folder.
    const aliases = fontAliases(o.fontFaces);
    assert.deepEqual([...aliases.keys()], ['Reader Serif']);
    const stack = appliedStack('"Reader Serif", Georgia, serif', aliases);
    assert.ok(stack.startsWith(`"${aliases.get('Reader Serif')}"`) && stack.endsWith('serif'));
    assert.match(fontFacesCss(o.fontFaces, aliases), /url\("\.\.\/design-system\/assets\/fonts\/reader-serif\.woff2"\)/);
  });
});
