import type { EventEntry, ProgramEvent } from "@/lib/schedule/types";
import { entryPlayed, lineWon, matchState } from "@/lib/schedule/entry-state";
import { formatEventNumericDay } from "@/lib/schedule/format";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";

/**
 * The court record — the season's singles results, court by court, as a grid
 * (Team Home's rail, the mosaic settled on 2026-09-07).
 *
 * Rows are lineup positions, columns are duals in the order they were played,
 * and a cell is how that court went that day. A coach reads it both ways: down
 * a column for a Saturday that went wrong, along a row for a court that keeps
 * losing. Nothing else on Home shows either.
 *
 * **Pure, and off the schedule the page already holds.** No query of its own:
 * `readSchedule` returns every event with its entries, and this walks them
 * through the same `entryPlayed` / `lineWon` the dual sheet and the schedule
 * page decide lines by. A second way of deciding who won a line is a court
 * marked won under the wrong side, with nothing on screen looking broken —
 * the guardrails' whole warning.
 *
 * **Windowed.** A full season outruns a 400px rail at 20px a column, so the
 * grid shows the most recent `COURT_RECORD_WINDOW` duals with any singles
 * played, and the card's footer says so. The complete season belongs on Compare.
 *
 * **Singles only.** Doubles lines arrive via SwingVision and a doubles slot is
 * a pair, not a court a coach fills; the six singles courts are what a lineup
 * decision is made of.
 */

/**
 * How many duals the record shows — and so how many columns the mosaic draws.
 * Twelve because that is what fills the rail; the pixel arithmetic is
 * `court-record-shell.tsx`'s. A shorter season pads to this width, so the
 * card holds one shape from day zero to the last weekend.
 */
export const COURT_RECORD_WINDOW = 12;

/** Six singles courts, S1 through S6 — the rows, in lineup order. */
export const SINGLES_SLOTS = ["S1", "S2", "S3", "S4", "S5", "S6"] as const;

/** Won, lost, or that court did not play that day. */
export type CourtCellResult = "w" | "l" | "-";

/**
 * One cell: the result, and the line behind it for the hover box. The names
 * and score are the event page's own — `playerLabels`, the match's
 * `opponentLabels`, `scoreSetsFrom` — so the tooltip and the dual sheet can
 * never describe one court two ways.
 */
export interface CourtCell {
  result: CourtCellResult;
  /** "D. Brooks" — empty when the court did not play. */
  ours: string;
  theirs: string;
  sets: ScoreLineSet[];
  /** Which side forfeited, when the result was decided that way. */
  forfeit: "ours" | "theirs" | null;
  /** The match's report, when one is back — where the cell links. */
  reportId: string | null;
}

export interface CourtRecordColumn {
  eventId: string;
  /** "3/14" — the column's header. */
  date: string;
  /** The opponent, for the cell's accessible name. */
  opponent: string;
}

export interface CourtRecordRow {
  slot: string;
  cells: CourtCell[];
  wins: number;
  losses: number;
}

export interface CourtRecord {
  columns: CourtRecordColumn[];
  rows: CourtRecordRow[];
  /** Every dual with a singles result, before windowing — the footer's count. */
  dualsPlayed: number;
}

/**
 * `entry.slot ?? S{n}` is the same fallback `team-home-server.ts` and
 * `dual-detail.tsx` use, so a line missing its slot is called the same court
 * on every screen.
 */
function singlesBySlot(entries: EventEntry[]): Map<string, EventEntry> {
  const bySlot = new Map<string, EventEntry>();
  entries
    .filter((entry) => entry.discipline === "singles")
    .forEach((entry, index) => {
      const slot = entry.slot ?? `S${index + 1}`;
      // First entry wins a duplicated slot — a data error, not a second court.
      if (!bySlot.has(slot)) bySlot.set(slot, entry);
    });
  return bySlot;
}

const EMPTY_CELL: CourtCell = {
  result: "-",
  ours: "",
  theirs: "",
  sets: [],
  forfeit: null,
  reportId: null,
};

function cellFor(entry: EventEntry | undefined): CourtCell {
  if (!entry || !entryPlayed(entry)) return EMPTY_CELL;
  // A dual line holds one match — `team-home-server.ts`'s `dualLines` reads
  // `matches[0]` for the same reason.
  const match = entry.matches[0] ?? null;
  return {
    result: lineWon(entry) === true ? "w" : "l",
    ours: entry.playerLabels.join(" / "),
    theirs: match?.opponentLabels.join(" / ") || entry.opponentLabels.join(" / "),
    sets: scoreSetsFrom(match?.score),
    forfeit: entry.forfeit,
    // Forfeit first, as `team-home-server.ts`'s `dualLines` decides it: a
    // forfeited line is not a report, whatever a match sitting under it says.
    reportId:
      entry.forfeit === null && match && matchState(match) === "ready" ? match.id : null,
  };
}

/**
 * Build the record from the schedule's events and their entries.
 *
 * `events` in any order — this sorts by `startsOn` ascending so the columns
 * read as a timeline whatever the caller's ordering (`readSchedule` returns
 * newest first). Duals only; a tournament entry is a run, not a court.
 */
export function courtRecordFrom(
  events: ProgramEvent[],
  entriesByEvent: Map<string, EventEntry[]>,
  window: number = COURT_RECORD_WINDOW
): CourtRecord {
  const played = events
    .filter((event) => event.kind === "dual")
    .map((event) => ({
      event,
      singles: singlesBySlot(entriesByEvent.get(event.id) ?? []),
    }))
    .filter(({ singles }) => [...singles.values()].some(entryPlayed))
    .sort((a, b) => a.event.startsOn.localeCompare(b.event.startsOn));

  const shown = played.slice(-window);

  const columns: CourtRecordColumn[] = shown.map(({ event }) => ({
    eventId: event.id,
    date: formatEventNumericDay(event.startsOn),
    opponent: event.name,
  }));

  const rows: CourtRecordRow[] = SINGLES_SLOTS.map((slot) => {
    const cells = shown.map(({ singles }) => cellFor(singles.get(slot)));
    return {
      slot,
      cells,
      wins: cells.filter((cell) => cell.result === "w").length,
      losses: cells.filter((cell) => cell.result === "l").length,
    };
  });

  return { columns, rows, dualsPlayed: played.length };
}
