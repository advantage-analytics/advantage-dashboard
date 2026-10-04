import { cn } from "@/lib/utils";

/**
 * A 14px ring: the share of the month's video hours still left. `null` draws
 * the bare track — the loading shape, which promises no figure.
 *
 * One drawing for the header's beta pill and the usage footer. `inverse` is
 * white on the pill's blue gradient; `default` is Signal Blue on a grey track
 * for a white surface, and `low` turns the arc `--error` once the allowance is
 * nearly spent (the same threshold as `hoursSeverity`).
 */
export function HoursRing({
  share,
  tone = "default",
  low = false,
  className,
}: {
  share: number | null;
  tone?: "default" | "inverse";
  low?: boolean;
  className?: string;
}) {
  const r = 6;
  const c = 2 * Math.PI * r;
  const inverse = tone === "inverse";
  return (
    <svg
      viewBox="0 0 16 16"
      className={cn("size-3.5 shrink-0 -rotate-90", className)}
      aria-hidden
    >
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke={inverse ? "rgba(255,255,255,0.3)" : "var(--ink-200)"}
        strokeWidth="2"
      />
      {share !== null && share > 0 && (
        <circle
          cx="8"
          cy="8"
          r={r}
          fill="none"
          stroke={inverse ? "white" : low ? "var(--error)" : "var(--blue)"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeDasharray={`${c * share} ${c}`}
        />
      )}
    </svg>
  );
}
