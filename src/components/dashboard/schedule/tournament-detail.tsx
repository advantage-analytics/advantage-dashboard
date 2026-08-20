import Link from "next/link";
import { Info } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { StatusChip } from "@/components/ui/status-chip";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import { LineRow } from "@/components/dashboard/schedule/line-row";
import { RunStrip, runRecord } from "@/components/dashboard/schedule/run-strip";
import { AddResultRow } from "@/components/dashboard/schedule/add-result-row";
import { entryState } from "@/lib/schedule/entry-state";
import {
  drawOfRound,
  formatEventSpanWithYear,
  siteTitle,
} from "@/lib/schedule/format";
import type { EventDetail, EventEntry } from "@/lib/schedule/types";

const COLUMNS = "grid-cols-[44px_52px_1fr_168px_110px]";

/**
 * 25f and 25g — a tournament, empty and read as runs.
 *
 * A run is one entry's matches in the order they were played. Segment headings
 * appear only when a player actually changed draws: an entry that never left
 * the main draw gets its rounds listed flat, because "Main draw" above four
 * rows that could not be anywhere else is a label carrying no information.
 */
export function TournamentDetail({
  detail,
  canEdit,
  createdJustNow,
}: {
  detail: EventDetail;
  canEdit: boolean;
  createdJustNow?: boolean;
}) {
  const { event, entries } = detail;

  const played = entries.reduce((count, entry) => count + entry.matches.length, 0);
  const working = entries.reduce(
    (count, entry) => count + (entryState(entry) === "working" ? 1 : 0),
    0
  );
  // Matches, not entries. A coach reading "1 without video" under a tournament
  // is counting films to make, and one entry can be a four-match run — counting
  // entries told them to film once when four were waiting.
  const withoutVideo = entries.reduce(
    (count, entry) => count + entry.matches.filter((match) => !match.hasVideo).length,
    0
  );

  return (
    <EventShell
      crumb={event.name}
      note={createdJustNow ? "Created just now" : undefined}
    >
      <div className="flex items-start gap-12">
        <div className="min-w-0 flex-1">
          <span className="eyebrow">
            Tournament ·{" "}
            <span
              className="mono"
              style={{ fontSize: "10px", letterSpacing: 0 }}
            >
              {formatEventSpanWithYear(event.startsOn, event.endsOn)}
            </span>
            {/* No "· final" here. A dual is final when every line is in — a
                fact the page can check. A tournament has no such signal: one
                result played is not a finished weekend, and printing "final"
                after the first one says the opposite of what is true. */}
          </span>
          <div
            className="mt-2.5 text-[30px] font-light leading-[34px] tracking-[-0.6px]"
            style={{ color: "var(--ink-900)" }}
          >
            {event.name}
          </div>
          <div className="mt-3 flex items-center gap-2.5">
            <span className="text-[13px] text-[var(--ink-900)]">
              {siteTitle(event.site)}
            </span>
            {event.surface ? (
              <>
                <span className="text-[var(--ink-300)]">·</span>
                <span className="text-[13px] text-[var(--ink-900)]">
                  {event.surface}
                </span>
              </>
            ) : null}
            {event.host ? (
              <>
                <span className="text-[var(--ink-300)]">·</span>
                <span className="text-[13px] text-[var(--ink-700)]">
                  Hosted by {event.host}
                </span>
              </>
            ) : null}
          </div>
        </div>

        <div className="flex w-[260px] shrink-0 flex-col items-end gap-2.5">
          {canEdit ? (
            <Link href="/dashboard/team/upload" className={advButton("primary", "sm")}>
              Upload video
            </Link>
          ) : null}
          {working > 0 ? (
            <StatusChip tone="blue" live>
              <span className="tabular">{played}</span>&nbsp;results ·{" "}
              <span className="tabular">{working}</span>&nbsp;analyzing
            </StatusChip>
          ) : (
            <span
              className="text-micro text-right"
              style={{ color: "var(--ink-600)" }}
            >
              <span className="tabular">{entries.length}</span>{" "}
              {entries.length === 1 ? "entry" : "entries"} ·{" "}
              {played === 0
                ? "no results yet"
                : `${played} ${played === 1 ? "result" : "results"}, ${withoutVideo} without video`}
            </span>
          )}
        </div>
      </div>

      {entries.map((entry) => (
        <EntryRun key={entry.id} entry={entry} canEdit={canEdit} />
      ))}

      {played === 0 ? (
        <div className="mt-5 flex items-center gap-2.5 rounded-[var(--radius-element)] bg-[var(--surface-subtle)] px-3.5 py-[11px]">
          <Info
            strokeWidth={1.5}
            className="size-[13px] shrink-0 text-[var(--ink-600)]"
          />
          <span className="text-[12px]" style={{ color: "var(--ink-700)" }}>
            Rounds appear as you add results. Nothing to enter until the first
            match is played — if a player&rsquo;s draw changes, edit the entry
            rather than starting a second one.
          </span>
        </div>
      ) : null}
    </EventShell>
  );
}

function EntryRun({ entry, canEdit }: { entry: EventEntry; canEdit: boolean }) {
  const record = runRecord(entry.matches);
  const decided = record.won + record.lost;

  // Segment only where a player actually moved. One draw across a whole run is
  // the normal case, and heading it "Main draw" tells the reader nothing.
  const draws = new Set(
    entry.matches.map((match) => drawOfRound(match.round) ?? entry.draw ?? "Main draw")
  );
  const segmented = draws.size > 1;

  return (
    <div className="mt-6 border-t border-[var(--border-hairline)] pt-6 first:border-t-0">
      <div className="flex items-center gap-3 pb-2.5">
        <span className="h-3 w-0.5 shrink-0 bg-[var(--blue)]" />
        <span className="text-[16px] text-[var(--ink-900)]">
          {entry.playerLabels.join(" / ") || "Unnamed entry"}
        </span>
        <span className="text-micro" style={{ color: "var(--ink-600)" }}>
          {entry.draw ? entry.draw.toLowerCase() : "entered"}
          {entry.seed ? (
            <>
              {" · seed "}
              <span className="tabular">{entry.seed}</span>
            </>
          ) : null}
          {/* The design annotates a single-draw run with "no segments — never
              left it". That reads as a claim about a FINISHED run, and after
              one match it is just noise — the absence of segment headings
              already says the player has not moved draws. */}
        </span>
        <div className="flex-1" />
        <RunStrip matches={entry.matches} />
        {decided > 0 ? (
          <span
            className="tabular w-11 text-right text-[14px]"
            style={{ color: "var(--ink-900)" }}
          >
            {record.won}–{record.lost}
          </span>
        ) : null}
      </div>

      {entry.matches.length === 0 ? (
        canEdit ? (
          <AddResultRow entry={entry} />
        ) : null
      ) : (
        <>
          {groupByDraw(entry).map((segment) => (
            <div key={segment.draw}>
              {segmented ? (
                <div className="pb-0.5 pt-3.5">
                  <span className="eyebrow">{segment.draw}</span>
                </div>
              ) : null}
              {segment.matches.map((match, index) => (
                <LineRow
                  key={match.id}
                  entry={entry}
                  match={match}
                  label={match.round ?? "—"}
                  round={match.round}
                  canEdit={canEdit}
                  columns={COLUMNS}
                  last={index === segment.matches.length - 1}
                />
              ))}
            </div>
          ))}
          {canEdit ? <AddResultRow entry={entry} /> : null}
        </>
      )}
    </div>
  );
}

function groupByDraw(entry: EventEntry) {
  const home = entry.draw ?? "Main draw";
  const order: string[] = [];
  const buckets = new Map<string, EventEntry["matches"]>();

  for (const match of entry.matches) {
    const draw = drawOfRound(match.round) ?? home;
    if (!buckets.has(draw)) {
      buckets.set(draw, []);
      order.push(draw);
    }
    buckets.get(draw)!.push(match);
  }

  return order.map((draw) => ({ draw, matches: buckets.get(draw)! }));
}
