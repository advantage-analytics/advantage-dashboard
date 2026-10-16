import Link from "next/link";
import { FormTicks } from "@/components/dashboard/shared/form-ticks";
import type { AskFormTick, AskFormVisual } from "@/lib/services/ask/events";
import { VisualFrame, VisualReadout } from "./visual-frame";

/**
 * A record as its matches, oldest left. The one block that uses the outcome
 * colours, because an outcome is what it draws.
 *
 * The record beside the strip is a count of the ticks drawn next to it, not a
 * figure from the database: it cannot disagree with the strip.
 *
 * With `ticks` — the rows named their matches — each tick carries its
 * match in words (the result, the opponent, the score, the date), shown in
 * a dark readout on hover and read out to a screen reader, and is a link
 * to the match when the row carried its id. The strip's geometry is
 * `FormTicks`' own: 2.5×12px bars, 3px apart.
 */
export function FormVisual({ visual }: { visual: AskFormVisual }) {
  const wins = visual.results.filter(Boolean).length;
  const losses = visual.results.length - wins;
  const ticks =
    visual.ticks && visual.ticks.length === visual.results.length
      ? visual.ticks
      : null;
  return (
    <VisualFrame kind="form" caption={visual.caption}>
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <p className="text-scoreboard m-0 tabular-nums">
          <span className="sr-only">Won </span>
          {wins}
          <span aria-hidden="true" className="px-1 text-[var(--ink-400)]">
            –
          </span>
          <span className="sr-only">, lost </span>
          {losses}
        </p>
        {ticks ? (
          <LabelledTicks results={visual.results} ticks={ticks} />
        ) : (
          <FormTicks
            form={visual.results.map((won) => (won ? "win" : "loss"))}
            empty={null}
          />
        )}
      </div>
    </VisualFrame>
  );
}

/** One tick's match in words: "Won against Theo Lindqvist, 6-4, 6-3, Sep 28, 2026". */
export function formTickWords(won: boolean, tick: AskFormTick): string {
  const parts = [
    `${won ? "Won" : "Lost"}${tick.player ? `, ${tick.player}` : ""}${tick.opponent ? ` ${won ? "against" : "to"} ${tick.opponent}` : ""}`,
    tick.score,
    tick.date,
  ].filter((part): part is string => part !== undefined && part !== "");
  return parts.join(", ");
}

function LabelledTicks({
  results,
  ticks,
}: {
  results: readonly boolean[];
  ticks: readonly AskFormTick[];
}) {
  return (
    <ol
      data-ask-form-ticks=""
      className="m-0 flex list-none items-center gap-[3px] p-0"
    >
      {results.map((won, index) => {
        const tick = ticks[index];
        const words = formTickWords(won, tick);
        const bar = (
          <span
            aria-hidden="true"
            className="block h-3 w-[2.5px] rounded-[1px]"
            style={{ background: won ? "var(--viz-good)" : "var(--viz-bad)" }}
          />
        );
        const readout = (
          <VisualReadout className="bottom-full left-1/2 mb-1 -translate-x-1/2">
            {words}
          </VisualReadout>
        );
        return (
          <li key={index} data-ask-form-tick="" className="group relative">
            {tick.matchId ? (
              <Link
                href={`/dashboard/matches/${encodeURIComponent(tick.matchId)}`}
                className="flex h-5 w-[2.5px] items-center rounded-[1px] outline-none focus-visible:shadow-[var(--focus-ring)]"
              >
                {bar}
                <span className="sr-only">{words}, open match</span>
              </Link>
            ) : (
              <span className="flex h-5 w-[2.5px] items-center">
                {bar}
                <span className="sr-only">{words}</span>
              </span>
            )}
            {readout}
          </li>
        );
      })}
    </ol>
  );
}
