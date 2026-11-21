# Media templates

A media page, such as a profile banner, a company cover or a feed image, is a
screen made at its exact upload size (a viewport of that size in
`design.json`) that names its template:

```html
<meta name="design:frame" content="linkedin-profile">
```

A template made for one upload size (`linkedin-profile`, `linkedin-company`)
outlines a page only at that size: `check` fails a page shown at any other
(`frames/size`), so give it `design:viewports` with the matching viewport.

On the board it shows as one group: a head with the page's title, the
template, the size, the date the template's sizes were checked and a key to
the marks that apply; then three frames, `desktop · in context`,
`phone · in context` and `on its own · W × H`, each with **Copy link** (the
in-context references end in `· desktop, in context` or `· phone, in
context`).

- The outlines are shapes only, in the viewer's paper and ink: bars for words,
  pills for buttons, circles and rounded squares for pictures. Nothing of the
  site's own logo, colours, type or look.
- What covers the image (the profile photo, the company logo) is hatched and
  named. The safe area for text and key marks is a dashed line, drawn in
  upload pixels over the image area.
- A feed image from 3:1 to 4:5 shows whole: the image area takes its
  proportions. A taller or wider image is cut from the centre to the limit;
  the cut parts show faint and hatched beyond it, with dashed lines at the cut
  and "Cut off: N px" labels. A label shows only while its cut part can hold
  it; the key always says how much is cut. On the phone outline the image
  runs the full width, so a cut at the sides falls outside it and only the
  key and the dashed lines show it.
- **On its own** is the page untouched: no outline and no marks.
- Wide images (profile, company) put the phone frame on the left and the
  desktop above the image on its own. Feed images sit in one row, the columns
  in proportion so the heights match. Below 768px it is one column: desktop,
  phone, on its own.
- Clicking any of the three frames opens the page in the focus view, as for a
  screen. Previews show a changed media page as a plain frame.

| Template | Upload | Marked |
|---|---|---|
| `linkedin-profile` | 1584 × 396 | The photo, and on phones the owner's settings icon. Safe area x 620 to 1544, y 40 to 356. |
| `linkedin-company` | 1512 × 256 | The logo. Safe area x 430 to 1472, y 28 to 200, clear of the lower right (right of x 1300 and below y 128). |
| `linkedin-feed-post` | Any from 3:1 to 4:5; 1080 × 1350 recommended | What is cut off beyond those ratios. |

The sizes were checked on 25 October 2026 against LinkedIn's help pages and a
real profile and company page, on desktop and on a phone. Each template in
`src/media/` carries its sizes, its sources and that date; when a site changes
its layout, measure again and update the template and its date.
