---
name: teallemur
description: How to design well in a design repo that Teal Lemur checks and builds, a git repo of static HTML/CSS where a product's tokens, components and screens live and are reviewed on a design board and pull request preview. Use this skill whenever you create or change anything in such a repo (a brief, design options, tokens, brand pages, components, screens), when you set up a new design repo, or when you review design work in one. It covers the order of work and its gates, the repo layout that `teallemur check` enforces, token layering, the component library, responsive screens, the visual quality bar, the self-review to run before asking for review, and how to write the review request.
---

# Designing in a design repo

The tool turns a git repo of plain HTML/CSS design files into a board of
every screen at every size, a before/after preview for every pull request, and
a checker. You design by writing files in that repo. A person (the reviewer,
usually the product's design owner) judges on the board and the preview, gives
feedback as PR comments, and approves by merging. You never merge.

This skill is the method. The longer checklists and templates are in
[reference.md](reference.md).

## Read first

1. The design repo's `AGENTS.md`: its house rules.
2. `design-system/SKILL.md`: the product's design rules (colour roles, type
   roles, surfaces, voice).
3. `design-system/tokens.css`, `design.json`, the component pages in
   `design-system/components/`, and the screens next to the one you are
   changing.

When sources disagree, the reviewer's words in the ticket or PR win, then the
repo's `AGENTS.md` and `design-system/SKILL.md`, then this skill.

## The flow

Work in this order. Each step has a gate: do not build on a step until its
gate has passed.

| Step | You make | Gate |
|---|---|---|
| 1. Brief | One page: who it is for, the job, tone, constraints, what "good" means | The reviewer agrees it (new product or big change only; otherwise the ticket is the brief) |
| 2. Options | A "here is what I think you mean" page, then 2 to 4 directions at the product's main screen type only | The reviewer picks one. The rest is archived and its tokens removed |
| 3. Foundation | Tokens in three layers, brand pages | Merged |
| 4. Components | A reusable library: families, variants, every state, both themes where the product has them | Merged, a few families per PR |
| 5. Screens | Screens composed only from components, responsive, with realistic content | Merged, one topic per PR |
| 6. Handoff | Code repos pin an approved commit and check for drift | Automatic |
| 7. Checks | `teallemur check` runs on every PR before a person looks | A failure blocks the merge |

The order is not rigid. Building screens often shows that a component is
missing. Then the component goes into the library, with its component page, in
the same PR, and the screen uses it. It never becomes a one-off on the screen.

### 1. Brief

Write `docs/brief.md` (template in reference.md). Before drawing anything, name
three things for each surface: **the user**, **the task** they came to do, and
**the decision** the screen helps them make. If you cannot name them, ask.

Then write a short plan: colour roles, type roles, the layout idea. Read it
back and cut anything you would have written for any product. The plan should
only fit this one.

### 2. Options

Use options when the direction is open. When it is clear, skip to the step it
belongs to and change files directly.

- Put them in `explorations/<yyyy-mm-dd>-<topic>/`, with option folders `a` to
  `d`. Each option mirrors the `screens/` paths it shows, so the board can put
  the options side by side, screen by screen.
- The exploration's `README.md` is the **"here is what I think you mean"
  page**, and the board links it next to the options. Restate the request in
  your own words: who, the job, what is being decided, your assumptions, then
  each option in one line. A wrong reading caught here costs nothing.
- **Two to four real directions**, different in idea and not only in colour.
  Each one should be something you would defend.
- **Main screen type only.** Build options at the size the product is mostly
  used at: desktop for a desktop tool, phone for a phone app. Declare it on
  every option page (`<meta name="design:viewports" content="desktop">`). Other
  sizes come after the pick.
- Show enough to judge: the identity, plus one or two of the most
  characteristic screens. Not every flow.
- **After the pick, in the same PR:** promote the chosen option into
  `design-system/` or `screens/`, move the whole exploration folder to
  `archive/<yyyy-mm-dd>-<topic>/`, add a line to its README naming the pick and
  linking the comment, and remove tokens that only the dropped options used.

### 3. Foundation

- `design-system/tokens.css`: the only file with colour literals and font
  family names. Three layers, named by role (see Tokens below).
- `design-system/brand/<page>.html`: the mark and lockups, clear space, minimum
  sizes, the colour story with each colour's role, type pairing, voice samples.
- `design-system/assets/`: SVG masters of marks and icons; self-hosted fonts in
  `assets/fonts/` with their licence files, registered with `@font-face` in
  `tokens.css`.
- `design-system/SKILL.md`: the rules in plain words, so the next agent can
  apply them. When a PR changes a rule, it updates this file too.
- Check the make-or-break element on its own: if the mark must read at 16 px,
  show it at 16 px on the brand page before anything is built on it.

### 4. Components

A component library is a set of reusable families, each with variants and
every state. It is not a stylesheet of per-screen styles. Rules are under
Components below.

### 5. Screens

Composed from components, responsive, with realistic content. Rules are under
Screens and Responsive below.

### 6. Handoff

Code repos build from an approved design commit, not from an open PR. A code
repo records which design repo and which commit it built from (for example a
`design-source.json` at its root), copies tokens and assets byte for byte from
that commit, and runs a drift check in CI. Never edit code repos from a design
PR; a new design commit reaches them through a pin update of their own.

### 7. Checks

Run `teallemur check .` before every push, with the tool version the
repo pins (its README or `AGENTS.md` gives the exact command). CI runs it again
with `--base` pointing at a checkout of the main branch, which also fails a PR
that removes approved work without archiving it.

## Repo layout

This is what `teallemur check` enforces. Nothing else may sit at the top
level.

```text
README.md, AGENTS.md, design.json
design-system/
  SKILL.md                         the product's design rules
  tokens.css                       the only file with colour literals and font names
  components.css                   component classes, built only from tokens
  components/<family>.html         one page per component family
  brand/<page>.html                brand pages
  assets/                          SVG masters, icons, fonts with licence files
screens/
  <flow>/<screen>--<state>.html    one file per screen state, lowercase kebab-case
  _shared/<name>.css               optional shared layout CSS
explorations/<yyyy-mm-dd>-<topic>/
  README.md                        the "here is what I think you mean" page
  a/ b/ c/ d/                      options, each mirroring screens/ paths
archive/<yyyy-mm-dd>-<reason>/     superseded work, keeping its original paths
docs/                              the brief and written notes (not on the board)
package.json, package-lock.json, scripts/, .github/, .gitignore, .gitattributes
```

- `design.json` names the product, its slug, its viewports and its flows.
  Every folder under `screens/` except `_shared` must be a flow listed there.
  Viewports are the sizes the product really supports; do not add one you
  will not design for. The board picks up to four sizes with buttons and
  more with a Size menu. A pull request's preview shows its changes at one
  size at a time with the same control: it always opens at `desktop` (or the
  first size), and a page without the size picked shows at its own first
  size.
- Every screen, option screen, component page and brand page has a `<title>`
  and relative links to `design-system/tokens.css` and
  `design-system/components.css`.
- No `http(s)://` URLs, CDNs, frameworks or build steps in design files. A
  small inline `<script>` may demonstrate an interaction; nothing fetches data.
- Put things where the board shows them: brand material in `brand/`, component
  families in `components/`, screens in their flow, options in `explorations/`,
  longer notes in `docs/`. Give every page a clean `<title>` such as
  `Sign in · error` or `Buttons`, because the board shows it. Use
  `design:order` to order screens in a flow and `design:note` for one line under
  a frame.
- A media image (a profile banner, a company cover, a feed image) is a screen
  at its exact upload size, with a viewport of that size in `design.json`, that
  names its template: `<meta name="design:frame" content="linkedin-profile">`
  (or `linkedin-company`, `linkedin-feed-post`). The board shows it in the
  page's outline at desktop and phone width, with what covers it and its safe
  area marked, and on its own. Do not draw those guides in the page itself.
- Give every image made for another site (a media image, an avatar, a
  banner, an icon) `design:viewports` with its one upload size. When every
  screen in the repo declares one size of its own, the board shows every
  image at once, each at its own size, flow by flow, with no size control.
- A page that has a ready file to hand out, such as a media image's exported
  PNG or a logo's SVG master, names it:
  `<meta name="design:download" content="../../design-system/assets/exports/linkedin/company-cover--default.png">`.
  The path is relative to the page, like a `src`, and must point at a file
  under `design-system/assets/` in the repo; `check` fails otherwise, so
  commit the file with the page.
  The board then shows a Download button for exactly that file. Every image
  in `design-system/assets/` (SVG, PNG, JPG, WebP, ICO) is also listed on the
  board's Files page (the Files card next to the Overview card opens it), so
  put finished exports there and keep drafts out.
- Keep `.gitattributes` with `* text=auto eol=lf`. The preview decides
  "changed" by comparing bytes, so mixed line endings mark every file changed.

## Tokens: three layers, named by role

1. **Base palette.** Raw values, named by hue and step: `--palette-blue-600`.
   Only layer 2 uses these.
2. **Roles.** What a value is for: `--color-text`, `--color-text-muted`,
   `--color-surface`, `--color-accent`, `--color-status-danger`,
   `--radius-control`, `--font-ui`. Themes redefine roles; nothing else changes
   between light and dark.
3. **Component tokens.** One decision per component where it needs its own:
   `--button-primary-fill: var(--color-accent)`. Add one only when a component
   has a decision worth changing in one place.

Components and screens use layers 2 and 3, never the palette. Name a token for
its role, never for its value (`--color-c45b3e`), a page
(`--settings-header-bg`) or the batch it was added in. `tokens.css` holds only
custom properties and `@font-face` rules, no classes. Colours, font families
and radii always come from tokens; sizes and spacing come from the scale where
one exists. A worked `tokens.css` is in reference.md.

## Components

- **Families, not styles.** One family per job: button, field, select,
  checkbox, tabs, table row, list item, card, dialog, toast, navigation,
  empty state. Class names say the role (`.button`, `.button--primary`,
  `.field__hint`), never a page (`.settings-save`), a tool export
  (`.frame-1234`) or a generated hash.
- **Every state.** Default, hover, focus, pressed or selected, disabled, and
  where they apply loading, error, empty and read-only. Give each a static
  class next to the real selector (`:focus-visible, .is-focus`) so the page can
  show it.
- **One page per family** in `design-system/components/`, every variant, size
  and state labelled with its name and class. Where the product has light and
  dark, show both. State each family's phone behaviour next to its desktop
  rules.
- **Built only from tokens.** A component never introduces a raw value.
- **The library stays small.** A healthy `components.css` is tens of kilobytes.
  Hundreds of kilobytes means screen styles leaked into it.

## Screens

- **Compose only from components,** plus a little page layout in a short
  `<style>` block or `screens/_shared/`. No visual styling in `style=""`.
  If a screen needs a component that does not exist, add the component and its
  page in the same PR first.
- **One file per state.** `default` is the normal state. Add a state file only
  when what the user sees or can do really changes (empty, error, loading,
  expanded); not for every tiny variation.
- **Realistic content.** Believable names, numbers, dates and lengths, from a
  fictional product (for example Harbor, a notes app, or Fieldwork, a team
  scheduling app). Include one long name and one awkward number to stress the
  layout. No lorem ipsum, no real customer data, secrets or private URLs.
- **Start bounded.** Deliver a new surface as a small checkpoint for feedback.
  Do not complete adjacent flows or states nobody asked for.
- **Themes.** Screens use the product's default theme. Do not copy every screen
  per theme; add a `--dark` state only where the other theme changes something
  worth judging.

## Responsive

- **One layout that reflows.** Use grid, flex, wrapping and media or container
  queries in one file. Never stack a desktop copy, a tablet copy and a phone
  copy of the same content and hide two of them. Swapping a small piece (a
  label that becomes an icon) is fine.
- **Keep the information model, adapt the presentation.** The phone shows the
  same things in the same order of importance. Move secondary panels into
  drawers, sheets or tabs; never drop a signal the user needs to decide.
- **Phone basics:** tap targets at least 44 px, input text at least 16 px (so
  phones do not zoom), no horizontal page scroll, the primary action within
  reach. Do not shrink the desktop layout to fit.
- **Declare only the sizes you designed.** A page that only works at some
  sizes says so with `design:viewports`. An undeclared size is a promise that
  the page works there.

## The quality bar

- **Clear hierarchy.** Each screen has one obvious first read. Size, weight and
  space do the work before colour does.
- **One accent with a job.** Write the job down in `SKILL.md` (for example:
  primary action, selection, focus). Status colours are separate from the
  accent.
- **Status by shape as well as colour:** an icon, a label or a pill, so it
  still reads without colour.
- **Repeated items line up.** Same edges, baselines, padding and placement for
  every card, row or badge in a set.
- **Type with intent.** A deliberate pairing, a small scale used
  consistently, reading text at a comfortable line length, tabular figures
  where numbers line up.
- **Neutrals chosen, not inherited.** A grey with a slight lean toward the
  brand reads as intentional; a default mid-grey does not.
- **Words are design material.** Name things the way users see them, use the
  active voice, let buttons say what happens, and let errors say what went
  wrong and how to fix it.
- **None of the stock AI look** (list in reference.md): purple-to-blue
  gradients, a default font picked because it was the default, everything
  centred, the same large radius and shadow on every block, emoji as icons.
  The brief's own direction always wins over this list.

## Look before you ask

Build the board, open it, and fix what you find before anyone else sees it:

1. `teallemur check .` passes.
2. `teallemur build . --out <folder outside the repo>`, then serve that folder
   with any static server (opening the files from disk does not work).
3. View every changed page at **every size it declares**, in every theme it
   has. The board and the preview show one size at a time: step through each.
4. Run the self-review list in reference.md: hierarchy, alignment, clipping,
   overflow, contrast, focus, touch targets, content stress, states, copy,
   tokens only.
5. Compare what you delivered with what was asked for. List anything missing.

Fix just the failing piece, then look again. Only then ask for review.

## The review request

- **One decision per PR,** stated as the first line: "Pick A, B or C for
  onboarding", or "Approve the button and field families". Never ask the
  reviewer about technical details such as token names.
- Fill in every section of the repo's PR template: the question, the preview
  link (check that it opens), what changed (screens, components and tokens
  added, changed or archived), notes and assumptions, and what is not done.
- Point at the frames that matter most, and say which sizes and states are
  covered. The preview opens at desktop (or the first size); name the size to
  pick when the change matters most at another.
- Revise from comments with new commits. Reply to each comment with what
  changed, and mark your own comments as the repo's `AGENTS.md` asks. Resolve a
  thread only after its change is visible in the preview.
- Stop once review is requested. The reviewer merges to approve or closes to
  reject.

## Scope and safety

- **Archive, never delete.** Removing approved work means moving it to
  `archive/<yyyy-mm-dd>-<reason>/` with its original path and a README line
  saying why. Build the replacement before archiving the original.
- **Never merge, approve or close your own design PR,** and never ask another
  agent to.
- **One topic per PR.** Split a large job into several PRs.
- **No generated images as screens, UI, icons, logos or marks.** Those are
  HTML, CSS and SVG. Generated raster images are only for illustration or
  texture, committed under `design-system/assets/` with a note of the tool and
  prompt.
- **No invented legal, privacy, consent or policy text.** Leave a labelled gap
  ("Terms text from the owner") and list it under "Not done".
- **Do not redesign what was not asked.** Suggest it in the PR instead.
- **Start from a fresh main branch** on a new branch, never in a checkout with
  changes you did not make, and never force-push over a reviewed PR.

**Stop and ask** in the PR or ticket when the work needs a new viewport or
flow, a change to a rule in `design-system/SKILL.md`, deleting or renaming
approved work, a change outside this design repo, an account or a secret, or
when two sources disagree and nothing here settles it. Show both versions; do
not pick one silently.
