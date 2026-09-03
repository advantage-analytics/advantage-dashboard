"use server";

/**
 * Server actions behind the upload wizard's details step and its drafts.
 *
 * Every read here runs as the signed-in user through the server client, so
 * RLS answers "what may this person see" — nothing below restates a policy.
 * The staff-only reads (a program's schedule, an opponent's pooled roster)
 * additionally ask `isProgramStaff`, the same predicate the schedule's own
 * actions use, because a player may open the wizard and must not be offered
 * a line they cannot attach to (`matches_block_client_regraft`).
 *
 * Design: Upload Wizard v5 — 3d/7a (the schedule offer), 6b (your events),
 * 11a/11b (opponents), 11c (drafts), 11d (save to profile).
 */

import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { isProgramStaff } from "@/lib/workspace/types";
import { getProgramSchedule } from "@/lib/data/schedule-server";
import { headToHeadRows } from "@/lib/data/opponents-server";
import { normalizedPersonName } from "@/lib/data/person-name";
import type { EventSite } from "@/lib/schedule/types";
import type {
  LineOffer,
  MatchDraft,
} from "@/components/dashboard/matches/new-match-wizard/types";

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
  ids: string[]
): Promise<Map<string, { key: string; school: string }>> {
  const map = new Map<string, { key: string; school: string }>();
  if (ids.length === 0) return map;
  const { data } = await supabase
    .from("programs")
    .select("id, program_key, school_name")
    .in("id", ids);
  for (const row of (data ?? []) as { id: string; program_key: string; school_name: string }[]) {
    map.set(row.id, { key: row.program_key, school: row.school_name });
  }
  return map;
}

/**
 * Lines the schedule can offer for this file (design 3d): open singles lines
 * for the named player within two days of the file's date, in the active
 * program. Empty for a personal workspace, for a player, and when nothing is
 * close enough — an offer that has to be declined is worse than none.
 */
export async function findLineOffers(input: {
  date: string;
  playerUserId: string | null;
  playerName: string;
}): Promise<LineOffer[]> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") return [];
  if (!isProgramStaff(workspace.active)) return [];
  if (!input.date) return [];

  const schedule = await getProgramSchedule(workspace.active.id);
  const wanted = normalizedPersonName(input.playerName);
  const offers: (LineOffer & { distance: number })[] = [];
  const programIds = new Set<string>();

  for (const event of schedule.events) {
    const distance = Math.min(
      daysBetween(event.startsOn, input.date),
      daysBetween(event.endsOn, input.date)
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
        entry.playerLabels.some((label) => normalizedPersonName(label) === wanted);
      if (!byId && !byName) continue;

      // A line whose match already has video is somebody else's upload.
      const match = entry.matches[0] ?? null;
      if (match?.hasVideo) continue;

      if (entry.opponentProgramId) programIds.add(entry.opponentProgramId);
      offers.push({
        entryId: entry.id,
        matchId: match?.id ?? null,
        eventId: event.id,
        eventName: event.name,
        eventKind: event.kind,
        slot: entry.slot ?? match?.round ?? null,
        playerName: entry.playerLabels[0] ?? input.playerName,
        opponentName: (match?.opponentLabels ?? entry.opponentLabels)[0] ?? "",
        opponentProgramKey: entry.opponentProgramId ?? null,
        opponentSchool: entry.opponentSchool,
        date: event.startsOn,
        site: event.site,
        surface: event.surface,
        bestOf: event.format.bestOf,
        adScoring: event.format.adScoring,
        distance: inside ? 0 : distance,
      });
    }
  }

  const supabase = await createClient();
  const keys = await programKeysFor(supabase, [...programIds]);
  return offers
    .sort((a, b) => a.distance - b.distance)
    .map(({ distance: _distance, ...offer }) => ({
      ...offer,
      opponentProgramKey: offer.opponentProgramKey
        ? keys.get(offer.opponentProgramKey)?.key ?? null
        : null,
      opponentSchool:
        offer.opponentSchool ??
        (offer.opponentProgramKey ? keys.get(offer.opponentProgramKey)?.school ?? null : null),
    }));
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
export async function opponentsPlayed(): Promise<OpponentPlayed[]> {
  const workspace = await getWorkspaceContext();
  if (!workspace) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const query = supabase
    .from("matches")
    .select("player2_name, date, opponent_hand, opponent_backhand, opponent_player_id")
    .order("date", { ascending: false })
    .limit(400);
  const { data } =
    workspace.active.kind === "team"
      ? await query.eq("program_id", workspace.active.id)
      : await query.eq("created_by", user.id).is("program_id", null);

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
export async function yourEvents(): Promise<YourEvent[]> {
  const workspace = await getWorkspaceContext();
  if (!workspace) return [];
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return [];

  const query = supabase
    .from("matches")
    .select("tournament_name, date, match_type")
    .not("tournament_name", "is", null)
    .order("date", { ascending: false })
    .limit(400);
  const { data } =
    workspace.active.kind === "team"
      ? await query.eq("program_id", workspace.active.id)
      : await query.eq("created_by", user.id).is("program_id", null);

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
    byName.set(key, { name, years: "", matches: 1, kind, first: year, last: year });
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
}): Promise<OpponentRosterRow[]> {
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team") return [];
  if (!isProgramStaff(workspace.active)) return [];
  const supabase = await createClient();

  const { data: program } = await supabase
    .from("programs")
    .select("id")
    .eq("program_key", input.opponentProgramKey)
    .maybeSingle();
  const opponentProgramId = (program as { id: string } | null)?.id ?? null;
  if (!opponentProgramId || opponentProgramId === workspace.active.id) return [];

  const [{ data: rosterRows }, { data: matchRows }, { data: lineupRows }] =
    await Promise.all([
      supabase.rpc("pooled_roster", { p_program_id: opponentProgramId }),
      supabase
        .from("matches")
        .select("id, player2_name, opponent_player_id")
        .eq("program_id", workspace.active.id),
      supabase.rpc("pooled_lineups", { p_opponent_program_id: opponentProgramId }),
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
    if (line.program_id !== workspace.active.id) continue;
    if (!input.slot || line.slot !== input.slot) continue;
    for (const label of line.opponent_labels ?? []) heldNames.add(normalizedPersonName(label));
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
 * provenance for a roster player who has no profile of their own to read.
 */
export async function playerStyleFromMatches(input: {
  playerId: string | null;
  playerName: string;
}): Promise<{ hand: string | null; backhand: string | null } | null> {
  const workspace = await getWorkspaceContext();
  if (!workspace) return null;
  const supabase = await createClient();
  let query = supabase
    .from("matches")
    .select("player_hand, player_backhand")
    .order("date", { ascending: false })
    .limit(1);
  query =
    workspace.active.kind === "team"
      ? query.eq("program_id", workspace.active.id)
      : query;
  query = input.playerId
    ? query.eq("player1_id", input.playerId)
    : query.ilike("player1_name", input.playerName.trim());
  const { data } = await query.maybeSingle();
  const row = data as { player_hand: string | null; player_backhand: string | null } | null;
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
  draft: Omit<MatchDraft, "updatedAt">
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
        program_id: workspace.active.kind === "team" ? workspace.active.id : null,
        step: draft.step,
        step_index: draft.stepIndex,
        step_count: draft.stepCount,
        provider: draft.provider,
        file_name: draft.fileName,
        player_name: draft.formData.playerName || draft.preset?.playerName || null,
        event_label: eventLabel,
        payload: draft,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "id" }
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

/** One of the viewer's drafts, for resuming. Null when it is not theirs. */
export async function loadMatchDraft(id: string): Promise<MatchDraft | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("match_drafts")
    .select("payload, updated_at")
    .eq("id", id)
    .maybeSingle();
  const row = data as { payload: MatchDraft; updated_at: string } | null;
  if (!row) return null;
  return { ...row.payload, id, updatedAt: row.updated_at };
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
    .select("id, player_name, event_label, step_index, step_count, file_name, updated_at")
    .eq("user_id", user.id)
    .order("updated_at", { ascending: false });
  query = scope.programId
    ? query.eq("program_id", scope.programId)
    : query.is("program_id", null);
  const { data } = await query;
  return ((data ?? []) as {
    id: string;
    player_name: string | null;
    event_label: string | null;
    step_index: number;
    step_count: number;
    file_name: string | null;
    updated_at: string;
  }[]).map((row) => ({
    id: row.id,
    playerName: row.player_name,
    eventLabel: row.event_label,
    stepIndex: row.step_index,
    stepCount: row.step_count,
    fileName: row.file_name,
    updatedAt: row.updated_at,
  }));
}

export type { EventSite };
