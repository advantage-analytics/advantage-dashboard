import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  classifyFailure,
  isUploadPaused,
  jobRecoveryFacts,
  stoppedUploadPercent,
  transferNeverFinished,
  UPLOAD_ABANDONED_AFTER,
  UPLOAD_PAUSED_AFTER_MS,
} from "@/lib/data/match-analysis";
import { uploadPausedEmail } from "@/lib/services/email";
import type { EmailMessage } from "@/lib/services/email";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The scheduled stalled-upload sweep: when an upload reads as paused, which
 * failed jobs count as "the video never finished uploading", the email a
 * paused upload's uploader gets, and who the sweep does and does not mail.
 * Offline — a fake query builder stands in for the service-role client, and
 * the prefs / claim / send seams are injected.
 */

test.beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = "https://app.example.test";
});

// ─── Which failures never finished uploading ───────────────────────────────

const REAPED = {
  status: "failed",
  external_job_id: null,
  upload_progress_percent: 27,
};

test("a failed, never-submitted job below 100% never finished its transfer", () => {
  expect(transferNeverFinished(REAPED)).toBe(true);
  expect(stoppedUploadPercent(REAPED)).toBe(27);
  // The cut, or the moment before the first block: unfinished, no position.
  expect(transferNeverFinished({ ...REAPED, upload_progress_percent: 0 })).toBe(
    true,
  );
  expect(
    stoppedUploadPercent({ ...REAPED, upload_progress_percent: 0 }),
  ).toBeUndefined();
});

test("anything else is taken as finished: 100%, submitted, no reading, or not failed", () => {
  for (const row of [
    { ...REAPED, upload_progress_percent: 100 },
    { ...REAPED, external_job_id: "ext-1" },
    { ...REAPED, upload_progress_percent: null },
    { status: "failed" },
    { ...REAPED, status: "uploading" },
    { ...REAPED, status: "uploaded" },
  ]) {
    expect(transferNeverFinished(row)).toBe(false);
    expect(stoppedUploadPercent(row)).toBeUndefined();
  }
});

test("a reaped upload is upload_again even though its row carries a video key", () => {
  // `/api/splitstep/upload-url` writes the key when the URL is issued.
  const classed = (row: Record<string, unknown>) =>
    classifyFailure({
      ...jobRecoveryFacts({
        status: "failed",
        hasVideo: true,
        hasResults: false,
        ...row,
      }),
      attemptsUsed: 1,
    });
  expect(classed(REAPED)).toBe("upload_again");
  // Finished, then failed: there is a video to resend.
  expect(classed({ ...REAPED, upload_progress_percent: 100 })).toBe("retry");
  expect(classed({ ...REAPED, external_job_id: "ext-1" })).toBe("retry");
  // A projection that selects no heartbeat keeps the old reading.
  expect(classed({})).toBe("retry");
});

// ─── When an upload reads as paused ────────────────────────────────────────

const NOW = Date.parse("2026-10-11T14:00:00Z");
const ago = (minutes: number) => new Date(NOW - minutes * 60_000).toISOString();

test("an upload is paused after twenty minutes without a progress write, and only then", () => {
  expect(UPLOAD_PAUSED_AFTER_MS).toBe(20 * 60 * 1000);
  const uploading = (minutes: number) =>
    isUploadPaused({ status: "uploading", updatedAt: ago(minutes) }, NOW);
  // The transfer writes at least once a minute: a slow upload is never quiet.
  expect(uploading(1)).toBe(false);
  expect(uploading(19)).toBe(false);
  expect(uploading(21)).toBe(true);
  expect(uploading(240)).toBe(true);
});

test("only a job that is still uploading can be paused", () => {
  for (const status of [
    "uploaded",
    "queued",
    "processing",
    "failed",
  ] as const) {
    expect(isUploadPaused({ status, updatedAt: ago(600) }, NOW)).toBe(false);
  }
  // No last-moved time is no evidence.
  expect(isUploadPaused({ status: "uploading" }, NOW)).toBe(false);
});

test("a quiet upload is ended at six hours, the life of its upload credential", () => {
  expect(UPLOAD_ABANDONED_AFTER).toBe("6 hours");
  // The page-load reaper passes it too: fifteen minutes would end an upload
  // whose tab now stops for good once its job is failed.
  const loader = readFileSync(
    resolve(process.cwd(), "src/lib/data/match-analysis-server.ts"),
    "utf8",
  );
  expect(loader).toContain(
    'supabase.rpc("reap_stalled_uploads", {\n      p_stale_after: UPLOAD_ABANDONED_AFTER,',
  );
  expect(loader).not.toContain('rpc("reap_stalled_uploads")');
});

// ─── The email ─────────────────────────────────────────────────────────────

const MAIL = {
  to: "alex@example.test",
  matchId: "0b7c9a1e-4f2d-4b8a-9c3e-2d1f5a6b7c8d",
  matchTitle: "Alex Rivera vs. Jordan Chen",
  matchContext: "Riverside Tennis Club · 30 Sep 2026",
  pausedPercent: 27 as number | null,
};

test("the email says paused, asks about the tab first, and gives the deadline", () => {
  const mail = uploadPausedEmail(MAIL);
  expect(mail.to).toBe("alex@example.test");
  expect(mail.subject).toBe(
    "Your video for Alex Rivera vs. Jordan Chen has stopped uploading",
  );
  expect(mail.tags).toEqual({ type: "upload_paused" });

  const text = mail.text ?? "";
  expect(text).toContain("Your video upload has paused");
  expect(text).toContain("The upload has stopped moving at 27%");
  expect(text).toContain("Your match and its score are saved.");
  // A sleeping computer resumes; only a closed tab needs a second upload.
  const tab = text.indexOf("If the tab you uploaded from is still open");
  const again = text.indexOf("choose to upload the video again");
  expect(tab).toBeGreaterThan(-1);
  expect(again).toBeGreaterThan(tab);
  expect(text).toContain("An upload that stays paused for six hours is ended.");
  // Nothing has failed, so it must not say so.
  expect(text).not.toMatch(/didn't finish|failed/i);
  expect(text).toContain(
    `https://app.example.test/dashboard/matches/${MAIL.matchId}`,
  );
  expect(text).toContain('"Email me if analysis fails"');
  expect(mail.html).toContain("UPLOAD PAUSED");
});

test("with no recorded progress it does not invent a percentage", () => {
  const text = uploadPausedEmail({ ...MAIL, pausedPercent: null }).text ?? "";
  expect(text).toContain("The upload has stopped moving, so");
  expect(text).not.toMatch(/moving at \d/);
});

// ─── The sweep ─────────────────────────────────────────────────────────────

interface JobRow {
  id: string;
  match_id: string | null;
  created_by: string | null;
  upload_progress_percent: number | null;
}

function job(id: string, overrides: Partial<JobRow> = {}): JobRow {
  return {
    id,
    match_id: `match-${id}`,
    created_by: `user-${id}`,
    upload_progress_percent: 27,
    ...overrides,
  };
}

/** A fake service-role client that records the filters of the paused read. */
function fakeDb(options: {
  paused: JobRow[];
  reapError?: boolean;
  /** Match ids that belong to a program, and the users still in it. */
  teamMatches?: string[];
  members?: string[];
  /** Dedupe keys already in `notification_sends`. */
  mailed?: string[];
}) {
  const calls = {
    rpc: [] as Array<[string, unknown]>,
    filters: [] as Array<[string, string, unknown]>,
  };
  const from = (table: string) => {
    const state = { match: "", user: "", keys: [] as string[] };
    const builder: Record<string, unknown> = {};
    const chain = () => builder;
    const record =
      (op: string) =>
      (column: string, ...rest: unknown[]) => {
        if (table === "processing_jobs")
          calls.filters.push([op, column, rest[rest.length - 1]]);
        if (op === "eq" && (column === "match_id" || column === "id"))
          state.match = rest[0] as string;
        if (op === "eq" && column === "user_id") state.user = rest[0] as string;
        return builder;
      };
    builder.select = chain;
    builder.order = chain;
    builder.limit = chain;
    builder.eq = record("eq");
    builder.not = record("not");
    builder.lt = record("lt");
    builder.in = (_column: string, keys: string[]) => {
      state.keys = keys;
      return builder;
    };
    builder.maybeSingle = async () => {
      if (table === "matches")
        return {
          data: {
            player1_name: "Alex Rivera",
            player2_name: "Jordan Chen",
            date: "2026-09-30T15:43:00Z",
            program_id: (options.teamMatches ?? []).includes(state.match)
              ? "program-1"
              : null,
          },
          error: null,
        };
      if (table === "users")
        return { data: { email: `${state.match}@example.test` }, error: null };
      return { data: null, error: null };
    };
    builder.then = (resolveRows: (value: unknown) => unknown) => {
      let data: unknown[] = [];
      if (table === "processing_jobs") data = options.paused;
      else if (table === "program_members")
        data = (options.members ?? []).includes(state.user)
          ? [{ user_id: state.user }]
          : [];
      else if (table === "notification_sends")
        data = state.keys
          .filter((key) => (options.mailed ?? []).includes(key))
          .map((dedupe_key) => ({ dedupe_key }));
      return Promise.resolve({ data, error: null }).then(resolveRows);
    };
    return builder;
  };
  const db = {
    from,
    rpc: async (name: string, args: unknown) => {
      calls.rpc.push([name, args]);
      return options.reapError
        ? { data: null, error: { message: "boom" } }
        : { data: 1, error: null };
    },
  } as unknown as SupabaseClient;
  return { db, calls };
}

const loader = createLoader({
  // `site-url.ts` builds the email's links with `URL` at call time.
  globals: { URL },
  stubs: {
    // The production seams build a service-role client; every one is injected.
    "./should-notify": {
      claimSend: async () => true,
      getNotificationPrefs: async () => new Map(),
    },
    "@/lib/data/programs-server": {
      programDisplayName: (school: string) => school,
    },
  },
});
const { sweepStalledUploads } = loader.load(
  "src/lib/services/notifications/upload-paused-mail.ts",
) as {
  sweepStalledUploads: (
    db: SupabaseClient,
    deps: Record<string, unknown>,
  ) => Promise<{ reaped: number | null; paused: number; sent: number }>;
};

function deps(options: { off?: string[]; claimed?: string[] } = {}) {
  const sent: EmailMessage[] = [];
  const claims: string[] = [];
  return {
    sent,
    claims,
    deps: {
      now: () => NOW,
      prefs: async (ids: string[]) =>
        new Map(
          ids.map((id) => [
            id,
            { notifyAnalysisFailed: !(options.off ?? []).includes(id) },
          ]),
        ),
      claim: async (key: string) => {
        claims.push(key);
        return !(options.claimed ?? []).includes(key);
      },
      send: async (message: EmailMessage) => {
        sent.push(message);
        return { ok: true };
      },
    },
  };
}

test("it ends six-hour-quiet uploads, then mails each twenty-minute-quiet one once", async () => {
  const { db, calls } = fakeDb({ paused: [job("a"), job("b")] });
  const seams = deps();
  const result = await sweepStalledUploads(db, seams.deps);

  // Six hours, never the function's fifteen-minute default.
  expect(calls.rpc).toEqual([
    ["reap_stalled_uploads", { p_stale_after: "6 hours" }],
  ]);
  // Still live, has recorded progress, and quiet for twenty minutes.
  expect(calls.filters.slice(0, 3)).toEqual([
    ["eq", "status", "uploading"],
    ["not", "upload_progress_percent", null],
    ["lt", "updated_at", ago(20)],
  ]);

  expect(result).toEqual({ reaped: 1, paused: 2, sent: 2 });
  expect(seams.claims).toEqual(["upload_paused:a", "upload_paused:b"]);
  expect(seams.sent.map((m) => m.to)).toEqual([
    "user-a@example.test",
    "user-b@example.test",
  ]);
  expect(seams.sent[0].text).toContain("stopped moving at 27%");
  expect(seams.sent[0].text).toContain("Alex Rivera vs. Jordan Chen");
});

test("a job already mailed for is not mailed again, even if it pauses twice", async () => {
  const { db } = fakeDb({ paused: [job("a"), job("b")] });
  const seams = deps({ claimed: ["upload_paused:a"] });
  const result = await sweepStalledUploads(db, seams.deps);
  expect(result.sent).toBe(1);
  expect(seams.sent.map((m) => m.to)).toEqual(["user-b@example.test"]);
});

test("jobs already mailed are dropped before the cap, so they cannot starve newer ones", async () => {
  // Thirty paused uploads, the 25 longest-quiet already mailed and still
  // paused. The five behind them must still be reached this run.
  const jobs = Array.from({ length: 30 }, (_, i) => job(`j${i}`));
  const { db } = fakeDb({
    paused: jobs,
    mailed: jobs.slice(0, 25).map((row) => `upload_paused:${row.id}`),
  });
  const seams = deps();
  const result = await sweepStalledUploads(db, seams.deps);
  expect(result).toEqual({ reaped: 1, paused: 30, sent: 5 });
  expect(seams.claims).toEqual(
    jobs.slice(25).map((row) => `upload_paused:${row.id}`),
  );
});

test("at most twenty-five emails go out in one run", async () => {
  const jobs = Array.from({ length: 40 }, (_, i) => job(`j${i}`));
  const { db } = fakeDb({ paused: jobs });
  const seams = deps();
  const result = await sweepStalledUploads(db, seams.deps);
  expect(result.sent).toBe(25);
});

test("nobody is mailed with the switch off or with no uploader", async () => {
  const { db } = fakeDb({
    paused: [job("off"), job("orphan", { created_by: null }), job("ok")],
  });
  const seams = deps({ off: ["user-off"] });
  const result = await sweepStalledUploads(db, seams.deps);
  expect(result.sent).toBe(1);
  expect(seams.sent.map((m) => m.to)).toEqual(["user-ok@example.test"]);
  // The switched-off job never spends its claim.
  expect(seams.claims).toEqual(["upload_paused:ok"]);
});

test("a team match is only mailed to an uploader who is still in the program", async () => {
  const { db } = fakeDb({
    paused: [job("member"), job("left")],
    teamMatches: ["match-member", "match-left"],
    members: ["user-member"],
  });
  const seams = deps();
  const result = await sweepStalledUploads(db, seams.deps);
  expect(result.sent).toBe(1);
  expect(seams.sent.map((m) => m.to)).toEqual(["user-member@example.test"]);
  // Someone who left never spends the claim, and never sees the match named.
  expect(seams.claims).toEqual(["upload_paused:member"]);
});

test("an upload that went quiet during the cut is mailed without a percentage", async () => {
  const { db } = fakeDb({
    paused: [job("cut", { upload_progress_percent: 0 })],
  });
  const seams = deps();
  await sweepStalledUploads(db, seams.deps);
  expect(seams.sent[0].text).toContain("The upload has stopped moving, so");
});

test("a reaper failure is reported and the mail still goes", async () => {
  const { db } = fakeDb({ paused: [job("a")], reapError: true });
  const seams = deps();
  const result = await sweepStalledUploads(db, seams.deps);
  expect(result).toEqual({ reaped: null, paused: 1, sent: 1 });
});

// ─── The route and its schedule ────────────────────────────────────────────

test("the route checks the bearer before it builds the service-role client", () => {
  const src = readFileSync(
    resolve(process.cwd(), "src/app/api/cron/reap-stalled-uploads/route.ts"),
    "utf8",
  );
  const auth = src.indexOf(
    "authorizeCronRequest(request, process.env.CRON_SECRET)",
  );
  const refuse = src.indexOf("{ status: 401 }");
  const admin = src.indexOf("createAdminClient()");
  expect(auth).toBeGreaterThan(-1);
  expect(refuse).toBeGreaterThan(auth);
  expect(admin).toBeGreaterThan(refuse);
});

test("the schedule runs every five minutes and carries no secret", () => {
  const dir = resolve(process.cwd(), "supabase/migrations");
  const file = readdirSync(dir).find((name) =>
    name.endsWith("_schedule_stalled_upload_sweep.sql"),
  );
  expect(file).toBeDefined();
  const sql = readFileSync(resolve(dir, file!), "utf8");
  expect(sql).toContain("'*/5 * * * *'");
  expect(sql).toContain(
    "select public.reap_stalled_uploads(interval '6 hours');",
  );
  expect(sql).toContain("/api/cron/reap-stalled-uploads");
  // The bearer is read from Vault at run time; nothing in the file is one.
  expect(sql).toContain("from vault.decrypted_secrets as secret");
  expect(sql).toContain("where secret.name = 'cron_secret'");
  const code = sql
    .split("\n")
    .filter((line) => !line.trimStart().startsWith("--"))
    .join("\n");
  expect(code).not.toMatch(/Bearer [A-Za-z0-9_-]{8,}/);
});
