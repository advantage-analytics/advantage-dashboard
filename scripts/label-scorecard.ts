/**
 * Score the labelling console's marks against a finished label session.
 *
 *   npx tsx scripts/label-scorecard.ts --session <uuid>
 *
 * Prints markdown: per mark code, how many marks there were and on how many the
 * labeller changed the point's winner, its ending or anything in the point;
 * then the changes no chip pointed at, the last strokes seeded In whose
 * coordinates say Out or Net, the deleted strokes by reason, the games that
 * do not add up, the winner flips, what happened to the last stroke's result
 * and landing, the vendor's out-call tails, and the serves that cannot be
 * right. The arithmetic is `src/lib/services/labels/scorecard.ts`.
 *
 * Reads only: every query is a SELECT, plus one storage download of the job's
 * results file. The marks are rebuilt from that file with the derivation code
 * in this checkout, hidden codes included, so the card measures today's rules,
 * even for a session labelled with marks off. The vendor's own calls come
 * from `label_shots.vendor`, the stroke frozen on each row at seed time.
 *
 * LABELS ARE A REAL ATHLETE'S DATA: the output names the players. Keep it
 * outside the repo.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/admin/validation";
import { readAllPages } from "@/lib/data/admin-range-read";
import { buildJobMarks, readLabelSessionRows } from "@/lib/data/labels-server";
import {
  buildScorecard,
  openingMarks,
  renderScorecard,
  vendorStrokeFacts,
  type VendorStrokeFacts,
} from "@/lib/services/labels/scorecard";
import { DERIVATION_VERSION } from "@/lib/services/splitstep/derivation";
import { loadEnvLocal } from "./lib/env";

loadEnvLocal();

async function main() {
  const sessionId = process.argv[process.argv.indexOf("--session") + 1];
  if (!sessionId || !UUID_RE.test(sessionId)) {
    console.error("usage: npx tsx scripts/label-scorecard.ts --session <uuid>");
    process.exit(1);
  }

  const db = createAdminClient();
  const built = (await readLabelSessionRows(db, sessionId))?.session;
  if (!built) throw new Error(`no label session ${sessionId}`);
  if (!built.jobId) {
    throw new Error(
      "the session's job is gone, so its marks cannot be rebuilt",
    );
  }

  // The marks as today's code raises them, every code — never a stored flag —
  // and the vendor's stroke, frozen on each row: the loader's column list
  // leaves it out, since the console never reads it. Independent reads.
  const [markFor, vendorRows] = await Promise.all([
    buildJobMarks(db, built.jobId),
    readAllPages<{ id: string; vendor: unknown }>(
      db
        .from("label_shots")
        .select("id, vendor")
        .eq("session_id", built.id)
        .order("id"),
      "Could not read the vendor strokes",
    ),
  ]);
  const fileMarks = markFor(built.points, { hidden: true });
  const marks = openingMarks(fileMarks, built.points, built.adScoring);

  const vendor = new Map<string, VendorStrokeFacts>();
  for (const row of vendorRows) {
    const facts = vendorStrokeFacts(row.vendor);
    if (facts) vendor.set(row.id, facts);
  }

  const card = buildScorecard(built.points, marks, {
    adScoring: built.adScoring,
    // A site-removed stroke is a ghost only while the marks are on.
    ghosts: built.marksEnabled,
    vendor,
  });
  const notes = [
    `session \`${built.id}\` (${built.status})`,
    `seeded on derivation ${built.derivationVersion}, marks rebuilt on ${DERIVATION_VERSION}`,
    built.marksEnabled
      ? "labelled with marks on"
      : "labelled BLIND (marks off): nobody was shown these marks",
  ];
  console.log(
    renderScorecard(card, {
      title: `Marks scorecard — ${built.player1Name} v ${built.player2Name}`,
      names: { p1: built.player1Name, p2: built.player2Name },
    }),
  );
  console.log(notes.map((note) => `- ${note}`).join("\n"));
}

main().catch((cause: unknown) => {
  console.error((cause as Error)?.message ?? cause);
  process.exit(1);
});
