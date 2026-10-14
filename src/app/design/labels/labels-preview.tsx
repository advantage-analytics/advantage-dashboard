"use client";

import { useMemo } from "react";
import { LabelDashboard } from "@/components/admin/labels/label-dashboard";
import { LabelsBoard } from "@/components/admin/labels/labels-board";
import { labelScores } from "@/lib/services/labels/score";
import { completeWarnings } from "@/lib/services/labels/session-status";
import {
  fixtureMatch,
  FLAGS,
  JOBS,
  MATCH_SCORE,
  NAMES,
  OWNERS,
  UPLOAD,
} from "./fixture";

/**
 * `/design/labels`: a match's overview on a made-up match, then the grouped
 * Labels list. The real components on fixed
 * inputs; a point's link has nowhere to go here, and says so in the page's
 * own note rather than doing nothing silently.
 */
export function LabelsDesignPreview() {
  const { points, marks } = useMemo(() => fixtureMatch(), []);
  const games = useMemo(() => labelScores(points, false).games, [points]);
  const warnings = useMemo(
    () =>
      completeWarnings({
        points,
        adScoring: false,
        marks,
        finalScore: null,
        videoEndsEarly: null,
        matchScore: MATCH_SCORE,
        games,
        names: NAMES,
      }),
    [points, marks, games],
  );

  return (
    <main className="mx-auto flex max-w-[1320px] flex-col gap-16 px-14 pt-10 pb-24">
      <header className="flex flex-col gap-2">
        <h1 className="text-display">Labels</h1>
        <p className="max-w-[72ch] text-[13px] leading-[1.6] text-[var(--ink-600)]">
          The real components on a made-up match. Nothing here is read from the
          database, and the point links and labelling buttons go nowhere:
          outside this page they open full screen on that point.
        </p>
      </header>

      <section aria-labelledby="overview" className="flex flex-col gap-12">
        <div className="flex flex-col gap-1">
          <h2
            id="overview"
            className="text-[20px] font-light text-[var(--ink-900)]"
          >
            A match’s overview
          </h2>
          <p className="text-[13px] text-[var(--ink-600)]">
            {NAMES.p1} vs {NAMES.p2}. Six cards: the work on the left, what it
            is checked against on the right.
          </p>
        </div>
        {/* The dashboard bleeds 56px into the admin page's right gutter;
            this takes the same gutter so it does not overflow here. */}
        <div className="overflow-hidden pr-14">
          <LabelDashboard
            points={points}
            marks={marks}
            games={games}
            adScoring={false}
            names={NAMES}
            finalScore={null}
            matchScore={MATCH_SCORE}
            warnings={warnings}
            complete={false}
            upload={UPLOAD}
            onOpen={() => {}}
          />
        </div>
      </section>

      <section aria-labelledby="list" className="flex flex-col gap-6">
        <div className="flex flex-col gap-1 border-t border-[var(--border-card)] pt-5">
          <h2
            id="list"
            className="text-[20px] font-light text-[var(--ink-900)]"
          >
            The Labels list, by program and player
          </h2>
          <p className="max-w-[72ch] text-[13px] leading-[1.6] text-[var(--ink-600)]">
            A dropdown for each program and, inside it, one for each person.
            What still needs labelling starts open. The view switch and the
            dropdowns are live.
          </p>
        </div>
        <LabelsBoard rows={JOBS} owners={OWNERS} flagCounts={FLAGS} />
      </section>
    </main>
  );
}
