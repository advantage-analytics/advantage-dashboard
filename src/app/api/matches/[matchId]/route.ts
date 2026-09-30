import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  purgeMatchStorage,
  PurgeRefusedError,
} from "@/lib/services/matches/purge-match-storage";
import { releaseStoragePurgeClaims } from "@/lib/services/matches/release-storage-purge-claim";
import { resolveAnalysisStatus } from "@/lib/data/match-analysis";
import { isUuid } from "@/lib/services/match-video/access";
import { isPlainObject } from "@/lib/services/match-video/http";
import {
  normalizeMatchPatch,
  type MatchFormat,
  type MatchScore,
} from "@/lib/matches/patch-match";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canManageTeamSchedule } from "@/lib/workspace/types";
import {
  rosterPlayerOptions,
  type RosterFullRow,
} from "@/lib/data/roster-shared";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Beta gate: every PATCH forces private = true until we surface the toggle.
const BETA_FORCE_PRIVATE = true;

/**
 * The Edit Match dialog's read and write.
 *
 * GET carries what the dialog decides its layout from, not just the editable
 * columns: whether the match was analyzed (format is then fixed), the event
 * line it sits on (E1 — the event owns date, round, type and surface), and
 * whether this viewer may attach a one-off team match to a line.
 *
 * PATCH rules live in `normalizeMatchPatch` (`src/lib/matches/patch-match.ts`).
 */

const MATCH_COLUMNS =
  "id, tournament_name, round, date, match_type, court_type, player1_id, player1_name, player2_name, score, private, format, duration, player_hand, player_backhand, opponent_hand, opponent_backhand, program_id, event_entry_id, source_provider";

interface MatchRow {
  id: string;
  score: MatchScore | null;
  format: MatchFormat | null;
  program_id: string | null;
  event_entry_id: string | null;
  source_provider: string | null;
  [key: string]: unknown;
}

/** The event line a match is filed under, as the dialog's header reads it. */
export interface MatchEventContext {
  eventId: string;
  eventName: string;
  eventKind: "dual" | "tournament";
  slot: string | null;
  discipline: string;
  startsOn: string;
  endsOn: string;
  site: string;
  surface: string | null;
  format: { best_of?: number; ad_scoring?: boolean | null } | null;
}

/**
 * The route's answer for a match that does not exist for this caller. A
 * malformed id gets it too, before any Supabase call: Postgres would only
 * refuse it as an invalid uuid, which the lookup turned into a 500.
 */
function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/** DELETE's answer when the admin console's purge guard refuses the match. */
const PURGE_PROTECTED_MESSAGE =
  "Matches recorded or analyzed through the admin console cannot be deleted here.";

/** DELETE's answer when that guard could not be checked, or anything else threw. */
const PURGE_UNAVAILABLE_MESSAGE = "Match deletion is unavailable. Try again.";

function unauthorized() {
  return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
}

function badRequest(error: string, field?: string) {
  return NextResponse.json(
    { error, ...(field ? { field } : {}) },
    { status: 400 },
  );
}

/**
 * A 500 whose logged detail (the real Supabase error) never reaches the
 * client — only `publicMessage` does.
 */
function serverError(logLabel: string, cause: unknown, publicMessage: string) {
  console.error(logLabel, cause);
  return NextResponse.json({ error: publicMessage }, { status: 500 });
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/**
 * The newest job for the match, in the shared status vocabulary, or null —
 * with the read's error beside it. A failed read must not pass for "not
 * analysed": PATCH would then unlock the format and player edits that an
 * analysed match keeps fixed.
 */
async function analysisFor(supabase: Supabase, matchId: string) {
  const { data, error } = await supabase
    .from("processing_jobs")
    .select("status, derivation_version")
    .eq("match_id", matchId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) return { analysis: null, error };
  if (!data) return { analysis: null, error: null };
  const row = data as { status: string; derivation_version: string | null };
  const status = resolveAnalysisStatus(row.status, row.derivation_version);
  return { analysis: status ? { status } : null, error: null };
}

async function eventContextFor(
  supabase: Supabase,
  entryId: string,
): Promise<MatchEventContext | null> {
  const { data } = await supabase
    .from("program_event_entries")
    .select(
      "slot, discipline, event:program_events(id, name, kind, starts_on, ends_on, site, surface, format)",
    )
    .eq("id", entryId)
    .maybeSingle();
  const row = data as {
    slot: string | null;
    discipline: string;
    event: {
      id: string;
      name: string;
      kind: "dual" | "tournament";
      starts_on: string;
      ends_on: string;
      site: string;
      surface: string | null;
      format: MatchEventContext["format"];
    } | null;
  } | null;
  if (!row?.event) return null;
  return {
    eventId: row.event.id,
    eventName: row.event.name,
    eventKind: row.event.kind,
    slot: row.slot,
    discipline: row.discipline,
    startsOn: row.event.starts_on,
    endsOn: row.event.ends_on,
    site: row.event.site,
    surface: row.event.surface,
    format: row.event.format,
  };
}

async function loadOwnMatch(
  supabase: Supabase,
  matchId: string,
  userId: string,
) {
  return supabase
    .from("matches")
    .select(MATCH_COLUMNS)
    .eq("id", matchId)
    .eq("created_by", userId)
    .maybeSingle();
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  if (!isUuid(matchId)) return notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { data, error } = await loadOwnMatch(supabase, matchId, user.id);
  if (error) {
    return serverError(
      "GET /api/matches/[matchId]: failed to load match",
      error,
      "Could not load the match",
    );
  }
  if (!data) return notFound();
  const match = data as unknown as MatchRow;

  // Attaching needs a team match that isn't on a line yet, in the workspace
  // being viewed, by someone the events policy lets run the schedule. The
  // database re-checks all of it (`attach_match_to_event_line`).
  const attachable = !!match.program_id && !match.event_entry_id;
  const [analysisRead, event, workspace] = await Promise.all([
    analysisFor(supabase, matchId),
    match.event_entry_id
      ? eventContextFor(supabase, match.event_entry_id)
      : Promise.resolve(null),
    attachable ? getWorkspaceContext() : Promise.resolve(null),
  ]);
  if (analysisRead.error) {
    return serverError(
      "GET /api/matches/[matchId]: failed to load analysis status",
      analysisRead.error,
      "Could not load the match",
    );
  }
  const { analysis } = analysisRead;

  const active = workspace?.active;
  const canAttach =
    attachable &&
    active?.kind === "team" &&
    active.id === match.program_id &&
    canManageTeamSchedule(active);

  return NextResponse.json({ match, analysis, event, canAttach });
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  if (!isUuid(matchId)) return notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  // Valid JSON is not enough: `null`, `42`, `"x"` and `[]` all parse, and
  // `normalizeMatchPatch` reads the body with `key in body`, which throws on
  // a primitive. Only an object literal is a patch.
  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return badRequest("Invalid JSON body");
  }
  if (!isPlainObject(body)) return badRequest("Invalid JSON body");

  // The analysis read is harmless for a match that turns out not to be ours
  // (it returns nothing), so it runs beside the ownership lookup.
  const [{ data: existing, error: lookupError }, analysisRead] =
    await Promise.all([
      loadOwnMatch(supabase, matchId, user.id),
      analysisFor(supabase, matchId),
    ]);
  if (lookupError) {
    return serverError(
      "PATCH /api/matches/[matchId]: failed to load match",
      lookupError,
      "Could not load the match",
    );
  }
  if (!existing) return notFound();
  if (analysisRead.error) {
    return serverError(
      "PATCH /api/matches/[matchId]: failed to load analysis status",
      analysisRead.error,
      "Could not load the match",
    );
  }
  const { analysis } = analysisRead;
  const stored = existing as unknown as MatchRow;

  const result = normalizeMatchPatch(body, {
    score: stored.score,
    format: stored.format,
    linked: stored.event_entry_id !== null,
    analyzed: analysis !== null || stored.source_provider !== null,
    teamMatch: stored.program_id !== null,
    matchType: (stored.match_type as string | null) ?? null,
    round: (stored.round as string | null) ?? null,
  });
  if (!result.ok) return badRequest(result.error, result.field);

  const update = result.update;

  // A roster pick: the id must be a player on this program's roster, and the
  // name comes from that row — a client-sent name never labels someone else.
  if (typeof update.player1_id === "string") {
    if (update.player1_id === stored.player1_id) {
      delete update.player1_id;
    } else {
      const { data: rows, error: rosterError } = await supabase.rpc(
        "program_roster_full",
        { p_program_id: stored.program_id },
      );
      // A failed roster read is not an off-roster pick: answering "Choose a
      // player…" would blame the user for our outage.
      if (rosterError) {
        return serverError(
          "PATCH /api/matches/[matchId]: failed to load roster",
          rosterError,
          "Could not load the roster",
        );
      }
      const pick = rosterPlayerOptions((rows ?? []) as RosterFullRow[]).find(
        (option) => option.playerId === update.player1_id,
      );
      let ownName: string | null = null;
      if (!pick) {
        const { data: own } = await supabase
          .from("program_players")
          .select("first_name, last_name")
          .eq("id", update.player1_id)
          .eq("program_id", stored.program_id as string)
          .eq("claimed_by_user_id", user.id)
          .is("archived_at", null)
          .is("merged_into_id", null)
          .maybeSingle();
        const row = own as { first_name: string; last_name: string } | null;
        if (row) ownName = `${row.first_name} ${row.last_name}`.trim();
      }
      if (!pick && !ownName) {
        return badRequest(
          "Choose a player on this team's roster.",
          "player1_id",
        );
      }
      update.player1_name = pick ? pick.name : ownName;
    }
  }
  if (BETA_FORCE_PRIVATE) update.private = true;

  const { data, error } = await supabase
    .from("matches")
    .update(update)
    .eq("id", matchId)
    .eq("created_by", user.id)
    .select(MATCH_COLUMNS)
    .maybeSingle();

  if (error) {
    return serverError(
      "PATCH /api/matches/[matchId]: failed to save match",
      error,
      "Could not save the match",
    );
  }
  if (!data) return notFound();

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/matches");
  revalidatePath(`/dashboard/matches/${matchId}`);

  return NextResponse.json({ match: data });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ matchId: string }> },
) {
  const { matchId } = await params;
  if (!isUuid(matchId)) return notFound();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return unauthorized();

  const { data: existing, error: lookupError } = await supabase
    .from("matches")
    .select("id")
    .eq("id", matchId)
    .eq("created_by", user.id)
    .maybeSingle();

  if (lookupError) {
    return serverError(
      "DELETE /api/matches/[matchId]: failed to load match",
      lookupError,
      "Could not load the match",
    );
  }
  if (!existing) return notFound();

  // Storage first, then the row. The ordering is load-bearing and the reason
  // this is a function call rather than a foreign-key cascade — see
  // purgeMatchStorage().
  //
  // A refusal maps by kind, never by forwarding `error.message`: the console
  // guard is a 409 with its fixed sentence, and everything else — the guard
  // unreadable, or any other throw — is a retryable 503.
  try {
    await purgeMatchStorage(supabase, [matchId]);
  } catch (error) {
    if (error instanceof PurgeRefusedError && error.kind === "protected") {
      return NextResponse.json(
        { error: PURGE_PROTECTED_MESSAGE },
        { status: 409 },
      );
    }
    console.error(
      "DELETE /api/matches/[matchId]: storage purge unavailable",
      error instanceof PurgeRefusedError ? (error.cause ?? error) : error,
    );
    return NextResponse.json(
      { error: PURGE_UNAVAILABLE_MESSAGE },
      { status: 503 },
    );
  }

  const { error: deleteError } = await supabase
    .from("matches")
    .delete()
    .eq("id", matchId)
    .eq("created_by", user.id);

  if (deleteError) {
    // The 409 and 503 refusals above take no claim (the claim RPC answers
    // false, or fails, before its insert), so only this failed-delete branch
    // releases. The id is the one the `created_by = user.id` lookup already
    // admitted, never a body field. See `releaseStoragePurgeClaims` for why this matters.
    await releaseStoragePurgeClaims(
      createAdminClient(),
      [matchId],
      "match delete",
    );
    return serverError(
      "DELETE /api/matches/[matchId]: failed to delete match",
      deleteError,
      "Could not delete the match",
    );
  }

  revalidatePath("/dashboard");
  revalidatePath("/dashboard/matches");

  return NextResponse.json({ ok: true });
}
