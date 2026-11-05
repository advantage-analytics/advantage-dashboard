/**
 * Seed the eyes-on LABELLER account with one throwaway labelling session, so
 * /pr-check Stage 3b can open `/label` and `/label/[sessionId]` in a real
 * browser as a labeller — and remove exactly those rows again.
 *
 *   npx tsx scripts/eyes-on/seed-labeller-session.ts                    # dry run: print the rows
 *   npx tsx scripts/eyes-on/seed-labeller-session.ts --write            # write them
 *   npx tsx scripts/eyes-on/seed-labeller-session.ts --cleanup          # dry run: list what would go
 *   npx tsx scripts/eyes-on/seed-labeller-session.ts --cleanup --write  # delete them
 *
 * THIS WRITES TO WHATEVER PROJECT `.env.local` NAMES — normally production.
 * Nothing is written without `--write`.
 *
 * What it writes, all keyed to the `EYES_ON_LABELLER_EMAIL` account:
 *   - `users.is_labeller = true` on that account. The column has no client
 *     grant and a trigger refuses client writes, so only this service-role
 *     script (or an operator) can set it.
 *   - one personal-workspace `matches` row owned by it, marked
 *     `tournament_name = "Eyes-on seed · labeller"` (skipped when
 *     `EYES_ON_LABELLER_MATCH_ID` names an existing Eyes-on seed match);
 *   - one `label_sessions` row: `kind = 'analyst'`, `status = 'labelling'`,
 *     `assigned_to` = the account, and `job_id` NULL. No `processing_jobs`
 *     row is written at all: the console opens a jobless session (no video,
 *     no marks — `getLabelSession`), the one-open-session-per-job index never
 *     applies, no vendor sweep or cron can select it, and the admin board
 *     (which lists sessions by job) never shows it to a real admin;
 *   - five `label_points` (one unfinished game) and their `label_shots`.
 * Re-running `--write` resets the session to `labelling` and rewrites its
 * points and shots, so a session the account submitted opens fresh again.
 *
 * Refusals (nothing is touched): the configured match or session id is the
 * real Cj vs Suhail match/session; the session would sit on a match that is
 * not an Eyes-on seed; an existing row at a seed id belongs to someone else;
 * the labeller account is the verifier (`EYES_ON_EMAIL` — the failure-class
 * seed's cleanup works the verifier's marked matches and would collide) or an
 * admin (the console would render the admin view, not the labeller's).
 *
 * Cleanup deletes only sessions assigned to the labeller on Eyes-on seed
 * matches (points, shots and history cascade), then the matches this script
 * created (owner + exact marker). It refuses if another account's session
 * hangs off the seed match. `is_labeller` is left set: the account exists to
 * be a labeller.
 *
 * Environment (from the checkout's `.env.local` via scripts/lib/env.ts, never
 * printed): EYES_ON_LABELLER_EMAIL, NEXT_PUBLIC_SUPABASE_URL,
 * SUPABASE_SERVICE_ROLE_KEY; optional EYES_ON_LABELLER_SESSION_ID (the id to
 * write, else a deterministic one — printed either way, for capture.mjs's
 * `[sessionId]`), EYES_ON_LABELLER_MATCH_ID, and EYES_ON_EMAIL (only to
 * refuse the same account).
 *
 * Exit codes: 0 done, 2 EYES_ON_LABELLER_EMAIL unset, 1 anything else
 * (including a refusal).
 */

import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import { loadEnvLocal } from "../lib/env";

/** The checkout this script lives in — `.env.local` belongs to it. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Bump to mint a fresh generation of ids. */
const SEED_NS = "advantage-eyes-on-labeller-session-v1";
/** Every Eyes-on seed match's marker prefix (seed-failure-classes.ts too). */
const SEED_PREFIX = "Eyes-on seed · ";
/** This script's own match marker — what cleanup selects on. */
const MARKER = `${SEED_PREFIX}labeller`;
const OPPONENT = "Eyes-on seed opponent";
/** Not a real derivation: the session has no vendor file behind it. */
const DERIVATION_VERSION = "eyes-on-seed";
/** Never read (no job, nothing publishes it); the CHECK wants one. */
const RESULTS_OBJECT_KEY = "eyes-on-seed/labeller/no-results.json";

/**
 * The real Cj vs Suhail labelling session and its match. Nothing this script
 * does may ever name either.
 */
const FORBIDDEN_IDS = new Set([
  "7a249f73-f2ad-4d54-a7d7-bd330d05dddd",
  "93d85299-f71b-4a90-a40f-709854e59172",
]);

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// ── helpers ────────────────────────────────────────────────────────────────

function fixtureId(name: string): string {
  const digest = createHash("sha256").update(`${SEED_NS}:${name}`).digest();
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

/** First 8 characters of an id — enough to recognise, not to reuse. */
const maskId = (id: string) => `${id.slice(0, 8)}…`;

function maskEmail(email: string): string {
  const [local, domain = ""] = email.split("@");
  return `${local.slice(0, 2)}***@${domain}`;
}

class Refusal extends Error {}

/** Refuse before any read or write that would name Cj vs Suhail. */
function assertNotForbidden(id: string, what: string) {
  if (FORBIDDEN_IDS.has(id.toLowerCase())) {
    throw new Refusal(
      `${what} ${id} is the real Cj vs Suhail labelling session or match — never a seed target. Nothing was touched.`,
    );
  }
}

/** An optional uuid from the environment; refused when malformed. */
function optionalUuid(name: string): string | null {
  const value = process.env[name]?.trim() ?? "";
  if (!value) return null;
  if (!UUID_RE.test(value)) {
    throw new Refusal(`${name} is not a uuid. Nothing was touched.`);
  }
  return value.toLowerCase();
}

// ── rows ───────────────────────────────────────────────────────────────────

type Side = "p1" | "p2";
type Stroke =
  "first_serve" | "second_serve" | "forehand" | "backhand" | "forehand_volley";
type Result = "in" | "out" | "net";

interface ShotSpec {
  hitter: Side;
  stroke: Stroke;
  result: Result;
}
interface PointSpec {
  winner: Side;
  ending: "ace" | "error" | "double_fault" | "winner";
  endedBy: Side;
  shots: ShotSpec[];
}

/**
 * One unfinished opening game, p1 serving — an ace, a rally error, a double
 * fault, a volley winner and a return winner (40–30) — so the console has
 * points to check, a game to score and amber stops to open on.
 */
const POINTS: PointSpec[] = [
  {
    winner: "p1",
    ending: "ace",
    endedBy: "p1",
    shots: [{ hitter: "p1", stroke: "first_serve", result: "in" }],
  },
  {
    winner: "p1",
    ending: "error",
    endedBy: "p2",
    shots: [
      { hitter: "p1", stroke: "first_serve", result: "in" },
      { hitter: "p2", stroke: "forehand", result: "in" },
      { hitter: "p1", stroke: "backhand", result: "in" },
      { hitter: "p2", stroke: "forehand", result: "net" },
    ],
  },
  {
    winner: "p2",
    ending: "double_fault",
    endedBy: "p1",
    shots: [
      { hitter: "p1", stroke: "first_serve", result: "out" },
      { hitter: "p1", stroke: "second_serve", result: "net" },
    ],
  },
  {
    winner: "p1",
    ending: "winner",
    endedBy: "p1",
    shots: [
      { hitter: "p1", stroke: "first_serve", result: "net" },
      { hitter: "p1", stroke: "second_serve", result: "in" },
      { hitter: "p2", stroke: "forehand", result: "in" },
      { hitter: "p1", stroke: "forehand_volley", result: "in" },
    ],
  },
  {
    winner: "p2",
    ending: "winner",
    endedBy: "p2",
    shots: [
      { hitter: "p1", stroke: "first_serve", result: "in" },
      { hitter: "p2", stroke: "backhand", result: "in" },
    ],
  },
];

function buildMatch(userId: string, matchId: string, nowMs: number) {
  const date = new Date(nowMs - 24 * 60 * 60 * 1000);
  date.setUTCHours(12, 0, 0, 0);
  // Shaped like seed-failure-classes.ts's personal matches.
  return {
    id: matchId,
    player1_name: "Eyes-on Labeller",
    player2_name: OPPONENT,
    player1_id: userId,
    player2_id: null,
    program_id: null,
    event_entry_id: null,
    created_by: userId,
    tournament_name: MARKER,
    round: null,
    date: date.toISOString(),
    format: { best_of: 3, ad_scoring: true, play_on_lets: false },
    score: {
      player1: [6, 6],
      player2: [4, 3],
      player1_tiebreaks: [null, null],
      player2_tiebreaks: [null, null],
    },
    result: "",
    source_provider: "splitstep",
    analysis_method: "ai",
    private: true,
  };
}

function buildSession(
  userId: string,
  sessionId: string,
  matchId: string,
  nowIso: string,
) {
  return {
    id: sessionId,
    job_id: null,
    match_id: matchId,
    kind: "analyst",
    status: "labelling",
    results_object_key: RESULTS_OBJECT_KEY,
    derivation_version: DERIVATION_VERSION,
    // Explicit: the column defaults to auth.uid(), null under the service role.
    labeller: userId,
    assigned_to: userId,
    assigned_at: nowIso,
    submitted_at: null,
    completed_at: null,
    started_at: nowIso,
    ad_scoring: true,
    open_counts: null,
    open_counts_at: null,
    final_score: null,
    start_score: null,
  };
}

function buildPointsAndShots(sessionId: string) {
  const points: Array<Record<string, unknown>> = [];
  const shots: Array<Record<string, unknown>> = [];
  let eventId = 0;
  POINTS.forEach((spec, index) => {
    const pointId = fixtureId(`${sessionId}:point:${index}`);
    const values = {
      set_number: 1,
      game_number: 1,
      server: "p1" as Side,
      // A real seed leaves the serve side to the labeller.
      serve_side: null,
      winner: spec.winner,
      ending: spec.ending,
      ended_by: spec.endedBy,
    };
    points.push({
      id: pointId,
      session_id: sessionId,
      point_index: index,
      vendor_rally_ids: [index + 1],
      ...values,
      game_type: "game",
      status: "unchanged",
      seed: { ...values, game_type: "game" },
    });
    spec.shots.forEach((shot, n) => {
      eventId += 1;
      const shotValues = {
        hitter: shot.hitter,
        stroke: shot.stroke,
        result: shot.result,
        spin: null,
        contact_x: null,
        contact_y: null,
        landing_x: null,
        landing_y: null,
        video_time: 10 + index * 20 + n * 1.5,
      };
      shots.push({
        id: fixtureId(`${sessionId}:shot:${eventId}`),
        session_id: sessionId,
        label_point_id: pointId,
        event_id: eventId,
        vendor: null,
        status: "kept",
        unclear: [],
        site_removal: null,
        ...shotValues,
        seed: shotValues,
      });
    });
  });
  return { points, shots };
}

// ── main ───────────────────────────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  for (const a of args) {
    if (a !== "--write" && a !== "--cleanup") {
      throw new Refusal(
        `unknown argument: ${a} (expected --write and/or --cleanup)`,
      );
    }
  }
  const write = args.includes("--write");
  const cleanup = args.includes("--cleanup");

  loadEnvLocal(ROOT);
  const email = process.env.EYES_ON_LABELLER_EMAIL?.trim() ?? "";
  if (!email) {
    console.error(
      "EYES_ON_LABELLER_EMAIL is not set (shell or .env.local) — nothing to seed for. Nothing was touched.",
    );
    process.exit(2);
  }
  const verifierEmail = process.env.EYES_ON_EMAIL?.trim() ?? "";
  if (verifierEmail && verifierEmail.toLowerCase() === email.toLowerCase()) {
    throw new Refusal(
      "EYES_ON_LABELLER_EMAIL is the verifier account (EYES_ON_EMAIL) — the labeller must be its own test user. Nothing was touched.",
    );
  }

  // Configured ids are checked before anything connects.
  const configuredSessionId = optionalUuid("EYES_ON_LABELLER_SESSION_ID");
  const configuredMatchId = optionalUuid("EYES_ON_LABELLER_MATCH_ID");
  if (configuredSessionId) {
    assertNotForbidden(configuredSessionId, "EYES_ON_LABELLER_SESSION_ID");
  }
  if (configuredMatchId) {
    assertNotForbidden(configuredMatchId, "EYES_ON_LABELLER_MATCH_ID");
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!url || !key) {
    throw new Refusal(
      "NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must both be set.",
    );
  }
  const supabase = makeClient(url, key);

  const projectRef = new URL(url).hostname.split(".")[0];
  console.log(
    `${write ? "WRITE" : "DRY RUN"} · ${cleanup ? "cleanup" : "seed"} · project ${projectRef}`,
  );

  // ---- Resolve the labeller. Refuse if it is not exactly one account. -----
  const { data: users, error: userError } = await supabase
    .from("users")
    .select("id, email, is_admin, is_labeller")
    .ilike("email", email);
  if (userError) throw new Error(`users: ${userError.message}`);
  if (!users || users.length !== 1) {
    throw new Refusal(
      `expected exactly one account for ${maskEmail(email)}, found ${users?.length ?? 0}. Nothing was touched.`,
    );
  }
  const user = users[0] as {
    id: string;
    is_admin: boolean | null;
    is_labeller: boolean | null;
  };
  const userId = user.id;
  const { data: authUser, error: authError } =
    await supabase.auth.admin.getUserById(userId);
  if (authError || !authUser?.user) {
    throw new Refusal(
      `${maskEmail(email)} has a users row but no auth account. Nothing was touched.`,
    );
  }
  if (user.is_admin) {
    throw new Refusal(
      `${maskEmail(email)} is an admin — the console would render the admin view, not the labeller's. Use a plain test user. Nothing was touched.`,
    );
  }
  console.log(
    `labeller ${maskEmail(email)} → ${maskId(userId)}  is_labeller ${user.is_labeller === true}`,
  );

  const ownMatchId = fixtureId(`${userId}:match`);
  const sessionId = configuredSessionId ?? fixtureId(`${userId}:session`);
  assertNotForbidden(sessionId, "session id");
  assertNotForbidden(ownMatchId, "match id");

  const ctx: Context = {
    supabase,
    userId,
    isLabeller: user.is_labeller === true,
    sessionId,
    ownMatchId,
    configuredMatchId,
    write,
  };
  if (cleanup) await runCleanup(ctx);
  else await runSeed(ctx);
}

function makeClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
type Db = ReturnType<typeof makeClient>;

interface Context {
  supabase: Db;
  userId: string;
  isLabeller: boolean;
  sessionId: string;
  /** The match this script creates when no match id is configured. */
  ownMatchId: string;
  configuredMatchId: string | null;
  write: boolean;
}

interface MatchRow {
  id: string;
  created_by: string | null;
  tournament_name: string | null;
}
interface SessionRow {
  id: string;
  match_id: string;
  assigned_to: string | null;
  status: string;
  kind: string;
  job_id: string | null;
}

const isSeedMatch = (m: MatchRow) =>
  String(m.tournament_name ?? "").startsWith(SEED_PREFIX);

async function readMatch(supabase: Db, id: string): Promise<MatchRow | null> {
  const { data, error } = await supabase
    .from("matches")
    .select("id, created_by, tournament_name")
    .eq("id", id)
    .maybeSingle<MatchRow>();
  if (error) throw new Error(`matches: ${error.message}`);
  return data ?? null;
}

async function readSession(
  supabase: Db,
  id: string,
): Promise<SessionRow | null> {
  const { data, error } = await supabase
    .from("label_sessions")
    .select("id, match_id, assigned_to, status, kind, job_id")
    .eq("id", id)
    .maybeSingle<SessionRow>();
  if (error) throw new Error(`label_sessions: ${error.message}`);
  return data ?? null;
}

async function runSeed(ctx: Context) {
  const { supabase, userId, sessionId, write } = ctx;
  const nowMs = Date.now();
  const nowIso = new Date(nowMs).toISOString();

  // ---- The match: a configured Eyes-on seed, or this script's own. --------
  let matchId: string;
  let matchRow: ReturnType<typeof buildMatch> | null = null;
  if (ctx.configuredMatchId) {
    matchId = ctx.configuredMatchId;
    const existing = await readMatch(supabase, matchId);
    if (!existing) {
      throw new Refusal(
        `EYES_ON_LABELLER_MATCH_ID ${maskId(matchId)} does not exist. Nothing was touched.`,
      );
    }
    if (!isSeedMatch(existing)) {
      throw new Refusal(
        `match ${maskId(matchId)} is not an Eyes-on seed (tournament_name must start "${SEED_PREFIX}") — refusing to put a session on it. Nothing was touched.`,
      );
    }
    console.log(
      `match           ${maskId(matchId)}  "${existing.tournament_name}"  (configured, not written)`,
    );
  } else {
    matchId = ctx.ownMatchId;
    const existing = await readMatch(supabase, matchId);
    if (
      existing &&
      (existing.created_by !== userId || existing.tournament_name !== MARKER)
    ) {
      throw new Refusal(
        `match ${maskId(matchId)} exists without the labeller + marker — refusing to overwrite it. Nothing was touched.`,
      );
    }
    matchRow = buildMatch(userId, matchId, nowMs);
    console.log(
      `match           ${maskId(matchId)}  created_by ${maskId(userId)}  tournament_name "${MARKER}"  ${existing ? "exists (upsert in place)" : "new"}`,
    );
  }
  assertNotForbidden(matchId, "match id");

  // ---- The session: new, or already ours on this same seed match. ---------
  const existingSession = await readSession(supabase, sessionId);
  if (existingSession) {
    if (
      existingSession.assigned_to !== userId ||
      existingSession.match_id !== matchId ||
      existingSession.kind !== "analyst" ||
      existingSession.job_id !== null
    ) {
      throw new Refusal(
        `label session ${maskId(sessionId)} exists but is not this seed's (assigned elsewhere, another match, or has a job) — refusing to overwrite it. Nothing was touched.`,
      );
    }
    if (existingSession.status === "complete") {
      throw new Refusal(
        `label session ${maskId(sessionId)} is complete (published) — run --cleanup --write first. Nothing was touched.`,
      );
    }
  }
  const session = buildSession(userId, sessionId, matchId, nowIso);
  const { points, shots } = buildPointsAndShots(sessionId);

  console.log(
    `label_sessions  ${sessionId}  kind analyst  status labelling  assigned_to ${maskId(userId)}  job_id null  ${existingSession ? `exists (${existingSession.status}; reset)` : "new"}`,
  );
  for (const p of points) {
    const own = shots.filter((s) => s.label_point_id === p.id);
    console.log(
      `  label_points  #${p.point_index}  server ${p.server}  winner ${p.winner}  ending ${p.ending}  ended_by ${p.ended_by}  shots ${own
        .map((s) => `${s.hitter}:${s.stroke}:${s.result}`)
        .join(", ")}`,
    );
  }
  console.log(
    `users.is_labeller ${ctx.isLabeller ? "already true" : "false → true"}`,
  );

  if (!write) {
    console.log(
      `\nDry run — nothing written. Re-run with --write to set is_labeller, ${matchRow ? "upsert 1 match, " : ""}upsert 1 session and rewrite ${points.length} points + ${shots.length} shots.`,
    );
    return;
  }

  if (!ctx.isLabeller) {
    const { error } = await supabase
      .from("users")
      .update({ is_labeller: true })
      .eq("id", userId);
    if (error) throw new Error(`users.is_labeller: ${error.message}`);
    console.log("\nset users.is_labeller = true");
  }
  if (matchRow) {
    const { error } = await supabase
      .from("matches")
      .upsert(matchRow as never, { onConflict: "id" });
    if (error) throw new Error(`matches upsert: ${error.message}`);
    console.log("upserted 1 match");
  }
  const { error: sErr } = await supabase
    .from("label_sessions")
    .upsert(session as never, { onConflict: "id" });
  if (sErr) throw new Error(`label_sessions upsert: ${sErr.message}`);
  console.log("upserted 1 label_sessions row");

  // Points first cleared (shots cascade), then written fresh, so an edited or
  // added row from an earlier eyes-on pass never survives a re-seed.
  const { error: dErr } = await supabase
    .from("label_points")
    .delete()
    .eq("session_id", sessionId);
  if (dErr) throw new Error(`clear label_points: ${dErr.message}`);
  const { error: pErr } = await supabase
    .from("label_points")
    .insert(points as never[]);
  if (pErr) throw new Error(`label_points insert: ${pErr.message}`);
  const { error: shErr } = await supabase
    .from("label_shots")
    .insert(shots as never[]);
  if (shErr) throw new Error(`label_shots insert: ${shErr.message}`);
  console.log(
    `wrote ${points.length} label_points, ${shots.length} label_shots`,
  );

  console.log(
    `\nSession id (put it in .env.local as EYES_ON_LABELLER_SESSION_ID so "labeller:/label/[sessionId]" resolves):\n  ${sessionId}\n  /label/${sessionId}`,
  );
}

async function runCleanup(ctx: Context) {
  const { supabase, userId, sessionId, write } = ctx;

  // This script's own matches: owner + exact marker.
  const { data: ownMatches, error: mErr } = await supabase
    .from("matches")
    .select("id, created_by, tournament_name")
    .eq("created_by", userId)
    .eq("tournament_name", MARKER)
    .returns<MatchRow[]>();
  if (mErr) throw new Error(`matches: ${mErr.message}`);
  const matchIds = (ownMatches ?? []).map((m) => m.id);
  for (const id of matchIds) assertNotForbidden(id, "match id");

  const { data: onOwn, error: oErr } = matchIds.length
    ? await supabase
        .from("label_sessions")
        .select("id, match_id, assigned_to, status, kind, job_id")
        .in("match_id", matchIds)
        .returns<SessionRow[]>()
    : { data: [] as SessionRow[], error: null };
  if (oErr) throw new Error(`label_sessions: ${oErr.message}`);

  // A self review is dropped by the match's own delete trigger; anyone
  // else's analyst session is real work, and the RESTRICT FK would refuse
  // the match anyway.
  const foreign = (onOwn ?? []).filter(
    (s) => s.kind === "analyst" && s.assigned_to !== userId,
  );
  if (foreign.length > 0) {
    throw new Refusal(
      `${foreign.length} session(s) on the seed match are not assigned to the labeller (${foreign.map((s) => maskId(s.id)).join(", ")}) — refusing. Nothing was touched.`,
    );
  }

  // Plus the seed session itself when it sits on a configured seed match.
  const sessions = new Map<string, SessionRow>();
  for (const s of onOwn ?? []) {
    if (s.kind === "analyst") sessions.set(s.id, s);
  }
  const configured = await readSession(supabase, sessionId);
  if (configured && !sessions.has(configured.id)) {
    const match = await readMatch(supabase, configured.match_id);
    if (configured.assigned_to === userId && match && isSeedMatch(match)) {
      sessions.set(configured.id, configured);
    }
  }
  for (const s of sessions.values()) {
    assertNotForbidden(s.id, "session id");
    assertNotForbidden(s.match_id, "match id");
  }

  console.log(
    `\nSeed rows for the labeller: ${sessions.size} label_sessions, ${matchIds.length} matches\n`,
  );
  for (const s of sessions.values()) {
    console.log(
      `  label_sessions ${maskId(s.id)}  status ${s.status}  match ${maskId(s.match_id)}  (points, shots and history cascade)`,
    );
  }
  for (const m of ownMatches ?? []) {
    console.log(`  matches        ${maskId(m.id)}  "${m.tournament_name}"`);
  }

  if (sessions.size === 0 && matchIds.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }
  if (!write) {
    console.log(
      "\nDry run — nothing deleted. Re-run with --cleanup --write to delete the sessions, then the matches. is_labeller is left set.",
    );
    return;
  }

  // Sessions first: label_sessions.match_id is ON DELETE RESTRICT.
  if (sessions.size > 0) {
    const { error, count } = await supabase
      .from("label_sessions")
      .delete({ count: "exact" })
      .in("id", [...sessions.keys()])
      .eq("assigned_to", userId);
    if (error) throw new Error(`delete label_sessions: ${error.message}`);
    console.log(`\ndeleted ${count ?? 0} label_sessions`);
  }
  if (matchIds.length > 0) {
    const { error, count } = await supabase
      .from("matches")
      .delete({ count: "exact" })
      .in("id", matchIds)
      .eq("created_by", userId)
      .eq("tournament_name", MARKER);
    if (error) throw new Error(`delete matches: ${error.message}`);
    console.log(`deleted ${count ?? 0} matches`);
  }
  console.log("is_labeller left set on the labeller account.");
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(
      err instanceof Refusal
        ? `refused: ${err.message}`
        : err instanceof Error
          ? err.message
          : err,
    );
    process.exit(1);
  },
);
