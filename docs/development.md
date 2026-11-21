# Development

How Teal Lemur itself is built and tested. To send a change, see
[CONTRIBUTING.md](../CONTRIBUTING.md).

## Working on the code

Development needs Node.js 24 or later, TypeScript, esbuild and the built-in
`node:test` runner.

```sh
npm ci              # installs dev dependencies and builds dist/
npm run typecheck   # tsc, no emit
npm test            # bundles, then runs node:test on tests/**/*.test.ts
npm run build       # bundles to dist/
node dist/cli.js --help
```

`npm ci` (and installing from a git tag) runs the `prepare` script, which
bundles the CLI to `dist/cli.js` and the viewer to `dist/viewer/`. The package
is `teallemur` and exposes the `teallemur` binary, plus the earlier
`designroom` and `design-viewer` aliases pointing at the same CLI entry file.

- `examples/harbor/` is the example design repo the README shows and tells
  people to copy. A test fails if it stops passing the check.
- `tests/fixtures/pass/` is a small design repo that passes the check.
- `tests/fixtures/fail/<name>/` holds one failing fixture per rule:
  `fixture.json` names the expected `rule` (and optionally `line`, `remove` and
  `base`), and `overlay/` holds files copied over the passing fixture. A test
  fails if a rule in `src/check/rules.ts` has no failing fixture.
- Tests check behaviour (rule IDs, output paths, classification, exit codes),
  not wording.
- `types/node.d.ts` declares the few Node.js built-ins the code uses, instead
  of depending on `@types/node`.
- `src/product.ts` holds the tool's names: the product name and the command.
  Code and tests read them from there. A rename changes that module, the
  `name` and `bin` entries in `package.json`, and the README title; the command
  examples in the docs follow with a find and replace. Earlier commands stay as
  aliases, and the browser storage key prefix stays as it is.
- `src/media/` holds the media templates: their outlines as data (each
  shape's position in CSS px of the page), the sizes and the date they were
  checked. Their look is the design repo's media template family, synced into
  `components.css`.
- `src/manifest.ts` holds the manifest contract (`board.json`, marker
  `design-board`). It carries no name and does not change in a rename; a test
  fails if it does.

Releases are semver tags (`v0.1.0`, ...), made by the maintainers. Each one
adds its notes to [CHANGELOG.md](../CHANGELOG.md).

## Design source

The viewer's tokens, component styles, fonts and mark come from the tool's own
design repo at an approved commit, recorded in `design-source.json`:

- `files` are copied byte for byte into `src/viewer/design/assets/`: the mark
  (`mark.svg`, shown as an image in every lockup, and `mark-16.svg` for the
  favicon) and the three fonts the viewer uses (Newsreader, Instrument Sans
  and Geist Mono), each with its SIL Open Font License file.
- `transcribed` files are made from the design repo's file by a fixed
  transform in `scripts/design-transform.ts`. `tokens.css`: comments removed,
  and the design mocks' sample-product tokens (`--sample-*`) and the font faces
  of fonts the viewer does not ship left out; every other token is unchanged.
  `components.css`: comments removed; every rule is unchanged.
- `npm run build` joins the tokens, the components and the viewer's own
  `src/viewer/viewer.css` (page layout only, built from tokens) into one
  `viewer.css`, and copies the assets next to it.

To move the pin, in a pull request of its own, set `commit` to a newer commit
on the design repo's main branch, then run:

```sh
npm run design:sync -- <path to a clone of the design repo>
npm run design:check -- <path to a clone of the design repo>
```

The path can also come from the `DESIGN_REPO` environment variable. Both
scripts read the design repo at the pinned commit with `git show`, never its
working tree, and refuse a shortened SHA. `design:check` exits non-zero when a
file differs.

The design repo is private, so only Betalgo's maintainers can run these two
scripts, and CI does not run them. Don't edit the copied files under
`src/viewer/design/` by hand: the next sync overwrites them. To suggest a change
to the viewer's look, open an issue.

## Screenshots

The images in `docs/images/` show `examples/harbor`, built with `build` at
1440 × 900 with the board at Phone size. The preview shows one change on top of
it: the inbox groups pinned notes under "Pinned" and "Recent", and
`--colour-pin` changes. When the viewer changes visibly, build them again the
same way and replace the images.
