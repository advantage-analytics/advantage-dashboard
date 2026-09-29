/**
 * Score a job's derivation against a hand-labelled match.
 *
 *   npx tsx scripts/splitstep-eval.ts --job <uuid> --labels <dir>
 *   npx tsx scripts/splitstep-eval.ts --job <uuid> --labels <dir> --no-trajectories
 *
 * `<dir>` holds one JSON file per point, as exported from a point-check sheet
 * (`ArtifactData list … out_dir`): `{ n, server, winner, ending, shot, flags,
 * review: { server?, winner?, ending?, note?, … } }`, optionally wrapped in
 * `{ data: … }`. The `review` fields are the labeller's corrections; anything
 * absent means the derived value was right. LABELS ARE A REAL ATHLETE'S DATA:
 * keep them outside the repo.
 *
 * Reads only; writes nothing. It rebuilds the transcript in memory from the
 * stored results (and trajectories, unless --no-trajectories), so it measures
 * the code in this checkout, not the rows in the database.
 *
 * Point i+1 is rally i, as in transcript.ts; a first-stroke time more than
 * 1.5 s from the label's time is reported, because then the join is wrong.
 *
 * This is the tool the dead-ball rule in derivation/played.ts is reconsidered with:
 * re-run it on every newly labelled match.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  analyzeResults,
  buildTranscript,
  lineCallsFor,
  playedRally,
  serversByChangeover,
  POINT_FLAGS,
  type DerivedPoint,
  type LineCalls,
  type MatchScore,
} from "@/lib/services/splitstep/derivation";
import { RESULTS_BUCKET } from "@/lib/services/splitstep/config";
import { resolveAdScoring } from "@/lib/services/splitstep/persist-transcript";

try {
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]])
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "").trim();
  }
} catch {
  /* already exported */
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Net height at the centre strap plus a ball radius. */
const NET_CENTRE_M = 0.914 + 0.033;

const ERRORS = new Set([
  "Unforced error",
  "Forced error",
  "Return error",
  "Double fault",
]);

interface Label {
  n: number;
  t: number | null;
  server: string;
  winner: string;
  ending: string;
  review: Record<string, unknown>;
}

function loadLabels(dir: string): Map<number, Label> {
  const labels = new Map<number, Label>();
  for (const file of readdirSync(dir)) {
    if (!file.endsWith(".json")) continue;
    const raw = JSON.parse(readFileSync(path.join(dir, file), "utf8"));
    const d = raw.data ?? raw;
    if (typeof d.n !== "number") continue;
    labels.set(d.n, {
      n: d.n,
      t: typeof d.t === "number" ? d.t : null,
      server: d.server,
      winner: d.winner,
      ending: d.ending,
      review: d.review ?? {},
    });
  }
  return labels;
}

/** The labeller's value where they corrected one, else what was derived. */
function truth(label: Label, key: "server" | "winner" | "ending"): string {
  const corrected = label.review[key];
  return typeof corrected === "string" ? corrected : label[key];
}

/** The sheet's ending vocabulary, from a derived point. */
function endingOf(point: DerivedPoint): string {
  const rt = point.result_type;
  if (!rt) return "Unknown";
  if (rt === "Double Fault") return "Double fault";
  if (rt === "Service Winner") return "Service winner";
  if (rt.endsWith("Winner")) {
    return point.rally_length === 2 ? "Return winner" : "Winner";
  }
  return point.rally_length === 2 ? "Return error" : "Unforced error";
}

function pct(a: number, b: number): string {
  return b === 0 ? "–" : `${Math.round((a / b) * 100)}%`;
}

async function main() {
  const argv = process.argv;
  const at = (flag: string) => {
    const i = argv.indexOf(flag);
    return i === -1 ? null : (argv[i + 1] ?? null);
  };
  const jobId = at("--job");
  const labelsDir = at("--labels");
  const useTrajectories = !argv.includes("--no-trajectories");
  if (!jobId || !UUID.test(jobId) || !labelsDir) {
    console.error(
      "usage: splitstep-eval.ts --job <uuid> --labels <dir> [--no-trajectories]",
    );
    process.exit(1);
  }

  const supabase = createAdminClient();
  const { data: job, error: jobError } = await supabase
    .from("processing_jobs")
    .select(
      "match_id, results_object_key, trajectories_object_key, start_time_seconds, initial_top_player_is_player1, ad_scoring",
    )
    .eq("id", jobId)
    .single();
  if (jobError || !job?.results_object_key) {
    console.error(`job not found or has no results: ${jobError?.message}`);
    process.exit(1);
  }
  const { data: match } = await supabase
    .from("matches")
    .select(
      "score, initial_top_player_is_player1, format, player1_name, player2_name",
    )
    .eq("id", job.match_id)
    .single();

  const bucket = supabase.storage.from(RESULTS_BUCKET);
  const results = await bucket.download(job.results_object_key);
  if (!results.data) throw new Error("results download failed");
  const analysis = analyzeResults(JSON.parse(await results.data.text()), {
    startTimeSeconds: Number(job.start_time_seconds ?? 0) || 0,
  });

  let lineCalls: LineCalls | undefined;
  let rawTrajectories: unknown = null;
  if (useTrajectories && job.trajectories_object_key) {
    const traj = await bucket.download(job.trajectories_object_key);
    if (traj.data) rawTrajectories = JSON.parse(await traj.data.text());
  }
  // Built even without a file, so the near-line numbers below can report the
  // strokes-file fallback; only handed to the transcript when enabled.
  const calls = lineCallsFor(analysis.strokes, rawTrajectories);
  if (useTrajectories) lineCalls = calls;

  const format = match?.format as {
    ad_scoring?: boolean;
    best_of?: number;
  } | null;
  const transcript = buildTranscript({
    rallies: analysis.rallies,
    labels: analysis.players,
    score: (match?.score as MatchScore | null) ?? null,
    initialTopIsPlayer1:
      job.initial_top_player_is_player1 ??
      match?.initial_top_player_is_player1 ??
      null,
    adScoring: resolveAdScoring(job.ad_scoring, format),
    bestOf: format?.best_of ?? 3,
    lineCalls,
  });
  if (!transcript.ok) {
    console.error(`transcript refused: ${transcript.reason}`);
    process.exit(1);
  }

  const labels = loadLabels(labelsDir);
  const player1 = transcript.reconciliation.player1Label;

  console.log(
    `=== ${jobId}  ${labels.size} labelled points · trajectories ${
      rawTrajectories ? "ON" : "OFF"
    }`,
  );

  // --- Join ---------------------------------------------------------------
  const rows = transcript.points.flatMap((point, i) => {
    const label = labels.get(point.point_number);
    if (!label) return [];
    const drift =
      label.t !== null && point.video_time !== null
        ? Math.abs(label.t - point.video_time)
        : 0;
    if (drift > 1.5) {
      console.log(`  ! point ${point.point_number}: time off by ${drift}s`);
    }
    return [{ point, label, rally: analysis.rallies[i] }];
  });

  // --- Accuracy -----------------------------------------------------------
  // The sheet names players as matches.player1_name / player2_name, which is
  // exactly how it was seeded from server_is_player1 / won_by_player1.
  const nameFor = (isP1: boolean) =>
    String(isP1 ? match?.player1_name : match?.player2_name);
  const serverOf = (p: DerivedPoint) => nameFor(p.server_is_player1);
  const winnerOf = (p: DerivedPoint) => nameFor(p.won_by_player1);

  const tally = { server: 0, winner: 0, ending: 0 };
  for (const { point, label } of rows) {
    if (serverOf(point) === truth(label, "server")) tally.server += 1;
    if (winnerOf(point) === truth(label, "winner")) tally.winner += 1;
    if (endingOf(point) === truth(label, "ending")) tally.ending += 1;
  }
  console.log("\naccuracy against the labels");
  for (const key of ["server", "winner", "ending"] as const) {
    console.log(
      `  ${key.padEnd(7)} ${tally[key]}/${rows.length} (${pct(tally[key], rows.length)})`,
    );
  }

  // --- Flags --------------------------------------------------------------
  // "Problem" = the labeller corrected the server, winner or ending, or
  // marked the point as a sequence problem.
  const problem = (l: Label, p: DerivedPoint) =>
    serverOf(p) !== truth(l, "server") ||
    winnerOf(p) !== truth(l, "winner") ||
    endingOf(p) !== truth(l, "ending") ||
    Boolean(l.review.issue);
  const flagCodes = new Set(rows.flatMap(({ point }) => point.flags));
  console.log("\nflags: fired · a real problem · the points");
  for (const code of [...flagCodes].sort()) {
    const hit = rows.filter(({ point }) => point.flags.includes(code));
    const real = hit.filter(({ point, label }) => problem(label, point));
    console.log(
      `  ${code.padEnd(28)} ${String(hit.length).padStart(3)} · ${String(real.length).padStart(3)} (${pct(real.length, hit.length)})  ${hit.map((h) => h.point.point_number).join(",")}`,
    );
  }
  const silent = rows.filter(
    ({ point, label }) => problem(label, point) && point.flags.length === 0,
  );
  console.log(
    `  problems with no flag: ${silent.map((s) => s.point.point_number).join(",") || "none"}`,
  );

  // --- The dead-ball flag and the near-line flag --------------------------
  const scoreRule = (code: string) => {
    const hit = rows.filter(({ point }) => point.flags.includes(code));
    const right = hit.filter(({ label }) => ERRORS.has(truth(label, "ending")));
    const wrong = hit.filter(
      ({ label }) => !right.some((r) => r.label === label),
    );
    return { hit, right, wrong };
  };
  console.log("\nending rules: fired · right (really an error) · wrong");
  for (const code of [
    POINT_FLAGS.WINNER_TO_ERROR_BY_BOUNCE,
    POINT_FLAGS.ENDING_SUSPECT_LINE,
  ]) {
    const { hit, right, wrong } = scoreRule(code);
    console.log(
      `  ${code.padEnd(28)} ${hit.length} · ${right.length} (${pct(right.length, hit.length)}) · wrong on ${wrong.map((w) => w.point.point_number).join(",") || "none"}`,
    );
  }
  const stillWinners = rows.filter(
    ({ point, label }) =>
      (endingOf(point) === "Winner" || endingOf(point) === "Return winner") &&
      ERRORS.has(truth(label, "ending")),
  );
  console.log(
    `  derived winners that are still really errors: ${stillWinners.length} (${stillWinners.map((s) => s.point.point_number).join(",") || "none"})`,
  );

  // --- Net study (measure only) -------------------------------------------
  // The labeller's notes say "net" where a final miss went into the net. Our
  // own call: the flight of the point's last stroke crossed the net plane
  // below net height, or never crossed it.
  console.log(
    "\nnet study: last stroke of points the labeller called an error",
  );
  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;
  const detail: string[] = [];
  for (const { point, label, rally } of rows) {
    if (!ERRORS.has(truth(label, "ending"))) continue;
    const kept = playedRally(rally, {
      winner: point.won_by_player1 ? player1 : otherLabel(analysis, player1),
      lineCalls: calls,
    }).rally.strokes;
    const last = kept[kept.length - 1];
    if (!last || last.strokeType === "serve") continue;
    const call = calls.get(last);
    if (!call || call.source !== "trajectory") continue;
    const predictedNet =
      call.netClearance === null || call.netClearance < NET_CENTRE_M;
    const notedNet = /\bnet\b/i.test(String(label.review.note ?? ""));
    if (predictedNet && notedNet) tp += 1;
    else if (predictedNet) fp += 1;
    else if (notedNet) fn += 1;
    else tn += 1;
    if (predictedNet || notedNet) {
      detail.push(
        `${point.point_number}:${predictedNet ? "N" : "-"}${notedNet ? "N" : "-"}@${call.netClearance ?? "none"}`,
      );
    }
  }
  console.log(
    `  our net call vs "net" in the note: both ${tp} · ours only ${fp} · note only ${fn} · neither ${tn}`,
  );
  console.log(`  (point:ours-note@clearance) ${detail.join(" ")}`);
  console.log(
    `  vendor netHit on the same strokes is in the shot rows; compare before trusting either.`,
  );

  // --- Coverage -----------------------------------------------------------
  const allCalls = [...calls.values()];
  console.log(
    `\ncoverage: ${allCalls.filter((c) => c.source === "trajectory").length} trajectory bounces · ${allCalls.filter((c) => c.source === "strokes").length} strokes-file only · ${allCalls.filter((c) => c.source === null).length} none, of ${allCalls.length} strokes`,
  );

  // --- Who served: the changeover witness ---------------------------------
  // Independent of the vendor's labels and score stream (server-witness.ts):
  // the serving end, the wizard's top-player answer, and changeover breaks.
  const topIsP1 =
    job.initial_top_player_is_player1 ??
    match?.initial_top_player_is_player1 ??
    null;
  const p2Label = analysis.players.find((p) => p !== player1) ?? null;
  if (!player1 || !p2Label || topIsP1 === null) {
    console.log(
      "\nserver witness: no anchor (player1 or the top-player answer)",
    );
    return;
  }
  const witnessed = serversByChangeover(
    analysis.rallies,
    topIsP1 ? player1 : p2Label,
    topIsP1 ? p2Label : player1,
  );
  let witnessRight = 0;
  let vendorRight = 0;
  const differ: string[] = [];
  for (const { point, label } of rows) {
    const w = witnessed[point.point_number - 1];
    const witness = w === null ? "?" : nameFor(w === player1);
    const real = truth(label, "server");
    if (witness === real) witnessRight += 1;
    if (serverOf(point) === real) vendorRight += 1;
    if (witness !== serverOf(point)) {
      differ.push(
        `${point.point_number}(${witness === real ? "witness" : serverOf(point) === real ? "vendor" : "neither"})`,
      );
    }
  }
  console.log("\nwho served: changeover witness vs the vendor's labels");
  console.log(
    `  witness ${witnessRight}/${rows.length} · vendor ${vendorRight}/${rows.length}`,
  );
  console.log(
    `  they differ on (who was right): ${differ.join(" ") || "none"}`,
  );
}

function otherLabel(
  analysis: ReturnType<typeof analyzeResults>,
  player1: string | null,
): string | null {
  return analysis.players.find((p) => p !== player1) ?? null;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
