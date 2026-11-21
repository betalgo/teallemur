# Downloads

A page that has a ready file to hand out, such as an exported PNG or an SVG
master, names it:

```html
<meta name="design:download" content="../../design-system/assets/exports/linkedin/company-cover--default.png">
```

The path is resolved against the page, like a `src` (percent escapes such as
`%20` are decoded), and must be a file under `design-system/assets/` that is
in the repo (`check`: `downloads/outside-assets`, `downloads/missing`). One file per page; archived pages offer none. The file
comes down exactly as it is in the built site, which holds the repo's files
from the commit the board was built from: the tool never makes or converts
it. No file named, no button.

- **The button names the format** ("Download PNG", "Download SVG"), from the
  file's extension. It is a same-origin link with the `download` attribute and
  the file's own name.
- **A media page:** Download at the top right of its group's heading; on
  phones it moves under the key. Its label gives the size in pixels.
- **Any other frame:** a Download link in the caption, before Copy link.
- **Focus view:** Download in the top bar, before Open in a new tab. On phones
  only its icon shows; its label gives the format and size in pixels.
- **Previews:** only the pull request's (head) frames offer their file, and
  the button says so: "Download PNG from PR 12", from `--label` up to its
  first colon ("this preview" when there is no label or that part is longer
  than 24 characters). The full board built with the preview says so too.
  A pull request that changes only an exported file leaves its page
  unchanged, so the preview lists the file under shared changes and the
  button is on the full board.
- **Files** is a page of its own, `<slug>/_files/index.html`, written by the
  build like the design system overview: every SVG, PNG, JPG, WebP and ICO
  under `design-system/assets/`, one card per folder, the top folder first,
  with a link to each folder at the top. Each row shows the image itself as a
  thumbnail, its name, its facts (format, width × height when the file says,
  size in KB or MB) and Download right next to it; rows fill columns of about
  300 px. Fonts and other files are not listed. In a preview the files are the
  pull request's, and each Download says so ("from PR 12").
- **The Files card** sits next to the Overview card on the board: the first
  four images, as the Files page lists them, and how many there are. It and
  the **Files** row under Overview in the sidebar open the Files page. The
  card does not depend on the size shown; it shows while the search matches
  one of its files' paths (or words such as "files" and "images"), and the
  search's count includes it.
- With no images there is no Files page, card or row.

Sizes in pixels are the size a browser draws the file at, read from the file
itself: a PNG, JPEG or WebP header (a JPEG's EXIF orientation turns it), the
largest image in an ICO, and an SVG's `width` and `height` (unitless, px or a
physical unit such as mm or pt, at 96 px to the inch) or else its `viewBox`.
