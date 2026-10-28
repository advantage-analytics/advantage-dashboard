/**
 * Two reads the label pages make beside `labels-server.ts`'s own, kept apart
 * so that file's loaders stay what the console needs to label:
 *
 * - `getLabelUploadInfo`: what the uploader entered in the upload wizard for
 *   one session's match — the inputs the derivation was run with. A labeller
 *   reads them to tell a wrong label from a wrong input: the players the
 *   other way round, the wrong scoring, a trim that cut the match short.
 * - `getLabelJobOwners`: whose match each job is — its program, the player
 *   on its near side and when it was played — which is how the Labels list
 *   groups its rows.
 *
 * Both re-check `requireAdmin` and read on the service role, as every admin
 * loader does. Neither throws for a missing row: a match whose program or
 * uploader is gone still lists, with that fact absent.
 */

import { isUuid } from "@/lib/admin/validation";
import { requireAdmin } from "@/lib/services/programs/admin-guard";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { readAllPages } from "@/lib/data/admin-range-read";
import {
  classifyFlags,
  type FlagCounts,
} from "@/lib/services/labels/job-groups";
import { PROGRAM_CRESTS_BUCKET } from "./teams-server";
import { USER_AVATARS_BUCKET } from "@/lib/user/avatar";

interface Dependencies {
  requireAdmin: () => Promise<{ id: string } | null>;
  createAdminClient: () => AdminClient;
}
const defaults: Dependencies = { requireAdmin, createAdminClient };

/* -------------------------------------------------------------------------
 * One match's upload inputs
 * ---------------------------------------------------------------------- */

export interface LabelUploadInfo {
  /** `matches.date`, ISO. */
  playedAt: string | null;
  /** `matches.tournament_name`: the event or dual the wizard named. */
  event: string | null;
  round: string | null;
  matchType: string | null;
  courtType: string | null;
  /** Sets to win the match as entered (`format.best_of`); null when unset. */
  bestOf: number | null;
  /** The scoring the job was RUN with, else the match's own format. */
  adScoring: boolean | null;
  playOnLets: boolean | null;
  /** The score as typed, p1 first: "4–6, 6–0, 5–2". */
  enteredScore: string | null;
  /** Raw wizard values ("right", "two-handed"); null when not entered. */
  player1: { hand: string | null; backhand: string | null };
  player2: { hand: string | null; backhand: string | null };
  /** Whether the camera stays put for the whole video. */
  fixedCamera: boolean | null;
  /**
   * Whether player 1 starts on the far (top) side of the frame. The one input
   * that, wrong, credits every stroke to the other player.
   */
  topPlayerIsPlayer1: boolean | null;
  /** The analysed window of the video, in seconds. */
  trim: { start: number | null; end: number | null };
  submittedAt: string | null;
  analysedAt: string | null;
  /** The uploader's name, else their email. */
  uploadedBy: string | null;
  /** "Dartmouth College · Women's", or null for a personal match. */
  program: string | null;
  /** The program's uploaded crest, as a public URL; null with none. */
  programCrestUrl: string | null;
  /** The vendor run's own confidence grade ("low", "medium", "high"). */
  confidence: string | null;
}

interface DbUploadMatch {
  date: string | null;
  tournament_name: string | null;
  round: string | null;
  match_type: string | null;
  court_type: string | null;
  format: unknown;
  score: unknown;
  player_hand: string | null;
  player_backhand: string | null;
  opponent_hand: string | null;
  opponent_backhand: string | null;
  fixed_camera: boolean | null;
  initial_top_player_is_player1: boolean | null;
  program_id: string | null;
  created_by: string | null;
}
interface DbUploadJob {
  ad_scoring: boolean | null;
  fixed_camera: boolean | null;
  initial_top_player_is_player1: boolean | null;
  start_time_seconds: number | null;
  end_time_seconds: number | null;
  submitted_at: string | null;
  completed_at: string | null;
  created_by: string | null;
  derivation_confidence: string | null;
}

const asRecord = (value: unknown): Record<string, unknown> | null =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;

const numbers = (value: unknown): number[] =>
  Array.isArray(value)
    ? value.filter((n): n is number => typeof n === "number")
    : [];

/** `matches.score` as "4–6, 6–0": null when no set was entered. */
export function formatEnteredScore(score: unknown): string | null {
  const record = asRecord(score);
  if (!record) return null;
  const p1 = numbers(record.player1);
  const p2 = numbers(record.player2);
  const sets = Math.max(p1.length, p2.length);
  if (sets === 0) return null;
  return Array.from(
    { length: sets },
    (_, i) => `${p1[i] ?? 0}–${p2[i] ?? 0}`,
  ).join(", ");
}

/** "Dartmouth College · Women's": the program as the list names it. */
export function programLabel(program: {
  school_name: string | null;
  team: string | null;
}): string | null {
  if (!program.school_name) return null;
  const team =
    program.team === "womens"
      ? "Women’s"
      : program.team === "mens"
        ? "Men’s"
        : null;
  return team ? `${program.school_name} · ${team}` : program.school_name;
}

function personLabel(
  user: {
    first_name: string | null;
    last_name: string | null;
    email: string | null;
  } | null,
): string | null {
  if (!user) return null;
  const name = [user.first_name, user.last_name].filter(Boolean).join(" ");
  return name || user.email;
}

/**
 * What the uploader entered for the match behind `sessionId`, or null when
 * the viewer is not an admin, the id is malformed, or there is no such
 * session or match.
 */
export async function getLabelUploadInfo(
  sessionId: string,
  deps: Dependencies = defaults,
): Promise<LabelUploadInfo | null> {
  const viewer = await deps.requireAdmin();
  if (!viewer || !isUuid(sessionId)) return null;
  const db = deps.createAdminClient();

  const { data: session } = await db
    .from("label_sessions")
    .select("match_id, job_id")
    .eq("id", sessionId)
    // A player's self review shares the table; the console never opens one.
    .eq("kind", "analyst")
    .maybeSingle<{ match_id: string; job_id: string | null }>();
  if (!session) return null;

  const [{ data: match }, { data: job }] = await Promise.all([
    db
      .from("matches")
      .select(
        "date, tournament_name, round, match_type, court_type, format, score, player_hand, player_backhand, opponent_hand, opponent_backhand, fixed_camera, initial_top_player_is_player1, program_id, created_by",
      )
      .eq("id", session.match_id)
      .maybeSingle<DbUploadMatch>(),
    session.job_id
      ? db
          .from("processing_jobs")
          .select(
            "ad_scoring, fixed_camera, initial_top_player_is_player1, start_time_seconds, end_time_seconds, submitted_at, completed_at, created_by, derivation_confidence",
          )
          .eq("id", session.job_id)
          .maybeSingle<DbUploadJob>()
      : Promise.resolve({ data: null }),
  ]);
  if (!match) return null;

  const uploaderId = job?.created_by ?? match.created_by;
  const [{ data: uploader }, { data: program }] = await Promise.all([
    uploaderId
      ? db
          .from("users")
          .select("first_name, last_name, email")
          .eq("id", uploaderId)
          .maybeSingle<{
            first_name: string | null;
            last_name: string | null;
            email: string | null;
          }>()
      : Promise.resolve({ data: null }),
    match.program_id
      ? db
          .from("programs")
          .select("school_name, team, crest_path")
          .eq("id", match.program_id)
          .maybeSingle<{
            school_name: string | null;
            team: string | null;
            crest_path: string | null;
          }>()
      : Promise.resolve({ data: null }),
  ]);

  const format = asRecord(match.format);
  const flag = (value: unknown) => (typeof value === "boolean" ? value : null);
  return {
    playedAt: match.date,
    event: match.tournament_name,
    round: match.round,
    matchType: match.match_type,
    courtType: match.court_type,
    bestOf: typeof format?.best_of === "number" ? format.best_of : null,
    // The job's value is the one the derivation ran with.
    adScoring: job?.ad_scoring ?? flag(format?.ad_scoring),
    playOnLets: flag(format?.play_on_lets),
    enteredScore: formatEnteredScore(match.score),
    player1: { hand: match.player_hand, backhand: match.player_backhand },
    player2: { hand: match.opponent_hand, backhand: match.opponent_backhand },
    fixedCamera: job?.fixed_camera ?? match.fixed_camera,
    topPlayerIsPlayer1:
      job?.initial_top_player_is_player1 ?? match.initial_top_player_is_player1,
    trim: {
      start: job?.start_time_seconds ?? null,
      end: job?.end_time_seconds ?? null,
    },
    submittedAt: job?.submitted_at ?? null,
    analysedAt: job?.completed_at ?? null,
    uploadedBy: personLabel(uploader ?? null),
    program: program ? programLabel(program) : null,
    // The bucket is public and the URL a function of the key (teams-server.ts).
    programCrestUrl: program?.crest_path
      ? db.storage.from(PROGRAM_CRESTS_BUCKET).getPublicUrl(program.crest_path)
          .data.publicUrl
      : null,
    confidence: job?.derivation_confidence ?? null,
  };
}

/* -------------------------------------------------------------------------
 * Whose match each job is, for the list
 * ---------------------------------------------------------------------- */

export interface LabelJobOwner {
  /** Null for a personal match. */
  programId: string | null;
  programName: string | null;
  /** The program's uploaded crest as a public URL; null with none. */
  programCrestUrl: string | null;
  /**
   * The near-side player's profile: `matches.player1_id` (a login or a
   * roster profile — both id spaces), else their name, so two matches of one
   * player group together even with no id.
   */
  playerKey: string;
  playerName: string;
  /** Their profile photo as a public URL (`playerPhotoUrls`); null with none. */
  playerPhotoUrl: string | null;
  opponentName: string;
  playedAt: string | null;
  event: string | null;
}

interface DbOwnerMatch {
  id: string;
  player1_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  date: string | null;
  tournament_name: string | null;
  program_id: string | null;
}

/** Each match's owner, by match id. Empty when the viewer is not an admin. */
export async function getLabelJobOwners(
  matchIds: readonly string[],
  deps: Dependencies = defaults,
): Promise<Map<string, LabelJobOwner>> {
  const owners = new Map<string, LabelJobOwner>();
  const ids = [...new Set(matchIds)].filter(isUuid);
  if (ids.length === 0) return owners;
  const viewer = await deps.requireAdmin();
  if (!viewer) return owners;
  const db = deps.createAdminClient();

  const { data: matches } = await db
    .from("matches")
    .select(
      "id, player1_id, player1_name, player2_name, date, tournament_name, program_id",
    )
    .in("id", ids)
    .returns<DbOwnerMatch[]>();
  const rows = matches ?? [];
  const programIds = [
    ...new Set(rows.map((m) => m.program_id).filter((id) => id !== null)),
  ];
  const { data: programs } = programIds.length
    ? await db
        .from("programs")
        .select("id, school_name, team, crest_path")
        .in("id", programIds)
        .returns<
          {
            id: string;
            school_name: string | null;
            team: string | null;
            crest_path: string | null;
          }[]
        >()
    : { data: [] };
  const programName = new Map(
    (programs ?? []).map((p) => [p.id, programLabel(p)]),
  );
  const programCrest = new Map(
    (programs ?? []).map((p) => [
      p.id,
      p.crest_path
        ? db.storage.from(PROGRAM_CRESTS_BUCKET).getPublicUrl(p.crest_path).data
            .publicUrl
        : null,
    ]),
  );

  const photos = await playerPhotoUrls(
    db,
    rows.map((m) => m.player1_id).filter((id) => id !== null),
  );

  for (const match of rows) {
    const playerName = match.player1_name ?? "Player 1";
    owners.set(match.id, {
      programId: match.program_id,
      programName: match.program_id
        ? (programName.get(match.program_id) ?? null)
        : null,
      programCrestUrl: match.program_id
        ? (programCrest.get(match.program_id) ?? null)
        : null,
      playerKey: match.player1_id ?? `name:${playerName.toLowerCase()}`,
      playerName,
      playerPhotoUrl: match.player1_id
        ? (photos.get(match.player1_id) ?? null)
        : null,
      opponentName: match.player2_name ?? "Player 2",
      playedAt: match.date,
      event: match.tournament_name,
    });
  }
  return owners;
}

/**
 * Profile photos for player ids in either of `matches.player1_id`'s id
 * spaces: a login (`users.avatar_path`), or a roster profile whose claimed
 * account has one. Ids with no photo are left out.
 */
async function playerPhotoUrls(
  db: AdminClient,
  playerIds: readonly string[],
): Promise<Map<string, string>> {
  const ids = [...new Set(playerIds)].filter(isUuid);
  const photos = new Map<string, string>();
  if (ids.length === 0) return photos;
  const { data: roster } = await db
    .from("program_players")
    .select("id, claimed_by_user_id")
    .in("id", ids)
    .returns<{ id: string; claimed_by_user_id: string | null }[]>();
  const accountOf = new Map<string, string>(ids.map((id) => [id, id]));
  for (const row of roster ?? []) {
    if (row.claimed_by_user_id) accountOf.set(row.id, row.claimed_by_user_id);
    else accountOf.delete(row.id);
  }
  const accounts = [...new Set(accountOf.values())];
  if (accounts.length === 0) return photos;
  const { data: users } = await db
    .from("users")
    .select("id, avatar_path")
    .in("id", accounts)
    .returns<{ id: string; avatar_path: string | null }[]>();
  const pathOf = new Map(
    (users ?? []).flatMap((u) =>
      u.avatar_path ? [[u.id, u.avatar_path]] : [],
    ),
  );
  for (const [playerId, account] of accountOf) {
    const path = pathOf.get(account);
    if (path) {
      photos.set(
        playerId,
        db.storage.from(USER_AVATARS_BUCKET).getPublicUrl(path).data.publicUrl,
      );
    }
  }
  return photos;
}

/* -------------------------------------------------------------------------
 * The flags each match's analysis raised, for the list
 * ---------------------------------------------------------------------- */

/**
 * Amber and grey flags per match, read off the flags the analysis stored on
 * each published point (`points.flags`) and sorted by `classifyFlags`. These
 * are the flags the analysis RAISED: what is still open in a session is the
 * console's to say, and reading it here would mean deriving every job's
 * vendor file on every visit to the list. A match whose labels are published
 * holds hand-labelled points, which carry none. Empty when the viewer is not
 * an admin.
 */
export async function getLabelJobFlagCounts(
  matchIds: readonly string[],
  deps: Dependencies = defaults,
): Promise<Map<string, FlagCounts>> {
  const counts = new Map<string, FlagCounts>();
  const ids = [...new Set(matchIds)].filter(isUuid);
  if (ids.length === 0) return counts;
  const viewer = await deps.requireAdmin();
  if (!viewer) return counts;
  const db = deps.createAdminClient();
  const rows = await readAllPages<{ match_id: string; flags: unknown }>(
    db.from("points").select("match_id, flags").in("match_id", ids).order("id"),
    "Could not read the matches' flags",
  );
  const byMatch = new Map<string, string[][]>();
  for (const row of rows) {
    if (!Array.isArray(row.flags) || row.flags.length === 0) continue;
    const list = byMatch.get(row.match_id) ?? [];
    list.push(row.flags.filter((f): f is string => typeof f === "string"));
    byMatch.set(row.match_id, list);
  }
  for (const id of ids) counts.set(id, classifyFlags(byMatch.get(id) ?? []));
  return counts;
}
