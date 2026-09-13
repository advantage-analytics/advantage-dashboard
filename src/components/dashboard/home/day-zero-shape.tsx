/**
 * The dimmed shape a day-zero page draws below its offer, and the rule one
 * ghost cell is made of.
 *
 * `DayZeroOffer` is the sentence and the buttons; this is everything under
 * them. Both live here because they are one composition — SKILL.md → Table
 * page states — and it was written out three times before this module existed.
 *
 * ── The pairing is the reason this is a component ───────────────────────────
 * `inert` and the `sr-only` sentence must ship together. `inert` takes the
 * ghost out of the tab order AND out of the accessibility tree, so on its own
 * it leaves a screen reader with an offer and then silence — the page appears
 * to end. The sentence is what says, to anyone not reading with their eyes,
 * what fills the rest of the screen and that none of it is real. Written by
 * hand per page, half of that pair is one distracted edit from going missing;
 * as one wrapper it cannot.
 *
 * 0.32 is the same number on every page for the same reason: three day zeros
 * that dim to three different greys read as three products.
 *
 * Home is deliberately NOT built on this — it fades its shape under a mask
 * gradient rather than a flat opacity, which is a real difference in that
 * layout, not drift.
 */

/**
 * How the five ghost rows fade. Shared so the ladder cannot drift page to
 * page; the widths above it are per-table and stay in the page's own file.
 */
export const GHOST_OPACITY = [1, 0.8, 0.6, 0.45, 0.3] as const;

export function DayZeroShape({
  description,
  className,
  children,
}: {
  /**
   * What this page holds once it holds anything, and that nothing below is
   * real. Worded per page — the mechanism is shared, the sentence is not.
   */
  description: string;
  /** Layout for the dimmed block itself; the pages stack their own gaps. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="sr-only">{description}</p>
      <div inert className={className} style={{ opacity: 0.32 }}>
        {children}
      </div>
    </>
  );
}

/**
 * One grey rule standing in for one value.
 *
 * `shape` rather than a positional test. All three ghost tables used to say
 * "the second column is the name, so make it taller" as `i === 1`, appending
 * an `h-[9px]` after an `h-2` and leaving CSS source order to settle which
 * won. A named shape says the same thing where the rule is declared, and puts
 * exactly one height class on the element.
 */
export function GhostRule({
  width,
  tone = "100",
  shape = "bar",
}: {
  /** A percentage of the column, or a fixed px for a glyph-sized mark. */
  width: string;
  /** `200` is the darker rule the name column gets; everything else is `100`. */
  tone?: "100" | "200";
  /** `tall` is the name; `dot` is `ResultMark`'s 14px footprint. */
  shape?: "bar" | "tall" | "dot";
}) {
  const geometry =
    shape === "dot"
      ? "h-3.5 rounded-full"
      : shape === "tall"
        ? "h-[9px] rounded-[2px]"
        : "h-2 rounded-[2px]";
  return (
    <span
      className={`${geometry} ${
        tone === "200" ? "bg-[var(--ink-200)]" : "bg-[var(--ink-100)]"
      }`}
      style={{ width }}
    />
  );
}
