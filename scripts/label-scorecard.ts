/**
 * Score the labelling console's marks against a finished label session.
 *
 *   npx tsx scripts/label-scorecard.ts --session <uuid>
 *
 * Prints markdown: per mark code, how many marks there were and on how many
 * of them the labeller changed the point's winner, its ending / ended-by, or
 * anything in the point (seed against the row now; added and deleted points
 * and strokes count as changes) — then the points whose winner changed with
 * no `count`-tier mark, the last strokes seeded In whose coordinates say Out
 * or Net and what they were labelled, and the strokes the labeller deleted,
 * by reason. The arithmetic is `src/lib/services/labels/scorecard.ts`; this
 * file only reads.
 *
 * Reads only; writes nothing — every query here is a SELECT (and one storage
 * download, of the job's results file). The session's rows are read the way
 * `getLabelSession` reads them (`lib/data/labels-server.ts`) and built with
 * its own `buildLabelSession`. The marks are NOT read from anywhere: they are
 * rebuilt from the job's raw results file with the derivation code in this
 * checkout, hidden codes included, so the card measures today's rules — and
 * it does so even for a session labelled with marks off, which is the blind
 * reading: nobody was shown the marks it scores.
 *
 * LABELS ARE A REAL ATHLETE'S DATA: the output names the players. Keep it
 * outside the repo.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from "node:fs";
import { createAdminClient } from "@/lib/supabase/admin";
import { UUID_RE } from "@/lib/admin/validation";
import { readAllPages } from "@/lib/data/admin-range-read";
import { buildLabelSession } from "@/lib/data/labels-server";
import { readJobAdScoring } from "@/lib/services/labels/ad-scoring";
import { buildLabelMarks } from "@/lib/services/labels/marks";
import {
  LABEL_POINT_COLUMNS,
  LABEL_SHOT_COLUMNS,
  type LabelPointRow,
  type LabelShotRow,
} from "@/lib/services/labels/rows";
import {
  buildScorecard,
  openingMarks,
  renderScorecard,
} from "@/lib/services/labels/scorecard";
import { DERIVATION_VERSION } from "@/lib/services/splitstep/derivation";
import { buildTranscriptForJob } from "@/lib/services/splitstep/persist-transcript";

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

type SessionRow = Parameters<typeof buildLabelSession>[0];
type MatchRow = NonNullable<Parameters<typeof buildLabelSession>[1]>;

function argument(name: string): string | null {
  const at = process.argv.indexOf(name);
  return at === -1 ? null : (process.argv[at + 1] ?? null);
}

async function main() {
  const sessionId = argument("--session");
  if (!sessionId || !UUID_RE.test(sessionId)) {
    console.error("usage: npx tsx scripts/label-scorecard.ts --session <uuid>");
    process.exit(1);
  }

  const db = createAdminClient();

  const { data: session, error: sessionError } = await db
    .from("label_sessions")
    .select(
      "id, job_id, match_id, status, derivation_version, ad_scoring, marks_enabled, final_score, video_ends_early",
    )
    .eq("id", sessionId)
    .maybeSingle<SessionRow>();
  if (sessionError) throw new Error(sessionError.message);
  if (!session) throw new Error(`no label session ${sessionId}`);
  if (!session.job_id) {
    throw new Error(
      "the session's job is gone, so its marks cannot be rebuilt",
    );
  }

  const [matchResult, jobResult, pointRows, shotRows] = await Promise.all([
    db
      .from("matches")
      .select("id, player1_name, player2_name, score")
      .eq("id", session.match_id)
      .maybeSingle<MatchRow>(),
    readJobAdScoring(db, session),
    readAllPages<LabelPointRow>(
      db
        .from("label_points")
        .select(LABEL_POINT_COLUMNS)
        .eq("session_id", session.id)
        .order("point_index")
        .order("id"),
      "Could not read label points",
    ),
    readAllPages<LabelShotRow>(
      db
        .from("label_shots")
        .select(LABEL_SHOT_COLUMNS)
        .eq("session_id", session.id)
        .order("id"),
      "Could not read label shots",
    ),
  ]);
  if (matchResult.error) throw new Error(matchResult.error.message);
  if (jobResult.error) throw new Error(jobResult.error.message);

  const built = buildLabelSession(
    session,
    matchResult.data ?? null,
    pointRows,
    shotRows,
    jobResult.data ?? null,
  );

  // The marks as today's code raises them, every code — never a stored flag.
  const { transcript, rallies, reason } = await buildTranscriptForJob({
    supabase: db,
    jobId: session.job_id,
  });
  if (!transcript || !transcript.ok || !rallies) {
    throw new Error(reason ?? "the transcript could not be built");
  }
  const fileMarks = buildLabelMarks(transcript, rallies, built.points, {
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
