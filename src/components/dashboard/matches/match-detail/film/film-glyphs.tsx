import type { SVGProps } from "react";

/**
 * Lucide ships `TimerOff` and `VolumeOff` but no `RepeatOff`, and the film
 * controls read every off state the same way — the glyph with Lucide's
 * diagonal slash through it — so this is `Repeat`'s four paths plus that
 * slash, drawn to the same 24px grid, stroke and caps as the library's own
 * off variants. Only here; a second hand-drawn Lucide is how a set drifts.
 */
export function RepeatOff(props: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="m17 2 4 4-4 4" />
      <path d="M3 11v-1a4 4 0 0 1 4-4h6.5" />
      <path d="m7 22-4-4 4-4" />
      <path d="M21 13v1a4 4 0 0 1-1.2 2.85" />
      <path d="M13.5 18H3" />
      <path d="m2 2 20 20" />
    </svg>
  );
}
