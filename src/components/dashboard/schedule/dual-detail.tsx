/*
 * LIVE — do not mistake this for part of the dormant tree.
 * `app/dashboard/team/schedule/[eventId]/page.tsx` renders it. The schedule
 * page's rail, `static/event-drawer.tsx`, summarises the same dual in 340px and
 * links each line to its match; this one is the DB-wired event page, where
 * lines are scored.
 *
 * See `./README.md` for the full live/dormant map.
 */

import Link from "next/link";
import { DualTicks } from "@/components/dashboard/schedule/dual-ticks";
import { EventGlyphRow } from "@/components/dashboard/schedule/event-glyph-row";
import {
  EventPageFrame,
  EventTitle,
  GroupHead,
  TableCard,
} from "@/components/dashboard/schedule/event-page";
import {
  LineRow,
  UnsetLineRow,
  type LineViewer,
} from "@/components/dashboard/schedule/line-row";
import { EventMark } from "@/components/dashboard/schedule/static/event-mark";
import {
  dualScore,
  entryPlayed,
  entryState,
  lineWon,
} from "@/lib/schedule/entry-state";
import { advButton } from "@/lib/ui/adv-button";
import type { EventDetail, EventEntry } from "@/lib/schedule/types";

/**
 * The dual's columns, stated once and handed to `TableCard` and every row:
 * line · player · opponent · result · action · chevron. The names share the
 * slack; Result (mark, then score) and the action are fixed tracks, so the
 * scores and the actions start on the same x on every row and the action sits
 * against the chevron rather than floating mid-row.
 */
const COLUMNS =
  "grid-cols-[32px_minmax(0,1fr)_minmax(0,1fr)_140px_112px_13px] gap-x-5";
const HEADERS = ["Line", "Player", "Opponent", "Result", "", ""];

/** A college dual's full card, always drawn whole. */
const SINGLES_SLOTS = ["S1", "S2", "S3", "S4", "S5", "S6"];
const DOUBLES_SLOTS = ["D1", "D2", "D3"];

/**
 * A dual's event page: the Schedule drawer's identity header, then one table
 * card whose top band is the dual score.
 *
 * The header is the drawer's — the 48px crest, the name with the opponent's
 * conference beside it, the date · venue · surface glyph row — so a coach who
 * opens the page from the drawer lands on the same event, spelled the same
 * way.
 *
 * The score band leads the card: the team score at 40px, the nine courts as
 * the drawer's form strip at twice its size, and how far the dual has got.
 * Each group's tally sits in its own heading row, beside the lines that make
 * it.
 *
 * The table always holds six singles and three doubles rows. A slot the
 * lineup has no entry for keeps its row, so the card never changes shape as a
 * dual fills in — empty and filled are ONE renderer.
 *
 * Every member of the program sees the same data — the membership-only RLS
 * policy hands every member the program's matches.
 */
export function DualDetail({
  detail,
  canEdit,
  conference = null,
  viewer = null,
}: {
  detail: EventDetail;
  canEdit: boolean;
  /** The opponent program's conference, where the dual resolved one. */
  conference?: string | null;
  /** The signed-in person, so their own line shows their photo. */
  viewer?: LineViewer | null;
}) {
  const { event, entries } = detail;

  const singles = entries.filter((entry) => entry.discipline === "singles");
  const doubles = entries.filter((entry) => entry.discipline === "doubles");

  const score = dualScore(entries);
  const anyPlayed = score.us > 0 || score.them > 0;
  const decidedLines = entries.filter((entry) => entryPlayed(entry)).length;

  // The primary is whatever is actually next: while a line has no result at
  // all, that is a score; once every line is in, it is the video.
  const needsScore = entries.some(
    (entry) => entry.forfeit === null && entryState(entry) === "empty",
  );

  const rows = (slots: string[], group: EventEntry[]) => {
    // Entries by their slot; anything without a recognised slot keeps its
    // lineup position after the fixed card, so no line is ever dropped.
    const bySlot = new Map(group.map((entry) => [entry.slot, entry]));
    const extra = group.filter(
      (entry) => !entry.slot || !slots.includes(entry.slot),
    );
    return [
      ...slots.map((slot) => {
        const entry = bySlot.get(slot);
        return entry ? (
          <LineRow
            key={entry.id}
            entry={entry}
            match={entry.matches[0] ?? null}
            label={slot}
            round={null}
            canEdit={canEdit}
            columns={COLUMNS}
            viewer={viewer}
            split
          />
        ) : (
          <UnsetLineRow
            key={slot}
            slot={slot}
            eventId={event.id}
            canEdit={canEdit}
            columns={COLUMNS}
          />
        );
      }),
      ...extra.map((entry) => (
        <LineRow
          key={entry.id}
          entry={entry}
          match={entry.matches[0] ?? null}
          label={entry.slot ?? "—"}
          round={null}
          canEdit={canEdit}
          columns={COLUMNS}
          viewer={viewer}
          split
        />
      )),
    ];
  };

  return (
    <EventPageFrame
      mark={<EventMark kind={event.kind} name={event.name} size={48} />}
      title={<EventTitle vs name={event.name} />}
      subline={conference}
      facts={<EventGlyphRow event={event} />}
      actions={
        canEdit ? (
          <>
            <Link
              href={`/dashboard/team/schedule/${event.id}/edit`}
              className={advButton("ghost", "md")}
            >
              Edit dual
            </Link>
            <Link
              href={
                needsScore
                  ? `/dashboard/team/schedule/${event.id}/score`
                  : "/dashboard/team/upload"
              }
              className={advButton("primary", "md")}
            >
              {needsScore ? "Add score" : "Upload match video"}
            </Link>
          </>
        ) : null
      }
    >
      <TableCard
        columns={COLUMNS}
        headers={HEADERS}
        top={
          <div className="flex items-center gap-4 border-b border-[var(--border-hairline)] pt-5 pb-[18px]">
            <span
              className="tabular text-[40px] leading-none font-light tracking-[-0.6px] whitespace-nowrap"
              aria-label={`Dual score ${score.us} to ${score.them}`}
            >
              {/* ink-300 until a point is on the board: a 0–0 in full ink
                  reads as a result rather than as an absence of one. */}
              <span
                style={{
                  color: anyPlayed ? "var(--ink-900)" : "var(--ink-300)",
                }}
              >
                {score.us}
              </span>
              <span className="mx-1" style={{ color: "var(--ink-300)" }}>
                –
              </span>
              <span
                style={{
                  color: anyPlayed ? "var(--ink-500)" : "var(--ink-300)",
                }}
              >
                {score.them}
              </span>
            </span>
            <span
              aria-hidden="true"
              className="h-7 w-px bg-[var(--border-hairline)]"
            />
            <DualTicks singles={singles} doubles={doubles} size="lg" />
            <span
              className="tabular text-[13px]"
              style={{ color: "var(--ink-600)" }}
            >
              {score.decided
                ? "Final"
                : `${decidedLines} of ${SINGLES_SLOTS.length + DOUBLES_SLOTS.length} lines decided`}
            </span>
          </div>
        }
      >
        <GroupHead label="Singles" note={<Tally entries={singles} />} />
        {rows(SINGLES_SLOTS, singles)}

        <GroupHead
          label="Doubles"
          note={<Tally entries={doubles} note={teamPointNote(doubles)} />}
        />
        {rows(DOUBLES_SLOTS, doubles)}
      </TableCard>
    </EventPageFrame>
  );
}

/** "2–2" beside a group's heading, with an optional quiet qualifier. */
function Tally({ entries, note }: { entries: EventEntry[]; note?: string }) {
  const won = entries.filter((entry) => lineWon(entry) === true).length;
  // Played AND not won — `lineWon` alone answers `false` for a court nobody
  // has played.
  const lost = entries.filter(
    (entry) => entryPlayed(entry) && lineWon(entry) !== true,
  ).length;
  return (
    <span className="inline-flex items-baseline gap-2.5">
      <span className="tabular text-[12px] text-[var(--ink-900)]">
        {won}–{lost}
      </span>
      {note ? <span>{note}</span> : null}
    </span>
  );
}

/**
 * Who the ONE doubles point went to. Two of three courts takes it — the ITA
 * rule `dualScore` applies — and it is said beside the Doubles tally because
 * three courts do not add up to one point without it.
 */
function teamPointNote(entries: EventEntry[]): string | undefined {
  const won = entries.filter((entry) => lineWon(entry) === true).length;
  const lost = entries.filter(
    (entry) => entryPlayed(entry) && lineWon(entry) !== true,
  ).length;

  if (won >= 2) return "point ours";
  if (lost >= 2) return "point theirs";
  return undefined;
}
