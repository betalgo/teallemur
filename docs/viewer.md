# The viewer

The viewer's look comes from the tool's own design repo: see
[Design source](development.md#design-source). Paper, ink and one accent; the designs on the
wall stay the loudest thing on screen.

**Board.** A wall of frames at one size at a time, picked in the top bar: up
to four sizes as buttons (the size switcher), more as one **Size** menu that
names the current size and its pixels and lists every size, the current one
checked. It opens at the board's main size (the one with the most frames) or
the size last picked for this product in this browser.

When every screen page declares one size of its own (`design:viewports` with
one id, as for images made for other sites, each at its upload size), the
board shows every page at once instead, each at its own size, flow by flow,
and the top bar has no size control. A page that offers several sizes, such
as a component page, shows once, at its first. The focus view still shows
each page at its size.

The board, and its sidebar, run in this order:

0. **Waiting for review** (boards built with `--reviews`, while the product
   has open pull requests): a one-line strip with the count and a link to
   each preview, opening in a new tab. Not in the sidebar.
1. **Design system:** the Overview and Files cards first, then brand pages,
   then component pages (see [Downloads](downloads.md)).
2. **Screens,** flow by flow, in `design.json` order. A media page shows as
   a group in its template (see [Media templates](media-templates.md)).
3. **Open options:** explorations waiting for a pick, with a "Waiting for a
   pick" tag; the sidebar shows how many are waiting.
4. **Archive,** closed.

Each section has a heading with its counts and a grid of frames; each frame
is labelled `flow / screen / state · size` and has a **Copy link** button.
Open options (explorations) sit in dashed cards: the question and each
option's name come from the exploration's `README.md` (an `## The question`
section or a `Question:` line, and list items such as
`- **A, Name:** what it does`), the waiting time from the folder's date.

- Frames load only when they are in or near view and large enough to read.
  At most 64 stay loaded; frames out of view are unloaded first, so boards
  with hundreds of frames stay usable.
- `/` focuses the search.
- The Size menu opens from its button or with the down arrow; the arrow keys,
  Home and End move through it, and `Esc` or a click outside closes it.
- Below 768px wide the sizes (or the Size menu, whose list then opens full
  width) move to a full-width row under the top bar, the frames stack in one
  column, and the sidebar opens as a drawer from the **Screens** button.

**Downloads.** See [Downloads](downloads.md): a Download button on frames
whose page names a ready file, and the Files page with every image.

**Design system overview.** Each build makes one page per product from its
`design-system/tokens.css`, opened from the overview card. It works for any
naming:

- **Colours** by role: grounds and surfaces, text, accent, lines, status,
  other. The role comes from words in the token's name, else in the comment on
  the same line, checked in this order: status (`success`, `warning`,
  `danger`, `error`, `info`, ...), text (`text`, `ink`, `fg`, `on`, ...), lines
  (`border`, `line`, `rule`, `divider`, ...), accent (`accent`, `brand`,
  `primary`, `focus`, ...), grounds (`bg`, `background`, `surface`, `panel`,
  `canvas`, `nav`, ...); anything else is Other. The lists are in
  `src/overview/roles.ts`.
- Each swatch shows the name, the value (references and `color-mix()` resolved
  where possible; the value as written otherwise) and the comment as its role.
  Text colours show "Aa" with the WCAG 2 contrast ratio and level, on the main
  ground (the first grounds token) or on the ground the name points to:
  `on-accent` on the accent, `nav-text` on the nav, `warning-text` on a pale
  warning colour. When several colours share the name's words, the text is
  measured on the one it reads best on.
- Colours whose names differ only by a trailing number show as one ramp.
- **Type:** a specimen per font-family token, then size and line-height
  tokens as rows. **Shape and space:** radii, spacing and shadows.
  **Brand and components:** thumbnails linking to each page on the board.
- Other tokens sit in a closed section; sections with no tokens are left out.
  The page is the tool's own paper and ink: the product's colours and fonts
  appear only in chips and samples, and its fonts load under names of their
  own.

**Focus view.** Clicking a frame opens it whole and in scale on the wall, with
the size it is shown at, the sizes as on the board (buttons or the Size menu;
sizes the page does not offer are disabled; none for a page with one size of
its own on a board of own sizes), a state stepper, a **Full height** toggle
and an **Open in a new tab** link. Left/right step through states of the current screen, up/down
through screens in the current flow, and `V` cycles supported sizes. Screen
changes retain the state and size when available, otherwise use the first
available one. State and screen stepping stops at the ends. `Esc` returns to
the board; `?` or the help button toggles shortcut help. Shortcuts also work
inside the same-origin frame, except while editing a field. On phones the
sizes sit in a bottom bar.

**Search.** A text search over titles and paths, with the number found.

**Navigation.** The sidebar lists flows, screens and states with their counts.
Selecting a state reveals its frame on the board, switching to its size and
clearing the search when they would hide it, and marks it as selected.
Expanded rows, and whether the sidebar is hidden, are remembered per product
in this browser when local storage is available.

**Copy link.** Every frame has a button that copies
`<slug> <path> @ <viewport>`, for example
`example-app screens/auth/login--error.html @ phone`, so a review comment can
name the exact frame. "Before" frames in a preview add ` (base)`.
The copied reference also includes the frame's focus URL. Screen URLs use
`#/flow/screen--state@viewport`; `?root=base` identifies a preview's before
copy, and `?view=board` reveals the frame on the board. Other page types use
`#/file/<repo-path>@viewport`. Links support reload and browser back/forward.

**Preview page order.** The top bar has the board's size control in the
middle (buttons up to four sizes, the Size menu past four, with the same keys,
and on phones the same full-width row under the bar) and links to the full
board at head (`board/`).

Changes show at **one size at a time**, so a page with five states at five
sizes is five pairs, not twenty-five. The preview always opens at the
product's main size: the viewport `desktop` when there is one, otherwise the
first in `design.json`. Picking a size switches every change, added page and
option at once and keeps the change being read in place; the size holds until
the reader leaves the page and is not stored, so the next visit opens at the
main size again. A changed or added page that does not offer the size picked
shows at its own first size, labelled with that size, so no change is hidden.
Each section's line says what is shown and what else exists, for example
"Shown at Desktop, 1440 × 900; also at Wide, Tablet and Phone." A preview of a
board of own sizes shows each page at its own size, with no size control, as
the board does. A link to a frame at another size (a copied link, or a size
picked in the focus view) switches the preview to that size.

Each change shows its **whole page**, top to bottom, so the reader scrolls
the preview and sees a change at the bottom of a long page without opening
it. Once a frame loads, the page's full height at the size is read from the
page itself (same origin; nothing is added to the design file and nothing
runs in it) and the frame grows to it; it is read again once the page's
fonts are ready and whenever the page changes size, for example when an
image arrives. Parts sized to the screen (`100vh`, `50vmin` and their `svh`,
`lvh` and `dvh` forms) stay as high as on the size's own screen: the frame's
copy of the page's styles has those units written as pixels, so a
full-screen hero is not stretched to the whole page and the rest of the page
pushed out of the frame. The focus view's **Full height** does the same. A
frame not loaded yet keeps the size's height, and frames growing above the
change being read do not move it. A page that fits its size, scrolls inside
its own areas, or does not scroll (`overflow: hidden` on its root or body)
keeps the size's height. Clicking a frame still opens the focus view;
closing it returns to the part of a long page that was being read. Board
frames show the size's first screen only.

1. A banner with the label, the base and head commits, and the number of
   changed, added and archived pages and token changes, each linking to its
   section.
2. Changed pages, before and after, at the size shown, each its whole page,
   both at the taller page's height. Each has a side by side / overlay
   toggle. The overlay draws after under before at identical dimensions;
   drag the line (or use the arrow keys) to move it. Mode and line position,
   per page and size, survive re-renders during the current visit. On phones
   before sits above after.
3. Added screens, components and brand pages, and new or changed explorations
   as their option cards, options side by side, at the size shown, each its
   own whole page.
4. Archived pages, with the path they moved to, and other archived files.
5. Token and shared style changes (old and new values of custom properties in
   `tokens.css` and `components.css`, and other changed shared files), in a
   native `<details>` element, closed by default. Its summary shows the
   changed token count and, when `tokens.css` or `components.css` changed, a
   note that every screen may be affected.

**Privacy.** Viewer pages carry a Content Security Policy that only allows the
site's own origin, and design files are checked for external URLs. The viewer
never injects scripts into design files.

**Click-through.** In focus view, optional `design:links` entries map a CSS
selector to `flow/screen--state`, separated by commas. Clicking an element
(including its descendants) opens an existing target frame, keeping the current
viewport when supported. Preview links prefer the current copy (base or head),
then head if the base target is unavailable. Invalid selectors and missing
targets are ignored. Modified clicks keep their normal browser behavior.
The viewer attaches event listeners from the parent page and leaves design files
unchanged. No design-repo build step is needed.
