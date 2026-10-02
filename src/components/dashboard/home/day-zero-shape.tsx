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
 * Both fades live here. `DayZeroShape` is the flat 0.32 form a card or a
 * table takes; `DayZeroGrade` is the continuous grade a whole page takes,
 * brightest under the offer and fading with distance. Same pairing, same
 * `inert` + sentence contract — only the falloff differs, and it differs
 * because a page-length tail banded at one opacity reads as two flat steps.
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
 * The mask both ends of the page-length grade are cut from.
 *
 * **It fades to 0.32, not to nothing.** That is the value the flat
 * `DayZeroShape` sits at, so nothing at the foot of a graded page is fainter
 * than it would have been drawn flat. It matters most for a page ending in
 * an activity heatmap, whose empty cells are `#F2F2F2` — five per cent off
 * white before any fade at all. A gradient running to transparent erased it
 * once already.
 */
const DAY_ZERO_GRADE =
  "linear-gradient(180deg, rgba(0,0,0,0.62) 0%, rgba(0,0,0,0.46) 40%, rgba(0,0,0,0.32) 100%)";

/**
 * The page-length form of the same shape: one continuous grade, not two flat
 * steps.
 *
 * Regions used to carry a fixed opacity each, which is a banding rather than
 * a fade — a page went 0.55, then a hard edge, then 0.32 for everything below
 * regardless of how far down it sat. Matches has always graded properly (its
 * five ghost rows step 1 → 0.3); this is the same idea applied to a page
 * whose regions are cards rather than rows.
 */
export function DayZeroGrade({
  description,
  className,
  children,
}: {
  /**
   * What this page holds once it holds anything, and that nothing below is
   * real. Worded per page — the mechanism is shared, the sentence is not.
   */
  description: string;
  /** Layout for the graded block itself; the pages stack their own gaps. */
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <>
      <p className="sr-only">{description}</p>
      <div
        inert
        className={className}
        style={{
          WebkitMaskImage: DAY_ZERO_GRADE,
          maskImage: DAY_ZERO_GRADE,
        }}
      >
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
