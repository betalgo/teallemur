import { parseHTML } from 'linkedom';
import type { ViewerData } from '../src/model.ts';
import { Context } from '../src/viewer/context.ts';
import { mountPreview } from '../src/viewer/preview.ts';

/** Render the real viewer with a DOM. Layout and lazy loading are browser-only. */
export function renderPreview(data: ViewerData, ctx = new Context(data)): HTMLElement {
  const { document, window } = parseHTML('<!doctype html><html><body><div id="app"></div></body></html>');
  Object.assign(window, { location: { href: 'http://localhost/example/' } });
  Object.assign(globalThis, {
    document,
    window,
    matchMedia: () => ({ matches: true, addEventListener() {} }),
    IntersectionObserver: class {
      observe() {}
      unobserve() {}
    },
    CSS: { supports: () => false },
  });
  const app = document.getElementById('app') as unknown as HTMLElement;
  mountPreview(ctx, app);
  return app;
}
