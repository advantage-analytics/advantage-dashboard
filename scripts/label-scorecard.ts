/**
 * Score the labelling console's marks against a finished label session.
 *
 *   npx tsx scripts/label-scorecard.ts --session <uuid>
 *
 * Prints markdown: per mark code, how many marks there were and on how many the
 * labeller changed the point's winner, its ending or anything in the point;
 * then the unmarked winner changes, the last strokes seeded In whose
 * coordinates say Out or Net, and the deleted strokes by reason. The arithmetic
 * is `src/lib/services/labels/scorecard.ts`.
 *
 * Reads only: every query is a SELECT, plus one storage download of the job's
 * results file. The marks are rebuilt from that file with the derivation code
 * in this checkout, hidden codes included, so the card measures today's rules,
 * even for a session labelled with marks off.
 *
 * LABELS ARE A REAL ATHLETE'S DATA: the output names the players. Keep it
 * outside the repo.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/admin/validation";
import { buildJobMarks, readLabelSessionRows } from "@/lib/data/labels-server";
import {
  buildScorecard,
  openingMarks,
  renderScorecard,
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

  // The marks as today's code raises them, every code — never a stored flag.
  const fileMarks = (await buildJobMarks(db, built.jobId))(built.points, {
    hidden: true,
  });
  const marks = openingMarks(fileMarks, built.points, built.adScoring);

  const card = buildScorecard(built.points, marks);
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
