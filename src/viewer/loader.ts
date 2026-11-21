// Lazy frame loading. A frame's <iframe> is only created when its box is in
// (or near) view and big enough on screen to be worth rendering. The number of
// live iframes is capped; the ones furthest from view are removed first.
// The loader also keeps each frame scaled to the width it is shown at.

const MAX_LIVE = 64;
const MIN_ON_SCREEN_WIDTH = 48;

interface Slot {
  host: HTMLElement;
  make: () => HTMLIFrameElement;
  frame: HTMLIFrameElement | null;
}

export class FrameLoader {
  private readonly io: IntersectionObserver;
  private readonly slots = new Map<Element, Slot>();
  private readonly near = new Set<Element>();
  private live: Slot[] = [];
  private pending = 0;
  private sizer: ResizeObserver | null = null;

  constructor(root: Element | null, margin: string) {
    this.io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) this.near.add(e.target);
          else this.near.delete(e.target);
        }
        this.refresh();
      },
      { root, rootMargin: margin },
    );
  }

  /** Registers a frame host; make() creates its iframe when it should load. */
  observe(host: HTMLElement, make: () => HTMLIFrameElement): void {
    this.slots.set(host, { host, make, frame: null });
    this.io.observe(host);
  }

  /**
   * Keeps `--dv-scale` on el equal to its width divided by `width`, so a
   * frame drawn at its real size fits the box it is shown in.
   */
  scale(el: HTMLElement, width: number): void {
    el.dataset.width = String(width);
    if (typeof ResizeObserver === 'undefined') return;
    this.sizer ??= new ResizeObserver((entries) => {
      for (const e of entries) {
        const target = e.target as HTMLElement;
        const w = Number(target.dataset.width);
        if (w > 0 && e.contentRect.width > 0) target.style.setProperty('--dv-scale', String(e.contentRect.width / w));
      }
      this.refreshSoon();
    });
    this.sizer.observe(el);
  }

  /** Remove a replaced comparison pane without retaining its iframe or observer. */
  forget(host: HTMLElement): void {
    const slot = this.slots.get(host);
    this.io.unobserve(host);
    slot?.frame?.remove();
    this.slots.delete(host);
    this.near.delete(host);
    this.live = this.live.filter((s) => s !== slot);
  }

  /** Forgets every frame, removing their iframes. */
  clear(): void {
    this.sizer?.disconnect();
    this.sizer = null;
    for (const s of this.slots.values()) {
      this.io.unobserve(s.host);
      s.frame?.remove();
    }
    this.slots.clear();
    this.near.clear();
    this.live = [];
  }

  /** Re-evaluates frames after a zoom or pan changed their on-screen size. */
  refreshSoon(): void {
    if (this.pending) return;
    this.pending = requestAnimationFrame(() => {
      this.pending = 0;
      this.refresh();
    });
  }

  private refresh(): void {
    for (const el of this.near) {
      const slot = this.slots.get(el);
      if (!slot || slot.frame) continue;
      if (slot.host.getBoundingClientRect().width < MIN_ON_SCREEN_WIDTH) continue;
      slot.frame = slot.make();
      slot.host.prepend(slot.frame);
      this.live.push(slot);
    }
    if (this.live.length <= MAX_LIVE) return;
    const keep: Slot[] = [];
    let excess = this.live.length - MAX_LIVE;
    for (const slot of this.live) {
      if (excess > 0 && !this.near.has(slot.host)) {
        slot.frame?.remove();
        slot.frame = null;
        excess--;
      } else {
        keep.push(slot);
      }
    }
    this.live = keep;
  }
}
