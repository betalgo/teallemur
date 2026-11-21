# The design repo

What a design repo holds, and the rules `check` applies. The full rule list is in
[Check rules](check-rules.md).

## Layout

```text
README.md, AGENTS.md, design.json
design-system/
  SKILL.md
  tokens.css                       the only file allowed colour literals and font names
  components.css
  components/<component>.html      component pages
  brand/<page>.html                brand pages
  assets/                          logos, icons, fonts (with licence files)
screens/
  <flow>/<screen>--<state>.html    one file per screen state, lowercase kebab-case
  _shared/<name>.css               optional shared layout CSS
explorations/<yyyy-mm-dd>-<topic>/
  README.md
  a/ b/ c/ d/                      options, each mirroring screens/ paths
archive/<yyyy-mm-dd>-<reason>/     superseded work, keeping its original paths
docs/, package.json, package-lock.json, scripts/, .github/, .gitignore, .gitattributes
```

Nothing else may sit at the top level. `.git` and `node_modules` folders are
never read, checked or copied.

## `design.json`

The schema is [`schema/design.schema.json`](../schema/design.schema.json)
(`schemaVersion` 1). `check` validates against that file with a small built-in
validator.

```json
{
  "schemaVersion": 1,
  "name": "Example App",
  "slug": "example-app",
  "viewports": [
    { "id": "desktop", "width": 1440, "height": 900 },
    { "id": "phone", "width": 390, "height": 844 }
  ],
  "flows": [
    { "id": "auth", "title": "Sign in and sign up" },
    { "id": "settings", "title": "Settings" }
  ]
}
```

| Field | Rules |
|---|---|
| `schemaVersion` | `1`. |
| `name` | Non-empty product name. |
| `slug` | Lowercase kebab-case. It is the product's folder in the output, so keep it stable. |
| `viewports` | At least one `{ id, width, height }`; ids are kebab-case and unique; sizes are positive integers. Board order. |
| `flows` | `{ id, title }`; ids are kebab-case and unique. Every folder under `screens/` except `_shared` must be listed. Board order. |
| `$schema` | Optional, for editors. No other properties are allowed. |

### Page metadata

Screens, component pages, brand pages and exploration screens may declare:

```html
<meta name="design:viewports" content="desktop,phone">  <!-- default: every viewport -->
<meta name="design:order" content="10">                 <!-- order within a flow; default: by path -->
<meta name="design:note" content="Shown after three failed attempts.">
<meta name="design:links" content="#submit -> auth/login--error, .signup -> auth/signup--default">
<meta name="design:frame" content="linkedin-profile">  <!-- a media page's template; see Media templates -->
<meta name="design:download" content="../../design-system/assets/exports/cover.png">  <!-- a ready file; see Downloads -->
```
