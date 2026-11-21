// Thumbnails on pages the CLI writes (the hub): each `.dv-thumb` holds an
// iframe at its real size, scaled to the thumbnail's width.

export function scaleThumbs(root: ParentNode): void {
  const thumbs = [...root.querySelectorAll<HTMLElement>('.dv-thumb[data-width]')];
  if (thumbs.length === 0 || typeof ResizeObserver === 'undefined') return;
  const sizer = new ResizeObserver((entries) => {
    for (const e of entries) {
      const el = e.target as HTMLElement;
      const width = Number(el.dataset.width);
      if (width > 0 && e.contentRect.width > 0) el.style.setProperty('--dv-scale', String(e.contentRect.width / width));
    }
  });
  for (const el of thumbs) sizer.observe(el);
}
