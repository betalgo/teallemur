// Every check rule, by stable ID. IDs are part of the CLI contract: never
// rename one; add a new ID instead.

export const RULES = {
  'design-json/missing': 'design.json is missing.',
  'design-json/invalid': 'design.json is not valid JSON or does not match the schema.',
  'layout/unknown-top-level': 'A top-level entry is outside the standard layout.',
  'screens/bad-path': 'A file under screens/ is not screens/<flow>/<screen>--<state>.html or screens/_shared/<name>.css.',
  'screens/unknown-flow': 'A folder under screens/ is not a flow in design.json.',
  'html/missing-title': 'A screen, component page or brand page has no <title>.',
  'html/missing-tokens-link': 'A screen, component page or brand page does not link design-system/tokens.css.',
  'html/missing-components-link': 'A screen, component page or brand page does not link design-system/components.css.',
  'tokens/colour-literal': 'A colour literal is used outside design-system/tokens.css.',
  'tokens/font-family-literal': 'A font family name is used outside design-system/tokens.css.',
  'urls/external-url': 'An http(s) URL is used in src, href, srcset, poster or url().',
  'urls/external-script': 'A <script src> loads an external script.',
  'viewports/unknown': 'A design:viewports value names a viewport that design.json does not define.',
  'frames/unknown': 'A design:frame value names a media template that the tool does not have.',
  'frames/size': 'A page names a media template for one upload size but is shown at another size.',
  'downloads/outside-assets': 'A design:download value does not name a file under design-system/assets/.',
  'downloads/missing': 'A design:download value names a file that is not in the repo.',
  'explorations/missing-readme': 'An exploration has no README.md.',
  'explorations/bad-option': 'An exploration has an option folder other than a, b, c or d.',
  'archive/removed-without-archive': 'A screen, component page or asset in the base is missing in the head and was not moved to archive/.',
} as const;

export type RuleId = keyof typeof RULES;
