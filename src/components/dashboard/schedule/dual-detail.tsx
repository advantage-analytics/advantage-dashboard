import Link from "next/link";
import { Badge } from "@/components/ui/badge";
import { StatusChip } from "@/components/ui/status-chip";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import { LineRow } from "@/components/dashboard/schedule/line-row";
import {
  dualScore,
  entryPlayed,
  entryState,
  matchWon,
} from "@/lib/schedule/entry-state";
import { formatEventDay, siteTitle } from "@/lib/schedule/format";
import type { EventDetail } from "@/lib/schedule/types";
import type { ResultsScope } from "@/lib/data/results-visibility";
import { RESULTS_WITHHELD_SENTENCE } from "@/components/dashboard/team/roster-vocabulary";

const COLUMNS = "grid-cols-[44px_52px_1fr_150px_130px]";

/**
 * 25c and 25d — a dual, empty and filled.
 *
 * One renderer, not two. The transition between them is the thing being
 * designed: a dual stops being empty when its rows have scores in them, and a
 * separate "nothing played yet" screen would have to be dismissed. That is the
 * same reasoning `/dashboard/team/page.tsx` records for its own two states.
 *
 * **And nothing here is counted on a reader's behalf who cannot see it all.**
 * `entries` is member-visible, so a player on a program with
 * `programs.roster_visible` unset still gets all nine lines with names and
 * opponents on them; the RESULT lives on `matches`, so at most one line comes
 * back with a match attached. `dualScore` over that is a confident, wrong,
 * low score under the fixture's name — see its own warning in
 * `lib/schedule/entry-state.ts`. `scope` is asked before any of that
 * arithmetic runs, the same gate `buildWeekendDual` puts in front of the same
 * function for Team Home's card.
 */
export function DualDetail({
  detail,
  canEdit,
  scope,
  createdJustNow,
}: {
  detail: EventDetail;
  canEdit: boolean;
  /**
   * `resultsScope()`'s answer for this viewer and this program — `program` for
   * staff and for a roster-visible program's players, `own` for a player on a
   * closed one. `null`-shaped downstream: every figure `dualScore` produces is
   * withheld together rather than a subset of them surviving, the same rule
   * `WeekendDual.tally` states. See `lib/data/results-visibility.ts`.
   */
  scope: ResultsScope;
  createdJustNow?: boolean;
}) {
  const { event, entries } = detail;

  const singles = entries.filter((entry) => entry.discipline === "singles");
  const doubles = entries.filter((entry) => entry.discipline === "doubles");

  // Withheld outright under a narrowed read rather than computed over the one
  // line that came back — see the doc comment above.
  const score = scope === "program" ? dualScore(entries) : null;
  const anyPlayed = score !== null && (score.us > 0 || score.them > 0);

  const working = entries.reduce(
    (count, entry) => count + (entryState(entry) === "working" ? 1 : 0),
    0
  );
  const withoutVideo = entries.filter(
    (entry) => entryState(entry) === "no-video"
  ).length;

  // The S/D split is the same claim as the team score, stated two more ways —
  // see `dualScore`'s own doc comment — so it is withheld with it rather than
  // computed independently.
  const singlesScore = score ? countGroup(singles) : null;
  const doublesScore = score ? countGroup(doubles) : null;

  return (
    <EventShell
      crumb={`vs ${event.name}`}
      note={createdJustNow ? "Created just now" : undefined}
    >
      <div className="flex items-end gap-12">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">
            Dual match · {formatEventDay(event.startsOn)} ·{" "}
            {siteTitle(event.site)} · {score?.decided ? "final" : event.surface ?? "—"}
          </span>
          {/* A real h1. The page carried no heading of any level, so a screen
              reader got no structure for the thing the page is about. "vs"
              stays inside it: the accessible name is the fixture, not the
              opponent standing on their own. */}
          <h1 className="mt-2 flex items-baseline gap-3">
            <span
              className="text-[30px] font-light leading-[34px] tracking-[-0.6px]"
              style={{ color: "var(--ink-600)" }}
            >
              {/* The trailing space is load-bearing. These are flex children
                  separated by a gap, so the visual space is layout, not text —
                  and the h1's accessible name came out "vsState College of
                  Ash". The space collapses visually and separates the words for
                  a screen reader. */}
              {"vs "}
            </span>
            <span
              className="text-[30px] font-light leading-[34px] tracking-[-0.6px]"
              style={{ color: "var(--ink-900)" }}
            >
              {event.name}
            </span>
            {score?.decided ? (
              <Badge variant={score.us > score.them ? "win" : "loss"}>
                {score.us > score.them ? "Won" : "Lost"}
              </Badge>
            ) : null}
          </h1>
        </div>

        <div className="flex max-w-[24ch] shrink-0 flex-col items-end gap-2">
          {score ? (
            <>
              <span
                className="tabular text-[40px] font-light leading-[40px]"
                // ink-300 until a point is actually on the board. A 0–0 in full
                // ink reads as a result rather than as an absence of one.
                style={{ color: anyPlayed ? "var(--ink-900)" : "var(--ink-300)" }}
              >
                {score.us}–{score.them}
              </span>
              {working > 0 ? (
                <StatusChip tone="blue" live>
                  <span className="tabular">{working}</span>&nbsp;analyzing ·{" "}
                  <span className="tabular">{withoutVideo}</span>&nbsp;without video
                </StatusChip>
              ) : (
                <span className="text-micro" style={{ color: "var(--ink-600)" }}>
                  {/* "lines", not "matches" — the create footer promised lines, and
                      until one is played that is exactly what these are. Two words
                      for one object is how a reader stops trusting either. */}
                  <span className="tabular">{entries.length}</span>{" "}
                  {entries.length === 1 ? "line" : "lines"} ·{" "}
                  {anyPlayed ? `${withoutVideo} without video` : "no results yet"}
                </span>
              )}
            </>
          ) : (
            // The Roster page's sentence, word for word — one flag, one
            // explanation, wherever a program surface withholds rather than
            // reports. Same substitution the dual sheet makes for its own
            // header.
            <p className="text-micro text-right">{RESULTS_WITHHELD_SENTENCE}</p>
          )}
        </div>
      </div>

      <Section
        title={
          <>
            Singles
            {singlesScore ? (
              <>
                {" · "}
                <span className="tabular" style={{ letterSpacing: 0 }}>
                  {singlesScore}
                </span>
              </>
            ) : null}
          </>
        }
        action={
          canEdit ? (
            <Link
              href="/dashboard/team/upload"
              className="text-[11px] font-medium text-[var(--blue-text)]"
            >
              Upload match video
            </Link>
          ) : null
        }
        first
      />
      {singles.map((entry, index) => (
        <LineRow
          key={entry.id}
          entry={entry}
          match={entry.matches[0] ?? null}
          label={entry.slot ?? `S${index + 1}`}
          round={null}
          canEdit={canEdit}
          columns={COLUMNS}
        />
      ))}

      <Section
        title={
          <>
            Doubles
            {doublesScore ? (
              <>
                {" · point "}
                <span className="tabular" style={{ letterSpacing: 0 }}>
                  {doublesScore}
                </span>
              </>
            ) : null}
          </>
        }
      />
      {doubles.map((entry, index) => (
        <LineRow
          key={entry.id}
          entry={entry}
          match={entry.matches[0] ?? null}
          label={entry.slot ?? `D${index + 1}`}
          round={null}
          canEdit={canEdit}
          columns={COLUMNS}
          last={index === doubles.length - 1}
        />
      ))}
    </EventShell>
  );
}

function Section({
  title,
  action,
  first,
}: {
  title: React.ReactNode;
  action?: React.ReactNode;
  first?: boolean;
}) {
  return (
    <div
      className={`flex items-baseline gap-2.5 border-b border-[var(--border-hairline)] pb-2.5 ${
        first ? "mt-7" : "mt-6"
      }`}
    >
      {/* h2, not a span. Singles and Doubles are the page's two sections, and
          a screen reader needs them in the outline to jump between. `.eyebrow`
          carries the look either way. */}
      <h2 className="eyebrow">{title}</h2>
      <div className="flex-1" />
      {action}
    </div>
  );
}

/**
 * "3–3" across one group of lines, or null while none are in.
 *
 * Lines won against lines lost — NOT `dualScore`, which folds three doubles
 * into a single team point. The heading above the doubles table is counting
 * courts; the number in the hero is counting the point they add up to.
 */
function countGroup(entries: EventDetail["entries"]): string | null {
  let us = 0;
  let them = 0;
  for (const entry of entries) {
    if (!entryPlayed(entry)) continue;
    if (entry.matches.some((match) => matchWon(match) === true)) us++;
    else them++;
  }
  return us === 0 && them === 0 ? null : `${us}–${them}`;
}
