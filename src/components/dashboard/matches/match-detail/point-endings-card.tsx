"use client";

import { useMemo } from "react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { useMatchSides } from "@/components/dashboard/matches/match-detail/use-match-sides";
import { useMatchReport } from "@/components/dashboard/matches/match-detail/match-report-context";
import {
  sideCut,
  type FilmCut,
} from "@/components/dashboard/matches/match-detail/film-cut-context";
import {
  outcomeTally,
  outcomeTotal,
  type OutcomeKey,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  PointEndingsBars,
  type PointEndingsSide,
} from "@/components/dashboard/shared/point-endings-bars";
import { EmptyMark } from "@/components/ui/empty-mark";
import { surnameLabels } from "@/lib/data/match-utils";

/**
 * The Statistics tab's "How points ended" card (artboard 46a, lines 550–556).
 *
 * The tally is `outcomeTally` and the bars `PointEndingsBars` — both shared
 * with the personal Statistics page, which draws the same card over a
 * season. This file is the match's wrapper: it reads the match context
 * (`useMatchData` / `useMatchSides` / `useMatchReport`), hands the tally
 * each side's seat, and owns the card's frame, its empty and its film cuts.
 *
 * The viewer's bar is first (`useMatchSides()`, guardrails §4), never
 * player1's. The bucketing — and the derived-aces rule — is documented on
 * `outcomeTally`.
 *
 * Whole match, always: the tally is taken over every point in
 * `useMatchData().points`, the same read every point-derived card on this tab
 * makes (rally-length-card.tsx takes the identical dependency). The match
 * filters live on the Video tab only.
 *
 * With a playable video each segment opens its points in the Video tab
 * (`outcomeCut`) on click or Enter — hovering only reads. Without one the
 * markup is exactly the read-only card.
 */

export { outcomeTally, type OutcomeKey };

/**
 * Each outcome's base cut, before a side is laid over it by `sideCut` — the
 * shared filters' Result › Ending, narrowed by a Film-only `ending` where
 * Ending alone would admit points this card counts in another segment (see
 * `FilmCutEnding`); aces are Serve › Result "Ace", exact on its own. The four
 * are exclusive, like the tally: a double fault is Error + Serve, which no
 * unforced error is.
 */
const OUTCOME_BASE_CUT: Record<OutcomeKey, FilmCut> = {
  winners: { resultEnding: ["winner"], ending: "winner" },
  unforcedErrors: { resultEnding: ["error"], ending: "unforced-error" },
  doubleFaults: { resultEnding: ["error"], resultShot: ["Serve"] },
  aces: { serveResult: ["ace"] },
};

/**
 * The film cut behind one segment of one side's bar. Aces are the SERVER's
 * (Serve › Player); the other three are Result › Hit by, the point of view
 * Ending reads — whoever hit the winner or made the error, the server for a
 * double fault. That is exactly the line `head-to-head-card.tsx`'s `sideCut`
 * draws for the same four rows, so this delegates to it rather than
 * re-deriving it here. `you`/`opp` are relative, resolved through the filter
 * context's `youIsPlayer1` inside the film tab (guardrails §4); nothing here
 * reads player order.
 *
 * On a derived match Winners' cut narrows to `rally-winner` — the derived
 * head-to-head Winners row's own — so it and Aces never open the same point.
 */
export function outcomeCut(
  key: OutcomeKey,
  side: "you" | "opp",
  isDerived = false,
): FilmCut {
  return sideCut(
    isDerived && key === "winners"
      ? { resultEnding: ["winner"], ending: "rally-winner" }
      : OUTCOME_BASE_CUT[key],
    side,
    key === "aces" ? "server" : "player",
  );
}

interface PointEndingsCardProps {
  /** Video-derived match — aces are its unreturned serves (`outcomeTally`). */
  isDerived: boolean;
}

export function PointEndingsCard({ isDerived }: PointEndingsCardProps) {
  const { meta, actions } = useMatchReport();
  const sides = useMatchSides();
  const { points } = useMatchData();

  const youIsPlayer1 = sides.you.isPlayer1;

  const { youTally, oppTally } = useMemo(
    () => ({
      youTally: outcomeTally(points, youIsPlayer1, isDerived),
      oppTally: outcomeTally(points, !youIsPlayer1, isDerived),
    }),
    [points, youIsPlayer1, isDerived],
  );

  const youTotal = outcomeTotal(youTally);
  const oppTotal = outcomeTotal(oppTally);

  const [youName, oppName] = surnameLabels(sides.you.name, sides.opp.name);

  // No point on this match records how it ended — two filled bars would read
  // as "nobody hit a winner or made an error". The anatomy stays: both names,
  // a dash for each total, an empty track, the legend, and one sentence.
  if (youTotal === 0 && oppTotal === 0) {
    return (
      <section
        aria-labelledby="point-endings-heading"
        className="surface-card flex flex-col gap-3"
        style={{ padding: "16px 20px 14px" }}
        data-testid="point-endings-empty"
      >
        <div className="flex items-baseline gap-2">
          <span id="point-endings-heading" className="eyebrow">
            How points ended
          </span>
          <div className="flex-1" />
          <span
            className="text-micro whitespace-nowrap"
            style={{ color: "var(--ink-400)" }}
          >
            Own outcomes
          </span>
        </div>

        {[youName, oppName].map((name, i) => (
          <div key={i} className="flex flex-col gap-1.5">
            <div className="flex items-baseline gap-2">
              <span className="truncate text-[11px] text-[var(--ink-600)]">
                {name}
              </span>
              <div className="flex-1" />
              <span className="mono tabular text-[10px]">
                <EmptyMark
                  label="No outcomes recorded"
                  className="text-[10px]"
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
          No point on this match records how it ended.
        </p>
      </section>
    );
  }

  // Only with a playable video does a segment take a click; without one the
  // bars draw their read-only markup.
  const onWatch = meta.hasPlayableVideo
    ? (key: OutcomeKey, side: PointEndingsSide, label: string) =>
        actions.watchCut(outcomeCut(key, side, isDerived), label)
    : undefined;

  return (
    <section
      aria-labelledby="point-endings-heading"
      className="surface-card flex flex-col gap-3"
      style={{ padding: "16px 20px 14px" }}
    >
      <div className="flex items-baseline gap-2">
        <span id="point-endings-heading" className="eyebrow">
          How points ended
        </span>
        <div className="flex-1" />
        <span
          className="text-micro whitespace-nowrap"
          style={{ color: "var(--ink-400)" }}
        >
          Own outcomes
        </span>
      </div>

      <PointEndingsBars
        youTally={youTally}
        oppTally={oppTally}
        youName={youName}
        oppName={oppName}
        onWatch={onWatch}
      />
    </section>
  );
}
