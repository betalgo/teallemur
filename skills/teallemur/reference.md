# Design repo skill: reference

Templates and checklists for [SKILL.md](SKILL.md). The examples use fictional
products: Harbor (a notes app used mostly on laptops), Fieldwork (a team
scheduling app) and Lumen (a reading app used mostly on phones).

## Brief template (`docs/brief.md`)

```markdown
# Harbor brief

1. What we are designing: the surfaces in scope, and what is out of scope.
2. Who it is for: users in priority order, and who we are not designing for.
3. The job: for each main surface, the user, the task and the decision it
   supports.
4. Tone: the voice in a few words, with "say" and "not" copy examples.
5. Constraints: platforms, the main screen type, themes, accessibility level,
   brand material that must stay, font licences.
6. What good means: criteria you can check, such as "the mark reads at 16 px"
   or "every status reads without colour".
7. References and anti-references: what to borrow from and what to avoid,
   each with a reason.
8. Existing material: what exists, what carries forward, what is archived.
```

Rules the brief settles for good (which colour means what, type roles,
surfaces, voice, forbidden words) move into `design-system/SKILL.md` once
approved.

## Exploration README ("here is what I think you mean")

```markdown
# Harbor onboarding, 2 March

## What I think you are asking for

New accounts land on an empty inbox and many leave before writing anything.
You want a first screen that gets a new person to their first note within a
minute. Harbor is used mostly on laptops, so the options are desktop only.

I assumed:
- people usually arrive from a teammate's invite, so a shared notebook exists;
- sign-up itself does not change.

## The question

Which first screen should new accounts see? Pick A, B or C.

## Options

- **A, Start in the shared notebook:** opens the teammate's notebook with a
  one-line hint.
- **B, Three-step checklist:** a short list that ends with writing a note.
- **C, A blank note with prompts:** opens straight into an editor.

Each option shows `screens/onboarding/welcome--default.html` and
`screens/inbox/list--empty.html` at desktop.

## Decision

<!-- After the pick: "Picked B on 4 March (link to the comment). A and C are
kept as history." -->
```

## A worked `tokens.css`

```css
/* Harbor tokens: the only file with colour literals and font names.
   Custom properties and @font-face only. */

@font-face {
  font-family: "Hanken Grotesk";
  src: url("assets/fonts/hankengrotesk-HankenGrotesk[wght].ttf") format("truetype");
  font-weight: 100 900;
  font-display: swap;
}

/* 1. Base palette: raw values by hue and step. Only roles use these. */
:root {
  --palette-white: #FFFFFF;
  --palette-ink-50: #F3F5F9;
  --palette-ink-100: #E2E6ED;
  --palette-ink-300: #AEB6C6;
  --palette-ink-600: #4F586B;
  --palette-ink-800: #283044;
  --palette-ink-900: #1A2132;
  --palette-ink-950: #121826;
  --palette-tide-100: #E8EEFC;
  --palette-tide-400: #84A1EE;
  --palette-tide-600: #2F5BD3;
  --palette-tide-900: #1C2A55;
  --palette-coral-400: #EE8A76;
  --palette-coral-600: #B93A26;
}

/* 2. Roles: what each value is for. Light is the default theme. */
:root {
  --color-ground: var(--palette-ink-50);
  --color-surface: var(--palette-white);
  --color-text: var(--palette-ink-950);
  --color-text-muted: var(--palette-ink-600);
  --color-line: var(--palette-ink-100);
  --color-accent: var(--palette-tide-600);       /* primary action, selection, focus */
  --color-accent-tint: var(--palette-tide-100);
  --color-on-accent: var(--palette-white);
  --color-status-danger: var(--palette-coral-600);

  --font-ui: "Hanken Grotesk", system-ui, sans-serif;
  --font-mono: ui-monospace, monospace;

  --text-small: 13px;
  --text-body: 15px;
  --text-title: 22px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-6: 24px;
  --space-8: 32px;
  --radius-control: 6px;
  --radius-card: 10px;
}

/* Dark: redefines roles only. Put data-theme="dark" on <html> for a dark
   screen, or on any element for a dark area on a component page. Keep this
   block after the light roles. */
[data-theme="dark"] {
  --color-ground: var(--palette-ink-950);
  --color-surface: var(--palette-ink-900);
  --color-text: var(--palette-ink-50);
  --color-text-muted: var(--palette-ink-300);
  --color-line: var(--palette-ink-800);
  --color-accent: var(--palette-tide-400);
  --color-accent-tint: var(--palette-tide-900);
  --color-on-accent: var(--palette-ink-950);
  --color-status-danger: var(--palette-coral-400);
}

/* 3. Component tokens, built from roles. Declared on every theme scope as
   well as :root: a custom property is resolved where it is declared, so one
   declared only on :root would keep the light value inside a dark area. */
:root, [data-theme] {
  --button-primary-fill: var(--color-accent);
  --button-primary-text: var(--color-on-accent);
  --field-border: var(--color-line);
  --field-border-error: var(--color-status-danger);
}
```

- A single-theme product drops the dark block and keeps the rest.
- Non-colour scales (space, type size, radius, shadow) follow the same idea:
  a small scale, then role names where a role exists.
- An exploration option that needs new tokens adds them under a comment that
  names the exploration, so they are easy to remove after the pick.

## Component page checklist

- One family per page, titled with the family name ("Buttons", "Fields").
- Sections in a steady order: kinds or variants, sizes, states, the family in
  a small realistic composition, both themes where the product has them, and
  phone behaviour.
- Every specimen labelled with its plain name and its class
  (`Primary · .button--primary`).
- States: default, hover, focus, pressed or selected, disabled; plus loading,
  error, empty and read-only where they apply. Show them with static classes
  (`.is-hover`, `.is-focus`) declared next to the real selectors.
- Focus is visible on every interactive specimen.
- Reuse the page scaffold the repo already uses for component pages.

Component page head (pages in `design-system/components/` link one level up):

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Buttons</title>
<meta name="design:note" content="Every kind, size and state, light and dark.">
<link rel="stylesheet" href="../tokens.css">
<link rel="stylesheet" href="../components.css">
</head>
```

## Screen file skeleton

```html
<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Inbox · empty</title>
<meta name="design:viewports" content="desktop,phone">
<meta name="design:order" content="20">
<meta name="design:note" content="First visit, before any note exists.">
<link rel="stylesheet" href="../../design-system/tokens.css">
<link rel="stylesheet" href="../../design-system/components.css">
<style>
/* Page layout only: where things go, not how they look. */
.page { display: grid; grid-template-columns: 264px minmax(0, 1fr); min-height: 100vh; }
@media (max-width: 767px) { .page { grid-template-columns: minmax(0, 1fr); } }
</style>
</head>
<body>
  <!-- composed from components.css classes -->
</body>
</html>
```

Option screens live at `explorations/<topic>/<a-d>/screens/<flow>/` and link
`../../../../../design-system/tokens.css` and `components.css`.

## Responsive checklist

- Design the main screen type fully first, then reflow to the other declared
  sizes.
- Place breakpoints where the content breaks, not at device widths. One or two
  per screen is usually enough.
- Navigation: a sidebar becomes a top bar with a drawer; long tab rows scroll
  or become a menu.
- Tables on phones: either a list of rows showing the two or three fields the
  task needs, or a table that scrolls inside its own container. Choose by the
  task.
- Forms on phones: one column, labels above fields, 16 px input text, 44 px
  controls, the right keyboard (`inputmode`, `type="email"`).
- The primary action stays reachable: at the end of the content or in a
  bottom bar.
- Judge the phone frame as one screenful at its declared width. What sits
  above the fold is the screen; the rest is scroll. Never enlarge the frame or
  scale the page down to fit more in.
- Long words and links wrap inside narrow containers; images and fixed-ratio
  boxes have `max-width: 100%`.

## The stock AI look

Avoid these unless the brief asks for them:

- a purple-to-blue gradient hero, or gradient text;
- a font chosen because it was the default, with no pairing;
- everything centred;
- the same large radius and soft shadow on every block, or cards inside cards;
- emoji or sparkles as icons or section markers;
- a coloured bar down the side of rounded cards;
- warm cream with a serif display and a terracotta accent, picked by default;
- near-black with one neon accent, picked by default;
- glass and blur by default;
- numbered markers (01, 02, 03) on content that is not a sequence;
- big-number tiles at the top when the numbers are not the point;
- a hero sized to the whole viewport that pushes the content out of view;
- placeholder content: lorem ipsum, "John Doe", "Your text here".

## Self-review list

Run it on every changed page, at every size the page declares, in every theme
it has.

**Rules**
- [ ] `teallemur check .` passes.
- [ ] Colours, fonts and radii come from tokens; no visual styling in
      `style=""`.
- [ ] The screen uses components; any new component has its page in this PR.

**Look**
- [ ] Hierarchy: the most important thing is the first read; one primary
      action per view.
- [ ] Alignment: repeated items share edges, baselines and padding; icons and
      trailing actions sit in fixed-width slots so columns line up.
- [ ] Spacing comes from the scale and has a steady rhythm.
- [ ] Clipping: no text cut off, no overlapping elements, nothing hidden
      behind a fixed bar.
- [ ] Overflow: no horizontal page scroll
      (`document.documentElement.scrollWidth === document.documentElement.clientWidth`);
      wide tables and code scroll inside their own container.
- [ ] Contrast: body text at least 4.5:1, large text, icons and control edges
      at least 3:1, in every theme.
- [ ] Focus: every interactive element shows a visible focus state, in reading
      order.
- [ ] Phones: tap targets at least 44 px, input text at least 16 px.
- [ ] Context: the person still knows where they are (title, selected
      navigation) at every size.
- [ ] States read without colour (icon, label or shape).
- [ ] Content stress: one long name, one large number, an empty list and a
      one-item list.
- [ ] Empty, loading and error states have helpful copy where the screen has
      them.
- [ ] Copy is realistic and written from the user's side; no placeholder
      text; no invented legal or policy text.
- [ ] Any motion respects `prefers-reduced-motion`.

**Coverage**
- [ ] Build the list of what should exist (the ticket, the flows in
      `design.json`, the archive and git history) and compare it with what you
      delivered. List every gap under "Not done".

## PR description

```markdown
## Question for the reviewer

Pick A, B or C for Harbor onboarding.

## Preview

<!-- CI adds the link. Open it before asking for review. -->

## What changed

- Added explorations/2026-03-02-onboarding/ with options A, B and C, desktop only.
- Tokens: added --palette-sand-*, used only by option C.

## Notes

- Assumed people arrive from a teammate's invite.
- Look first at the empty inbox in each option: that is where they differ most.

## Not done

- Phone layouts come after the pick.
```

Good questions name one decision: "Approve the Fieldwork shift list at desktop
and phone", "Pick A or B for the Lumen reader controls". Weak ones ask for
everything at once ("Thoughts?") or bundle several decisions into one PR.

## Handoff note

When you stop, say in the PR: what changed, which sizes and states are
covered, which comments are still open, which decisions remain, and what is
designed as opposed to only proposed.
