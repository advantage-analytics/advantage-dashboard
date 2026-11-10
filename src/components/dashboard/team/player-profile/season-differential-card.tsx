import { LegendSwatch } from "@/components/dashboard/matches/match-detail/legend-swatch";
import { SEASON_OPPONENTS_LABEL } from "@/components/dashboard/team/player-profile/season-head-to-head-card";
import { EmptyMark } from "@/components/ui/empty-mark";
import { surname } from "@/lib/data/match-utils";
import type { SeasonOutcomes } from "@/lib/data/player-season";

/**
 * The team player profile's season "Differential" (design canvas "Match page
 * refinements", board 9), under the season Head to head as the match
 * report's sits under its own (`differential-card.tsx`): winners minus
 * errors, per match, for the player and for their opponents — a signed
 * figure over one bar split at zero, errors growing left in the side's light
 * tint, winners right in its full colour.
 *
 * THE COUNTS are How points ended's (`seasonOutcomes`: the report's
 * `outcomeTally` run per match with that match's own seat, then summed), so
 * the two cards cannot disagree: winners by `winnerHitBy` (a service winner
 * and an ace are not winners), errors by `errorMadeBy`. Unforced errors only
 * when every analyzed match has its errors judged
 * (`SeasonOutcomes.errorSplitJudged`), every error otherwise — the season
 * Head to head's Errors row reads the same way. Each figure is the season sum
 * over the analyzed matches, so the differential is the per-match average.
 *
 * Both bars share one scale (the largest of the four averages), so a bar's
 * length compares across the card. Static on purpose, as the other season
 * cards: a season figure is many matches, with no one film to open.
 *
 * Empty (nothing analyzed, or no winner or error recorded): the anatomy —
 * both names, a dash for each figure, empty tracks — and one sentence.
 */

const HEADING_ID = "season-differential-heading";

/** "+3.3", "−1.2" (a true minus), "0.0" — one decimal, as a count row. */
export function signedPerMatch(value: number): string {
  const fixed = Math.abs(value).toFixed(1);
  if (fixed === "0.0") return "0.0";
  return value > 0 ? `+${fixed}` : `−${fixed}`;
}

/** Both sides' per-match winners and errors, from the season's outcomes. */
export function seasonDifferential(outcomes: SeasonOutcomes, analyzed: number) {
  const per = (n: number) => (analyzed > 0 ? n / analyzed : 0);
  return {
    you: {
      winners: per(outcomes.you.winners),
      errors: per(outcomes.you.unforcedErrors),
    },
    opp: {
      winners: per(outcomes.opp.winners),
      errors: per(outcomes.opp.unforcedErrors),
    },
  };
}

export function SeasonDifferentialCard({
  playerName,
  analyzed,
  outcomes,
}: {
  /** The player's full name; the first row shows their surname. */
  playerName: string;
  /** Matches with points — what `outcomes` was summed over. */
  analyzed: number;
  /** `seasonOutcomes()` — the same tallies How points ended draws. */
  outcomes: SeasonOutcomes;
}) {
  const { you, opp } = seasonDifferential(outcomes, analyzed);
  const errorNoun = outcomes.errorSplitJudged ? "unforced errors" : "errors";
  const errorLabel = outcomes.errorSplitJudged ? "Unforced errors" : "Errors";
  const name = surname(playerName);

  const rows = [
    {
      id: "you",
      name,
      ...you,
      winnersFill: "var(--viz-you)",
      errorsFill: "var(--viz-you-light)",
    },
    {
      id: "opp",
      name: SEASON_OPPONENTS_LABEL,
      ...opp,
      winnersFill: "var(--viz-opp)",
      errorsFill: "var(--viz-opp-light)",
    },
  ];
  const scale = Math.max(...rows.flatMap((r) => [r.winners, r.errors]));
  const empty = analyzed === 0 || scale === 0;
  const youDiff = you.winners - you.errors;
  const oppDiff = opp.winners - opp.errors;

  const header = (
    <div className="flex items-baseline gap-2">
      <span id={HEADING_ID} className="eyebrow">
        Differential
      </span>
      <div className="flex-1" />
      <span
        className="text-micro whitespace-nowrap"
        style={{ color: "var(--ink-400)" }}
      >
        Winners minus {errorNoun}, per match
      </span>
    </div>
  );

  if (empty) {
    return (
      <section
        aria-labelledby={HEADING_ID}
        className="surface-card flex flex-1 flex-col gap-3"
        style={{ padding: "16px 20px 14px" }}
        data-testid="season-differential-empty"
      >
        {header}
        {rows.map((row) => (
          <div key={row.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {row.name}
              </span>
              <div className="flex-1" />
              <span className="tabular text-[13px]">
                <EmptyMark
                  label="No winners or errors recorded"
                  className="text-[13px]"
                />
              </span>
            </div>
            <div
              aria-hidden="true"
              className="h-2.5 w-full rounded-[var(--radius-cell)]"
              style={{ background: "var(--ink-100)" }}
            />
          </div>
        ))}
        <p className="text-micro pt-0.5" style={{ color: "var(--ink-500)" }}>
          {analyzed === 0
            ? `Winners and errors add up here once one of ${name}'s matches is analyzed.`
            : "No point in these matches records a winner or an error."}
        </p>
      </section>
    );
  }

  return (
    <section
      aria-labelledby={HEADING_ID}
      // `flex-1 justify-between`: when the chart column is the taller one the
      // card takes the head-to-head column's slack, spread between its rows,
      // so both columns end on one line — the report's card does the same.
      className="surface-card flex flex-1 flex-col justify-between gap-3"
      style={{ padding: "16px 20px 14px" }}
      data-testid="season-differential"
    >
      {header}

      {rows.map((row) => {
        const diff = row.winners - row.errors;
        const leads = diff > (row.id === "you" ? oppDiff : youDiff);
        return (
          <div key={row.id} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {row.name}
              </span>
              <div className="flex-1" />
              <span
                className="tabular text-[13px]"
                style={{
                  fontWeight: leads ? 500 : 400,
                  color: leads ? "var(--ink-900)" : "var(--ink-500)",
                }}
              >
                {signedPerMatch(diff)}
              </span>
            </div>

            <div
              className="flex h-2.5 w-full gap-0.5"
              role="img"
              aria-label={`${row.name}: ${row.winners.toFixed(1)} winners and ${row.errors.toFixed(1)} ${errorNoun} per match.`}
            >
              <div className="flex min-w-0 flex-1 justify-end">
                {row.errors > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${(row.errors / scale) * 100}%`,
                      background: row.errorsFill,
                      borderRadius: "var(--radius-cell) 0 0 var(--radius-cell)",
                    }}
                  />
                )}
              </div>
              <div className="flex min-w-0 flex-1">
                {row.winners > 0 && (
                  <div
                    className="h-full"
                    style={{
                      width: `${(row.winners / scale) * 100}%`,
                      background: row.winnersFill,
                      borderRadius: "0 var(--radius-cell) var(--radius-cell) 0",
                    }}
                  />
                )}
              </div>
            </div>

            <div
              aria-hidden="true"
              className="tabular flex gap-0.5 text-[11px]"
              style={{ color: "var(--ink-500)" }}
            >
              <span className="min-w-0 flex-1 pr-1.5 text-right">
                {row.errors.toFixed(1)}
              </span>
              <span className="min-w-0 flex-1 pl-1.5">
                {row.winners.toFixed(1)}
              </span>
            </div>
          </div>
        );
      })}

      <div
        aria-hidden="true"
        className="flex flex-wrap items-center gap-x-3.5 gap-y-1.5 pt-0.5"
      >
        <LegendSwatch color="var(--viz-you)" label="Winners" />
        <LegendSwatch color="var(--viz-you-light)" label={errorLabel} />
      </div>
    </section>
  );
}
