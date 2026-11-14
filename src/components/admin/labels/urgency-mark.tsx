/**
 * Urgency mark — three rising bars and a word, for the labeller queue and
 * board. Shape from `docs/superpowers/specs/2026-11-12-admin-strip/Urgency.dc.html`;
 * the artboard's pink and purple are raw values, so the design system's tokens
 * stand in: Express and Priority fill in `--blue` (the one accent), Standard
 * fills in `--ink-500` and its word drops to the quieter ink.
 */

export type UrgencyMarkLevel = "express" | "priority" | "standard";

const LEVELS: Record<
  UrgencyMarkLevel,
  { word: string; filled: number; fill: string; wordClass: string }
> = {
  express: {
    word: "Express",
    filled: 3,
    fill: "var(--blue)",
    wordClass: "font-medium text-[var(--ink-900)]",
  },
  priority: {
    word: "Priority",
    filled: 2,
    fill: "var(--blue)",
    wordClass: "font-medium text-[var(--ink-900)]",
  },
  standard: {
    word: "Standard",
    filled: 1,
    fill: "var(--ink-500)",
    wordClass: "font-normal text-[var(--ink-700)]",
  },
};

const BARS = [
  { x: 1, y: 8, width: 3, height: 5 },
  { x: 5.5, y: 5, width: 3, height: 8 },
  { x: 10, y: 1, width: 3, height: 12 },
] as const;

export function UrgencyMark({ level }: { level: UrgencyMarkLevel }) {
  const { word, filled, fill, wordClass } = LEVELS[level];
  return (
    <span className="inline-flex h-[22px] items-center gap-[7px] text-[12px] whitespace-nowrap">
      <svg aria-hidden="true" width={14} height={14} viewBox="0 0 14 14">
        {BARS.map((bar, i) => (
          <rect
            key={bar.x}
            {...bar}
            rx={1}
            fill={i < filled ? fill : "var(--ink-200)"}
            data-filled={i < filled ? "true" : "false"}
          />
        ))}
      </svg>
      <span className={wordClass}>{word}</span>
    </span>
  );
}
