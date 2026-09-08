import { EmptyMark } from "@/components/ui/empty-mark";

export type FormResult = "win" | "loss";

/**
 * The last few results as a strip, oldest at the left — the design system's
 * `FormPills` (Form Ticks): 2.5×12px bars, 3px gap, 1px radius, `--viz-good`
 * / `--viz-bad`.
 *
 * Lifted out of `team/roster-table.tsx` when Team Home (Platform Audit Ta3)
 * started drawing the same strip in three more places — top movers, the dual
 * sheet's S/D split and the dual-history footer. One drawing, so a bar on the
 * roster and a bar on Home can never disagree about what a win looks like.
 *
 * Colour alone would carry this to a red/green-blind reader, so the strip has
 * a text equivalent rather than an `aria-hidden` and nothing else.
 *
 * `empty` is what to draw for no results at all: the roster's em dash by
 * default, or nothing (`null`) where the caller has its own way of saying so.
 */
export function FormPills({
  results,
  empty = <EmptyMark label="No form yet" />,
}: {
  results: readonly FormResult[];
  empty?: React.ReactNode;
}) {
  if (results.length === 0) return <>{empty}</>;
  return (
    <>
      <span className="sr-only">
        Last {results.length}:{" "}
        {results.map((r) => (r === "win" ? "W" : "L")).join(" ")}
      </span>
      <span aria-hidden className="flex items-center gap-[3px]">
        {results.map((result, index) => (
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
