import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";

import { expect, test } from "@playwright/test";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

import {
  ANON_KEY,
  HAVE_ENV,
  SUPABASE_URL,
  createAdminClient,
  createLogins,
  runMarker,
  type Session,
} from "./fixtures/live-db";

/**
 * Apply 20260910120000 only to an isolated local Supabase development stack,
 * then run with SCHEDULE_OUTCOMES_DEV_URL set to that stack's exact URL.
 * This explicit opt-in must be supplied by the operator, never inferred from
 * .env.local or the mere presence of a service-role key. All remote hosts are
 * refused before constructing any client, including an explicitly opted-in host.
 * The local bootstrap keeps unrelated parents reduced, but reconstructs the
 * complete processing_jobs contract — columns, constraints, indexes, policies,
 * grants, updated_at trigger and realtime publication — from every migration
 * in the repository that changes that table's catalog.
 * See fixtures/schedule-outcomes-local.sql for exact provenance and assumptions.
 *
 * npx playwright test tests/schedule-outcomes-db.spec.ts --workers=1
 * A skip is NOT proof of the live database acceptance criterion.
 */
const DEV_URL = process.env.SCHEDULE_OUTCOMES_DEV_URL;
const LOCAL_CONTAINER = process.env.SCHEDULE_OUTCOMES_LOCAL_CONTAINER;
const OPTED_IN = Boolean(DEV_URL);
if (OPTED_IN) {
  const target = new URL(DEV_URL!);
  if (
    target.protocol !== "http:" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(target.hostname) ||
    target.username ||
    target.password ||
    target.search ||
    target.hash ||
    target.pathname !== "/" ||
    SUPABASE_URL !== DEV_URL
  ) {
    throw new Error(
      "Schedule outcome tests require matching, HTTP localhost URLs; remote database writes are forbidden",
    );
  }
}
if (
  LOCAL_CONTAINER &&
  LOCAL_CONTAINER !== "supabase_db_advantage-t1-supabase.nVvVfW"
) {
  throw new Error(
    "Schedule outcome catalog checks only permit the verified disposable local container",
  );
}
const exec = promisify(execFile);
async function localSql(query: string): Promise<string> {
  if (
    !OPTED_IN ||
    DEV_URL !== "http://127.0.0.1:55321" ||
    LOCAL_CONTAINER !== "supabase_db_advantage-t1-supabase.nVvVfW"
  ) {
    throw new Error("Only the explicitly approved local fixture is allowed");
  }
  return (
    await exec("docker", [
      "exec",
      LOCAL_CONTAINER,
      "psql",
      "-X",
      "-U",
      "postgres",
      "-d",
      "postgres",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-c",
      query,
    ])
  ).stdout.trim();
}
const { mark, password } = runMarker("schedule-outcomes");
const TABLE = "program_event_outcomes";

type Outcome = {
  entry_id: string;
  event_id: string;
  program_id: string;
  event_kind: string;
  round: string | null;
  kind: string;
  side: string;
};

test.describe("schedule outcomes (verified development database only)", () => {
  test.describe.configure({ mode: "serial", timeout: 60_000 });
  test.skip(
    !OPTED_IN,
    "Development target not explicitly verified; no DB writes",
  );

  let admin: SupabaseClient;
  let owner: Session;
  let coach: Session;
  let staff: Session;
  let player: Session;
  let outsider: Session;
  const authUserIds: string[] = [];
  const programIds = [randomUUID(), randomUUID()];
  const eventIds = [randomUUID(), randomUUID(), randomUUID()];
  const entryIds = [randomUUID(), randomUUID(), randomUUID()];
  const historyTables = [
    "programs",
    "program_events",
    "program_event_entries",
    "matches",
    "match_stats",
    "points",
    "shots",
    "processing_jobs",
  ];
  const historyIds = [1, 2, 3, 4, 5, 6, 7, 8];
  const history: unknown[] = [];

  const dual = (changes: Partial<Outcome> = {}): Outcome => ({
    entry_id: entryIds[0],
    event_id: eventIds[0],
    program_id: programIds[0],
    event_kind: "dual",
    round: null,
    kind: "forfeit",
    side: "ours",
    ...changes,
  });
  const tournament = (changes: Partial<Outcome> = {}): Outcome =>
    dual({
      entry_id: entryIds[1],
      event_id: eventIds[1],
      event_kind: "tournament",
      round: "QF",
      ...changes,
    });

  test.beforeAll(async () => {
    test.setTimeout(180_000);
    // Fail (not skip) a requested live run with missing/mismatched credentials.
    expect(HAVE_ENV, "Development credentials are required").toBe(true);
    expect(
      SUPABASE_URL,
      "Credentials must target the approved development URL",
    ).toBe(DEV_URL);
    expect(
      LOCAL_CONTAINER,
      "The verified disposable local container must be explicit",
    ).toBe("supabase_db_advantage-t1-supabase.nVvVfW");
    expect(
      await localSql(`do $$
declare
  expected_columns text[] := array[
    'id|uuid|t|gen_random_uuid()','match_id|uuid|t|','created_by|uuid|f|',
    'provider|text|t|''splitstep''::text','external_job_id|text|f|',
    'status|text|t|''pending''::text','priority|text|t|''standard''::text',
    'start_time_seconds|numeric|f|','end_time_seconds|numeric|f|',
    'billable_seconds|integer|f|','video_object_key|text|f|',
    'video_url_expires_at|timestamp with time zone|f|','results_object_key|text|f|',
    'sas_url|text|f|','sas_expires_at|timestamp with time zone|f|',
    'trimmed_video_url|text|f|','submitted_at|timestamp with time zone|f|',
    'queued_ack_at|timestamp with time zone|f|','completed_at|timestamp with time zone|f|',
    'attempt_count|integer|t|0','error_message|text|f|',
    'raw_webhook_payload|jsonb|t|''[]''::jsonb','derivation_version|text|f|',
    'derivation_confidence|text|f|','created_at|timestamp with time zone|t|now()',
    'updated_at|timestamp with time zone|t|now()','video_access_token|text|f|',
    'video_token_issued_at|timestamp with time zone|f|',
    'video_token_revoked_at|timestamp with time zone|f|',
    'vendor_first_downloaded_at|timestamp with time zone|f|',
    'vendor_last_downloaded_at|timestamp with time zone|f|',
    'vendor_request_count|integer|t|0','initial_top_player_is_player1|boolean|f|',
    'ad_scoring|boolean|f|','fixed_camera|boolean|f|',
    'upload_progress_percent|smallint|f|','trimmed_object_key|text|f|',
    'derivation_quality|jsonb|f|','error_code|text|f|','error_category|text|f|',
    'error_step|text|f|','resubmitted_from_job_id|uuid|f|',
    'auto_resubmitted|boolean|t|false','last_polled_at|timestamp with time zone|f|',
    'players_url|text|f|','trajectories_url|text|f|','players_object_key|text|f|',
    'trajectories_object_key|text|f|'
  ];
  actual_columns text[];
begin
  select array_agg(format('%s|%s|%s|%s', a.attname,
    pg_catalog.format_type(a.atttypid,a.atttypmod), a.attnotnull,
    coalesce(pg_get_expr(d.adbin,d.adrelid),'')) order by a.attnum)
  into actual_columns
  from pg_attribute a
  left join pg_attrdef d on d.adrelid = a.attrelid and d.adnum = a.attnum
  where a.attrelid = 'public.processing_jobs'::regclass
    and a.attnum > 0 and not a.attisdropped;
  if actual_columns is distinct from expected_columns then
    raise exception 'processing_jobs columns differ: %', actual_columns;
  end if;
  if not (select c.relrowsecurity and not c.relforcerowsecurity
          from pg_class c where c.oid = 'public.processing_jobs'::regclass) then
    raise exception 'processing_jobs RLS flags differ';
  end if;
  if (select array_agg(conname::text || '|' || pg_get_constraintdef(oid,true)
        order by conname) from pg_constraint
      where conrelid = 'public.processing_jobs'::regclass) is distinct from array[
        'processing_jobs_confidence_check|CHECK (derivation_confidence IS NULL OR (derivation_confidence = ANY (ARRAY[''high''::text, ''medium''::text, ''low''::text])))',
        'processing_jobs_created_by_fkey|FOREIGN KEY (created_by) REFERENCES users(id)',
        'processing_jobs_match_id_fkey|FOREIGN KEY (match_id) REFERENCES matches(id) ON DELETE CASCADE',
        'processing_jobs_pkey|PRIMARY KEY (id)',
        'processing_jobs_priority_check|CHECK (priority = ANY (ARRAY[''standard''::text, ''express''::text]))',
        'processing_jobs_resubmitted_from_job_id_fkey|FOREIGN KEY (resubmitted_from_job_id) REFERENCES processing_jobs(id) ON DELETE SET NULL',
        'processing_jobs_status_check|CHECK (status = ANY (ARRAY[''pending''::text, ''uploading''::text, ''uploaded''::text, ''submitting''::text, ''queued''::text, ''processing''::text, ''deriving''::text, ''completed''::text, ''failed''::text, ''derivation_failed''::text]))',
        'processing_jobs_trim_check|CHECK (start_time_seconds IS NULL OR end_time_seconds IS NULL OR end_time_seconds > start_time_seconds)',
        'processing_jobs_upload_progress_check|CHECK (upload_progress_percent IS NULL OR upload_progress_percent >= 0 AND upload_progress_percent <= 100)'
      ] then raise exception 'processing_jobs constraints differ'; end if;
  if (select array_agg(indexname::text || '|' || indexdef order by indexname) from pg_indexes
      where schemaname = 'public' and tablename = 'processing_jobs') is distinct from array[
        'processing_jobs_awaiting_download_idx|CREATE INDEX processing_jobs_awaiting_download_idx ON public.processing_jobs USING btree (submitted_at) WHERE (vendor_first_downloaded_at IS NULL)',
        'processing_jobs_created_by_idx|CREATE INDEX processing_jobs_created_by_idx ON public.processing_jobs USING btree (created_by)',
        'processing_jobs_external_job_id_key|CREATE UNIQUE INDEX processing_jobs_external_job_id_key ON public.processing_jobs USING btree (external_job_id) WHERE (external_job_id IS NOT NULL)',
        'processing_jobs_match_id_idx|CREATE INDEX processing_jobs_match_id_idx ON public.processing_jobs USING btree (match_id)',
        'processing_jobs_one_live_per_match|CREATE UNIQUE INDEX processing_jobs_one_live_per_match ON public.processing_jobs USING btree (match_id) WHERE (status <> ALL (ARRAY[''failed''::text, ''completed''::text, ''derivation_failed''::text]))',
        'processing_jobs_pkey|CREATE UNIQUE INDEX processing_jobs_pkey ON public.processing_jobs USING btree (id)',
        'processing_jobs_resubmitted_from_idx|CREATE INDEX processing_jobs_resubmitted_from_idx ON public.processing_jobs USING btree (resubmitted_from_job_id) WHERE (resubmitted_from_job_id IS NOT NULL)',
        'processing_jobs_status_idx|CREATE INDEX processing_jobs_status_idx ON public.processing_jobs USING btree (status)',
        'processing_jobs_video_access_token_key|CREATE UNIQUE INDEX processing_jobs_video_access_token_key ON public.processing_jobs USING btree (video_access_token) WHERE (video_access_token IS NOT NULL)'
      ] then raise exception 'processing_jobs indexes differ'; end if;
  if (select array_agg(format('%s|%s|%s|%s|%s', policyname,cmd,roles,qual,with_check)
        order by policyname) from pg_policies where schemaname = 'public'
      and tablename = 'processing_jobs') is distinct from array[
        'Users can delete own processing jobs|DELETE|{authenticated}|(( SELECT auth.uid() AS uid) = created_by)|',
        'Users can insert own processing jobs|INSERT|{authenticated}||(( SELECT auth.uid() AS uid) = created_by)',
        'Users can update own processing jobs|UPDATE|{authenticated}|(( SELECT auth.uid() AS uid) = created_by)|(( SELECT auth.uid() AS uid) = created_by)',
        'Users can view own processing jobs|SELECT|{authenticated}|(( SELECT auth.uid() AS uid) = created_by)|'
      ] then raise exception 'processing_jobs policies differ'; end if;
  if not has_table_privilege('authenticated','public.processing_jobs','SELECT,INSERT,UPDATE,DELETE')
    or not has_table_privilege('service_role','public.processing_jobs','SELECT,INSERT,UPDATE,DELETE')
    or has_table_privilege('anon','public.processing_jobs','SELECT')
    or has_table_privilege('anon','public.processing_jobs','INSERT')
    or has_table_privilege('anon','public.processing_jobs','UPDATE')
    or has_table_privilege('anon','public.processing_jobs','DELETE') then
    raise exception 'processing_jobs grants differ';
  end if;
  if (select array_agg(pg_get_triggerdef(oid,true) order by tgname) from pg_trigger
      where tgrelid = 'public.processing_jobs'::regclass and not tgisinternal)
      is distinct from array['CREATE TRIGGER processing_jobs_set_updated_at BEFORE UPDATE ON processing_jobs FOR EACH ROW EXECUTE FUNCTION set_processing_jobs_updated_at()']
    or not exists (select 1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
      where n.nspname = 'public' and p.proname = 'set_processing_jobs_updated_at'
        and p.pronargs = 0 and p.prorettype = 'trigger'::regtype
        and not p.prosecdef and p.proconfig = array['search_path=""']
        and btrim(p.prosrc, E'\\n\\r\\t ') = 'begin
  new.updated_at := now();
  return new;
end;')
    or has_function_privilege('authenticated','public.set_processing_jobs_updated_at()','EXECUTE')
    or has_function_privilege('anon','public.set_processing_jobs_updated_at()','EXECUTE') then
    raise exception 'processing_jobs trigger/function contract differs';
  end if;
  if not exists (select 1 from pg_publication_tables
      where pubname = 'supabase_realtime' and schemaname = 'public'
        and tablename = 'processing_jobs') then
    raise exception 'processing_jobs realtime publication differs';
  end if;
  if (select count(*) from pg_trigger where not tgisinternal and tgname in
      ('guard_schedule_outcome','guard_schedule_match','guard_legacy_forfeit')) <> 3
    or to_regprocedure('public.set_schedule_outcome(uuid,uuid,text,text,text)') is null
    or not has_function_privilege('authenticated',
      'public.set_schedule_outcome(uuid,uuid,text,text,text)','EXECUTE')
    or has_function_privilege('anon',
      'public.set_schedule_outcome(uuid,uuid,text,text,text)','EXECUTE') then
    raise exception 'schedule outcome/action objects differ';
  end if;
end $$;
select 'production-equivalent';`),
      "The local catalog must match the repository's authoritative processing/outcome contract",
    ).toBe("DO\nproduction-equivalent");
    admin = createAdminClient();
    // Fail before creating fixtures if the additive migration is absent.
    const schema = await admin
      .from(TABLE)
      .select("id,actor_user_id,recorded_at")
      .limit(0);
    expect(schema.error).toBeNull();
    // Bootstrap sentinels predate migration application. Read every column;
    // afterAll compares them again after outcome mutations and fixture cleanup.
    for (const [i, table] of historyTables.entries()) {
      const row = await admin
        .from(table)
        .select("*")
        .eq("id", `00000000-0000-4000-8000-00000000000${historyIds[i]}`)
        .single();
      expect(
        row.error,
        `Missing pre-migration ${table} sentinel; apply the local fixture first`,
      ).toBeNull();
      history.push(row.data);
    }
    expect(history[2]).toMatchObject({ forfeit: "theirs" });
    expect(history[3]).toMatchObject({
      score: {
        sets: [
          [6, 4],
          [6, 2],
        ],
      },
      insights: { sentinel: "historical analysis" },
    });

    [owner, coach, staff, player, outsider] = await createLogins(
      admin,
      ["owner", "coach", "staff", "player", "outsider"],
      { mark, password, authUserIds },
    );
    const programs = await admin.from("programs").insert(
      programIds.map((id, i) => ({
        id,
        org_type: "club",
        program_key: `${mark}-${i}`,
        school_name: `Schedule outcomes ${mark} ${i}`,
        school_group: `${mark}-${i}`,
      })),
    );
    expect(programs.error).toBeNull();
    const members = await admin.from("program_members").insert([
      ...[owner, coach, staff, player].map((session, i) => ({
        program_id: programIds[0],
        user_id: session.userId,
        role: ["owner", "coach", "staff", "player"][i],
      })),
      { program_id: programIds[1], user_id: outsider.userId, role: "owner" },
    ]);
    expect(members.error).toBeNull();
    const events = await admin.from("program_events").insert(
      eventIds.map((id, i) => ({
        id,
        program_id: programIds[i === 2 ? 1 : 0],
        kind: i === 1 ? "tournament" : "dual",
        name: `${mark}-${i}`,
        starts_on: "2026-09-10",
        ends_on: "2026-09-10",
        site: "home",
      })),
    );
    expect(events.error).toBeNull();
    const entries = await admin.from("program_event_entries").insert(
      entryIds.map((id, i) => ({
        id,
        event_id: eventIds[i],
        program_id: programIds[i === 2 ? 1 : 0],
        discipline: "singles",
        slot: i === 1 ? null : "S1",
        // Sentinel: the rollout must not rewrite the old forfeits.
        forfeit: i === 2 ? "theirs" : null,
      })),
    );
    expect(entries.error).toBeNull();
  });

  test.afterEach(async () => {
    if (!admin) return;
    const result = await admin.from(TABLE).delete().in("entry_id", entryIds);
    expect(result.error).toBeNull();
  });

  test.afterAll(async () => {
    if (!admin) return;
    // Only this run's generated UUIDs are ever deleted. Attempt every cleanup
    // even after a setup failure; unlike the shared helper, surface failures.
    const errors: string[] = [];
    for (const [table, column, ids] of [
      [TABLE, "entry_id", entryIds],
      ["program_event_entries", "id", entryIds],
      ["program_events", "id", eventIds],
      ["program_members", "program_id", programIds],
      ["programs", "id", programIds],
    ] as const) {
      const result = await admin
        .from(table)
        .delete()
        .in(column, [...ids]);
      if (result.error) errors.push(`${table}: ${result.error.message}`);
    }
    for (const id of authUserIds) {
      const result = await admin.auth.admin.deleteUser(id);
      if (result.error) errors.push(`auth fixture: ${result.error.message}`);
    }
    for (const [i, original] of history.entries()) {
      const row = await admin
        .from(historyTables[i])
        .select("*")
        .eq("id", `00000000-0000-4000-8000-00000000000${historyIds[i]}`)
        .single();
      expect(row.error).toBeNull();
      expect(row.data, `Historical ${historyTables[i]} changed`).toEqual(
        original,
      );
    }
    expect(errors, "Fixture cleanup failed").toEqual([]);
  });

  test("every kind and side records the actual actor and database time", async () => {
    for (const session of [owner, coach, staff]) {
      for (const kind of ["forfeit", "default", "withdrawal"]) {
        for (const side of ["ours", "theirs"]) {
          const saved = await session.client
            .from(TABLE)
            .insert(dual({ kind, side }))
            .select("id,kind,side,actor_user_id,recorded_at")
            .single();
          expect(saved.error).toBeNull();
          expect(saved.data).toMatchObject({
            kind,
            side,
            actor_user_id: session.userId,
          });
          expect(Number.isFinite(Date.parse(saved.data!.recorded_at))).toBe(
            true,
          );
          const cleared = await session.client
            .from(TABLE)
            .delete()
            .eq("id", saved.data!.id)
            .select("id");
          expect(cleared.error).toBeNull();
          expect(cleared.data).toHaveLength(1);
        }
      }
    }
  });

  test("dual NULL grain is unique; tournament rounds are individually unique", async () => {
    expect((await owner.client.from(TABLE).insert(dual())).error).toBeNull();
    expect(
      (await owner.client.from(TABLE).insert(dual({ kind: "default" }))).error
        ?.code,
    ).toBe("23505");
    expect(
      (
        await owner.client
          .from(TABLE)
          .insert([
            tournament({ round: "QF" }),
            tournament({ round: "SF", side: "theirs" }),
          ])
      ).error,
    ).toBeNull();
    expect(
      (await owner.client.from(TABLE).insert(tournament())).error?.code,
    ).toBe("23505");
  });

  test("invalid kinds, sides, rounds and forged event scope fail in Postgres", async () => {
    for (const row of [
      dual({ kind: "retirement" }),
      dual({ side: "both" }),
      dual({ round: "QF" }),
      dual({ event_kind: "other" }),
      tournament({ round: null }),
      tournament({ round: "S1" }),
      tournament({ round: "" }),
      tournament({ round: "qf" }),
    ]) {
      expect((await owner.client.from(TABLE).insert(row)).error?.code).toBe(
        "23514",
      );
    }
    for (const row of [
      dual({ event_id: eventIds[1] }),
      dual({ event_kind: "tournament", round: "QF" }),
      dual({ entry_id: entryIds[2] }),
    ]) {
      expect((await owner.client.from(TABLE).insert(row)).error?.code).toBe(
        "23503",
      );
    }
  });

  test("member reads; outsiders and anonymous clients cannot read or mutate", async () => {
    const saved = await owner.client
      .from(TABLE)
      .insert(dual())
      .select("id")
      .single();
    expect(saved.error).toBeNull();
    const id = saved.data!.id;
    const visible = await player.client.from(TABLE).select("id").eq("id", id);
    expect(visible.error).toBeNull();
    expect(visible.data).toHaveLength(1);
    const hidden = await outsider.client.from(TABLE).select("id").eq("id", id);
    expect(hidden.error).toBeNull();
    expect(hidden.data).toEqual([]);
    for (const session of [player, outsider]) {
      expect(
        (await session.client.from(TABLE).insert(tournament())).error?.code,
      ).toBe("42501");
      const denied = await session.client
        .from(TABLE)
        .delete()
        .eq("id", id)
        .select("id");
      expect(denied.error).toBeNull();
      expect(denied.data).toEqual([]);
      expect(
        (
          await session.client
            .from(TABLE)
            .update({ side: "theirs" })
            .eq("id", id)
        ).error?.code,
      ).toBe("42501");
    }
    const anon = createClient(SUPABASE_URL!, ANON_KEY!, {
      auth: { persistSession: false },
    });
    expect((await anon.from(TABLE).select("id").eq("id", id)).error?.code).toBe(
      "42501",
    );
    expect((await anon.from(TABLE).insert(tournament())).error?.code).toBe(
      "42501",
    );
    expect((await anon.from(TABLE).delete().eq("id", id)).error?.code).toBe(
      "42501",
    );
    expect(
      (
        await owner.client.from(TABLE).insert(
          dual({
            entry_id: entryIds[2],
            event_id: eventIds[2],
            program_id: programIds[1],
          }),
        )
      ).error?.code,
    ).toBe("42501");
  });

  test("staff cannot forge provenance or overwrite; parent edits cannot invalidate scope", async () => {
    for (const extra of [
      { actor_user_id: outsider.userId },
      { recorded_at: "2000-01-01T00:00:00Z" },
    ]) {
      expect(
        (await owner.client.from(TABLE).insert({ ...dual(), ...extra })).error
          ?.code,
      ).toBe("42501");
    }
    const saved = await owner.client
      .from(TABLE)
      .insert(dual())
      .select("id")
      .single();
    expect(saved.error).toBeNull();
    expect(
      (
        await owner.client
          .from(TABLE)
          .update({ kind: "default" })
          .eq("id", saved.data!.id)
      ).error?.code,
    ).toBe("42501");
    expect(
      (
        await admin
          .from("program_events")
          .update({ kind: "tournament" })
          .eq("id", eventIds[0])
      ).error?.code,
    ).toBe("23503");
    expect(
      (
        await admin
          .from("program_event_entries")
          .update({ event_id: eventIds[1] })
          .eq("id", entryIds[0])
      ).error?.code,
    ).toBe("23503");
    expect(
      (
        await admin
          .from("program_event_entries")
          .update({ program_id: programIds[1] })
          .eq("id", entryIds[0])
      ).error?.code,
    ).toBe("23503");
    expect(
      (await admin.from("program_event_entries").delete().eq("id", entryIds[0]))
        .error?.code,
    ).toBe("23503");
  });

  test("outcomes create no matches or processing jobs and preserve historical analysis sentinels", async () => {
    expect(
      (await owner.client.from(TABLE).insert([dual(), tournament()])).error,
    ).toBeNull();
    const matches = await admin
      .from("matches")
      .select("id")
      .in("event_entry_id", entryIds);
    expect(matches.error).toBeNull();
    expect(matches.data).toEqual([]);
    const jobs = await admin
      .from("processing_jobs")
      .select("id")
      .neq("id", "00000000-0000-4000-8000-000000000008");
    expect(jobs.error).toBeNull();
    expect(jobs.data).toEqual([]);
    for (let i = 3; i < historyTables.length; i += 1) {
      const row = await admin
        .from(historyTables[i])
        .select("*")
        .eq("id", `00000000-0000-4000-8000-00000000000${historyIds[i]}`)
        .single();
      expect(row.error).toBeNull();
      expect(
        row.data,
        `Historical ${historyTables[i]} sentinel changed after non-played outcomes`,
      ).toEqual(history[i]);
    }
    const legacy = await admin
      .from("program_event_entries")
      .select("forfeit")
      .eq("id", entryIds[2])
      .single();
    expect(legacy.error).toBeNull();
    expect(legacy.data?.forfeit).toBe("theirs");
  });
});
