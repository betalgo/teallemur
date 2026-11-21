# Check rules

Rule IDs are stable; new rules get new IDs.

| Rule ID | Fails when |
|---|---|
| `design-json/missing` | `design.json` does not exist. |
| `design-json/invalid` | `design.json` is not valid JSON, does not match the schema, or repeats a viewport or flow id. |
| `layout/unknown-top-level` | A top-level file or folder is not part of the layout above. |
| `screens/bad-path` | A file under `screens/` (or an option's `screens/`) is not `<flow>/<screen>--<state>.html` in lowercase kebab-case, or `screens/_shared/` holds something other than `.css` files. |
| `screens/unknown-flow` | A folder under `screens/` is not a flow in `design.json`. |
| `html/missing-title` | A screen, component page, brand page or option screen has no `<title>`. |
| `html/missing-tokens-link` | Such a page has no relative `<link rel="stylesheet">` to `design-system/tokens.css`. |
| `html/missing-components-link` | Such a page has no relative `<link rel="stylesheet">` to `design-system/components.css`. |
| `tokens/colour-literal` | A hex colour, a colour function without `var()` (`rgb()`, `hsl()`, `oklch()`, ...), or a named colour appears outside `tokens.css`, in CSS, `<style>`, `style=""` or colour attributes such as `fill`. `transparent` and `currentColor` are allowed. |
| `tokens/font-family-literal` | A font family name appears in `font-family` or `font` outside `tokens.css`. Generic families (`sans-serif`, `monospace`, `system-ui`, ...) are allowed. |
| `urls/external-url` | An `http(s)://` or `//` URL appears in `src`, `href`, `srcset`, `poster`, `xlink:href`, `url()` or `@import`. |
| `urls/external-script` | A `<script src>` points outside the site. |
| `viewports/unknown` | `design:viewports` names a viewport that `design.json` does not define. |
| `frames/unknown` | `design:frame` names a media template the tool does not have. |
| `frames/size` | A page names a media template made for one upload size (`linkedin-profile`, `linkedin-company`) but is shown at a viewport of another size, for example because it leaves out `design:viewports`. |
| `downloads/outside-assets` | `design:download` is not a relative path to a file under `design-system/assets/` (it is absolute, external, has a query, fragment or backslash, names a folder, or points elsewhere). |
| `downloads/missing` | `design:download` names a file under `design-system/assets/` that is not in the repo. |
| `explorations/missing-readme` | An exploration folder has no `README.md`. |
| `explorations/bad-option` | An exploration has a folder other than `a`, `b`, `c` or `d`. |
| `archive/removed-without-archive` | With `--base`: a screen, component page or asset exists in the base but not in the head, and not at `archive/<folder>/<original path>`. |

The token and URL rules scan `.html`, `.css` and (URL rules only) `.svg` files
under `design-system/`, `screens/` and `explorations/`. `archive/` and `docs/`
are not scanned. SVG assets may contain colour literals.
