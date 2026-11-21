# Output

What `build` and `hub` write, and how to look at it.

## Layout

```text
<out>/
  index.html                      hub (from `hub`)
  <slug>/
    index.html                    board, preview, or error page
    board.json                    manifest read by `hub` (see below)
    _viewer/                      the viewer: viewer.js, viewer.css, and
                                  assets/ with its fonts (and licences) and mark
    _overview/index.html, fonts.css
                                  the design system overview (when tokens.css
                                  has tokens) and the product's fonts for it
    _files/index.html             the Files page (when design-system/assets/
                                  has images)
    design-system/ screens/ explorations/ archive/
                                  copies of the repo's design files (head)
    board/index.html              preview only: the full board at head
    _base/design-system/ _base/screens/
                                  preview only: copies of the base files
```

Design files are copied with their repo paths, so every frame is a same-origin
`<iframe>` and `<slug>/screens/auth/login--error.html` opens the exact file.
`README.md`, `design.json`, `docs/`, `scripts/` and `.github/` are not copied.

## `board.json`

| Field | Meaning |
|---|---|
| `generator`, `formatVersion` | Always `"design-board"` and `1`. Readers find manifests by this file name and marker. |
| `tool` | The tool's name, `"Teal Lemur"`, for information only. Readers must not depend on it. |
| `kind` | `"board"`, `"preview"` or `"error"`. |
| `product` | `{ "name", "slug" }` from `design.json` (`name` may be `null` for an error). |
| `commit` | `{ "sha", "date" }` of the repo's checked-out commit, or `null` when `<repo>` is not the top of a git work tree. |
| `screens`, `frames` | Number of screen state files, and of frames on the board. |
| `cover` | `{ "path", "viewport" }`: the first screen at the board's main size, shown on the hub card, or `null`. |
| `base`, `label`, `classification` | Preview only. `classification` lists `changed`, `added` and `removed` pages, new `archived` files, changed `explorations`, changed `shared` files, and `tokens` changes with old and new values. |
| `findings` | Error only: the check findings. |

A page counts as **changed** when its bytes differ between base and head.

## Serving it locally

Serve the output folder with any static file server and open
`http://localhost:<port>/<slug>/`. Opening the files straight from disk is not
supported: browsers treat local files as separate origins, which breaks
same-origin frames and the page's security policy.
