# Commands

```text
teallemur check <repo> [--base <dir>]
teallemur build <repo> --out <dir> [--base <dir>] [--label <text>] [--reviews <file>]
teallemur hub --out <dir> --title <text> [--reviews <file>]
teallemur --version | --help
```

Exit codes for every command: `0` success, `1` check findings (or a build of a
repo that fails the check), `2` usage or I/O error.

The tool's earlier command names, `designroom` and `design-viewer`, still work
as aliases of `teallemur`.

## `check`

Validates a design repo. It prints one line per finding to stdout, sorted by
path and line:

```text
path:line: rule-id: message
```

`path` is relative to the repo, with forward slashes. Findings that are not
tied to a line (a missing file, a directory, a page without a `<title>`) use
line `1`. A summary goes to stderr. Every finding is an error; the exit code is
`1` when there is at least one.

With `--base <dir>` (a checkout of the base branch) it also enforces the
archive rule: work that exists in the base may not disappear from the head
unless it moved to `archive/`.

## `build`

Runs the same check (with `--base` when given), then writes one product under
`<out>/<slug>/`, where `slug` comes from `design.json`. The folder is emptied
first. The build refuses to write to a folder that is, or contains, the repo it
reads.

- **Board** (no `--base`): the product's design board.
- **Preview** (`--base <dir>`): a before/after page for a change, plus the full
  board at head. `--label` is shown in the preview banner, for example
  `PR 12: onboarding options`.

With `--reviews <file>` (boards only; it cannot be combined with `--base`),
the board shows the product's own open pull requests from the
[reviews file](#reviews-file) in a one-line strip at the top of the wall,
each linking to its preview; links that do not fit scroll sideways. No strip
when the product has none.

If the check finds errors, the build does not write a board. When
`design.json` still names a usable slug, it writes an error page and a
manifest with `"kind": "error"` under `<out>/<slug>/` instead, so the hub can
show an error card; otherwise it writes nothing. Either way it prints the
findings and exits `1`.

## `hub`

Writes `<out>/index.html`: one card per product built under `<out>`, sorted by
name, and copies the viewer to `<out>/_viewer/`. A card shows a thumbnail of
the product's first screen at its main size, the product name, its screen
count, and the date and short hash of the commit it was built from. A product
whose build failed the check shows an error card with its finding count and
first finding. Previews are not listed as cards.

With `--reviews <file>`, a **Waiting for review** section sits above the cards:
one row per pull request in the [reviews file](#reviews-file), newest change
first, with the product name, the number and title, the date it last changed,
and links to its preview and its page (both open in a new tab). An empty list
says "Nothing is waiting."; a missing, blank or unreadable file leaves the
section out, so the hub looks as it does without the option.

The section opens and closes with a Hide / Show button (`aria-expanded`).
Until the reader picks, it is open on desktop and closed on phones (below
768px), where it is one compact row with the count. The pick is kept in this
browser under the storage key `design-viewer:hub:reviews`; blocked storage
only means it is not kept. At most three rows show at first; a "Show all N"
button opens the rest in place.

## Reviews file

An optional JSON array, written by whoever hosts the hub (the tool never asks
a code host for pull requests itself):

```json
[
  {
    "product": "harbor",
    "title": "Onboarding refresh",
    "number": 12,
    "url": "https://code.example/harbor-design/pull/12",
    "previewUrl": "https://previews.example/harbor-pr-12/harbor/",
    "updatedAt": "2026-10-16T09:12:44Z"
  }
]
```

| Field | Meaning |
|---|---|
| `product` | The product's slug, as in its `design.json`. |
| `title`, `number` | The pull request's title and number. |
| `url` | The pull request's page: an `http(s)` URL. |
| `previewUrl` | Its preview (`http(s)`), or `null` when it has none yet; the row then links only the pull request. |
| `updatedAt` | When it last changed (ISO 8601), or `null`. |

- A missing, blank or unreadable file, or one that is not an array, means
  **no list**: a warning on stderr, the section and strips left out, exit `0`.
- `[]` means **nothing is waiting**.
- An entry that does not fit (for example a `javascript:` URL or a missing
  title), or repeats a product and number, is skipped with a warning.
- The links are the only addresses outside the site on these pages; nothing
  is loaded from them.
