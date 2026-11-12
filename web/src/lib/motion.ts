/** Small motion helpers: view transitions between screens, and a reduced-motion switch every animation honours. */

export function reducedMotion(): boolean {
  return matchMedia("(prefers-reduced-motion: reduce)").matches;
}

type Doc = Document & { startViewTransition?: (cb: () => void) => { finished: Promise<void> } };

/** Runs a state change inside a view transition when the browser has them, and plainly otherwise. */
export function transition(change: () => void): void {
  const d = document as Doc;
  if (!d.startViewTransition || reducedMotion()) {
    change();
    return;
  }
  d.startViewTransition(change);
}

/** Draws an SVG path from nothing, like an engraver's line. */
export function drawPath(el: SVGGeometryElement, ms: number, delay = 0): Animation | null {
  const len = el.getTotalLength();
  el.style.strokeDasharray = `${len}`;
  if (reducedMotion()) {
    el.style.strokeDashoffset = "0";
    return null;
  }
  return el.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], {
    duration: ms,
    delay,
    easing: "cubic-bezier(0.65, 0, 0.35, 1)",
    fill: "both",
  });
}

export const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, reducedMotion() ? 0 : ms));
