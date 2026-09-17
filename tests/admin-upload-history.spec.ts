import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getAdminUploadHistory } from "@/lib/data/admin-uploads-server";

type Row = Record<string, unknown>;
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const date = "2026-09-17T03:54:52.627241+00:00";
function harness() {
  const tables: Record<string, Row[]> = {
    admin_upload_submissions: [],
    admin_upload_submission_items: [],
    admin_file_attempts: [],
    programs: [{ id: id(900), school_name: "Test", team: "mens" }],
    users: [{ id: id(901), first_name: "Admin", last_name: "Member" }],
    program_events: [],
    matches: [],
    processing_jobs: [],
    match_stats: [],
    program_event_outcomes: [],
  };
  const calls: string[] = [];
  let authorized = true;
  let fail: string | null = null;
  const visible = new Set<string>();
  function client(kind: string) {
    return {
      from(table: string) {
        calls.push(`${kind}:${table}`);
        if (kind === "service" && table.startsWith("admin_"))
          throw new Error("No service grant");
        let rows = [...tables[table]];
        if (kind === "session" && table === "matches")
          rows = rows.filter((r) => visible.has(String(r.id)));
        const orders: { key: string; asc: boolean }[] = [];
        let from = 0,
          to = Infinity;
        const q = {
          returns() {
            return q;
          },
          select() {
            return q;
          },
          eq(key: string, value: unknown) {
            rows = rows.filter((r) => r[key] === value);
            return q;
          },
          in(key: string, values: unknown[]) {
            rows = rows.filter((r) => values.includes(r[key]));
            return q;
          },
          order(key: string, opts?: { ascending: boolean }) {
            orders.push({ key, asc: opts?.ascending ?? true });
            return q;
          },
          or(filter: string) {
            const match =
              /^created_at.lt.(.+),and\(created_at.eq.(.+),operation_id.lt.([a-f0-9-]+)\)$/.exec(
                filter,
              );
            if (!match || match[1] !== match[2])
              throw new Error("unsafe filter");
            rows = rows.filter(
              (r) =>
                String(r.created_at) < match[1] ||
                (r.created_at === match[1] &&
                  String(r.operation_id) < match[3]),
            );
            return q;
          },
          limit(n: number) {
            to = n;
            return q;
          },
          range(start: number, end: number) {
            from = start;
            to = end + 1;
            return q;
          },
          then(resolve: (value: unknown) => unknown) {
            rows.sort((a, b) => {
              for (const o of orders) {
                const c = String(a[o.key]).localeCompare(String(b[o.key]));
                if (c) return o.asc ? c : -c;
              }
              return 0;
            });
            return Promise.resolve({
              data: rows.slice(from, to),
              error: fail === table ? {} : null,
            }).then(resolve);
          },
        };
        return q;
      },
    } as unknown as SupabaseClient;
  }
  const deps = {
    requireAdmin: async () => {
      calls.push("guard");
      return authorized ? { id: id(901) } : null;
    },
    createClient: async () => {
      calls.push("session");
      return client("session");
    },
    createAdminClient: () => {
      calls.push("service");
      return client("service");
    },
  };
  function add(n: number, kind = "dual", status = "succeeded") {
    tables.admin_upload_submissions.push({
      operation_id: id(n),
      actor_user_id: id(901),
      program_id: id(900),
      kind,
      event_id: null,
      origin: "admin_console",
      created_at: date,
    });
    const item = {
      operation_id: id(n),
      item_id: id(n + 1000),
      kind: "match",
      request: {},
      status,
      match_id: id(n + 2000),
      outcome_id: null,
      processing_job_id: null,
      match_file_id: null,
      result: {},
      error_code: null,
    } as Row;
    tables.admin_upload_submission_items.push(item);
    tables.matches.push({
      id: item.match_id,
      player1_name: "Our player",
      player2_name: "Opponent",
    });
    return item;
  }
  return {
    tables,
    calls,
    visible,
    deps,
    add,
    deny: () => (authorized = false),
    fail: (table: string) => (fail = table),
  };
}

test("guard and invalid inputs precede clients and reads", async () => {
  const h = harness();
  h.deny();
  expect(await getAdminUploadHistory({}, h.deps)).toMatchObject({
    ok: false,
    reason: "admin-required",
  });
  expect(h.calls).toEqual(["guard"]);
  const valid = harness();
  for (const cursor of [
    "",
    "garbage",
    Buffer.from(
      JSON.stringify({ v: 1, date: `${date},id.gt.x`, id: id(1) }),
    ).toString("base64url"),
    Buffer.from(JSON.stringify({ v: 1, date, id: "x)" })).toString("base64url"),
  ]) {
    expect(await getAdminUploadHistory({ cursor }, valid.deps)).toMatchObject({
      ok: false,
      reason: "invalid-cursor",
    });
  }
  expect(
    await getAdminUploadHistory({ pageSize: 101 }, valid.deps),
  ).toMatchObject({ ok: false, reason: "invalid-page-size" });
  expect(valid.calls.every((c) => c === "guard")).toBe(true);
});

test("keyset pages preserve equal timestamp UUID ties and microseconds", async () => {
  const h = harness();
  [1, 2, 3, 4, 5].forEach((n) => h.add(n));
  h.tables.admin_upload_submissions[0].created_at =
    "2026-09-17T03:54:52.627240+00:00";
  const found: string[] = [];
  let cursor: string | null = null;
  do {
    const result = await getAdminUploadHistory({ pageSize: 2, cursor }, h.deps);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    found.push(...result.rows.map((r) => r.operationId));
    cursor = result.nextCursor;
    if (cursor)
      expect(JSON.parse(Buffer.from(cursor, "base64url").toString()).date).toBe(
        date,
      );
  } while (cursor);
  expect(found).toEqual([5, 4, 3, 2, 1].map(id));
});

test("only explicit provenance, all kinds, partial saves and session-safe links", async () => {
  const h = harness();
  ["file", "video", "dual", "tournament", "analysis_attachment"].forEach(
    (kind, n) => h.add(n + 1, kind),
  );
  h.tables.admin_upload_submissions[1].actor_user_id = id(902); // Nonmember administrator: no membership query exists.
  h.tables.users.push({ id: id(902), first_name: "Other", last_name: "Admin" });
  h.tables.admin_upload_submissions.push({
    ...h.tables.admin_upload_submissions[0],
    operation_id: id(99),
    origin: "dashboard",
  });
  h.tables.matches.push({ id: id(9999), player1_name: "Ordinary dashboard" });
  const original = h.tables.admin_upload_submission_items[2];
  h.tables.admin_upload_submission_items.push({
    ...original,
    item_id: id(99),
    status: "failed",
    match_id: null,
    error_code: "result-conflict",
  });
  h.visible.add(String(original.match_id));
  const result = await getAdminUploadHistory({}, h.deps);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.rows).toHaveLength(5);
  expect(result.rows.map((r) => r.kind)).toEqual([
    "analysis_attachment",
    "tournament",
    "dual",
    "video",
    "file",
  ]);
  const dual = result.rows.find((r) => r.kind === "dual")!;
  expect(dual).toMatchObject({
    state: "partial",
    counts: { saved: 1, failed: 1, pending: 0 },
    team: { name: "Test" },
    addedBy: { name: "Admin Member" },
  });
  expect(dual.items.find((i) => i.saveStatus === "failed")).toMatchObject({
    state: "failed",
    error: "result-conflict",
    matchHref: null,
  });
  expect(dual.items.find((i) => i.saveStatus === "succeeded")?.matchHref).toBe(
    `/dashboard/matches/${original.match_id}`,
  );
  expect(
    result.rows.find((r) => r.kind === "tournament")?.items[0].matchHref,
  ).toBeNull();
  expect(h.calls.some((c) => c.includes("program_members"))).toBe(false);
});

test("job evidence uses canonical states and published statistics, unknowns stay unknown", async () => {
  const h = harness();
  const states = [
    "pending",
    "uploading",
    "uploaded",
    "submitting",
    "queued",
    "processing",
    "deriving",
    "completed",
    "completed",
    "completed",
    "failed",
    "derivation_failed",
    "future",
  ];
  states.forEach((status, n) => {
    const item = h.add(n + 1, "video");
    item.processing_job_id = id(n + 3000);
    h.tables.processing_jobs.push({
      id: item.processing_job_id,
      match_id: item.match_id,
      status,
      derivation_version: n === 8 || n === 9 ? "v1" : null,
      error_message: status.includes("failed") ? "Processing error" : null,
    });
    if (n === 9) h.tables.match_stats.push({ match_id: item.match_id });
  });
  const result = await getAdminUploadHistory({}, h.deps);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  const byId = new Map(result.rows.map((r) => [r.operationId, r]));
  expect([7, 8, 9].map((n) => byId.get(id(n + 1))!.state)).toEqual([
    "processed",
    "timeline",
    "completed",
  ]);
  expect(byId.get(id(13))!.state).toBe("unknown");
  expect(byId.get(id(11))!.items[0].error).toBe("Processing error");
  expect(byId.get(id(12))!.state).toBe("derivation_failed");
});

test("file attempts override linkage success and lost/missing evidence is not completed", async () => {
  const h = harness();
  ["queued", "processing", "completed", "failed", "future"].forEach(
    (state, n) => {
      const item = h.add(n + 1, "analysis_attachment");
      item.kind = "analysis_attachment";
      item.match_file_id = id(n + 4000);
      h.tables.admin_file_attempts.push({
        operation_id: item.operation_id,
        item_id: item.item_id,
        match_id: item.match_id,
        file_id: item.match_file_id,
        state,
        error_code: state === "failed" ? "partial-write" : null,
      });
    },
  );
  h.add(6, "file");
  h.add(7, "dual", "pending");
  const result = await getAdminUploadHistory({}, h.deps);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.rows.map((r) => r.state)).toEqual([
    "pending",
    "unknown",
    "unknown",
    "failed",
    "imported",
    "processing",
    "queued",
  ]);
  expect(result.rows[3].items[0].error).toBe("partial-write");
});

test("batch reads page beyond row limits, failures are explicit", async () => {
  const h = harness();
  const item = h.add(1);
  for (let n = 0; n < 510; n++)
    h.tables.admin_upload_submission_items.push({
      ...item,
      item_id: id(n + 10000),
    });
  const result = await getAdminUploadHistory({}, h.deps);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.rows[0].items).toHaveLength(511);
  expect(h.calls.filter((c) => c === "service:matches")).toHaveLength(1);
  h.fail("match_stats");
  expect(await getAdminUploadHistory({}, h.deps)).toMatchObject({
    ok: false,
    reason: "read-failed",
  });
});

test("actual outcome rows preserve kind and side, absent evidence stays unknown", async () => {
  const h = harness();
  const a = h.add(1, "tournament");
  a.kind = "outcome";
  a.match_id = null;
  a.outcome_id = id(7000);
  const b = h.add(2, "dual");
  b.kind = "outcome";
  b.match_id = null;
  b.outcome_id = id(7001);
  h.tables.program_event_outcomes.push({
    id: id(7000),
    kind: "walkover",
    side: "theirs",
    round: "QF",
  });
  const result = await getAdminUploadHistory({}, h.deps);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.rows[0].state).toBe("unknown");
  expect(result.rows[1].items[0]).toMatchObject({
    state: "saved",
    outcome: { kind: "walkover", side: "theirs", round: "QF" },
    matchHref: null,
  });
});

test("member and nonmember attachments retain provenance; missing jobs and unknown saves stay unknown", async () => {
  const h = harness();
  const first = h.add(1, "analysis_attachment");
  const second = h.add(2, "analysis_attachment");
  first.kind = second.kind = "analysis_attachment";
  first.processing_job_id = id(8888); // Missing durable linked job.
  h.tables.admin_upload_submissions[1].actor_user_id = id(902);
  h.tables.users.push({
    id: id(902),
    first_name: "Nonmember",
    last_name: "Admin",
  });
  h.tables.admin_upload_submission_items.push({
    ...first,
    item_id: id(8889),
    status: "pending",
    processing_job_id: null,
    match_id: null,
  });
  h.tables.admin_upload_submission_items.push({
    ...first,
    item_id: id(8890),
    status: "failed",
    error_code: "refused",
    processing_job_id: null,
    match_id: null,
  });
  h.add(3, "dual", "future");
  const result = await getAdminUploadHistory({}, h.deps);
  expect(result.ok).toBe(true);
  if (!result.ok) return;
  expect(result.rows[0]).toMatchObject({
    state: "unknown",
    counts: { unknown: 1 },
  });
  expect(result.rows[1].addedBy.name).toBe("Nonmember Admin");
  expect(result.rows[2]).toMatchObject({
    state: "partial",
    counts: { saved: 1, pending: 1, failed: 1 },
  });
  expect(
    result.rows[2].items.find((i) => i.itemId === first.item_id)?.state,
  ).toBe("unknown");
});

test("empty history succeeds and failed provenance reads never become empty history", async () => {
  const h = harness();
  expect(await getAdminUploadHistory({}, h.deps)).toEqual({
    ok: true,
    rows: [],
    nextCursor: null,
  });
  expect(h.calls).not.toContain("service");
  h.fail("admin_upload_submissions");
  expect(await getAdminUploadHistory({}, h.deps)).toMatchObject({
    ok: false,
    reason: "read-failed",
  });
});
