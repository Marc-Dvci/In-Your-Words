import { useEffect, useRef } from "preact/hooks";
import { curvePath, rosette } from "@iyw/core";
import { drawPath } from "../lib/motion";

interface Props {
  hex: string;
  /** A second fingerprint drawn over the first, for verification. */
  again?: string | null;
  animate?: boolean;
  label?: string;
}

const C = 120;
const R = 104;

/** The guilloché seal: four rose-engine curves computed from the fingerprint, engraved one after another. */
export function Rosette({ hex, again, animate = true, label }: Props) {
  const ref = useRef<SVGSVGElement>(null);
  const curves = rosette(hex);
  const second = again ? rosette(again) : null;
  const match = Boolean(again && again === hex);

  useEffect(() => {
    if (!animate || !ref.current) return;
    const paths = [...ref.current.querySelectorAll<SVGPathElement>("path.curve:not(.again)")];
    paths.forEach((p, i) => drawPath(p, 1500, i * 260));
    const again = [...ref.current.querySelectorAll<SVGPathElement>("path.again")];
    again.forEach((p, i) => drawPath(p, 1500, 600 + i * 260));
    const rings = [...ref.current.querySelectorAll<SVGCircleElement>(".ring")];
    rings.forEach((r, i) => drawPath(r, 900, 1100 + i * 120));
  }, [hex, again, animate]);

  return (
    <svg
      ref={ref}
      class={`rosette${second ? " overlay" : ""}${match ? " match" : ""}`}
      viewBox={`0 0 ${C * 2} ${C * 2}`}
      role="img"
      aria-label={label ?? `Seal drawn from the fingerprint ${hex.slice(0, 8)}`}
    >
      <defs>
        <linearGradient id={`ink-${hex.slice(0, 6)}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="#12324B" />
          <stop offset="1" stop-color="#1D6B5B" />
        </linearGradient>
      </defs>
      <circle class="ring" cx={C} cy={C} r={R + 10} stroke-width="0.9" />
      <circle class="ring" cx={C} cy={C} r={R + 6} stroke-width="0.4" />
      {curves.map((c, i) => (
        <path key={`a${i}`} class="curve" d={curvePath(c, C, C, R)} stroke={`url(#ink-${hex.slice(0, 6)})`} />
      ))}
      {second?.map((c, i) => (
        <path key={`b${i}`} class="curve again" d={curvePath(c, C, C, R)} />
      ))}
      <circle class="hub" cx={C} cy={C} r={10} />
    </svg>
  );
}

/** The small engraved mark beside the name. */
export function Mark({ size = 26 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 26 26" aria-hidden="true">
      <g fill="none" stroke="#12324B" stroke-width="0.75">
        {[0, 30, 60, 90, 120, 150].map((a) => (
          <ellipse key={a} cx="13" cy="13" rx="11.5" ry="4.2" transform={`rotate(${a} 13 13)`} />
        ))}
      </g>
      <circle cx="13" cy="13" r="1.8" fill="#1D6B5B" />
    </svg>
  );
}
