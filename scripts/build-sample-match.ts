/**
 * Build the first-run sample match fixture from one real match.
 *
 *   npx tsx scripts/build-sample-match.ts            # writes src/lib/sample-match/fixture.json
 *   npx tsx scripts/build-sample-match.ts --check    # read, anonymise, verify, write nothing
 *
 * Reads match SOURCE_MATCH_ID through the service-role client and the same
 * loader the match page composes (`loadMatchDetail`, the inside of
 * `getMatchDetailData`) — never a hand-copied `select`, so the fixture cannot
 * drift from what the page actually renders. "You" is pinned to seat one
 * (`youSeat: "player1"`): the service-role client has no viewer to orient
 * from, and the sample is told from the winner's side.
 *
 * The result goes through `anonymiseMatchDetail` and then `assertSampleClean`,
 * and only a clean result is written. A banned name or a real uuid anywhere in
 * the output fails the run with the path it sits at; nothing is written then.
 * `foldUnreconciled` is carried exactly as the loader produced it.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 * Run it from the repository root, where .env.local lives, and commit the
 * fixture it writes. `tests/sample-match-fixture.spec.ts` guards the file.
 */

import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname } from "node:path";
import { createAdminClient } from "@/lib/supabase/admin";
import { loadMatchDetail } from "@/lib/data/match-detail-server";
import {
  anonymiseMatchDetail,
  assertSampleClean,
} from "@/lib/sample-match/anonymise";

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

/** Rudy Quan d. Matt Goodman 6-2 6-2 — 87 points, 532 shots, a full video match. */
const SOURCE_MATCH_ID = "bca90097-72c9-448b-b0e4-e0e83dc143d9";
const FIXTURE_PATH = "src/lib/sample-match/fixture.json";

async function main() {
  const check = process.argv.includes("--check");
  const supabase = createAdminClient();

  const data = await loadMatchDetail(supabase, SOURCE_MATCH_ID, {
    myPlayerIds: () => Promise.resolve([]),
    youSeat: "player1",
    kpiHistory: false,
  });
  if (!data) {
    console.error(`match ${SOURCE_MATCH_ID} not found`);
    process.exit(1);
  }
  if (!data.points) {
    console.error(`match ${SOURCE_MATCH_ID}: the points read failed`);
    process.exit(1);
  }
  if (!data.statsResult) {
    console.error(`match ${SOURCE_MATCH_ID}: no statistics rows`);
    process.exit(1);
  }

  const sample = anonymiseMatchDetail(data);
  // Checked on the serialised form, which is what gets committed.
  const json = JSON.stringify(sample, null, 2) + "\n";
  assertSampleClean(JSON.parse(json));

  const sets = sample.match.score.sets
    .map((set) => `${set.player1}-${set.player2}`)
    .join(" ");
  console.log("=== SAMPLE MATCH ===");
  console.log(`${sample.match.player1.name} d. ${sample.match.player2.name}`);
  console.log(`score ${sets} (you = player1, won = ${sample.match.won})`);
  console.log(`points ${sample.points?.length ?? 0}`);
  console.log(
    `shots ${sample.points?.reduce((n, p) => n + (p.shots?.length ?? 0), 0) ?? 0}`,
  );
  console.log(`foldUnreconciled ${sample.foldUnreconciled}`);
  console.log(`insights ${sample.insights ? "present" : "none"}`);
  console.log(`keyMoments ${sample.keyMoments.length}`);

  if (check) {
    console.log("--check: clean, nothing written");
    return;
  }

  mkdirSync(dirname(FIXTURE_PATH), { recursive: true });
  writeFileSync(FIXTURE_PATH, json);
  console.log(`wrote ${FIXTURE_PATH} (${(json.length / 1024).toFixed(0)} KB)`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
