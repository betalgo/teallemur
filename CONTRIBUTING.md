# Contributing to Teal Lemur

Thanks for helping. Bug reports, fixes and improvements are welcome.

## Before you start

- **Small fixes** (a bug, a typo, a missing test): send a pull request.
- **Anything bigger** (a new check rule, a new command or option, a change to
  the output): open an issue first, so we can agree on the change before you
  build it.
- **Security problems:** don't open an issue. Follow [SECURITY.md](SECURITY.md).

Keep each pull request to one topic.

## Run it locally

You need Node.js 24 or later.

```sh
npm ci                                      # installs dev dependencies and builds dist/
npm run typecheck                           # tsc, no emit
npm test                                    # bundles, then runs every test
node dist/cli.js check examples/harbor      # try it on the example design repo
```

## What a good change looks like

- **Tests prove behaviour,** not wording: rule IDs, output paths,
  classifications and exit codes. A test that compares a sentence breaks the
  next time someone improves the sentence.
- **A new check rule** needs a failing fixture in
  `tests/fixtures/fail/<name>/`. A test fails if a rule in
  `src/check/rules.ts` has no fixture. See the [development guide](docs/development.md) for the fixture format.
- **No runtime dependencies.** Development dependencies stay few and pinned.
  Ask in an issue before adding one.
- **Viewer pages load nothing from outside their own site:** no analytics,
  external fonts, CDNs or external scripts.
- **Docs match the code.** If you change what a command does, update the
  README or the page in `docs/` in the same pull request.
- **The viewer's look** (tokens, component styles, fonts and mark under
  `src/viewer/design/`) is copied from a private design repo, and the next sync
  overwrites hand edits. Open an issue to suggest a change to it.
- **Leave `version` in `package.json` alone.** The maintainers set it, and the
  changelog, when they release.

## Licence

By sending a contribution, you agree that it is released under this project's
[MIT licence](LICENSE).
