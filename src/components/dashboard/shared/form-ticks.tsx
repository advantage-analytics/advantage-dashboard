import { EmptyMark } from "@/components/ui/empty-mark";

/**
 * The last five results as a strip, oldest at the left — SKILL.md → Form
 * Ticks (`FormPills` in the design system): 2.5×12px bars, 3px gap, 1px
 * radius, `--viz-good` / `--viz-bad`. A `"pending"` result — played, not yet
 * decided — draws as a solid `--ink-300` bar rather than an invented color.
 *
 * Extracted from the roster table when the player profile's line history
 * needed the same strip. Two private copies drifted by a pixel of tick height
 * within a week of each other; one export cannot.
 *
 * Colour alone would carry this to a red/green-blind reader, so the strip has
 * a text equivalent rather than an `aria-hidden` and nothing else.
 *
 * No `"use client"`: it has no state, so a server-rendered card can draw it.
 */
export function FormTicks({
  form,
  slots,
  empty = <EmptyMark label="No form yet" />,
}: {
  form: readonly ("win" | "loss" | "pending")[];
  /**
   * Pad the strip to a fixed width with faint `--ink-100` ghost bars for the
   * matches that haven't happened yet — the roster table's "five, eventually"
   * treatment. Omitted everywhere else: the player profile's line history and
   * the team's season/dual strips draw exactly `form.length` bars, as they
   * always have, so this stays opt-in rather than a default every call site
   * inherits.
   */
  slots?: number;
  /**
   * What to draw for no results at all. The em dash by default, for the two
   * table cells with a column to keep aligned; every card that draws the
   * strip inside a line which already says there is nothing yet passes
   * `null`, where a second mark would be noise. Ignored when `slots` is set —
   * an all-ghost strip already says "nothing yet" on its own.
   */
  empty?: React.ReactNode;
}) {
  if (form.length === 0 && slots === undefined) return <>{empty}</>;
  const ghostCount = slots === undefined ? 0 : Math.max(0, slots - form.length);
  return (
    <>
      <span className="sr-only">
        {form.length === 0
          ? "No form yet"
          : `Last ${form.length}: ${form
              .map((r) => (r === "win" ? "W" : r === "loss" ? "L" : "Pending"))
              .join(" ")}`}
      </span>
      <span aria-hidden className="flex items-center gap-[3px]">
        {form.map((result, index) => (
          <span
            key={index}
            className="h-3 w-[2.5px] rounded-[1px]"
            style={{
              background:
                result === "win"
                  ? "var(--viz-good)"
                  : result === "loss"
                    ? "var(--viz-bad)"
                    : "var(--ink-300)",
            }}
          />
        ))}
        {Array.from({ length: ghostCount }, (_, index) => (
          <span
            key={`ghost-${index}`}
            className="h-3 w-[2.5px] rounded-[1px] bg-[var(--ink-100)]"
          />
        ))}
      </span>
    </>
  );
}
