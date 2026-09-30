import { test, expect } from "@playwright/test";
import ExcelJS from "exceljs";
import { createHash } from "node:crypto";
import {
  getAdminMatchFileStatus,
  submitAdminMatchFile,
} from "@/lib/services/programs/admin-file-submission";
import type { AdminCheck } from "@/lib/services/programs/admin-guard";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
async function workbook() {
  const book = new ExcelJS.Workbook();
  book.addWorksheet("Settings").addRows([
    ["Host Team", "Guest Team", "Ad Scoring"],
    ["Athlete", "Rival", true],
  ]);
  book.addWorksheet("Sets").addRows([
    ["Set", "Host Score", "Guest Score", "Host Tiebreak", "Guest Tiebreak"],
    [1, 6, 4],
    [2, 7, 6, 7, 4],
  ]);
  for (const sheet of ["Points", "Shots", "Games", "Stats"])
    book.addWorksheet(sheet).addRows([["Data"], [1]]);
  return new File(
    [(await book.xlsx.writeBuffer()) as ArrayBuffer],
    "match.xlsx",
    {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    },
  );
}
function form(file: File) {
  const data = new FormData();
  for (const [key, value] of Object.entries({
    operationId: id(1),
    itemId: id(2),
    programId: id(3),
    playerId: id(4),
    date: "2026-09-15",
    matchType: "Singles",
    courtType: "Hard",
  }))
    data.set(key, value);
  data.set("file", file);
  return data;
}
function harness(
  options: {
    /** `false` a signed-in non-admin (403), `401` no session at all. */
    admin?: boolean | 401;
    existing?: Blob;
    state?: string;
    error?: string;
  } = {},
) {
  const calls: { name: string; args?: any }[] = [];
  let blob: Blob | undefined;
  const storage = {
    upload: async (path: string, file: Blob, config: unknown) => {
      calls.push({ name: "upload", args: { path, config } });
      blob = file;
      return { error: options.existing ? { message: "exists" } : null };
    },
    download: async () => ({ data: options.existing, error: null }),
  };
  const state = options.state ?? "queued";
  const admin = {
    storage: { from: () => storage },
    rpc: async (name: string, args: unknown) => {
      calls.push({ name, args });
      return {
        data: { match_id: id(5), state },
        error: options.error ? { message: options.error } : null,
      };
    },
    functions: {
      invoke: async () => {
        calls.push({ name: "process" });
        return { data: null, error: null };
      },
    },
  };
  const client = {
    from: (table: string) => ({
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({
            data: { actor_user_id: id(9) },
            error: null,
          }),
          eq: () => ({
            maybeSingle: async () => ({
              data: { match_id: id(5), file_id: id(6), state },
              error: null,
            }),
          }),
        }),
      }),
    }),
  };
  const deps = {
    checkAdmin: async (): Promise<AdminCheck> =>
      options.admin === false || options.admin === 401
        ? { ok: false, status: options.admin === 401 ? 401 : 403 }
        : { ok: true, id: id(9) },
    createAdminClient: () => admin as any,
    createClient: async () => client as any,
  };
  return { deps, calls, stored: () => blob };
}
test("server uses real validator/parser and session actor, ignoring no client claims", async () => {
  const file = await workbook();
  const h = harness();
  const answer = await submitAdminMatchFile(form(file), h.deps);
  expect(answer, JSON.stringify(answer)).toMatchObject({
    ok: true,
    state: "queued",
    operationId: id(1),
    retryable: true,
  });
  const submit = h.calls.find(
    (c) => c.name === "admin_submit_match_file",
  )!.args;
  expect(submit.p_actor_id).toBe(id(9));
  expect(submit.p_request.parsed).toMatchObject({
    player1_name: "Athlete",
    player2_name: "Rival",
    score: { player1: [6, 7], player2: [4, 6] },
    result: "Athlete Wins",
  });
  expect(submit.p_request.sha256).toBe(
    createHash("sha256")
      .update(Buffer.from(await file.arrayBuffer()))
      .digest("hex"),
  );
  expect(h.calls.filter((c) => c.name === "process")).toHaveLength(1);
  expect(h.calls[0].args.config).toEqual({ upsert: false });
});
test("authorization and workbook validation precede storage; caller cannot supply parsed score or actor", async () => {
  const file = await workbook();
  const denied = harness({ admin: false });
  expect(await submitAdminMatchFile(form(file), denied.deps)).toMatchObject({
    ok: false,
    status: 403,
  });
  expect(denied.calls).toEqual([]);
  const anonymous = harness({ admin: 401 });
  expect(await submitAdminMatchFile(form(file), anonymous.deps)).toMatchObject({
    ok: false,
    status: 401,
  });
  expect(
    await getAdminMatchFileStatus(id(1), id(2), anonymous.deps),
  ).toMatchObject({ ok: false, status: 401 });
  expect(
    await getAdminMatchFileStatus(id(1), id(2), denied.deps),
  ).toMatchObject({ ok: false, status: 403 });
  expect(anonymous.calls).toEqual([]);
  for (const key of ["actorId", "score", "parsed", "storagePath"]) {
    const h = harness();
    const data = form(file);
    data.set(key, "forged");
    expect((await submitAdminMatchFile(data, h.deps)).ok).toBe(false);
    expect(h.calls).toEqual([]);
  }
  const bad = harness();
  expect(
    (
      await submitAdminMatchFile(
        form(new File(["garbage"], "match.xlsx")),
        bad.deps,
      )
    ).ok,
  ).toBe(false);
  expect(bad.calls).toEqual([]);
});
test("content-addressed retries verify stored bytes and never dispatch started/failed work", async () => {
  const file = await workbook();
  const changed = harness({ existing: new Blob(["changed bytes"]) });
  expect((await submitAdminMatchFile(form(file), changed.deps)).ok).toBe(false);
  expect(changed.calls.map((c) => c.name)).toEqual(["upload"]);
  for (const state of ["processing", "failed", "completed"]) {
    const h = harness({ existing: file, state });
    const result = await submitAdminMatchFile(form(file), h.deps);
    expect(result).toMatchObject({ ok: true, state, retryable: false });
    expect(h.calls.some((c) => c.name === "process")).toBe(false);
  }
  const mismatch = harness({ error: "score-mismatch" });
  expect(await submitAdminMatchFile(form(file), mismatch.deps)).toMatchObject({
    ok: false,
    message: expect.stringContaining("recorded result was not changed"),
  });
});

test("file admission preserves wizard court labels and permits unanswered optional surface", async () => {
  const file = await workbook();
  for (const court of [
    "",
    "Outdoor Hard Court",
    "Indoor Hard Court",
    "Clay Court",
    "Grass Court",
  ]) {
    const h = harness();
    const body = form(file);
    body.set("courtType", court);
    expect((await submitAdminMatchFile(body, h.deps)).ok).toBe(true);
    expect(
      h.calls.find((c) => c.name === "admin_submit_match_file")!.args.p_request
        .courtType,
    ).toBe(court || null);
  }
});
