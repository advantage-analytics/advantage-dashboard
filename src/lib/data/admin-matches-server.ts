import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { isFresh, loadNavSeen, type SeenState } from "@/lib/admin/seen-server";
import { UUID_RE } from "@/lib/admin/validation";
import { readAllPages } from "@/lib/data/admin-range-read";
import {
  DEFAULT_BANDS,
  rowToBandSettings,
  type BandSettings,
  type BandSettingsDbRow,
} from "@/lib/data/viz-bands";
import { BAND_COLUMNS } from "@/lib/data/viz-bands-write";
import { loadMatchDetail } from "@/lib/data/match-detail-server";
import {
  analysisFor,
  loadMatchAnalysis,
} from "@/lib/data/match-analysis-server";
import {
  isAnalysisFailed,
  isInFlight,
  matchListGroup,
  withStatsPublished,
  type MatchAnalysis,
} from "@/lib/data/match-analysis";
import { scoreWinner, type MatchScore } from "@/lib/data/match-utils";
import {
  verificationFor,
  type MatchVerification,
} from "@/lib/data/match-verification";
import { programDisplayName } from "@/lib/data/programs-server";
import { PROGRAM_CRESTS_BUCKET } from "@/lib/data/teams-server";
import { getMatchViews30d } from "@/lib/services/posthog/match-views-server";
import { playedSets, type ScoreLineSet } from "@/lib/ui/score-format";

/**
 * Admin › Matches — every match on Advantage, personal and team, through the
 * service-role client. Every export re-runs `requireAdminOrNotFound()` (or is
 * handed an admin id by a caller that did), as every admin loader does.
 *
 * ## When a match was "uploaded"
 *
 * `matches` has no `created_at`. The moment a match arrived is the earliest of
 * what its upload left behind: its first `processing_jobs.created_at` (a
 * video) or its `match_files.uploaded_at` (a SwingVision import). An admin
 * console entry leaves one of those too — its own submission ledger,
 * `admin_upload_submission_items`, is private even to the service role. A match
 * with none of those — a hand-scored one, or a legacy import whose file row
 * is gone — falls back to when its statistics were written
 * (`match_stats.created_at`), which is when the import ran. A match with none
 * of the three has no known moment and prints "—"; it sorts last, by its match
 * day.
 */

/** The newest this many matches are loaded; the page says so past it. */
export const ADMIN_MATCHES_CAP = 2000;

/** The page's filter buckets — the view pills. */
export type AdminMatchBucket = "uploading" | "analyzing" | "failed" | "settled";

export type AdminMatchWorkspace =
  | {
      kind: "team";
      programId: string;
      name: string;
      crestUrl: string | null;
      shortCode: string | null;
    }
  | { kind: "personal" };

export interface AdminMatchRow {
  id: string;
  /** The uploader's side ("Player"), then the other. */
  player: string;
  opponent: string;
  /** From the player's seat; null when the score does not decide it. */
  won: boolean | null;
  /** Played sets, player-first. Empty while there is no score yet. */
  sets: ScoreLineSet[];
  workspace: AdminMatchWorkspace;
  /** `matches.tournament_name`, or null. */
  event: string | null;
  /** ISO moment, or null when nothing recorded one (see the file header). */
  uploadedAt: string | null;
  /** Pageviews over 30 days, admins excluded; null when unmeasured. */
  views: number | null;
  analysis: MatchAnalysis;
  verification: MatchVerification | null;
  bucket: AdminMatchBucket;
  /** New since this admin last looked. */
  fresh: boolean;
  /** The label console for this match, or the Labels list, or null. */
  labelHref: string | null;
}

export interface AdminMatchesResult {
  rows: AdminMatchRow[];
  /** Every match on Advantage, which may exceed `rows.length` past the cap. */
  total: number;
  /** False when PostHog is unconfigured or did not answer. */
  viewsMeasured: boolean;
}

interface DbListMatch {
  id: string;
  player1_id: string | null;
  player2_id: string | null;
  player1_name: string | null;
  player2_name: string | null;
  created_by: string | null;
  program_id: string | null;
  tournament_name: string | null;
  date: string | null;
  score: MatchScore | null;
  source_provider: string | null;
  verified: boolean | null;
  verified_at: string | null;
}

const LIST_COLUMNS =
  "id, player1_id, player2_id, player1_name, player2_name, created_by, program_id, tournament_name, date, score, source_provider, verified, verified_at";

/** The seen-store key for one match row. */
export function matchSeenKey(matchId: string): string {
  return `match:${matchId}`;
}

function chunks<T>(items: T[], size = 100): T[][] {
  const out: T[][] = [];
  for (let offset = 0; offset < items.length; offset += size) {
    out.push(items.slice(offset, offset + size));
  }
  return out;
}

/** `select … where key in ids`, chunked so the URL stays short. */
async function readByIds<T>(
  db: SupabaseClient,
  table: string,
  columns: string,
  key: string,
  ids: string[],
): Promise<T[]> {
  const unique = [...new Set(ids)];
  const pages = await Promise.all(
    chunks(unique).map((chunk) =>
      readAllPages<T>(
        db.from(table).select(columns).in(key, chunk).order(key).returns<T[]>(),
        `${table} read failed`,
      ),
    ),
  );
  return pages.flat();
}

function earlier(a: string | null | undefined, b: string | null | undefined) {
  if (!a) return b ?? null;
  if (!b) return a;
  return Date.parse(a) <= Date.parse(b) ? a : b;
}

/**
 * When each match was uploaded (file header), plus which have statistics —
 * the stats read answers both questions.
 */
async function uploadMoments(
  db: SupabaseClient,
  ids: string[],
): Promise<{ uploadedAt: Map<string, string>; withStats: Set<string> }> {
  const [jobs, files, stats] = await Promise.all([
    readByIds<{ match_id: string; created_at: string }>(
      db,
      "processing_jobs",
      "match_id, created_at",
      "match_id",
      ids,
    ),
    readByIds<{ match_id: string; uploaded_at: string | null }>(
      db,
      "match_files",
      "match_id, uploaded_at",
      "match_id",
      ids,
    ),
    readByIds<{ match_id: string; created_at: string | null }>(
      db,
      "match_stats",
      "match_id, created_at",
      "match_id",
      ids,
    ),
  ]);

  const primary = new Map<string, string>();
  const note = (id: string, at: string | null | undefined) => {
    const next = earlier(primary.get(id), at);
    if (next) primary.set(id, next);
  };
  for (const row of jobs) note(row.match_id, row.created_at);
  for (const row of files) note(row.match_id, row.uploaded_at);

  const statsAt = new Map<string, string>();
  const withStats = new Set<string>();
  for (const row of stats) {
    withStats.add(row.match_id);
    const next = earlier(statsAt.get(row.match_id), row.created_at);
    if (next) statsAt.set(row.match_id, next);
  }

  const uploadedAt = new Map(primary);
  for (const [id, at] of statsAt) {
    if (!uploadedAt.has(id)) uploadedAt.set(id, at);
  }
  return { uploadedAt, withStats };
}

/** Score sets as stored, player1-first. */
function storedSets(score: MatchScore | null): ScoreLineSet[] {
  const p1 = score?.player1 ?? [];
  const p2 = score?.player2 ?? [];
  const t1 = score?.player1_tiebreaks ?? [];
  const t2 = score?.player2_tiebreaks ?? [];
  return p1.map((games, i) => ({
    player1: games,
    player2: p2[i] ?? 0,
    player1Tiebreak: t1[i] ?? null,
    player2Tiebreak: t2[i] ?? null,
  }));
}

/**
 * Which seat is the "Player" on an admin row: the uploader's, when they sit
 * in seat two, else seat one — the seat every upload path writes the athlete
 * into (a personal player's own login, a program's roster player).
 */
function playerSeat(row: DbListMatch): "player1" | "player2" {
  return row.created_by && row.created_by === row.player2_id
    ? "player2"
    : "player1";
}

function bucketFor(analysis: MatchAnalysis): AdminMatchBucket {
  const { status } = analysis;
  if (status === "uploading" || status === "uploaded") return "uploading";
  if (isInFlight(status)) return "analyzing";
  if (matchListGroup(analysis) === "Failed") return "failed";
  return "settled";
}

/** Latest label session per match, an analyst's ahead of a player's own. */
async function labelSessions(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, string>> {
  const rows = await readByIds<{
    id: string;
    match_id: string;
    kind: string | null;
    created_at: string;
  }>(db, "label_sessions", "id, match_id, kind, created_at", "match_id", ids);
  const best = new Map<string, (typeof rows)[number]>();
  const rank = (kind: string | null) => (kind === "analyst" ? 1 : 0);
  for (const row of rows) {
    const held = best.get(row.match_id);
    if (
      !held ||
      rank(row.kind) > rank(held.kind) ||
      (rank(row.kind) === rank(held.kind) &&
        Date.parse(row.created_at) > Date.parse(held.created_at))
    ) {
      best.set(row.match_id, row);
    }
  }
  return new Map([...best].map(([matchId, row]) => [matchId, row.id]));
}

/**
 * Where "Open in Labels" goes: the match's label session when one exists;
 * the Labels list (where "Start labelling" lives) for an analysed video match
 * with none yet; nowhere for a match there is nothing to label on.
 */
function labelHrefFor(
  sessionId: string | undefined,
  sourceProvider: string | null,
  analysis: MatchAnalysis,
): string | null {
  if (sessionId) return `/admin/labels/${sessionId}`;
  if (
    sourceProvider === "splitstep" &&
    !isInFlight(analysis.status) &&
    !isAnalysisFailed(analysis.status) &&
    analysis.status !== "cancelled"
  ) {
    return "/admin/labels";
  }
  return null;
}

async function workspaces(
  db: SupabaseClient,
  programIds: string[],
): Promise<Map<string, AdminMatchWorkspace>> {
  const programs = await readByIds<{
    id: string;
    school_name: string | null;
    school_abbrev: string | null;
    team: string | null;
    crest_path: string | null;
  }>(
    db,
    "programs",
    "id, school_name, school_abbrev, team, crest_path",
    "id",
    programIds,
  );
  return new Map(
    programs.map((program) => [
      program.id,
      {
        kind: "team" as const,
        programId: program.id,
        name: programDisplayName(program.school_name ?? "Team", program.team),
        crestUrl: program.crest_path
          ? db.storage
              .from(PROGRAM_CRESTS_BUCKET)
              .getPublicUrl(program.crest_path).data.publicUrl
          : null,
        shortCode: program.school_abbrev,
      },
    ]),
  );
}

/** Analysis per match, chunked (the loader reads by `in`). Never reaps. */
async function analyses(
  db: SupabaseClient,
  ids: string[],
): Promise<Map<string, MatchAnalysis>> {
  const maps = await Promise.all(
    chunks(ids).map((chunk) => loadMatchAnalysis(db, chunk)),
  );
  return new Map(maps.flatMap((map) => [...map]));
}

function compareRows(
  a: { uploadedAt: string | null; date: string | null; id: string },
  b: { uploadedAt: string | null; date: string | null; id: string },
): number {
  if (a.uploadedAt && b.uploadedAt) {
    const diff = Date.parse(b.uploadedAt) - Date.parse(a.uploadedAt);
    if (diff !== 0) return diff;
  } else if (a.uploadedAt) return -1;
  else if (b.uploadedAt) return 1;
  const day = (b.date ?? "").localeCompare(a.date ?? "");
  return day !== 0 ? day : b.id.localeCompare(a.id);
}

/**
 * Every match, newest upload first, with the admin's New marks. `seen` comes
 * from the page's one `lookAtSurface(adminId, "matches")`.
 */
export async function listAdminMatches(
  seen: SeenState,
): Promise<AdminMatchesResult> {
  await requireAdminOrNotFound();
  const db = createAdminClient();

  const [matches, views] = await Promise.all([
    readAllPages<DbListMatch>(
      db
        .from("matches")
        .select(LIST_COLUMNS)
        .order("id")
        .returns<DbListMatch[]>(),
      "matches read failed",
    ),
    getMatchViews30d(),
  ]);
  const ids = matches.map((m) => m.id);

  const [moments, jobAnalysis, programMap, sessions] = await Promise.all([
    uploadMoments(db, ids),
    analyses(db, ids),
    workspaces(
      db,
      matches.flatMap((m) => (m.program_id ? [m.program_id] : [])),
    ),
    labelSessions(db, ids),
  ]);

  const ordered = matches
    .map((m) => ({ m, uploadedAt: moments.uploadedAt.get(m.id) ?? null }))
    .sort((a, b) =>
      compareRows(
        { uploadedAt: a.uploadedAt, date: a.m.date, id: a.m.id },
        { uploadedAt: b.uploadedAt, date: b.m.date, id: b.m.id },
      ),
    )
    .slice(0, ADMIN_MATCHES_CAP);

  const rows = ordered.map(({ m, uploadedAt }): AdminMatchRow => {
    const seat = playerSeat(m);
    const sets = playedSets(storedSets(m.score)).map((set) =>
      seat === "player1"
        ? set
        : {
            player1: set.player2,
            player2: set.player1,
            player1Tiebreak: set.player2Tiebreak ?? null,
            player2Tiebreak: set.player1Tiebreak ?? null,
          },
    );
    const winner = scoreWinner(m.score);
    const base = analysisFor(jobAnalysis, {
      id: m.id,
      sourceProvider: m.source_provider ?? undefined,
    });
    const analysis = {
      ...base,
      status: withStatsPublished(base.status, moments.withStats.has(m.id)),
    };
    const p1 = m.player1_name?.trim() || "Unknown player";
    const p2 = m.player2_name?.trim() || "Unknown opponent";
    return {
      id: m.id,
      player: seat === "player1" ? p1 : p2,
      opponent: seat === "player1" ? p2 : p1,
      won: winner === null ? null : winner === seat,
      sets,
      workspace:
        (m.program_id && programMap.get(m.program_id)) ||
        (m.program_id
          ? {
              kind: "team",
              programId: m.program_id,
              name: "Unavailable team",
              crestUrl: null,
              shortCode: null,
            }
          : { kind: "personal" }),
      event: m.tournament_name?.trim() || null,
      uploadedAt,
      views: views ? (views.get(m.id) ?? 0) : null,
      analysis,
      verification: verificationFor(m),
      bucket: bucketFor(analysis),
      fresh: isFresh(seen, matchSeenKey(m.id), uploadedAt),
      labelHref: labelHrefFor(sessions.get(m.id), m.source_provider, analysis),
    };
  });

  return { rows, total: matches.length, viewsMeasured: views !== null };
}

/**
 * The Matches tab's nav count: matches uploaded since this admin last opened
 * the page and not opened since. Read-only; never moves a watermark.
 */
export async function countNewMatchesForNav(adminId: string): Promise<number> {
  const seen = (await loadNavSeen(adminId)).matches;
  const db = createAdminClient();
  const since = seen.since;

  try {
    // Paged, so PostgREST's row cap can't truncate a long absence silently.
    type Row = { match_id: string | null };
    const [jobs, files, stats] = await Promise.all([
      readAllPages<Row>(
        db
          .from("processing_jobs")
          .select("match_id")
          .gt("created_at", since)
          .order("id")
          .returns<Row[]>(),
        "processing_jobs nav read failed",
      ),
      readAllPages<Row>(
        db
          .from("match_files")
          .select("match_id")
          .gt("uploaded_at", since)
          .order("id")
          .returns<Row[]>(),
        "match_files nav read failed",
      ),
      readAllPages<Row>(
        db
          .from("match_stats")
          .select("match_id")
          .gt("created_at", since)
          .order("match_id")
          .returns<Row[]>(),
        "match_stats nav read failed",
      ),
    ]);
    const candidates = [
      ...new Set(
        [...jobs, ...files, ...stats].flatMap((row) =>
          row.match_id ? [row.match_id] : [],
        ),
      ),
    ];
    if (!candidates.length) return 0;

    // A candidate counts only if its FIRST upload is new — a resubmitted job
    // on an old match is not a new match — and the match still exists.
    const [{ uploadedAt }, existing] = await Promise.all([
      uploadMoments(db, candidates),
      readByIds<{ id: string }>(db, "matches", "id", "id", candidates),
    ]);
    return existing.filter((row) =>
      isFresh(seen, matchSeenKey(row.id), uploadedAt.get(row.id) ?? null),
    ).length;
  } catch (cause) {
    console.error("[admin matches] nav count failed", {
      error: cause instanceof Error ? cause.message : String(cause),
    });
    return 0;
  }
}

// ── The admin report (/admin/matches/[matchId]) ──────────────────────────────

export interface AdminMatchReport {
  detail: NonNullable<Awaited<ReturnType<typeof loadMatchDetail>>>;
  /** The latest job's analysis, stats-published applied. */
  analysis: MatchAnalysis;
  workspace: AdminMatchWorkspace;
  labelHref: string | null;
  /**
   * The match's own visualization bands — its program's, or its owner's for
   * a personal match — so the admin sees the buckets the player sees.
   */
  bands: BandSettings;
}

/** `viz_band_settings` for one account; any miss or failure is the default. */
async function bandsFor(
  db: SupabaseClient,
  accountId: string | null,
): Promise<BandSettings> {
  if (!accountId) return DEFAULT_BANDS;
  const { data, error } = await db
    .from("viz_band_settings")
    .select(BAND_COLUMNS)
    .eq("account_id", accountId)
    .maybeSingle();
  if (error) {
    console.error("[admin matches] band settings read failed", {
      error: error.message,
    });
    return DEFAULT_BANDS;
  }
  return rowToBandSettings((data as BandSettingsDbRow | null) ?? null);
}

/**
 * The match report's data through the SERVICE-ROLE client, for an admin who
 * is in neither seat nor the program. Same loader as the dashboard
 * (`loadMatchDetail`, the seam `getMatchDetailData` wraps with the cookie
 * client), so the report cannot drift from what the player sees — oriented
 * from the uploader's seat, as the player's own view is, and without the KPI
 * history (that read is the viewer's own, through the cookie client).
 *
 * Read-only: no reap, no vendor reconcile. Null for an id that is not a
 * match. `cache()`d so the page and its metadata share one read.
 */
export const getAdminMatchReport = cache(async function getAdminMatchReport(
  matchId: string,
): Promise<AdminMatchReport | null> {
  await requireAdminOrNotFound();
  if (!UUID_RE.test(matchId)) return null;
  const db = createAdminClient();

  const { data: owner, error } = await db
    .from("matches")
    .select("created_by, program_id, source_provider")
    .eq("id", matchId)
    .maybeSingle();
  if (error) throw error;
  if (!owner) return null;
  const row = owner as {
    created_by: string | null;
    program_id: string | null;
    source_provider: string | null;
  };

  const [detail, jobs, programMap, sessions, bands] = await Promise.all([
    loadMatchDetail(db, matchId, {
      myPlayerIds: async () => (row.created_by ? [row.created_by] : []),
      kpiHistory: false,
    }),
    loadMatchAnalysis(db, [matchId]),
    workspaces(db, row.program_id ? [row.program_id] : []),
    labelSessions(db, [matchId]),
    bandsFor(db, row.program_id ?? row.created_by),
  ]);
  if (!detail) return null;

  const base = analysisFor(jobs, {
    id: matchId,
    sourceProvider: detail.match.sourceProvider,
  });
  const statsPublished = Boolean(
    detail.statsResult?.statistics?.player1Stats &&
    detail.statsResult?.statistics?.player2Stats,
  );
  const analysis = {
    ...base,
    status: withStatsPublished(base.status, statsPublished),
  };

  return {
    detail,
    analysis,
    workspace:
      (row.program_id && programMap.get(row.program_id)) ||
      (row.program_id
        ? {
            kind: "team",
            programId: row.program_id,
            name: "Unavailable team",
            crestUrl: null,
            shortCode: null,
          }
        : { kind: "personal" }),
    labelHref: labelHrefFor(
      sessions.get(matchId),
      row.source_provider,
      analysis,
    ),
    bands,
  };
});
