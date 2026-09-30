"use server";

/**
 * Server actions behind the upload wizard's details step and its drafts.
 *
 * Dashboard reads use the signed-in session. Explicit console lookup scopes
 * re-authorize an admin before service reads of the selected program.
 * Opponent pool reads always retain the session and public-pool policies.
 * The staff-only reads (a program's schedule, an opponent's pooled roster)
 * additionally ask `canManageTeamSchedule`, the same predicate the schedule's
 * own actions use, because a player may open the wizard and must not be offered
 * a line they cannot attach to (`matches_block_client_regraft`).
 *
 * Design: Upload Wizard v5 — 3d/7a (the schedule offer), 6b (your events),
 * 11a/11b (opponents), 11c (drafts), 11d (save to profile).
 */

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import {
  resolveWizardLookupScope,
  readWizardSchedule,
  readWizardRosterIds,
  type WizardLookupScope,
} from "./lookup-scope-server";
import { headToHeadRows } from "@/lib/data/opponents-server";
import { normalizedPersonName } from "@/lib/data/person-name";
import type { EventEntry, EventSite, ProgramEvent } from "@/lib/schedule/types";
import { resolveEntryResult } from "@/lib/schedule/entry-state";
import {
  attachLineGroups,
  type AttachLine,
} from "@/lib/schedule/attach-line-state";
import { canonicalRosterIds } from "@/lib/data/roster-ids";
import type {
  LineOffer,
  MatchDraft,
} from "@/components/dashboard/matches/new-match-wizard/types";
import {
  DRAFT_TARGET_SELECT,
  draftTargetFromColumns,
  type DraftTargetColumns,
} from "@/lib/wizard/draft-target";

/** Days either side of the file's date a line still counts as "this match". */
const OFFER_WINDOW_DAYS = 2;

function daysBetween(a: string, b: string): number {
  const [ay, am, ad] = a.slice(0, 10).split("-").map(Number);
  const [by, bm, bd] = b.slice(0, 10).split("-").map(Number);
  const ms = Date.UTC(ay, am - 1, ad) - Date.UTC(by, bm - 1, bd);
  return Math.abs(ms) / 86_400_000;
}

/** `programs.program_key` and school name for a set of program ids. */
async function programKeysFor(
  supabase: Awaited<ReturnType<typeof createClient>>,
  ids: string[],
): Promise<Map<string, { key: string; school: string }>> {
  const map = new Map<string, { key: string; school: string }>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("programs")
    .select("id, program_key, school_name")
    .in("id", ids);
  for (const row of (data ?? []) as {
    id: string;
    program_key: string;
    school_name: string;
  }[]) {
    map.set(row.id, { key: row.program_key, school: row.school_name });
  }
  return map;
}

type Supabase = Awaited<ReturnType<typeof createClient>>;

/** One line as the wizard attaches it: what `attachLine` fills the form from. */
function offerFor(
  event: ProgramEvent,
  entry: EventEntry,
  match: EventEntry["matches"][number] | null,
  fallbackPlayerName: string,
  /** Days from the file's date — known to `findLineOffers`, not the picker. */
  daysFromFile?: number,
): LineOffer {
  return {
    entryId: entry.id,
    matchId: match?.id ?? null,
    eventId: event.id,
    eventName: event.name,
    eventKind: event.kind,
    slot: entry.slot ?? match?.round ?? null,
    playerName: entry.playerLabels[0] ?? fallbackPlayerName,
    opponentName: (match?.opponentLabels ?? entry.opponentLabels)[0] ?? "",
    // A program id until `withProgramKeys` swaps in the key.
    opponentProgramKey: entry.opponentProgramId ?? null,
    opponentSchool: entry.opponentSchool,
    date: event.startsOn,
    site: event.site,
    surface: event.surface,
    bestOf: event.format.bestOf,
    adScoring: event.format.adScoring,
    // Games only: the client compares them with the typed score, and tiebreak
    // points and `winner` are not part of that comparison.
    score: match?.score
      ? { player1: [...match.score.player1], player2: [...match.score.player2] }
      : null,
    ...(daysFromFile === undefined ? {} : { daysFromFile }),
  };
}

/** Swap each offer's opponent program id for its key, filling the school. */
async function withProgramKeys<T extends LineOffer>(
  supabase: Supabase,
  offers: T[],
): Promise<T[]> {
  const ids = [
    ...new Set(
      offers
        .map((offer) => offer.opponentProgramKey)
        .filter((id): id is string => id !== null),
    ),
  ];
  const keys = await programKeysFor(supabase, ids);
  return offers.map((offer) => ({
    ...offer,
    opponentProgramKey: offer.opponentProgramKey
      ? (keys.get(offer.opponentProgramKey)?.key ?? null)
      : null,
    opponentSchool:
      offer.opponentSchool ??
      (offer.opponentProgramKey
        ? (keys.get(offer.opponentProgramKey)?.school ?? null)
        : null),
  }));
}

/**
 * Lines the schedule can offer for this file (design 3d): open singles lines
 * for the named player within two days of the file's date, in the active
 * program. Empty for a personal workspace, for a player, and when nothing is
 * close enough — an offer that has to be declined is worse than none.
 *
 * This is the candidate list, not what the strip shows: the client filters it
 * further (`rankLineOffers`), keeping only lines whose opponent name or score
 * also matches what was typed. That filter runs in memory on every keystroke,
 * so this query takes no opponent or score and is re-asked only when the date
 * or the player changes.
 */
export async function findLineOffers(input: {
  date: string;
  playerUserId: string | null;
  playerName: string;
  scope?: WizardLookupScope;
}): Promise<LineOffer[]> {
  const scope = await resolveWizardLookupScope(input.scope);
  if (!scope?.programId || !scope.canReadSchedule) return [];
  if (!input.date) return [];

  const schedule = await readWizardSchedule(scope);
  const wanted = normalizedPersonName(input.playerName);
  const offers: LineOffer[] = [];

  for (const event of schedule.events) {
    const distance = Math.min(
      daysBetween(event.startsOn, input.date),
      daysBetween(event.endsOn, input.date),
    );
    const inside = input.date >= event.startsOn && input.date <= event.endsOn;
    if (!inside && distance > OFFER_WINDOW_DAYS) continue;

    for (const entry of schedule.entriesByEvent.get(event.id) ?? []) {
      if (entry.forfeit !== null || entry.discipline !== "singles") continue;
      const byId = input.playerUserId
        ? entry.playerUserIds.includes(input.playerUserId)
        : false;
      const byName =
        !byId &&
        wanted.length > 0 &&
        entry.playerLabels.some(
          (label) => normalizedPersonName(label) === wanted,
        );
      if (!byId && !byName) continue;

      // A line whose match already has video is somebody else's upload.
      const match = entry.matches[0] ?? null;
      if (match?.hasVideo) continue;
      // A saved outcome (a default, a withdrawal) answers the line with no
      // match to fill, and `guard_schedule_result` refuses a match beside it.
      const round = event.kind === "dual" ? null : (match?.round ?? null);
      if (resolveEntryResult(entry, round).kind === "non-played") continue;

      offers.push(
        offerFor(event, entry, match, input.playerName, inside ? 0 : distance),
      );
    }
  }

  const supabase = await createClient();
  const sorted = offers.sort(
    (a, b) => (a.daysFromFile ?? 0) - (b.daysFromFile ?? 0),
  );
  return withProgramKeys(supabase, sorted);
}

/** A picker row, carrying the offer `attachLine` fills the form from. */
export type UploadLine = AttachLine & { offer: LineOffer };

export type FindUploadLinesResult =
  | {
      ok: true;
      matchDate: string;
      suggested: UploadLine[];
      sameDay: UploadLine[];
      search: UploadLine[];
    }
  | { ok: false; error: string };

/**
 * The wizard's "Add to an event" — the Edit Match picker's groups, judged for a
 * match that does not exist yet: the file's date, round, format and player.
 * `mode: "upload"` keeps a scored-but-unfilmed line open, since the upload
 * fills that match (`handleCreateMatch` reuses `offer.matchId`).
 */
export async function findUploadLines(input: {
  /** YYYY-MM-DD. */
  date: string;
  round: string | null;
  player: { id: string | null; name: string };
  bestOf: number;
  adScoring: boolean | null;
  query?: string;
  scope?: WizardLookupScope;
}): Promise<FindUploadLinesResult> {
  const scope = await resolveWizardLookupScope(input.scope);
  if (!scope?.programId || !scope.canReadSchedule) {
    return {
      ok: false,
      error: "Only schedule staff can add a match to an event.",
    };
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.date)) {
    return { ok: false, error: "Set the match date first." };
  }

  const supabase = await createClient();
  const [schedule, roster] = await Promise.all([
    readWizardSchedule(scope),
    readWizardRosterIds(scope),
  ]);
  const groups = attachLineGroups({
    events: schedule.events,
    entriesByEvent: schedule.entriesByEvent,
    canonical: canonicalRosterIds(roster),
    query: input.query,
    mode: "upload",
    match: {
      date: input.date,
      round: input.round,
      player1Id: input.player.id,
      player1Name: input.player.name,
      bestOf: input.bestOf,
      adScoring: input.adScoring,
    },
  });

  const eventsById = new Map(schedule.events.map((e) => [e.id, e]));
  const entriesById = new Map(
    [...schedule.entriesByEvent.values()].flat().map((e) => [e.id, e]),
  );
  const attach = (lines: AttachLine[]) =>
    lines.map((line) => {
      const event = eventsById.get(line.eventId)!;
      const entry = entriesById.get(line.entryId)!;
      const match = line.existingMatchId
        ? (entry.matches.find((m) => m.id === line.existingMatchId) ?? null)
        : null;
      const offer = offerFor(event, entry, match, input.player.name);
      // A tournament entry takes the file's own round, not the slot, and keeps
      // the file's day when that day is inside the event. A dual is one day.
      return {
        ...line,
        offer:
          event.kind === "tournament"
            ? {
                ...offer,
                slot: line.round,
                date: line.sameDay ? input.date : offer.date,
              }
            : offer,
      };
    });
  const all = [
    ...attach(groups.suggested),
    ...attach(groups.sameDay),
    ...attach(groups.search),
  ];
  const keyed = await withProgramKeys(
    supabase,
    all.map((line) => line.offer),
  );
  const byEntry = new Map(keyed.map((offer) => [offer.entryId, offer]));
  const finish = (lines: UploadLine[]) =>
    lines.map((line) => ({ ...line, offer: byEntry.get(line.entryId)! }));
  const nSuggested = groups.suggested.length;
  const nSameDay = groups.sameDay.length;
  return {
    ok: true,
    matchDate: input.date,
    suggested: finish(all.slice(0, nSuggested)),
    sameDay: finish(all.slice(nSuggested, nSuggested + nSameDay)),
    search: finish(all.slice(nSuggested + nSameDay)),
  };
}

export interface OpponentPlayed {
  name: string;
  /** Matches in this workspace against them. */
  matches: number;
  /** YYYY-MM-DD of the most recent. */
  lastDate: string;
  /** Hand and backhand as recorded on that most recent match. */
  hand: string | null;
  backhand: string | null;
  /** Their pooled identity, when a match recorded one. */
  playerId: string | null;
}

/**
 * Everyone this workspace has played, most recent first (design 11a). A
 * personal workspace's opponents are private labels; a team's are the
 * program's own matches. Either way the same shape: name, volume, recency.
 */
export async function opponentsPlayed(
  inputScope?: WizardLookupScope,
): Promise<OpponentPlayed[]> {
  const scope = await resolveWizardLookupScope(inputScope);
  if (!scope) return [];
  const supabase = scope.client;

  const query = supabase
    .from("matches")
    .select(
      "player2_name, date, opponent_hand, opponent_backhand, opponent_player_id",
    )
    .order("date", { ascending: false })
    .limit(400);
  const { data } =
    scope.programId !== null
      ? await query.eq("program_id", scope.programId)
      : await query.eq("created_by", scope.actorId).is("program_id", null);

  const byName = new Map<string, OpponentPlayed>();
  for (const row of (data ?? []) as {
    player2_name: string | null;
    date: string;
    opponent_hand: string | null;
    opponent_backhand: string | null;
    opponent_player_id: string | null;
  }[]) {
    const name = (row.player2_name ?? "").trim();
    const key = normalizedPersonName(name);
    if (!key) continue;
    const existing = byName.get(key);
    if (existing) {
      existing.matches += 1;
      continue;
    }
    // Rows arrive newest first, so the first sighting is the latest match.
    byName.set(key, {
      name,
      matches: 1,
      lastDate: row.date.slice(0, 10),
      hand: row.opponent_hand,
      backhand: row.opponent_backhand,
      playerId: row.opponent_player_id,
    });
  }
  return [...byName.values()];
}

export interface YourEvent {
  name: string;
  /** "2025", or "2024–2025" when it spans years. */
  years: string;
  matches: number;
  kind: "tournament" | "dual" | "other";
}

/**
 * The events this workspace's matches already belong to (design 6b), for the
 * Event type-ahead. An event is a grouping in the library and nothing more.
 */
export async function yourEvents(
  inputScope?: WizardLookupScope,
): Promise<YourEvent[]> {
  const scope = await resolveWizardLookupScope(inputScope);
  if (!scope) return [];
  const supabase = scope.client;

  const query = supabase
    .from("matches")
    .select("tournament_name, date, match_type")
    .not("tournament_name", "is", null)
    .order("date", { ascending: false })
    .limit(400);
  const { data } =
    scope.programId !== null
      ? await query.eq("program_id", scope.programId)
      : await query.eq("created_by", scope.actorId).is("program_id", null);

  const byName = new Map<string, YourEvent & { first: number; last: number }>();
  for (const row of (data ?? []) as {
    tournament_name: string | null;
    date: string;
    match_type: string | null;
  }[]) {
    const name = (row.tournament_name ?? "").trim();
    if (!name) continue;
    const year = Number(row.date.slice(0, 4));
    const key = name.toLowerCase();
    const kind: YourEvent["kind"] =
      row.match_type === "Tournament"
        ? "tournament"
        : row.match_type === "Dual Match"
          ? "dual"
          : "other";
    const existing = byName.get(key);
    if (existing) {
      existing.matches += 1;
      existing.first = Math.min(existing.first, year);
      existing.last = Math.max(existing.last, year);
      continue;
    }
    byName.set(key, {
      name,
      years: "",
      matches: 1,
      kind,
      first: year,
      last: year,
    });
  }
  return [...byName.values()].map(({ first, last, ...event }) => ({
    ...event,
    years: first === last ? String(first) : `${first}–${last}`,
  }));
}

export interface OpponentRosterRow {
  playerId: string;
  name: string;
  classYear: string | null;
  /** Matches this program has recorded against them. */
  meetings: number;
  /** They held this very line against us before. */
  heldThisLine: boolean;
}

/**
 * The opponent program's roster for a dual line (design 11b): the players who
 * held this line against us first, the rest of the program after. Empty when
 * the pool has nothing for that program, which is a non-answer, not an error.
 */
export async function opponentRosterForLine(input: {
  opponentProgramKey: string;
  slot: string | null;
  scope?: WizardLookupScope;
}): Promise<OpponentRosterRow[]> {
  const scope = await resolveWizardLookupScope(input.scope);
  if (!scope?.programId || !scope.canReadSchedule) return [];
  // The opponent is not the admin's selected target. Keep pooled visibility.
  const supabase = await createClient();

  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("program_key", input.opponentProgramKey)
    .maybeSingle();
  const opponentProgramId = (program as { id: string } | null)?.id ?? null;
  if (!opponentProgramId || opponentProgramId === scope.programId) return [];

  const [{ data: rosterRows }, { data: matchRows }, { data: lineupRows }] =
    await Promise.all([
      supabase.rpc("pooled_roster", { p_program_id: opponentProgramId }),
      scope.client
        .from("matches")
        .select("id, player2_name, opponent_player_id")
        .eq("program_id", scope.programId),
      supabase.rpc("pooled_lineups", {
        p_opponent_program_id: opponentProgramId,
      }),
    ]);

  const matches = (matchRows ?? []) as {
    id: string;
    player2_name: string | null;
    opponent_player_id: string | null;
  }[];

  // Who held this slot against US, by the names our own lineups recorded.
  const heldNames = new Set<string>();
  for (const line of (lineupRows ?? []) as {
    program_id: string;
    slot: string | null;
    opponent_labels: string[] | null;
  }[]) {
    if (line.program_id !== scope.programId) continue;
    if (!input.slot || line.slot !== input.slot) continue;
    for (const label of line.opponent_labels ?? [])
      heldNames.add(normalizedPersonName(label));
  }

  return (
    (rosterRows ?? []) as {
      id: string;
      first_name: string;
      last_name: string;
      class_year: string | null;
      lineup_spot: number | null;
    }[]
  )
    .map((row) => {
      const name = `${row.first_name} ${row.last_name}`.trim();
      return {
        playerId: row.id,
        name,
        classYear: row.class_year,
        meetings: headToHeadRows(matches, [{ id: row.id, name }]).length,
        heldThisLine: heldNames.has(normalizedPersonName(name)),
        spot: row.lineup_spot,
      };
    })
    .sort((a, b) => {
      if (a.heldThisLine !== b.heldThisLine) return a.heldThisLine ? -1 : 1;
      if (a.spot === b.spot) return a.name.localeCompare(b.name);
      if (a.spot === null) return 1;
      if (b.spot === null) return -1;
      return a.spot - b.spot;
    })
    .map(({ spot: _spot, ...row }) => row);
}

/**
 * The player's hand and backhand as this program last recorded them — the
 * fallback for a roster player whose roster profile has no style saved.
 */
export async function playerStyleFromMatches(input: {
  playerId: string | null;
  playerName: string;
  scope?: WizardLookupScope;
}): Promise<{ hand: string | null; backhand: string | null } | null> {
  const scope = await resolveWizardLookupScope(input.scope);
  if (!scope) return null;
  const supabase = scope.client;
  let query = supabase
    .from("matches")
    .select("player_hand, player_backhand")
    // The newest match that recorded a style, not the newest match: one
    // saved without an answer would otherwise hide every older one that had
    // it. Same filter Edit match's suggestion uses.
    .or("player_hand.not.is.null,player_backhand.not.is.null")
    .order("date", { ascending: false })
    .limit(1);
  // Scoped like opponentsPlayed above: this workspace's matches, never a
  // row RLS happens to show from another program the viewer belongs to.
  query =
    scope.programId !== null
      ? query.eq("program_id", scope.programId)
      : query.eq("created_by", scope.actorId).is("program_id", null);
  query = input.playerId
    ? query.eq("player1_id", input.playerId)
    : query.ilike("player1_name", input.playerName.trim());
  const { data } = await query.maybeSingle();
  const row = data as {
    player_hand: string | null;
    player_backhand: string | null;
  } | null;
  if (!row || (!row.player_hand && !row.player_backhand)) return null;
  return { hand: row.player_hand, backhand: row.player_backhand };
}

/** "Save to your profile" — the uploader's own row, and only theirs (RLS). */
export async function saveMyStyle(input: {
  hand: "right" | "left" | undefined;
  backhand: "one-handed" | "two-handed" | undefined;
}): Promise<{ saved: boolean }> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return { saved: false };
  const { error } = await supabase
    .from("users")
    .update({ hand: input.hand ?? null, backhand: input.backhand ?? null })
    .eq("id", user.id);
  return { saved: !error };
}

/** Save (or replace) a draft. Returns the row's id and timestamp. */
export async function saveMatchDraft(
  draft: Omit<MatchDraft, "updatedAt">,
): Promise<{ id: string; updatedAt: string } | null> {
  const workspace = await getWorkspaceContext();
  if (!workspace) return null;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;

  const eventLabel = draft.attachedLine
    ? `${draft.attachedLine.eventName}${draft.attachedLine.eventKind === "dual" ? " dual" : ""}${
        draft.attachedLine.slot ? ` · ${draft.attachedLine.slot}` : ""
      }`
    : draft.preset?.eventName
      ? `${draft.preset.eventName}${draft.preset.eventKind === "dual" ? " dual" : ""}${
          draft.preset.round ? ` · ${draft.preset.round}` : ""
        }`
      : draft.formData.eventName || null;

  const { data, error } = await supabase
    .from("match_drafts")
    .upsert(
      {
        id: draft.id,
        user_id: user.id,
        program_id:
          workspace.active.kind === "team" ? workspace.active.id : null,
        step: draft.step,
        step_index: draft.stepIndex,
        step_count: draft.stepCount,
        provider: draft.provider,
        file_name: draft.fileName,
        player_name:
          draft.formData.playerName || draft.preset?.playerName || null,
        event_label: eventLabel,
        payload: draft,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" },
    )
    .select("id, updated_at")
    .maybeSingle();
  if (error || !data) return null;
  const row = data as { id: string; updated_at: string };
  return { id: row.id, updatedAt: row.updated_at };
}

export async function deleteMatchDraft(id: string): Promise<void> {
  const supabase = await createClient();
  await supabase.from("match_drafts").delete().eq("id", id);
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Deletes every one of the signed-in user's drafts that target `matchId` —
 * a draft opened from a scored schedule line (`?entry=&match=`) or whose
 * details step accepted a line offer, per `draftTargetMatchId()`
 * (`src/lib/wizard/draft-target.ts`).
 *
 * `handleCreateMatch` calls this right after the match row write succeeds,
 * alongside the existing `deleteMatchDraft(draftId)`: that call only removes
 * the draft the wizard was resuming (`draftId`), which is null when the
 * wizard was opened straight from the schedule line. Without this, an
 * earlier "Save draft" for the same line survives the submit as a stale row.
 *
 * RLS (`(select auth.uid()) = user_id`) already scopes deletes to the
 * caller's own rows; the explicit `user_id` filter here matches
 * `listMatchDrafts`'s pattern rather than relying on RLS alone.
 */
export async function deleteMatchDraftsForMatch(
  matchId: string,
): Promise<void> {
  // `.or()` takes a raw PostgREST filter string, so the id is interpolated,
  // not bound. A match id is always a uuid; anything else is refused rather
  // than smuggled into the filter.
  if (!UUID_RE.test(matchId)) return;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return;
  await supabase
    .from("match_drafts")
    .delete()
    .eq("user_id", user.id)
    .or(
      `payload->preset->>matchId.eq.${matchId},payload->attachedLine->>matchId.eq.${matchId}`,
    );
}

/**
 * A draft as it comes back off the row, carrying the workspace it was saved
 * under alongside its payload.
 *
 * `program_id` is a COLUMN, not part of the jsonb payload — `saveMatchDraft`
 * writes it from `getWorkspaceContext()` at save time, so it cannot be
 * back-dated by anything the client later puts in `payload`. That is why it is
 * spread last below, and why the resume check reads this field rather than
 * anything inside the draft.
 */
export interface LoadedMatchDraft extends MatchDraft {
  /** The team workspace it was saved in, or null for a personal one. */
  programId: string | null;
}

/**
 * One of the viewer's drafts, for resuming. Null when it is not theirs.
 *
 * RLS (`(select auth.uid()) = user_id`) answers ownership, and ownership
 * alone: a draft the viewer saved in a program they have since left still
 * reads back here. Which workspace it belongs to is a separate question, and
 * `program_id` is what answers it — see `draftBelongsToWorkspace()`.
 */
export async function loadMatchDraft(
  id: string,
): Promise<LoadedMatchDraft | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("match_drafts")
    .select("payload, updated_at, program_id")
    .eq("id", id)
    .maybeSingle();
  const row = data as {
    payload: MatchDraft;
    updated_at: string;
    program_id: string | null;
  } | null;
  if (!row) return null;
  return {
    ...row.payload,
    id,
    updatedAt: row.updated_at,
    programId: row.program_id,
  };
}

/** The drafts the Matches table lists at its top (design 11c). */
export interface DraftRow {
  id: string;
  playerName: string | null;
  eventLabel: string | null;
  stepIndex: number;
  stepCount: number;
  fileName: string | null;
  updatedAt: string;
  /**
   * The existing match this draft fills — `draftTargetMatchId()` over the
   * stored payload — or null for a draft that will create one. The Matches
   * table folds such a draft onto that match (`foldDrafts()`) instead of
   * listing one court twice.
   */
  matchId: string | null;
}

export async function listMatchDrafts(scope: {
  programId: string | null;
}): Promise<DraftRow[]> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];
  let query = supabase
    .from("match_drafts")
    .select(
      // Two JSON paths, not the whole payload: the list needs one id out of
      // it, and the payload carries every answer the wizard holds.
      `id, player_name, event_label, step_index, step_count, file_name, updated_at, ${DRAFT_TARGET_SELECT}`,
    )
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  query = scope.programId
    ? query.eq("program_id", scope.programId)
    : query.is("program_id", null);
  const { data } = await query;
  const drafts: DraftRow[] = (
    (data ?? []) as unknown as ({
      id: string;
      player_name: string | null;
      event_label: string | null;
      step_index: number;
      step_count: number;
      file_name: string | null;
      updated_at: string;
    } & DraftTargetColumns)[]
  ).map((row) => ({
    id: row.id,
    playerName: row.player_name,
    eventLabel: row.event_label,
    stepIndex: row.step_index,
    stepCount: row.step_count,
    fileName: row.file_name,
    updatedAt: row.updated_at,
    matchId: draftTargetFromColumns(row),
  }));

  // A draft whose match already has a video job is stale: the video went in
  // (the wizard submitted, then the draft outlived it), and resuming it would
  // start a second job for one court. Drop it here and reap the row.
  //
  // `processing_jobs` RLS is per-creator, so this only sees the viewer's own
  // jobs; the Matches table's `matchIdsWithJob` guard covers the rest from
  // the enriched analysis. A failed lookup keeps every draft rather than
  // failing the page.
  const targetIds = [
    ...new Set(drafts.flatMap((d) => (d.matchId ? [d.matchId] : []))),
  ];
  if (targetIds.length === 0) return drafts;
  const { data: jobs, error: jobsError } = await supabase
    .from("processing_jobs")
    .select("match_id")
    .in("match_id", targetIds);
  if (jobsError || !jobs?.length) return drafts;
  const withJob = new Set(
    (jobs as { match_id: string | null }[]).flatMap((j) =>
      j.match_id ? [j.match_id] : [],
    ),
  );
  const staleIds = drafts
    .filter((d) => d.matchId && withJob.has(d.matchId))
    .map((d) => d.id);
  if (staleIds.length === 0) return drafts;
  // Fire-and-forget, started now rather than in `after()`: the session client
  // reads cookies, which a Server Component's `after()` callback may not. A
  // delete that fails or is cut off leaves a row this same filter hides again
  // on the next visit, so nothing waits on it and nothing can fail the page.
  void supabase
    .from("match_drafts")
    .delete()
    .eq("user_id", user.id)
    .in("id", staleIds)
    .then(
      ({ error }) => {
        if (error)
          console.warn("[wizard] could not reap stale match drafts", { error });
      },
      (error: unknown) =>
        console.warn("[wizard] could not reap stale match drafts", { error }),
    );
  const stale = new Set(staleIds);
  return drafts.filter((d) => !stale.has(d.id));
}

export type { EventSite };
