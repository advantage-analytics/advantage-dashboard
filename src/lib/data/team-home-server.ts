import { createClient } from "@/lib/supabase/server";
import { getProgramUsage, type ProgramUsage } from "@/lib/data/usage-server";
import { getTeamSettings } from "@/lib/data/team-settings-server";
import { loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import {
  ANALYSIS_LABEL,
  importedAnalysis,
  manualAnalysis,
  type AnalysisStatus,
} from "@/lib/data/match-analysis";
import {
  matchOutcome,
  shortDate,
  type MatchScore,
} from "@/lib/data/match-utils";
import { scoreSetsFrom, type ScoreLineSet } from "@/lib/ui/score-format";
import { INVITE_TTL_HOURS } from "@/lib/services/programs/tokens";

/**
 * What the program's home page reads.
 *
 * F6 and F8 are the same page with and without rows in it, so they are one
 * query set rather than two: the budget meter is on screen from visit one
 * — coaches steward budgets for a living, and hiding it until it matters is
 * the version that feels like a trick.
 *
 * None of this is a new source of truth. Usage comes from the same SECURITY
 * DEFINER functions Settings › Usage reads, the roster from the same
 * `program_roster` RPC Settings › Team reads and the same `program_roster_full`
 * RPC the Roster page reads, the next event from the same `program_events`
 * policy the schedule page reads under, match state from the shared analysis
 * loader, and who won from the same `matchOutcome` the matches list, the
 * schedule and every player profile ask. A second answer to "how many hours
 * have we used" — or to "did we win that" — would be worse than no answer,
 * because someone would believe this one.
 */

/** How many rows the page shows before "see all" would be the honest control. */
const RECENT_MATCH_LIMIT = 6;

/** Invites close enough to expiry to be worth naming on the home page. */
const EXPIRING_SOON_DAYS = 7;

/**
 * Today as YYYY-MM-DD in the reader's own reckoning.
 *
 * `program_events.starts_on` and `ends_on` are dates, not instants, so the
 * comparison has to be made in the same units. `new Date().toISOString()` would
 * hand the query a UTC day, which for anyone west of Greenwich drops this
 * evening's dual off the schedule several hours early.
 */
function localDay(now: Date): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export interface TeamMatchRow {
  id: string;
  /**
   * "M. Reid vs J. Park" — the program's side named FIRST wherever the row
   * establishes one, so the names, the score and the mark all read from the
   * same point of view. See `programSide()`.
   */
  title: string;
  /** "Big Sky dual · away", or the match type when there is no event. */
  context: string;
  status: AnalysisStatus;
  /** The product's own word for the status — never a second vocabulary. */
  label: string;
  /** "Aug 8" */
  date: string;
  /**
   * The set scores, oriented so `player1` is the side `title` names first.
   *
   * Resolved here rather than in the row, because `<ScoreLine>` takes
   * pre-oriented sets and deliberately never asks who is looking. Empty when
   * nobody has recorded a score — the row falls back to its status dot then.
   */
  sets: ScoreLineSet[];
  /**
   * Did the PROGRAM's side win?
   *
   * `null` covers three different silences, and all three must render the same
   * way — without a `<ResultMark>`: no score recorded, a score that decides
   * nothing (level sets), and a row whose side `programSide()` cannot
   * establish. A row with no glyph is honest; a green check on a match the
   * program lost is the silent misattribution `docs/ui-revamp-guardrails.md`
   * exists to prevent, and nothing on screen would look broken.
   */
  won: boolean | null;
  /**
   * When the job row was created, ISO — absent for an import, which never had
   * one. Carried so a surface showing an in-flight match can say how long it
   * has been going; `loadMatchAnalysis` already reads it, so this costs no
   * query.
   */
  startedAt?: string;
}

/**
 * The soonest event the program has not finished yet.
 *
 * Upcoming only, and deliberately so: a program whose schedule holds nothing
 * but last season has the same next action as one holding nothing at all.
 * Read here rather than through `getScheduleRows()` because that loads every
 * event, every entry under them and every match pointing at those entries —
 * three round trips to answer a yes/no question.
 */
export interface TeamNextEvent {
  id: string;
  /** Opponent school for a dual, the tournament's own name for a tournament. */
  name: string;
  /** YYYY-MM-DD. */
  startsOn: string;
}

export interface RosterProgress {
  /** Players who have accepted. */
  joined: number;
  /** Players invited in total — accepted plus still outstanding. */
  invited: number;
  /** Outstanding invites falling due inside a week. */
  expiringSoon: number;
  /** Whole days until the soonest of those, floored at 0. */
  expiringInDays: number | null;
}

export interface TeamHomeData {
  usage: ProgramUsage;
  matches: TeamMatchRow[];
  roster: RosterProgress;
  /** Null when the program has nothing on the schedule from today onwards. */
  nextEvent: TeamNextEvent | null;
  /**
   * The program's upload permission, carried here because it decides whether a
   * player sees a New match control at all. Read from the same row Settings ›
   * Team writes — never a second copy of the setting.
   */
  playersCanUpload: boolean;
}

/**
 * What the row says about itself besides the names.
 *
 * The event first, then the round, because a coach scanning the list is looking
 * for a dual rather than for a quarter-final. When a match has neither, the
 * type is the only true thing left to say.
 */
function matchContext(row: {
  tournament_name: string | null;
  round: string | null;
  match_type: string | null;
}): string {
  const parts = [row.tournament_name, row.round].filter(
    (part): part is string => Boolean(part?.trim())
  );
  if (parts.length > 0) return parts.join(" · ");
  return row.match_type?.trim() || "Match";
}

/**
 * Which side of a match row is the program's — and `null` when nothing says.
 *
 * Team Home's rows are name-based: `player1_name vs player2_name`, with no
 * "us" anywhere in them. `<ResultMark>` draws a green check or a red cross, so
 * an answer guessed here shows a coach a win where they lost with nothing on
 * screen looking wrong. Two things establish the side; where neither does, the
 * row goes without a mark rather than with a coin flip.
 *
 * 1. **An id on this program's roster.** `program_roster_full.player_id` is
 *    documented as "the id their matches carry" (`roster-server.ts`), and it is
 *    what both writers of a program match put in `player1_id`: the upload
 *    wizard from the roster pick (`useUploadMatchWizard.ts` — "whose match this
 *    is, which in a team workspace is not the uploader"), and `recordResult`
 *    from the event entry's player (`lib/schedule/actions.ts`). An opponent
 *    cannot collide with it: opponent identities are written to
 *    `matches.opponent_player_id`, deliberately NOT to `player2_id`
 *    (`opponents-server.ts`), so a roster id in either column is one of ours.
 * 2. **The row is a line off this program's schedule.** `event_entry_id` says
 *    so, and what makes it evidence is a convention rather than a single
 *    writer — do not "verify" this clause by reading one function and stopping.
 *    **Two places write the column, and both write our side into `player1`:**
 *    - `recordResult` (`lib/schedule/actions.ts`) inserts `event_entry_id:
 *      entry.id` alongside `player1_name: ourLabel` / `player1_id:
 *      playerUserId`, having first refused an entry belonging to another
 *      program.
 *    - the upload wizard (`useUploadMatchWizard.ts:1130`) inserts
 *      `event_entry_id: preset?.entryId ?? null`, so the column is non-null
 *      exactly when the coach opened the wizard from a schedule preset — and
 *      that same preset supplies `playerName`/`playerUserId`, which
 *      `buildMatchData` puts in `player1_name`/`player1_id`. The roster pick a
 *      preset implies and the id `recordResult` would have written are the same
 *      person. (Its other branch fills a row that already carries the column
 *      rather than setting it, and writes `player1_name` the same way round.)
 *
 *    So the invariant is the convention `lib/schedule/entry-state.ts` reads the
 *    whole schedule under — a match tied to an entry has us in `player1` — not
 *    a property of one function. This clause is what covers a DOUBLES line,
 *    whose `player1_id` is deliberately null because two accounts do not fit
 *    one column. Should a third writer ever appear, it has to honour the same
 *    convention or this clause stops being true.
 *
 * Both clauses answer `player1` in every case they overlap on, which is the
 * point: they are two readings of one convention, not two rules. The id test
 * runs first because an id is evidence about THIS row, where the entry test is
 * evidence about how the row was written.
 */
function programSide(
  row: {
    player1_id: string | null;
    player2_id: string | null;
    event_entry_id: string | null;
  },
  rosterIds: ReadonlySet<string>
): "player1" | "player2" | null {
  if (row.player1_id && rosterIds.has(row.player1_id)) return "player1";
  if (row.player2_id && rosterIds.has(row.player2_id)) return "player2";
  if (row.event_entry_id) return "player1";
  return null;
}

/**
 * Player invites, seen from the home page.
 *
 * Counts players only. Staff invites are a different question with a different
 * answer — a program with four coaches and no roster is not 0% of the way to
 * being set up — and merging them made "6 of 10 joined" mean nothing in
 * particular.
 */
function rosterProgress(
  members: { role: string }[],
  invites: { role: string; createdAt: string }[],
  now: number
): RosterProgress {
  const joined = members.filter((member) => member.role === "player").length;
  const outstanding = invites.filter((invite) => invite.role === "player");

  const ttlMs = INVITE_TTL_HOURS * 60 * 60 * 1000;
  const expiries = outstanding
    .map((invite) => new Date(invite.createdAt).getTime() + ttlMs)
    .filter((expiry) => Number.isFinite(expiry))
    .sort((a, b) => a - b);

  const horizon = now + EXPIRING_SOON_DAYS * 24 * 60 * 60 * 1000;
  const soon = expiries.filter((expiry) => expiry <= horizon);

  return {
    joined,
    invited: joined + outstanding.length,
    expiringSoon: soon.length,
    expiringInDays:
      soon.length > 0
        ? Math.max(0, Math.floor((soon[0] - now) / (24 * 60 * 60 * 1000)))
        : null,
  };
}

export async function getTeamHomeData(
  programId: string,
  billingMonth: string
): Promise<TeamHomeData> {
  const supabase = await createClient();

  const [usage, team, { data: rows }, { data: eventRows }, { data: rosterRows }] =
    await Promise.all([
      getProgramUsage(programId, billingMonth),
      getTeamSettings(programId),
      supabase
        .from("matches")
        // `score` carries the games AND both tiebreak arrays, which is what lets
        // the row print "6-7³" rather than a set that looks decided 7-6 the same
        // as one decided 7-5. The three id columns are not display data: they are
        // the only evidence of which side is the program's — see `programSide()`.
        .select(
          "id, player1_id, player2_id, event_entry_id, player1_name, player2_name, score, tournament_name, round, date, match_type, source_provider, verified"
        )
        .eq("program_id", programId)
        .order("date", { ascending: false })
        .limit(RECENT_MATCH_LIMIT),
      // `ends_on`, not `starts_on`: a tournament that began on Thursday is still
      // the next thing on the schedule on Saturday morning. The same policy the
      // schedule page reads under, on the same table — this adds a read, not a
      // source of truth.
      supabase
        .from("program_events")
        .select("id, name, starts_on")
        .eq("program_id", programId)
        .gte("ends_on", localDay(new Date()))
        .order("starts_on", { ascending: true })
        .limit(1),
      // Every id that means "us" on a match row. The same SECURITY DEFINER
      // function Roster and the lineup builder read (`roster-server.ts`,
      // `team-roster-server.ts`) — not a second answer to who is on this team,
      // and the only one that includes a coach-managed player, whose profile id
      // is precisely what their matches carry. Staff seats come back from it too
      // and are kept: a coach uploading without a schedule preset lands their own
      // user id in `player1_id`, and that is still our side of the net.
      supabase.rpc("program_roster_full", { p_program_id: programId }),
    ]);

  // `reap: true` is deliberately NOT passed. It is a write, and it belongs to
  // the two surfaces that draw a progress bar big enough for a frozen one to
  // mislead — the matches list and match detail. This page shows a dot.
  const ids = (rows ?? []).map((row) => row.id as string);
  const jobs = await loadMatchAnalysis(supabase, ids);

  const rosterIds = new Set(
    ((rosterRows ?? []) as { player_id: string | null }[])
      .map((rosterRow) => rosterRow.player_id)
      .filter((id): id is string => Boolean(id))
  );

  const matches: TeamMatchRow[] = (rows ?? []).map((row) => {
    const analysis =
      jobs.get(row.id as string) ??
      (row.source_provider
        ? importedAnalysis(row.source_provider as string, Boolean(row.verified))
        : manualAnalysis());

    const side = programSide(
      row as {
        player1_id: string | null;
        player2_id: string | null;
        event_entry_id: string | null;
      },
      rosterIds
    );
    // Both halves of the flip travel together, and they have to: names read
    // one way and games the other is the same wrong answer as a wrong glyph,
    // told more quietly. With no side established nothing flips — the row
    // keeps the stored order, and `won` stays null so no mark is drawn.
    const swap = side === "player2";
    const score = (row.score ?? null) as MatchScore | null;
    const ourName = (swap ? row.player2_name : row.player1_name) as string;
    const theirName = (swap ? row.player1_name : row.player2_name) as string;

    return {
      id: row.id as string,
      title: `${ourName} vs ${theirName}`,
      context: matchContext(row),
      status: analysis.status,
      label: ANALYSIS_LABEL[analysis.status],
      date: shortDate(row.date as string),
      // Sets counted, never a stored outcome: `matches.result` holds a CONTEXT
      // string ("Final Score"), so `matchOutcome` is the shared rule the
      // matches list, the schedule and every player profile already ask.
      sets: scoreSetsFrom(score, { swap }),
      won: side === null ? null : matchOutcome(score, side === "player1"),
      startedAt: analysis.startedAt,
    };
  });

  const [nextEventRow] = (eventRows ?? []) as {
    id: string;
    name: string;
    starts_on: string;
  }[];

  return {
    usage,
    matches,
    roster: rosterProgress(
      team?.members ?? [],
      team?.invites ?? [],
      Date.now()
    ),
    nextEvent: nextEventRow
      ? {
          id: nextEventRow.id,
          name: nextEventRow.name,
          startsOn: nextEventRow.starts_on,
        }
      : null,
    playersCanUpload: team?.program.playersCanUpload ?? false,
  };
}
