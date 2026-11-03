/**
 * Replay the seed's serve landing autofix (src/lib/services/labels/serve-autofix.ts)
 * against the analyst label sessions: what it would have changed on the seed,
 * how close that lands to where the labeller put the ball, and how many
 * console flags it would have cleared before anyone opened the match.
 *
 *   npx tsx scripts/serve-autofix-eval.ts            # complete sessions
 *   npx tsx scripts/serve-autofix-eval.ts --all      # labelling ones too
 *
 * The "seed view" of a session is every vendor stroke and point as seeded
 * (`seed`), added strokes left out and nothing dismissed — the match as the
 * console first opens it. The flags are the console's own point builders
 * (marks-state.ts) run on that view twice, before and after the autofix,
 * with ghosts on, as a marks-on session draws them and as the seed leaves
 * the site's removed strokes out of a serve's rally. The truth for a stroke is its row now: where the labeller
 * left it, moved it, re-called it or deleted it. A session seeded after the
 * autofix shipped already carries it in its seed, so it moves nothing there.
 *
 * Reads only. Prints counts and distances, no names.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { readLabelSessionRows } from "@/lib/data/labels-server";
import {
  firstServeFaultAlone,
  lastLandingMissing,
  placementMissing,
  pointEndedEarly,
  secondServeAsFirst,
  serveAfterServeIn,
  serveInLandingOut,
} from "@/lib/services/labels/marks-state";
import {
  pulledBackServeLanding,
  pullbackShot,
  serveMiss,
  servePlayedOn,
  type CourtPoint,
} from "@/lib/services/labels/serve-autofix";
import { inServeLandingMiss } from "@/lib/services/labels/shot-derived";
import {
  isServeStroke,
  liveShotsInOrder,
  type LabelPoint,
  type LabelShot,
} from "@/lib/services/labels/session";
import { loadEnvLocal } from "./lib/env";

loadEnvLocal();

/** The site's removed strokes are ghosts, never rally strokes. */
const GHOSTS = true;

/** The point builders whose answer can move with a stroke's coordinates. */
const FLAGS = {
  serve_in_landing_out: (p: LabelPoint) => serveInLandingOut(p, GHOSTS),
  shot_after_point_end: (p: LabelPoint) => pointEndedEarly(p, GHOSTS),
  last_landing_missing: (p: LabelPoint) => lastLandingMissing(p, GHOSTS),
  placement_missing: (p: LabelPoint) => placementMissing(p, GHOSTS),
  serve_after_serve_in: (p: LabelPoint) => serveAfterServeIn(p, GHOSTS),
  first_serve_fault_alone: (p: LabelPoint) => firstServeFaultAlone(p, GHOSTS),
  second_serve_as_first: (p: LabelPoint) => secondServeAsFirst(p, GHOSTS),
} as const;
type FlagCode = keyof typeof FLAGS;

/** A point as seeded: seeded values, vendor strokes only, nothing dismissed. */
function seedView(point: LabelPoint): LabelPoint {
  const seed = point.seed;
  return {
    ...point,
    status: "unchanged",
    dismissed: [],
    ...(seed && {
      setNumber: seed.set_number,
      gameNumber: seed.game_number,
      server: seed.server,
      serveSide: seed.serve_side,
      winner: seed.winner,
      ending: seed.ending,
      endedBy: seed.ended_by,
    }),
    shots: point.shots.flatMap((shot): LabelShot[] => {
      if (!shot.seed) return [];
      const s = shot.seed;
      return [
        {
          ...shot,
          status: "kept",
          hitter: s.hitter,
          stroke: s.stroke,
          result: s.result,
          spin: s.spin,
          contactX: s.contact_x,
          contactY: s.contact_y,
          landingX: s.landing_x,
          landingY: s.landing_y,
          videoTime: s.video_time,
        },
      ];
    }),
  };
}

/** Whether the rally went on after `shot`, read off its point's live strokes. */
function playedOn(point: LabelPoint, shot: LabelShot): boolean {
  const live = liveShotsInOrder(point, GHOSTS);
  const at = live.findIndex((s) => s.id === shot.id);
  return at >= 0 && servePlayedOn(live, at);
}

/** The pulled-back landing for `shot`, or null when the autofix leaves it. */
function fixFor(point: LabelPoint, shot: LabelShot): CourtPoint | null {
  return pulledBackServeLanding(pullbackShot(shot), {
    playedOn: playedOn(point, shot),
  });
}

/** The seed view with the autofix applied. */
function fixedView(point: LabelPoint): LabelPoint {
  return {
    ...point,
    shots: point.shots.map((shot) => {
      const landing = fixFor(point, shot);
      return landing
        ? { ...shot, landingX: landing.x, landingY: landing.y }
        : shot;
    }),
  };
}

function countFlags(points: readonly LabelPoint[]): Record<FlagCode, number> {
  const counts = Object.fromEntries(
    Object.keys(FLAGS).map((k) => [k, 0]),
  ) as Record<FlagCode, number>;
  for (const point of points) {
    for (const code of Object.keys(FLAGS) as FlagCode[]) {
      if (FLAGS[code](point)) counts[code] += 1;
    }
  }
  return counts;
}

/** Serves stored in whose landing reads out or net — per stroke, not per point. */
function countLandingMisses(points: readonly LabelPoint[]): number {
  return points
    .flatMap((p) => p.shots)
    .filter((s) => inServeLandingMiss(s) !== null).length;
}

/** How far past the box the vendor's bounce was, as a band. */
function missBand(shot: LabelShot): string {
  const miss = serveMiss(shot.contactY!, {
    x: shot.landingX!,
    y: shot.landingY!,
  });
  return miss <= 0.3 ? "a ≤0.3 m" : miss <= 1 ? "b 0.3–1 m" : "c 1–2 m";
}

const dist = (a: CourtPoint, b: CourtPoint) => Math.hypot(a.x - b.x, a.y - b.y);

function quantiles(values: number[]): string {
  if (!values.length) return "—";
  const sorted = [...values].sort((a, b) => a - b);
  const q = (p: number) =>
    sorted[Math.min(sorted.length - 1, Math.floor(p * sorted.length))];
  return `median ${q(0.5).toFixed(2)} m · p75 ${q(0.75).toFixed(2)} · p90 ${q(0.9).toFixed(2)}`;
}

async function main() {
  const all = process.argv.includes("--all");
  const db = createAdminClient();
  let query = db.from("label_sessions").select("id").eq("kind", "analyst");
  if (!all) query = query.eq("status", "complete");
  const { data: rows, error } = await query;
  if (error) throw new Error(error.message);

  const flags = { seed: countFlags([]), fixed: countFlags([]) };
  const misses = { seed: 0, fixed: 0 };
  let livePoints = 0;

  // What the labeller did to each serve the autofix moved.
  const fate = {
    movedIn: [] as { fix: number; raw: number }[],
    untouched: [] as number[],
    landingCleared: 0,
    reCalledOut: 0,
    deleted: 0,
    // By how far the vendor's bounce missed and whether the rally went on:
    // [labeller kept it in, labeller re-called it out or net].
    byBand: {} as Record<string, [number, number]>,
  };

  for (const { id } of rows ?? []) {
    const built = await readLabelSessionRows(db, id);
    if (!built) continue;
    const { points } = built.session;
    // Points the labeller kept; a deleted seeded point was a phantom or the
    // absorbed half of a join, and its flags would have gone with it anyway.
    const seedPoints = points
      .filter((p) => p.vendorRallyIds.length > 0 && p.status !== "deleted")
      .map(seedView);
    const fixedPoints = seedPoints.map(fixedView);
    livePoints += seedPoints.length;

    for (const [view, list] of [
      ["seed", seedPoints],
      ["fixed", fixedPoints],
    ] as const) {
      const counts = countFlags(list);
      for (const code of Object.keys(counts) as FlagCode[]) {
        flags[view][code] += counts[code];
      }
      misses[view] += countLandingMisses(list);
    }

    const now = new Map(points.flatMap((p) => p.shots).map((s) => [s.id, s]));
    for (const point of seedPoints) {
      for (const shot of point.shots) {
        if (!isServeStroke(shot.stroke)) continue;
        const landing = fixFor(point, shot);
        if (!landing) continue;
        const raw = { x: shot.landingX!, y: shot.landingY! };
        const truth = now.get(shot.id);
        if (!truth || truth.status === "deleted") {
          fate.deleted += 1;
          continue;
        }
        const wrong = truth.result === "out" || truth.result === "net";
        const key = `${missBand(shot)} · ${playedOn(point, shot) ? "rally went on" : "point over within 2"}`;
        (fate.byBand[key] ??= [0, 0])[wrong ? 1 : 0] += 1;
        if (wrong) fate.reCalledOut += 1;
        else if (truth.landingX === null || truth.landingY === null) {
          fate.landingCleared += 1;
        } else {
          const labelled = { x: truth.landingX, y: truth.landingY };
          if (dist(labelled, raw) < 0.01) {
            fate.untouched.push(dist(landing, raw));
          } else {
            fate.movedIn.push({
              fix: dist(landing, labelled),
              raw: dist(raw, labelled),
            });
          }
        }
      }
    }
  }

  const moved =
    fate.movedIn.length +
    fate.untouched.length +
    fate.landingCleared +
    fate.reCalledOut +
    fate.deleted;
  const lines = [
    `# Serve landing autofix replay — ${rows?.length ?? 0} ${all ? "analyst" : "complete analyst"} sessions, ${livePoints} kept seeded points`,
    "",
    "## Flags on the seed view (points carrying each)",
    "",
    "| flag | seed | with the autofix |",
    "|---|---|---|",
    ...(Object.keys(FLAGS) as FlagCode[]).map(
      (code) => `| ${code} | ${flags.seed[code]} | ${flags.fixed[code]} |`,
    ),
    "",
    `In serves whose landing reads out or net (per stroke): ${misses.seed} → ${misses.fixed}`,
    "",
    `## ${moved} serves moved`,
    "",
    `- labeller moved the landing too: ${fate.movedIn.length}`,
    `  - vendor bounce → labeller: ${quantiles(fate.movedIn.map((r) => r.raw))}`,
    `  - pulled-back → labeller: ${quantiles(fate.movedIn.map((r) => r.fix))}`,
    `  - closer than the vendor's: ${fate.movedIn.filter((r) => r.fix < r.raw).length}`,
    `- labeller left the vendor's bounce: ${fate.untouched.length} (the fix moved it ${quantiles(fate.untouched)})`,
    `- labeller cleared the landing: ${fate.landingCleared}`,
    `- labeller re-called the serve out or net (the fix is wrong): ${fate.reCalledOut}`,
    `- stroke deleted: ${fate.deleted}`,
    "",
    "| vendor bounce missed by · after the serve | stayed in | re-called out |",
    "|---|---|---|",
    ...Object.keys(fate.byBand)
      .sort()
      .map(
        (key) => `| ${key} | ${fate.byBand[key][0]} | ${fate.byBand[key][1]} |`,
      ),
  ];
  console.log(lines.join("\n"));
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
