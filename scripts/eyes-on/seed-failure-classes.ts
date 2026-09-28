/**
 * Seed one failing video job per recovery class for the eyes-on verifier, so
 * /pr-check Stage 3b can open each failure state in a real browser — and
 * remove exactly those rows again.
 *
 *   npx tsx scripts/eyes-on/seed-failure-classes.ts                    # dry run: print the rows
 *   npx tsx scripts/eyes-on/seed-failure-classes.ts --write            # write them
 *   npx tsx scripts/eyes-on/seed-failure-classes.ts --cleanup          # dry run: list what would go
 *   npx tsx scripts/eyes-on/seed-failure-classes.ts --cleanup --write  # delete them
 *
 * THIS WRITES TO WHATEVER PROJECT `.env.local` NAMES — normally production.
 * Approved by the author 2026-09-28 (task T21). Nothing is written without
 * `--write`.
 *
 * What it writes: six personal-workspace `matches` owned by the verifier
 * (`created_by` = `player1_id` = the verifier's auth uid, `program_id` null,
 * shaped like a real Advantage Intelligence upload) and one `processing_jobs`
 * row on each, chosen so `classifyFailure()` returns a different
 * `RecoveryClass` for each. The script asserts that with the real classifier
 * before it writes anything.
 *
 * Marker: every seeded match carries `tournament_name = "Eyes-on seed · <class>"`
 * and `player2_name = "Eyes-on seed opponent"`. Row ids are deterministic
 * (namespace + verifier id + class), so re-running upserts in place. Cleanup
 * selects ONLY matches whose `created_by` is the verifier AND whose
 * `tournament_name` starts with the marker, and only jobs on those matches
 * whose `created_by` is the verifier. It refuses outright if any other
 * account's job hangs off a marked match (the FK cascade would take it).
 *
 * Why no sweep touches these rows (verified against the code, 2026-09-28):
 *   - `external_job_id` is null on every job, and no row is in a pollable
 *     status (submitting|queued|processing) — `reconcileVendorJobs()` never
 *     selects them.
 *   - No row is `completed`, so `recoverUndeliveredResults()` never selects
 *     them.
 *   - No row is `pending` or `uploading`, so `reap_stalled_uploads()` never
 *     touches them (it deliberately leaves `uploaded` alone).
 *   - The daily `/api/cron/cleanup-match-videos` sweep works only on
 *     `match_video_attachments`; nothing here creates one.
 *   - Failure email is sent on the webhook/reconcile transition, never by a
 *     database trigger, so inserting a failed row mails nobody.
 * The storage keys point at blobs that do not exist. `resubmitJob()` HEADs the
 * blob before any vendor call, so a Retry click is refused rather than sent.
 *
 * Environment (from the checkout's `.env.local` via scripts/lib/env.ts, never
 * printed): EYES_ON_EMAIL, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 *
 * Exit codes: 0 done, 2 EYES_ON_EMAIL unset, 1 anything else (including a
 * refusal).
 */

import { createHash } from "node:crypto";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import { createClient } from "@supabase/supabase-js";

import {
  classifyFailure,
  jobRecoveryFacts,
  type RecoveryClass,
} from "@/lib/data/match-analysis";
import {
  resultsObjectKey,
  videoObjectKey,
} from "@/lib/services/splitstep/object-keys";

import { loadEnvLocal } from "../lib/env";

/** The checkout this script lives in — `.env.local` belongs to it. */
const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Bump to mint a fresh generation of ids. */
const SEED_NS = "advantage-eyes-on-failure-classes-v1";
/** The marker cleanup selects on. Never change it without a migration path
 *  for rows an earlier version wrote. */
const MARKER = "Eyes-on seed · ";
const OPPONENT = "Eyes-on seed opponent";

/** Older than SUBMIT_STALL_MS (3 min) with plenty of margin. */
const STALL_AGE_MS = 60 * 60 * 1000;

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

/** Storage keys embed the owner's uid — mask that segment for printing. */
function maskKey(key: string | null, userId: string): string | null {
  return key ? key.split(userId).join(maskId(userId)) : null;
}

class Refusal extends Error {}

// ── rows ───────────────────────────────────────────────────────────────────

interface JobSpec {
  status: "failed" | "uploaded" | "derivation_failed";
  hasVideo: boolean;
  hasResults: boolean;
  errorCode: string | null;
  errorCategory: string | null;
  errorStep: string | null;
  errorMessage: string | null;
  /** Backdate `updated_at` past the submit-stall threshold. */
  stalled?: boolean;
}

const CLASSES: Record<RecoveryClass, JobSpec> = {
  retry: {
    status: "failed",
    hasVideo: true,
    hasResults: false,
    errorCode: "INTERNAL_ERROR",
    errorCategory: "internal",
    errorStep: "downloading_video",
    errorMessage: "The video could not be downloaded.",
  },
  upload_again: {
    status: "failed",
    hasVideo: false,
    hasResults: false,
    errorCode: null,
    errorCategory: null,
    errorStep: null,
    errorMessage: "Failed to fetch",
  },
  fix_recording: {
    status: "failed",
    hasVideo: true,
    hasResults: false,
    errorCode: "VIDEO_FRAME_RATE_TOO_LOW",
    errorCategory: "invalid_input",
    errorStep: "trimming_video",
    errorMessage: "The video must be at least 29.9 fps.",
  },
  wait_or_ask: {
    status: "uploaded",
    hasVideo: true,
    hasResults: false,
    errorCode: "QUOTA_EXCEEDED",
    errorCategory: null,
    errorStep: null,
    errorMessage: "You have used this month's analysis allowance.",
    stalled: true,
  },
  rederive: {
    status: "derivation_failed",
    hasVideo: true,
    hasResults: true,
    errorCode: "DERIVATION_ERROR",
    errorCategory: null,
    errorStep: null,
    errorMessage: "Derivation crashed (eyes-on seed).",
  },
  stats_unavailable: {
    status: "derivation_failed",
    hasVideo: true,
    hasResults: true,
    errorCode: "DERIVATION_REFUSED",
    errorCategory: null,
    errorStep: null,
    errorMessage: "Derivation refused the results (eyes-on seed).",
  },
};

function buildRows(userId: string, nowMs: number) {
  const entries = Object.entries(CLASSES) as [RecoveryClass, JobSpec][];

  const matches = entries.map(([cls], i) => {
    const date = new Date(nowMs - (i + 1) * 24 * 60 * 60 * 1000);
    date.setUTCHours(12, 0, 0, 0);
    // Mirrors a real personal Advantage Intelligence upload's column set.
    return {
      id: fixtureId(`${userId}:match:${cls}`),
      player1_name: "Eyes-on Verifier",
      player2_name: OPPONENT,
      player1_id: userId,
      player2_id: null,
      program_id: null,
      event_entry_id: null,
      created_by: userId,
      tournament_name: `${MARKER}${cls}`,
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
  });

  const jobs = entries.map(([cls, spec], i) => {
    const matchId = matches[i].id;
    const jobId = fixtureId(`${userId}:job:${cls}`);
    const createdAt = new Date(nowMs - STALL_AGE_MS - i * 60_000).toISOString();
    return {
      id: jobId,
      match_id: matchId,
      created_by: userId,
      provider: "splitstep",
      // Null on every row: the reconciler only polls rows that carry one.
      external_job_id: null,
      status: spec.status,
      video_object_key: spec.hasVideo
        ? videoObjectKey({ userId, matchId, fileName: "original.mp4" })
        : null,
      results_object_key: spec.hasResults
        ? resultsObjectKey({ userId, matchId, jobId })
        : null,
      error_code: spec.errorCode,
      error_category: spec.errorCategory,
      error_step: spec.errorStep,
      error_message: spec.errorMessage,
      initial_top_player_is_player1: true,
      ad_scoring: true,
      fixed_camera: true,
      created_at: createdAt,
      // The updated_at trigger fires on UPDATE only, so an insert keeps this.
      updated_at: spec.stalled
        ? new Date(nowMs - STALL_AGE_MS).toISOString()
        : createdAt,
      completed_at: spec.status === "derivation_failed" ? createdAt : null,
    };
  });

  return { matches, jobs, classes: entries.map(([cls]) => cls) };
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
  const email = process.env.EYES_ON_EMAIL?.trim() ?? "";
  if (!email) {
    console.error(
      "EYES_ON_EMAIL is not set (shell or .env.local) — nothing to seed for. Nothing was touched.",
    );
    process.exit(2);
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

  // ---- Resolve the verifier. Refuse if it is not exactly one account. -----
  const { data: users, error: userError } = await supabase
    .from("users")
    .select("id, email")
    .ilike("email", email);
  if (userError) throw new Error(`users: ${userError.message}`);
  if (!users || users.length !== 1) {
    throw new Refusal(
      `expected exactly one account for ${maskEmail(email)}, found ${users?.length ?? 0}. Nothing was touched.`,
    );
  }
  const userId = users[0].id as string;
  const { data: authUser, error: authError } =
    await supabase.auth.admin.getUserById(userId);
  if (authError || !authUser?.user) {
    throw new Refusal(
      `${maskEmail(email)} has a users row but no auth account. Nothing was touched.`,
    );
  }
  console.log(`verifier ${maskEmail(email)} → ${maskId(userId)}`);

  if (cleanup) {
    await runCleanup(supabase, userId, write);
  } else {
    await runSeed(supabase, userId, write);
  }
}

function makeClient(url: string, key: string) {
  return createClient(url, key, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
type Db = ReturnType<typeof makeClient>;

async function runSeed(supabase: Db, userId: string, write: boolean) {
  const nowMs = Date.now();
  const { matches, jobs, classes } = buildRows(userId, nowMs);

  // ---- Every row belongs to the verifier — asserted, not assumed. ---------
  for (const row of [...matches, ...jobs]) {
    if (row.created_by !== userId) {
      throw new Refusal(`row ${maskId(row.id)} is not owned by the verifier`);
    }
  }

  // ---- Every job classifies as intended, by the real classifier. ----------
  for (const [i, cls] of classes.entries()) {
    const job = jobs[i];
    const facts = jobRecoveryFacts(
      {
        status: job.status,
        error_code: job.error_code,
        error_category: job.error_category,
        error_step: job.error_step,
        error_message: job.error_message,
        external_job_id: job.external_job_id,
        updated_at: job.updated_at,
        hasVideo: job.video_object_key != null,
        hasResults: job.results_object_key != null,
      },
      nowMs,
    );
    const got = classifyFailure({ ...facts, attemptsUsed: 1 });
    if (got !== cls) {
      throw new Refusal(`job for ${cls} classifies as ${got ?? "null"}`);
    }
  }

  // ---- Existing rows at these ids must already be ours. -------------------
  const { data: existingMatches, error: emError } = await supabase
    .from("matches")
    .select("id, created_by, tournament_name")
    .in(
      "id",
      matches.map((m) => m.id),
    );
  if (emError) throw new Error(`matches: ${emError.message}`);
  const { data: existingJobs, error: ejError } = await supabase
    .from("processing_jobs")
    .select("id, match_id, created_by")
    .in(
      "match_id",
      matches.map((m) => m.id),
    );
  if (ejError) throw new Error(`processing_jobs: ${ejError.message}`);
  for (const row of existingMatches ?? []) {
    if (
      row.created_by !== userId ||
      !String(row.tournament_name ?? "").startsWith(MARKER)
    ) {
      throw new Refusal(
        `match ${maskId(row.id)} exists without the verifier + marker — refusing to overwrite it.`,
      );
    }
  }
  const ourJobIds = new Set(jobs.map((j) => j.id));
  for (const row of existingJobs ?? []) {
    if (row.created_by !== userId || !ourJobIds.has(row.id)) {
      // A foreign or extra job on a seed match (a Retry click, say) would
      // collide with processing_jobs_one_live_per_match or be orphaned.
      throw new Refusal(
        `job ${maskId(row.id)} on a seed match was not written by this script — run --cleanup first.`,
      );
    }
  }

  console.log(
    `\n${existingMatches?.length ?? 0} of ${matches.length} seed matches already exist (upsert in place).\n`,
  );
  for (const [i, cls] of classes.entries()) {
    const m = matches[i];
    const j = jobs[i];
    console.log(`[${cls}]`);
    console.log(
      `  matches         id ${maskId(m.id)}  created_by ${maskId(m.created_by)}  player1_id ${maskId(m.player1_id)}  tournament_name "${m.tournament_name}"  date ${m.date.slice(0, 10)}  ${m.source_provider}/${m.analysis_method}  private`,
    );
    console.log(
      `  processing_jobs id ${maskId(j.id)}  status ${j.status}  error_code ${j.error_code ?? "—"}  category ${j.error_category ?? "—"}  step ${j.error_step ?? "—"}`,
    );
    console.log(
      `                  message ${JSON.stringify(j.error_message)}  updated_at ${j.updated_at}  external_job_id null`,
    );
    console.log(
      `                  video_object_key ${maskKey(j.video_object_key, userId) ?? "null"}  results_object_key ${maskKey(j.results_object_key, userId) ?? "null"}`,
    );
    console.log(`  classifyFailure → ${cls} ✓`);
  }

  if (!write) {
    console.log(
      `\nDry run — nothing written. Re-run with --write to upsert ${matches.length} matches + ${jobs.length} jobs.`,
    );
    return;
  }

  const { error: mErr } = await supabase
    .from("matches")
    .upsert(matches as never[], { onConflict: "id" });
  if (mErr) throw new Error(`matches upsert: ${mErr.message}`);
  console.log(`\nupserted ${matches.length} matches`);
  const { error: jErr } = await supabase
    .from("processing_jobs")
    .upsert(jobs as never[], { onConflict: "id" });
  if (jErr) throw new Error(`processing_jobs upsert: ${jErr.message}`);
  console.log(`upserted ${jobs.length} processing_jobs`);
  console.log(
    "note: an upsert over an existing uploaded row resets updated_at to now (trigger); wait_or_ask reads as stalled again after 3 minutes.",
  );
  for (const m of matches) {
    console.log(`  /dashboard/matches/${m.id}  (${m.tournament_name})`);
  }
}

async function runCleanup(supabase: Db, userId: string, write: boolean) {
  const { data: matches, error: mErr } = await supabase
    .from("matches")
    .select("id, tournament_name, created_by")
    .eq("created_by", userId)
    .like("tournament_name", `${MARKER}%`);
  if (mErr) throw new Error(`matches: ${mErr.message}`);
  const matchIds = (matches ?? []).map((m) => m.id as string);

  const { data: jobs, error: jErr } = matchIds.length
    ? await supabase
        .from("processing_jobs")
        .select("id, match_id, status, created_by")
        .in("match_id", matchIds)
    : { data: [], error: null };
  if (jErr) throw new Error(`processing_jobs: ${jErr.message}`);

  const foreign = (jobs ?? []).filter((j) => j.created_by !== userId);
  if (foreign.length > 0) {
    throw new Refusal(
      `${foreign.length} job(s) on marked matches belong to another account (${foreign.map((j) => maskId(j.id)).join(", ")}) — refusing, the cascade would take them.`,
    );
  }

  console.log(
    `\nMarked rows owned by the verifier: ${matchIds.length} matches, ${jobs?.length ?? 0} processing_jobs\n`,
  );
  for (const m of matches ?? []) {
    console.log(
      `  matches         ${maskId(m.id)}  "${m.tournament_name}"  created_by ${maskId(m.created_by)}`,
    );
    for (const j of (jobs ?? []).filter((x) => x.match_id === m.id)) {
      console.log(
        `    processing_jobs ${maskId(j.id)}  status ${j.status}  created_by ${maskId(j.created_by)}`,
      );
    }
  }

  if (matchIds.length === 0) {
    console.log("Nothing to clean up.");
    return;
  }
  if (!write) {
    console.log(
      "\nDry run — nothing deleted. Re-run with --cleanup --write to delete jobs, then matches.",
    );
    return;
  }

  // Jobs first (the FK would cascade anyway, but explicit is auditable),
  // each delete re-stating the owner filter.
  const jobIds = (jobs ?? []).map((j) => j.id as string);
  if (jobIds.length) {
    const { error, count } = await supabase
      .from("processing_jobs")
      .delete({ count: "exact" })
      .in("id", jobIds)
      .eq("created_by", userId);
    if (error) throw new Error(`delete processing_jobs: ${error.message}`);
    console.log(`\ndeleted ${count ?? 0} processing_jobs`);
  }
  const { error, count } = await supabase
    .from("matches")
    .delete({ count: "exact" })
    .in("id", matchIds)
    .eq("created_by", userId)
    .like("tournament_name", `${MARKER}%`);
  if (error) throw new Error(`delete matches: ${error.message}`);
  console.log(`deleted ${count ?? 0} matches`);
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
