// Pure sizing rules for frames on the wall and in the focus view.

/**
 * The narrowest column a frame of this width gets on the board, in CSS
 * pixels. Desktop frames come three to a row on a laptop; phone frames more.
 */
export function minColumn(frameWidth: number): number {
  return Math.round(Math.min(480, Math.max(200, frameWidth * 0.2)));
}

/** Columns of at least `min` pixels, `gap` apart, that fit in `available`. */
export function columns(available: number, min: number, gap: number): number {
  return Math.max(1, Math.floor((available + gap) / (min + gap)));
}

/** Scale that fits a w × h frame into vw × vh, never above max. */
export function fitScale(w: number, h: number, vw: number, vh: number, max = 1): number {
  if (w <= 0 || h <= 0) return 1;
  return Math.max(0.01, Math.min(max, vw / w, vh / h));
}
