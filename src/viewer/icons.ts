// Line icons on a 16 grid, 1.5 px stroke (the design system's `.icon`).
// Only where words alone are unclear.

export const ICONS = {
  search: '<circle cx="7" cy="7" r="4.25"/><path d="M10.25 10.25L13.5 13.5"/>',
  sidebar: '<path d="M2.75 3.25h10.5v9.5H2.75zM6.25 3.25v9.5"/>',
  close: '<path d="M4 4l8 8M12 4l-8 8"/>',
  expanded: '<path d="M4 6.5l4 4 4-4"/>',
  collapsed: '<path d="M6.5 4l4 4-4 4"/>',
  previous: '<path d="M9.5 4l-4 4 4 4"/>',
  next: '<path d="M6.5 4l4 4-4 4"/>',
  height: '<path d="M8 2.5v11M5.5 5L8 2.5 10.5 5M5.5 11L8 13.5 10.5 11"/>',
  external: '<path d="M9.5 2.75h3.75V6.5M13.25 2.75L7.5 8.5M11.5 9.5v3.75H2.75V4.5H6.5"/>',
  forward: '<path d="M3 8h9.5M8.5 4l4 4-4 4"/>',
  back: '<path d="M13 8H3.5M7.5 4L3.5 8l4 4"/>',
  clock: '<circle cx="8" cy="8" r="5.75"/><path d="M8 5v3.25l2.25 1.5"/>',
  commit: '<circle cx="8" cy="8" r="2.5"/><path d="M1.5 8h4M10.5 8h4"/>',
  arrow: '<path d="M3.5 8h9M9 4.5l3.5 3.5L9 11.5"/>',
  archive: '<path d="M2.5 3.5h11v3h-11zM3.5 6.5v6h9v-6M6.5 9h3"/>',
  check: '<path d="M3.5 8.5l3 3 6-7"/>',
  download: '<path d="M8 2.75v7.5M4.75 7L8 10.25 11.25 7M2.75 10.5v2.75h10.5V10.5"/>',
  keyLeft: '<path d="M12.5 8h-9M7 4.5L3.5 8 7 11.5"/>',
  keyRight: '<path d="M3.5 8h9M9 4.5l3.5 3.5L9 11.5"/>',
  keyUp: '<path d="M8 12.5v-9M4.5 7L8 3.5 11.5 7"/>',
  keyDown: '<path d="M8 3.5v9M4.5 9L8 12.5 11.5 9"/>',
  blank: '',
} as const;

export type IconName = keyof typeof ICONS;

/** The icon as markup, for pages written by the CLI. */
export function iconHtml(name: IconName, extraClass = ''): string {
  return `<svg class="icon${extraClass ? ` ${extraClass}` : ''}" viewBox="0 0 16 16" aria-hidden="true">${ICONS[name]}</svg>`;
}
