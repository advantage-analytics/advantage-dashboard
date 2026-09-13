import { EmptyMark } from "@/components/ui/empty-mark";

/**
 * The last five results as a strip, oldest at the left — SKILL.md → Form
 * Ticks (`FormPills` in the design system): 2.5×12px bars, 3px gap, 1px
 * radius, `--viz-good` / `--viz-bad`.
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
  empty = <EmptyMark label="No form yet" />,
}: {
  form: readonly ("win" | "loss")[];
  /**
   * What to draw for no results at all. The em dash by default, for the two
   * table cells with a column to keep aligned; every card that draws the
   * strip inside a line which already says there is nothing yet passes
   * `null`, where a second mark would be noise.
   */
  empty?: React.ReactNode;
}) {
  if (form.length === 0) return <>{empty}</>;
  return (
    <>
      <span className="sr-only">
        Last {form.length}:{" "}
        {form.map((r) => (r === "win" ? "W" : "L")).join(" ")}
      </span>
      <span aria-hidden className="flex items-center gap-[3px]">
        {form.map((result, index) => (
          <span
            key={index}
            className="h-3 w-[2.5px] rounded-[1px]"
            style={{
              background:
                result === "win" ? "var(--viz-good)" : "var(--viz-bad)",
            }}
          />
        ))}
      </span>
    </>
  );
}
