import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import type { AskFormVisual } from "@/lib/services/ask/events";
import { VisualFrame } from "./visual-frame";

/**
 * A record as its matches, oldest left. The one block that uses the outcome
 * colours, because an outcome is what it draws.
 *
 * The record beside the strip is a count of the ticks drawn next to it, not a
 * figure from the database: it cannot disagree with the strip.
 */
export function FormVisual({ visual }: { visual: AskFormVisual }) {
  const wins = visual.results.filter(Boolean).length;
  const losses = visual.results.length - wins;
  return (
    <VisualFrame kind="form" caption={visual.caption}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-scoreboard m-0">
          <span className="sr-only">Won </span>
          {wins}
          <span aria-hidden="true" className="px-1 text-[var(--ink-400)]">
            –
          </span>
          <span className="sr-only">, lost </span>
          {losses}
        </p>
        <FormTicks
          form={visual.results.map((won) => (won ? "win" : "loss"))}
          empty={null}
        />
      </div>
    </VisualFrame>
  );
}
