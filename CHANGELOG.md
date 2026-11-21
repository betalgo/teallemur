# Changelog

What changed in each release of Teal Lemur, and what readers of its output
need to update. Releases are semver tags.

## 0.13.0

The first public release, under the [MIT licence](LICENSE). It adds a README
with screenshots, the reference in [docs/](docs/README.md), the example design
repo [examples/harbor](examples/harbor/), and CONTRIBUTING and SECURITY notes.
Commands, options, the output, the manifest and `check` do not change.

## 0.12.1

In 0.12.1, a bug fix, each changed and added page in a preview, and each
option, shows its whole page, top to bottom, instead of only its size's
first screen, so a change low on a long page is seen by scrolling the
preview rather than by opening the focus view (see
[Preview page order](docs/viewer.md)). Before and after show at one height,
the taller page's, side by side and in the overlay. A page that fits its
size, scrolls inside its own areas or does not scroll keeps the size's
height, and board frames still show the first screen only. A part sized to
the screen (`100vh`) stays the size's screen high instead of stretching with
the taller frame, in previews and in the focus view's **Full height**.
Commands, options, the manifest, the build's output, the viewer data and
`check` do not change.

## 0.12.0

In 0.12.0 a preview shows its changed and added pages, and new or changed
options, at one size at a time instead of at every size, picked with the
board's size control in the preview's top bar (see
[Preview page order](docs/viewer.md)). It always opens at the product's main
size, `desktop` (or the first size in `design.json`); a size picked holds for
that visit only and is not stored. A page without that size shows at its
own first size. A preview of a board of own sizes shows each page at its own
size, with no size control. Preview data gains the optional `ownSizes` field
the board already had.
Commands, options, the manifest, the build's output and `check` do not change:
previews still carry every size, and deep links to any of them still work.

## 0.11.0

In 0.11.0 a board whose every screen page declares one size of its own
(`design:viewports` with one id, as for images made for other sites) shows
every page at once, each at its own size, with no size control; a board with
more than four sizes picks them in one **Size** menu instead of a row of
buttons; and Files leaves the board for a page of its own,
`<slug>/_files/index.html`, opened from a Files card next to the Overview card
and from the sidebar's Files row (see [The viewer](docs/viewer.md) and
[Downloads](docs/downloads.md)). Board data gains an optional `ownSizes` field and an
optional `filesHref` on the design system section. Commands, options, the
manifest and `check` do not change.

## 0.10.0

In 0.10.0 a page can name a ready file with
`<meta name="design:download" content="../../design-system/assets/exports/cover.png">`,
and the board, the focus view and previews show a Download button for it; the
design system ends with **Files**, every image under `design-system/assets/`
with its own Download (see [Downloads](docs/downloads.md)). Board data gains optional
`download` fields on frames, `assets` on the design system section and
`change` on previews, and `check` gains the rules `downloads/outside-assets`
and `downloads/missing`. Commands, options, output layout and the manifest do
not change.

## 0.9.0

In 0.9.0 a page can name a media template with
`<meta name="design:frame" content="linkedin-profile">`, and the board shows it
in the template's outline at desktop and phone width and on its own (see
[Media templates](docs/media-templates.md)). Board data gains an optional `frame`
field on frames, and `check` gains the rules `frames/unknown` and
`frames/size`. Commands,
options, output layout and the manifest do not change.

## 0.8.0

In 0.8.0 the viewer takes the new mark from its design repo: two amber eyes
on a teal rounded square, shown as an image of `assets/mark.svg` in its own
colours instead of a one-colour mask, and the 16 px master as the favicon.
Commands, options, output layout and the manifest do not change.

## 0.7.0

In 0.7.0 `build` and `hub` take an optional `--reviews <file>` (see
[Reviews file](docs/commands.md#reviews-file)), and board data gains an optional `reviews`
field. Nothing else changes: without the option the output is as before, and
the manifest contract stays `board.json` with `generator: "design-board"`.

## 0.6.0

In 0.6.0 the tool is renamed Teal Lemur, and the manifest contract stops
carrying the tool's name, so later renames never change it. The per-product
manifest is `board.json`, its marker is `generator: "design-board"`, and a new
`tool` field names the tool for information only. Builds write only this
manifest, and hubs read only this filename and marker. Hubs consuming 0.5.0
output (`designroom.json` with `generator: "designroom"`) must update with the
builder; there is no fallback to the old contract. The command is `teallemur`;
`designroom` and `design-viewer` still work as aliases.

The `_viewer/` asset folder and the browser sidebar storage keys stay unchanged
to preserve assets and saved preferences.

## 0.5.0

In 0.5.0 the manifest gains an optional `cover` field (read by the hub for its
thumbnails), the board data gains a `design-system` section that replaces the
separate brand and components sections, and builds write a design system
overview to `<slug>/_overview/`. The manifest's `formatVersion` stays `1`; a
0.5.0 hub lists 0.4.0 boards without thumbnails.
