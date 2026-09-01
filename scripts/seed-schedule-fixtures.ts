/**
 * Seed ZZ Test Program with a verifiable schedule.
 *
 *   npx tsx scripts/seed-schedule-fixtures.ts
 *
 * Writes four `program_events` (three duals, one tournament) with their
 * `program_event_entries`, plus the `matches` and `processing_jobs` rows that
 * give the schedule surfaces something real to count:
 *
 *  - one dual with EVERY line decided (scores + one forfeit), so `dualScore()`
 *    returns `decided: true` and a team score;
 *  - one dual with NO line decided, so `dualScore()` returns `decided: false`;
 *  - one dual partly played, for the in-between rendering;
 *  - one tournament whose entries carry multi-round runs;
 *  - two entries whose matches sit in different analysis states (`completed`
 *    with a derivation stamp → "ready", and `processing` → "working"), next to
 *    hand-scored lines with no job at all → "manual". That is what makes
 *    "N of M lines analyzed" countable.
 *
 * Idempotent: every row id is derived deterministically from a seed constant,
 * and every write is an upsert on `id`. Running it twice converges to the same
 * rows. It only ever writes rows carrying the ZZ Test Program's `program_id`
 * (or FKs that resolve to them) and refuses to run at all if the target
 * program's name does not start with "ZZ" — so it cannot touch UCLA,
 * Dartmouth, or anybody real.
 */

import { createHash } from 'node:crypto';
import { loadEnvLocal } from './lib/env';
import { dualScore } from '@/lib/schedule/entry-state';
import { resolveAnalysisStatus } from '@/lib/data/match-analysis';
import type { EventEntry } from '@/lib/schedule/types';

loadEnvLocal();

// Imported lazily below so loadEnvLocal() runs before admin.ts reads process.env
// at createAdminClient() call time (it reads inside the function, but keeping
// the order explicit costs nothing).
import { createAdminClient } from '@/lib/supabase/admin';

/** ZZ Test Program — the designated fixture program. Never a real school. */
const PROGRAM_ID = 'edaf1aa0-b346-4a9f-aa8d-d47d586d25a4';

/** Bump to mint a fresh generation of ids (the old rows would then be orphaned
 *  fixtures, not duplicates of live data — delete them by hand if you do). */
const SEED_NS = 'advantage-schedule-fixtures-v1';

/**
 * Deterministic UUID from the seed namespace and a stable name.
 *
 * SHA-256 truncated to 16 bytes with the version/variant bits set so Postgres
 * accepts it as a well-formed UUID. Determinism is the idempotency mechanism:
 * the same name always addresses the same row, so re-running upserts in place.
 */
function fixtureId(name: string): string {
  const digest = createHash('sha256').update(`${SEED_NS}:${name}`).digest();
  const b = Buffer.from(digest.subarray(0, 16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const hex = b.toString('hex');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

interface Score {
  player1: number[];
  player2: number[];
  player1_tiebreaks?: (number | null)[];
  player2_tiebreaks?: (number | null)[];
}

interface LineSpec {
  key: string;
  discipline: 'singles' | 'doubles';
  slot: string | null;
  position: number;
  draw?: string | null;
  seed?: number | null;
  players: string[];
  /** Attach the owner's user id (singles lines only get one). */
  ownPlayer?: boolean;
  opponents: string[];
  opponentSchool?: string | null;
  forfeit?: 'ours' | 'theirs' | null;
  /** One per round for a tournament run; at most one for a dual line. */
  matches?: { round: string | null; score: Score; opponents?: string[] }[];
  /** Analysis state for this line's first match. Omit = hand-scored, no job. */
  job?: { status: string; derivationVersion?: string };
}

interface EventSpec {
  key: string;
  kind: 'dual' | 'tournament';
  name: string;
  startsOn: string;
  endsOn: string;
  site: 'home' | 'away' | 'neutral';
  surface: string | null;
  host: string | null;
  /** `ad_scoring` MUST be a real boolean — jsonb true/false, never "null". */
  format: { best_of: number; ad_scoring: boolean };
  lines: LineSpec[];
}

/** A standard dual card: 6 singles + 3 doubles, all empty. */
function emptyDualLines(prefix: string): LineSpec[] {
  const singles = [
    'Aiden Brooks', 'Theo Nakamura', 'Rafael Osei',
    'Marcus Webb', 'Julian Reyes', 'Owen Caldwell',
  ].map<LineSpec>((name, i) => ({
    key: `${prefix}-s${i + 1}`,
    discipline: 'singles',
    slot: `S${i + 1}`,
    position: i + 1,
    players: [name],
    opponents: [],
  }));
  const doubles = [
    ['Aiden Brooks', 'Theo Nakamura'],
    ['Rafael Osei', 'Marcus Webb'],
    ['Julian Reyes', 'Owen Caldwell'],
  ].map<LineSpec>((pair, i) => ({
    key: `${prefix}-d${i + 1}`,
    discipline: 'doubles',
    slot: `D${i + 1}`,
    position: i + 1,
    players: pair,
    opponents: [],
  }));
  return [...singles, ...doubles];
}

const EVENTS: EventSpec[] = [
  {
    // Every line decided: 4 singles wins (one via their forfeit), 2 losses,
    // doubles point ours 2-1. dualScore → { us: 5, them: 2, decided: true }.
    key: 'dual-decided',
    kind: 'dual',
    name: 'Seed State University',
    startsOn: '2026-02-07',
    endsOn: '2026-02-07',
    site: 'home',
    surface: 'Hard',
    host: null,
    format: { best_of: 3, ad_scoring: false },
    lines: [
      {
        key: 'dual-decided-s1', discipline: 'singles', slot: 'S1', position: 1,
        players: ['Clajerson Gimena'], ownPlayer: true, opponents: ['M. Alvarez'],
        matches: [{ round: 'S1', score: { player1: [6, 6], player2: [4, 2] } }],
        // completed + derivation stamp → resolves "completed" → analyzed/ready.
        job: { status: 'completed', derivationVersion: 'seed-fixture' },
      },
      {
        key: 'dual-decided-s2', discipline: 'singles', slot: 'S2', position: 2,
        players: ['Theo Nakamura'], opponents: ['D. Petrov'],
        matches: [{ round: 'S2', score: { player1: [3, 4], player2: [6, 6] } }],
        // Vendor mid-flight → resolves "processing" → the state that pulses.
        job: { status: 'processing' },
      },
      {
        key: 'dual-decided-s3', discipline: 'singles', slot: 'S3', position: 3,
        players: ['Rafael Osei'], opponents: ['J. Kim'],
        matches: [{
          round: 'S3',
          // 7-6 set: game counts, with the LOSER's tiebreak points alongside.
          score: {
            player1: [7, 6], player2: [6, 4],
            player1_tiebreaks: [null, null], player2_tiebreaks: [5, null],
          },
        }],
      },
      {
        key: 'dual-decided-s4', discipline: 'singles', slot: 'S4', position: 4,
        players: ['Marcus Webb'], opponents: ['A. Haddad'],
        matches: [{ round: 'S4', score: { player1: [6, 6], player2: [3, 4] } }],
      },
      {
        // Decided without a match ever existing: they forfeited, point to us.
        key: 'dual-decided-s5', discipline: 'singles', slot: 'S5', position: 5,
        players: ['Julian Reyes'], opponents: ['T. Okafor'], forfeit: 'theirs',
      },
      {
        key: 'dual-decided-s6', discipline: 'singles', slot: 'S6', position: 6,
        players: ['Owen Caldwell'], opponents: ['L. Fischer'],
        matches: [{
          round: 'S6',
          score: {
            player1: [4, 6], player2: [6, 7],
            player1_tiebreaks: [null, 4], player2_tiebreaks: [null, null],
          },
        }],
      },
      {
        key: 'dual-decided-d1', discipline: 'doubles', slot: 'D1', position: 1,
        players: ['Clajerson Gimena', 'Theo Nakamura'],
        opponents: ['M. Alvarez', 'D. Petrov'],
        matches: [{ round: 'D1', score: { player1: [6], player2: [3] } }],
      },
      {
        key: 'dual-decided-d2', discipline: 'doubles', slot: 'D2', position: 2,
        players: ['Rafael Osei', 'Marcus Webb'],
        opponents: ['J. Kim', 'A. Haddad'],
        matches: [{ round: 'D2', score: { player1: [4], player2: [6] } }],
      },
      {
        key: 'dual-decided-d3', discipline: 'doubles', slot: 'D3', position: 3,
        players: ['Julian Reyes', 'Owen Caldwell'],
        opponents: ['T. Okafor', 'L. Fischer'],
        matches: [{ round: 'D3', score: { player1: [7], player2: [5] } }],
      },
    ],
  },
  {
    // Nothing decided: nine empty lines. dualScore → { 0, 0, decided: false }.
    key: 'dual-upcoming',
    kind: 'dual',
    name: 'Fixture Tech',
    startsOn: '2026-09-19',
    endsOn: '2026-09-19',
    site: 'away',
    surface: 'Hard',
    host: null,
    format: { best_of: 3, ad_scoring: true },
    lines: emptyDualLines('dual-upcoming'),
  },
  {
    // Partly played: two lines in, seven to go. Still decided: false.
    key: 'dual-partial',
    kind: 'dual',
    name: 'Placeholder College',
    startsOn: '2026-01-24',
    endsOn: '2026-01-24',
    site: 'neutral',
    surface: 'Indoor Hard',
    host: null,
    format: { best_of: 3, ad_scoring: false },
    lines: emptyDualLines('dual-partial').map((line): LineSpec => {
      if (line.slot === 'S1') {
        return {
          ...line,
          opponents: ['R. Duval'],
          matches: [{ round: 'S1', score: { player1: [6, 7], player2: [2, 5] } }],
        };
      }
      if (line.slot === 'S2') {
        return {
          ...line,
          opponents: ['K. Mensah'],
          matches: [{ round: 'S2', score: { player1: [4, 3], player2: [6, 6] } }],
        };
      }
      return line;
    }),
  },
  {
    key: 'tournament',
    kind: 'tournament',
    name: 'Seed Invitational',
    startsOn: '2026-01-16',
    endsOn: '2026-01-18',
    site: 'neutral',
    surface: 'Hard',
    host: 'Seed State University',
    format: { best_of: 3, ad_scoring: true },
    lines: [
      {
        // A main-draw run: through R32, out in R16.
        key: 'tournament-t1', discipline: 'singles', slot: null, position: 1,
        draw: 'main', seed: 4,
        players: ['Clajerson Gimena'], ownPlayer: true,
        opponents: ['S. Virtanen'], opponentSchool: 'Placeholder College',
        matches: [
          { round: 'R32', score: { player1: [6, 6], player2: [2, 3] }, opponents: ['P. Laurent'] },
          { round: 'R16', score: { player1: [4, 4], player2: [6, 6] }, opponents: ['S. Virtanen'] },
        ],
      },
      {
        key: 'tournament-t2', discipline: 'singles', slot: null, position: 2,
        draw: 'qualifying',
        players: ['Theo Nakamura'],
        opponents: ['B. Silva'], opponentSchool: 'Fixture Tech',
        matches: [
          { round: 'Q1', score: { player1: [6, 6], player2: [4, 4] }, opponents: ['B. Silva'] },
        ],
      },
      {
        // Entered, nothing recorded yet.
        key: 'tournament-t3', discipline: 'doubles', slot: null, position: 3,
        draw: 'main',
        players: ['Rafael Osei', 'Marcus Webb'],
        opponents: [],
      },
    ],
  },
];

async function main() {
  const supabase = createAdminClient();

  // ---- Guard: only ever the designated fixture program. -------------------
  const { data: program, error: programError } = await supabase
    .from('programs')
    .select('id, school_name')
    .eq('id', PROGRAM_ID)
    .single();
  if (programError || !program) {
    throw new Error(`Target program ${PROGRAM_ID} not found: ${programError?.message}`);
  }
  if (!/^zz/i.test(program.school_name ?? '')) {
    throw new Error(
      `Refusing to seed "${program.school_name}" — the target must be the ZZ test program.`
    );
  }

  const { data: members, error: memberError } = await supabase
    .from('program_members')
    .select('user_id, role')
    .eq('program_id', PROGRAM_ID);
  if (memberError || !members?.length) {
    throw new Error(`No members on the test program: ${memberError?.message}`);
  }
  const owner =
    members.find((m) => m.role === 'owner')?.user_id ?? members[0].user_id;

  // ---- Build rows. --------------------------------------------------------
  const eventRows = EVENTS.map((event) => ({
    id: fixtureId(`event:${event.key}`),
    program_id: PROGRAM_ID,
    kind: event.kind,
    name: event.name,
    starts_on: event.startsOn,
    ends_on: event.endsOn,
    site: event.site,
    surface: event.surface,
    host: event.host,
    format: event.format,
    created_by: owner,
  }));

  const entryRows = EVENTS.flatMap((event) =>
    event.lines.map((line) => ({
      id: fixtureId(`entry:${line.key}`),
      event_id: fixtureId(`event:${event.key}`),
      program_id: PROGRAM_ID,
      discipline: line.discipline,
      slot: line.slot,
      position: line.position,
      draw: line.draw ?? null,
      seed: line.seed ?? null,
      player_user_ids: line.ownPlayer ? [owner] : [],
      player_labels: line.players,
      opponent_labels: line.opponents,
      opponent_school: line.opponentSchool ?? null,
      opponent_program_id: null,
      forfeit: line.forfeit ?? null,
    }))
  );

  // Mirrors recordResult() in src/lib/schedule/actions.ts — the one place the
  // app mints a match from an entry — so the seed reads back through
  // getProgramSchedule() exactly like a coach-recorded result.
  const matchRows = EVENTS.flatMap((event) =>
    event.lines.flatMap((line) =>
      (line.matches ?? []).map((m) => ({
        id: fixtureId(`match:${line.key}:${m.round ?? ''}`),
        player1_name: line.players.join(' / '),
        player2_name: (m.opponents ?? line.opponents).join(' / '),
        player1_id:
          line.discipline === 'singles' && line.ownPlayer ? owner : null,
        program_id: PROGRAM_ID,
        event_entry_id: fixtureId(`entry:${line.key}`),
        tournament_name: event.name,
        round: m.round,
        // Noon, not midnight — a bare date lands 00:00Z and renders as the
        // previous day everywhere west of Greenwich.
        date: `${event.startsOn}T12:00:00`,
        format: {
          best_of: event.format.best_of,
          ad_scoring: event.format.ad_scoring,
          play_on_lets: false,
        },
        score: m.score,
        result: 'Final Score',
        match_type: line.discipline === 'doubles' ? 'Doubles' : 'Singles',
        court_type: event.surface,
        // NULL, never 'manual' — a non-null source_provider reads as an import
        // and reports the line as analysed (see recordResult's comment).
        source_provider: null,
        analysis_method: 'manual',
        created_by: owner,
        private: false,
      }))
    )
  );

  const jobRows = EVENTS.flatMap((event) =>
    event.lines.flatMap((line) => {
      if (!line.job || !line.matches?.length) return [];
      const first = line.matches[0];
      return [{
        id: fixtureId(`job:${line.key}`),
        match_id: fixtureId(`match:${line.key}:${first.round ?? ''}`),
        created_by: owner,
        provider: 'splitstep',
        external_job_id: `seed-fixture-${line.key}`,
        status: line.job.status,
        derivation_version: line.job.derivationVersion ?? null,
        billable_seconds: 5400,
        submitted_at: `${event.startsOn}T18:00:00Z`,
        ...(line.job.status === 'completed'
          ? { completed_at: `${event.startsOn}T21:00:00Z` }
          : {}),
      }];
    })
  );

  // ---- Write, FK order, upsert on id. -------------------------------------
  for (const [table, rows] of [
    ['program_events', eventRows],
    ['program_event_entries', entryRows],
    ['matches', matchRows],
    ['processing_jobs', jobRows],
  ] as const) {
    const { error } = await supabase.from(table).upsert(rows as never[], {
      onConflict: 'id',
    });
    if (error) throw new Error(`${table}: ${error.message}`);
    console.log(`  upserted ${rows.length} ${table}`);
  }

  // ---- Read back and verify what the criteria actually claim. -------------
  const count = async (table: string, filter: (q: any) => any) => {
    const { count: n, error } = await filter(
      supabase.from(table).select('id', { count: 'exact', head: true })
    );
    if (error) throw new Error(`count ${table}: ${error.message}`);
    return n as number;
  };

  const events = await count('program_events', (q: any) => q.eq('program_id', PROGRAM_ID));
  const entries = await count('program_event_entries', (q: any) => q.eq('program_id', PROGRAM_ID));
  const matches = await count('matches', (q: any) =>
    q.eq('program_id', PROGRAM_ID).not('event_entry_id', 'is', null)
  );
  const strayEvents = await count('program_events', (q: any) => q.neq('program_id', PROGRAM_ID));
  const strayEntries = await count('program_event_entries', (q: any) => q.neq('program_id', PROGRAM_ID));

  console.log(`\n  ZZ Test Program now has:`);
  console.log(`    program_events:        ${events}`);
  console.log(`    program_event_entries: ${entries}`);
  console.log(`    matches on entries:    ${matches}`);
  console.log(`  rows under any OTHER program_id: ${strayEvents} events, ${strayEntries} entries`);

  // dualScore over the seeded duals, computed by the real predicate.
  for (const key of ['dual-decided', 'dual-upcoming'] as const) {
    const eventId = fixtureId(`event:${key}`);
    const { data: entryData } = await supabase
      .from('program_event_entries')
      .select('id, discipline, forfeit')
      .eq('event_id', eventId);
    const { data: matchData } = await supabase
      .from('matches')
      .select('id, event_entry_id, round, score, player2_name')
      .in('id', (await supabase
        .from('matches')
        .select('id')
        .in('event_entry_id', (entryData ?? []).map((e) => e.id))
      ).data?.map((m) => m.id) ?? []);

    const asEntries: EventEntry[] = (entryData ?? []).map((e) => ({
      id: e.id, eventId, discipline: e.discipline, slot: null, position: 0,
      draw: null, seed: null, playerUserIds: [], playerLabels: [],
      opponentLabels: [], opponentSchool: null,
      forfeit: e.forfeit ?? null,
      matches: (matchData ?? [])
        .filter((m) => m.event_entry_id === e.id)
        .map((m) => ({
          id: m.id, round: m.round, status: 'manual' as const,
          score: m.score, opponentLabels: [], hasVideo: false,
        })),
    }));
    const score = dualScore(asEntries);
    console.log(
      `  dualScore(${key}): us ${score.us} — them ${score.them}, decided: ${score.decided}`
    );
  }

  // Analysis states, resolved by the real resolver.
  const { data: jobs } = await supabase
    .from('processing_jobs')
    .select('id, match_id, status, derivation_version')
    .in('id', jobRows.map((j) => j.id));
  for (const job of jobs ?? []) {
    console.log(
      `  job ${job.id.slice(0, 8)}: db "${job.status}" → ui "${resolveAnalysisStatus(
        job.status,
        job.derivation_version
      )}"`
    );
  }

  // Every event's format must carry a real jsonb boolean, never "null".
  const { data: formats } = await supabase
    .from('program_events')
    .select('id, name, format')
    .eq('program_id', PROGRAM_ID);
  for (const row of formats ?? []) {
    const ad = (row.format as Record<string, unknown>)?.ad_scoring;
    if (typeof ad !== 'boolean') {
      throw new Error(`event "${row.name}" has non-boolean ad_scoring: ${JSON.stringify(ad)}`);
    }
  }
  console.log(`  every event format carries boolean ad_scoring ✓`);
}

main().then(
  () => process.exit(0),
  (err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
);
