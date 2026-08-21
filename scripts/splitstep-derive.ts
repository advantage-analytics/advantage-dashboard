/**
 * Build, inspect and optionally persist a job's derived transcript.
 *
 *   npx tsx scripts/splitstep-derive.ts --job <uuid>            # dry run, writes nothing
 *   npx tsx scripts/splitstep-derive.ts --job <uuid> --write    # persist
 *
 * Dry run is the default deliberately. This is the first thing in the pipeline
 * that mutates match data, and the two failure modes that matter — a mirrored
 * player mapping and a fold that lands on the wrong score — are both invisible
 * once the rows are in. Read the summary before passing --write.
 *
 * Requires in .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync } from 'node:fs';
import { createAdminClient } from '@/lib/supabase/admin';
import { persistTranscript } from '@/lib/services/splitstep/persist-transcript';
import { deriveAndPublish } from '@/lib/services/splitstep/derive-and-publish';

try {
  for (const line of readFileSync('.env.local', 'utf8').split('\n')) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    if (!process.env[m[1]]) process.env[m[1]] = m[2].replace(/^["']|["']$/g, '').trim();
  }
} catch {
  /* already exported */
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

async function main() {
  const argv = process.argv;
  const write = argv.includes('--write');
  const at = argv.indexOf('--job');
  const jobId = at === -1 ? null : argv[at + 1];

  if (!jobId || !UUID.test(jobId)) {
    console.error('usage: splitstep-derive.ts --job <uuid> [--write]');
    process.exit(1);
  }

  const supabase = createAdminClient();

  // --write goes through deriveAndPublish so the CLI exercises exactly what the
  // webhook runs, statistics and suppression included. A dry run stops at the
  // transcript, which is the whole point of it.
  const supabaseClient = supabase;
  if (write) {
    const published = await deriveAndPublish({ supabase: supabaseClient, jobId });
    if (!published.ok) {
      console.error(`REFUSED: ${published.reason}`);
      process.exit(1);
    }
    console.log('=== PUBLISHED ===');
    console.log(`match ${published.matchId}`);
    console.log(`wrote ${published.pointsWritten} points and ${published.shotsWritten} shots`);
    console.log('calculate_match_stats, backfill and suppression all ran.');
    return;
  }

  const out = await persistTranscript({ supabase, jobId, dryRun: true });

  if (!out.ok) {
    console.error(`REFUSED: ${out.reason}`);
    if (out.transcript) {
      const r = out.transcript.reconciliation;
      console.error(`  folded sets: ${JSON.stringify(r.foldedSets)}`);
      console.error(`  unresolved points: ${r.unresolvedPoints.length}`);
    }
    process.exit(1);
  }

  const t = out.transcript;
  const r = t.reconciliation;
  const shots = t.points.reduce((n, p) => n + p.shots.length, 0);

  console.log(write ? '=== WRITTEN ===' : '=== DRY RUN — nothing written ===');
  console.log(`player1 (from the score fold, not by name): ${r.player1Label}`);
  console.log(`folded sets: ${JSON.stringify(r.foldedSets)}`);
  console.log(`points ${t.points.length}   shots ${shots}   games ${r.games.length}`);
  console.log(
    `winnerShare ${t.winnerShare.toFixed(3)} (gate <0.40)   ` +
      `serveRetention ${t.serveGeometryRetention.toFixed(3)} (gate >0.75)   ` +
      `unreturnedServeRate ${t.unreturnedServeRate.toFixed(3)}`
  );

  const byType: Record<string, number> = {};
  const pointFlags: Record<string, number> = {};
  const shotFlags: Record<string, number> = {};
  for (const p of t.points) {
    byType[p.result_type ?? '(none)'] = (byType[p.result_type ?? '(none)'] ?? 0) + 1;
    for (const f of p.flags) pointFlags[f] = (pointFlags[f] ?? 0) + 1;
    for (const s of p.shots) for (const f of s.flags) shotFlags[f] = (shotFlags[f] ?? 0) + 1;
  }
  const show = (label: string, o: Record<string, number>) => {
    console.log(`\n${label}`);
    for (const [k, v] of Object.entries(o).sort((a, b) => b[1] - a[1])) {
      console.log(`  ${String(v).padStart(5)}  ${k}`);
    }
  };
  show('result_type', byType);
  show('point flags', pointFlags);
  show('shot flags', shotFlags);

  console.log('\nfirst three points');
  for (const p of t.points.slice(0, 3)) {
    console.log(
      `  #${p.point_number} set${p.set_number} game${p.game_number} ` +
        `server_p1=${p.server_is_player1} won_p1=${p.won_by_player1} ` +
        `rally=${p.rally_length} ${p.result_type ?? '-'} t=${p.video_time?.toFixed(1)}`
    );
    for (const s of p.shots) {
      console.log(
        `      ${s.shot_number}  ${String(s.shot_type).padEnd(12)} ${String(s.result).padEnd(4)} ` +
          `p1=${s.is_player1 ? 'Y' : 'N'} zone=${String(s.zone ?? '-').padEnd(13)} ` +
          `land=(${s.landing_x?.toFixed(2) ?? '-'}, ${s.landing_y?.toFixed(2) ?? '-'}) ` +
          `mph=${s.speed_mph?.toFixed(0) ?? '-'}`
      );
    }
  }

  if (!write) console.log('\nNothing was written. Re-run with --write to persist.');
  else console.log(`\nWrote ${out.pointsWritten} points and ${out.shotsWritten} shots.`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
