/**
 * Give a session seeded before the serve landing autofix what a new seed
 * gets (src/lib/services/labels/serve-autofix.ts): every in serve whose
 * landing reads out, pulled back into the box, in the row and its `seed`.
 *
 *   npx tsx scripts/label-serve-autofix.ts --session <uuid>           # dry run
 *   npx tsx scripts/label-serve-autofix.ts --session <uuid> --write   # apply
 *   npx tsx scripts/label-serve-autofix.ts --restore <backup.json>    # undo
 *
 * Only strokes still `kept` move — the labeller has not touched them, so the
 * row is its seed — and the rally each is read in is the session's live
 * strokes (deleted ones and the site's ghosts left out, added ones counted).
 * Each write is compare-and-set on `status = 'kept'` and the landing it read.
 * --write first saves the old values to a JSON file OUTSIDE the repo
 * (~/Desktop/advantage-serve-autofix-backups/); --restore puts them back on
 * every stroke still holding the pulled-back landing.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { UUID_RE } from "@/lib/admin/validation";
import { readLabelSessionRows } from "@/lib/data/labels-server";
import {
  pulledBackServeLanding,
  pullbackShot,
  servePlayedOn,
} from "@/lib/services/labels/serve-autofix";
import { liveShotsInOrder } from "@/lib/services/labels/session";
import { createAdminClient, type AdminClient } from "@/lib/supabase/admin";
import { loadEnvLocal } from "./lib/env";

loadEnvLocal();

interface Move {
  shotId: string;
  seed: Record<string, unknown>;
  from: { x: number; y: number };
  to: { x: number; y: number };
}

interface Backup {
  sessionId: string;
  at: string;
  moves: Move[];
}

async function plan(db: AdminClient, sessionId: string): Promise<Move[]> {
  const built = await readLabelSessionRows(db, sessionId);
  if (!built) throw new Error(`no analyst label session ${sessionId}`);
  const moves: Move[] = [];
  for (const point of built.session.points) {
    if (point.status === "deleted") continue;
    // Ghosts left out, as the seed leaves the site's removed strokes out.
    const live = liveShotsInOrder(point, true);
    live.forEach((shot, index) => {
      if (shot.status !== "kept" || !shot.seed) return;
      const to = pulledBackServeLanding(pullbackShot(shot), {
        playedOn: servePlayedOn(live, index),
      });
      if (!to) return;
      moves.push({
        shotId: shot.id,
        seed: { ...shot.seed },
        from: { x: shot.landingX!, y: shot.landingY! },
        to,
      });
    });
  }
  return moves;
}

/** How close a stored landing must be to the one read to count as unchanged. */
const SAME_LANDING_M = 1e-6;

/** Move each stroke's landing from one end of `move` to the other. */
async function write(
  db: AdminClient,
  moves: readonly Move[],
  direction: "apply" | "restore",
): Promise<number> {
  let written = 0;
  for (const move of moves) {
    const [from, to] =
      direction === "apply" ? [move.from, move.to] : [move.to, move.from];
    const { data, error } = await db
      .from("label_shots")
      .update({
        landing_x: to.x,
        landing_y: to.y,
        seed: { ...move.seed, landing_x: to.x, landing_y: to.y },
      })
      .eq("id", move.shotId)
      .eq("status", "kept")
      // A window, not `eq`: a double such as 4.775 does not round-trip
      // through the filter exactly, and an exact match then skipped strokes
      // nobody had touched (2026-11-05).
      .gte("landing_x", from.x - SAME_LANDING_M)
      .lte("landing_x", from.x + SAME_LANDING_M)
      .gte("landing_y", from.y - SAME_LANDING_M)
      .lte("landing_y", from.y + SAME_LANDING_M)
      .select("id");
    if (error) throw new Error(`${move.shotId}: ${error.message}`);
    if (data?.length) written += 1;
    else console.warn(`skipped ${move.shotId}: changed since it was read`);
  }
  return written;
}

async function main() {
  const db = createAdminClient();
  const argv = process.argv;

  const restoreAt = argv.indexOf("--restore");
  if (restoreAt >= 0) {
    const backup = JSON.parse(
      readFileSync(argv[restoreAt + 1], "utf8"),
    ) as Backup;
    // The backup's seed is the pre-autofix one; restoring writes it back.
    const written = await write(db, backup.moves, "restore");
    console.log(
      `restored ${written} of ${backup.moves.length} serves on ${backup.sessionId}`,
    );
    return;
  }

  const sessionId = argv[argv.indexOf("--session") + 1];
  if (!sessionId || !UUID_RE.test(sessionId)) {
    console.error(
      "usage: npx tsx scripts/label-serve-autofix.ts --session <uuid> [--write]",
    );
    process.exit(1);
  }

  const moves = await plan(db, sessionId);
  for (const m of moves) {
    console.log(
      `${m.shotId}  (${m.from.x.toFixed(2)}, ${m.from.y.toFixed(2)}) → (${m.to.x.toFixed(2)}, ${m.to.y.toFixed(2)})`,
    );
  }
  console.log(`${moves.length} serves to pull back`);
  if (!argv.includes("--write") || moves.length === 0) return;

  const dir = join(homedir(), "Desktop", "advantage-serve-autofix-backups");
  mkdirSync(dir, { recursive: true });
  const at = new Date().toISOString();
  const file = join(dir, `${sessionId}-${at.replace(/[:.]/g, "-")}.json`);
  writeFileSync(
    file,
    JSON.stringify({ sessionId, at, moves } satisfies Backup, null, 2),
  );
  console.log(`backup: ${file}`);
  const written = await write(db, moves, "apply");
  console.log(`wrote ${written} of ${moves.length}`);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
