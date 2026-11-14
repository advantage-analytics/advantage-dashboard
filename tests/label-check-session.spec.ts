import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  checkLabelSession,
  NOT_WAITING_FOR_CHECK,
  SEND_BACK_NOTE_MAX,
  SEND_BACK_NOTE_REQUIRED,
  SEND_BACK_NOTE_TOO_LONG,
  sendBackLabelSession,
  type LabelCheckDependencies,
} from "@/lib/services/labels/check-session";
import { ADMIN_REQUIRED } from "@/lib/services/labels/edit-session";
import { ANOTHER_SESSION_OPEN } from "@/lib/services/labels/session-status-session";

/**
 * The admin's Check and Send back over a fake client: who may, what one
 * update each writes and on what it is matched, and that neither touches the
 * match (no `verify_match` / `unverify_match`, no `matches` write).
 */

const SESSION_ID = "11111111-1111-4111-8111-111111111111";
const ADMIN = "33333333-3333-4333-8333-333333333333";
const NOW = Date.parse("2026-11-14T08:00:00.000Z");
const STAMP = new Date(NOW).toISOString();

interface Call {
  table: string;
  op: "select" | "update" | "insert" | "delete" | "rpc";
  values?: Record<string, unknown>;
  filters: Record<string, unknown>;
}

function fakeClient(opts: { raced?: boolean; failCode?: string } = {}) {
  const calls: Call[] = [];
  const client = {
    async rpc(fn: string, args: Record<string, unknown>) {
      calls.push({ table: fn, op: "rpc", values: args, filters: {} });
      return { data: null, error: null };
    },
    from(table: string) {
      const call: Call = { table, op: "select", filters: {} };
      calls.push(call);
      const answer = () => {
        if (call.op === "update" && opts.failCode) {
          return {
            data: null,
            error: { message: "duplicate key", code: opts.failCode },
          };
        }
        return {
          data: opts.raced ? [] : [{ id: call.filters.id }],
          error: null,
        };
      };
      const write =
        (op: "update" | "insert" | "delete") =>
        (values?: Record<string, unknown>) => {
          call.op = op;
          call.values = values;
          return builder;
        };
      const builder = {
        select: () => builder,
        update: write("update"),
        insert: write("insert"),
        delete: write("delete"),
        eq: (column: string, value: unknown) => {
          call.filters[column] = value;
          return builder;
        },
        is: (column: string, value: unknown) => {
          call.filters[`${column} is`] = value;
          return builder;
        },
        then: (
          resolve: (v: unknown) => unknown,
          reject?: (e: unknown) => unknown,
        ) => Promise.resolve(answer()).then(resolve, reject),
      };
      return builder;
    },
  };
  return { calls, supabase: client as unknown as AdminClient };
}

function deps(
  client: ReturnType<typeof fakeClient>,
  kind: "admin" | "labeller" | null = "admin",
): LabelCheckDependencies & { built: () => number } {
  let built = 0;
  return {
    requireLabelActor: async () =>
      kind ? { id: kind === "admin" ? ADMIN : "labeller", kind } : null,
    createAdminClient: () => {
      built += 1;
      return client.supabase;
    },
    now: () => NOW,
    built: () => built,
  };
}

/** Nothing reached the match: no verify RPC, no `matches`/`points`/`shots` write. */
function expectMatchUntouched(calls: Call[]) {
  expect(calls.filter((c) => c.op === "rpc")).toEqual([]);
  expect(
    calls.filter((c) => ["matches", "points", "shots"].includes(c.table)),
  ).toEqual([]);
}

test.describe("Check", () => {
  test("refuses a non-admin before any write", async () => {
    for (const kind of [null, "labeller"] as const) {
      const client = fakeClient();
      const d = deps(client, kind);
      expect(await checkLabelSession(SESSION_ID, d)).toEqual({
        error: ADMIN_REQUIRED,
      });
      expect(d.built()).toBe(0);
      expect(client.calls).toEqual([]);
    }
  });

  test("is one update, matched on a complete, unchecked analyst session", async () => {
    const client = fakeClient();
    expect(await checkLabelSession(SESSION_ID, deps(client))).toEqual({
      ok: true,
      status: "complete",
    });
    expect(client.calls).toEqual([
      {
        table: "label_sessions",
        op: "update",
        values: { checked_at: STAMP, checked_by: ADMIN },
        filters: {
          id: SESSION_ID,
          status: "complete",
          kind: "analyst",
          "checked_at is": null,
        },
      },
    ]);
    expectMatchUntouched(client.calls);
  });

  test("answers the named sentence when nothing matched", async () => {
    const client = fakeClient({ raced: true });
    expect(await checkLabelSession(SESSION_ID, deps(client))).toEqual({
      error: NOT_WAITING_FOR_CHECK,
    });
    expectMatchUntouched(client.calls);
  });
});

test.describe("Send back", () => {
  test("refuses a non-admin before any write", async () => {
    for (const kind of [null, "labeller"] as const) {
      const client = fakeClient();
      const d = deps(client, kind);
      expect(await sendBackLabelSession(SESSION_ID, "Fix set 2", d)).toEqual({
        error: ADMIN_REQUIRED,
      });
      expect(d.built()).toBe(0);
      expect(client.calls).toEqual([]);
    }
  });

  test("refuses a blank or overlong note before any write", async () => {
    for (const [note, sentence] of [
      ["", SEND_BACK_NOTE_REQUIRED],
      ["   \n\t ", SEND_BACK_NOTE_REQUIRED],
      [null, SEND_BACK_NOTE_REQUIRED],
      ["x".repeat(SEND_BACK_NOTE_MAX + 1), SEND_BACK_NOTE_TOO_LONG],
    ] as const) {
      const client = fakeClient();
      const d = deps(client);
      expect(await sendBackLabelSession(SESSION_ID, note, d)).toEqual({
        error: sentence,
      });
      expect(d.built()).toBe(0);
      expect(client.calls).toEqual([]);
    }
  });

  test("takes a note of exactly the limit once trimmed", async () => {
    const client = fakeClient();
    const note = "y".repeat(SEND_BACK_NOTE_MAX);
    expect(
      await sendBackLabelSession(SESSION_ID, `  ${note}  `, deps(client)),
    ).toEqual({ ok: true, status: "labelling" });
    expect(client.calls[0].values?.sent_back_note).toBe(note);
  });

  test("is one update reopening the session with the trimmed note", async () => {
    const client = fakeClient();
    expect(
      await sendBackLabelSession(
        SESSION_ID,
        "  Set 2 game 4: the serve is the wrong player.  ",
        deps(client),
      ),
    ).toEqual({ ok: true, status: "labelling" });
    expect(client.calls).toEqual([
      {
        table: "label_sessions",
        op: "update",
        values: {
          status: "labelling",
          completed_at: null,
          checked_at: null,
          checked_by: null,
          sent_back_at: STAMP,
          sent_back_by: ADMIN,
          sent_back_note: "Set 2 game 4: the serve is the wrong player.",
        },
        filters: { id: SESSION_ID, status: "complete", kind: "analyst" },
      },
    ]);
    // A checked session goes back too: the update is not matched on the check.
    expect(client.calls[0].filters).not.toHaveProperty("checked_at is");
    // Nor is the labeller changed.
    expect(client.calls[0].values).not.toHaveProperty("assigned_to");
    expectMatchUntouched(client.calls);
  });

  test("answers ANOTHER_SESSION_OPEN on a unique violation", async () => {
    const client = fakeClient({ failCode: "23505" });
    expect(
      await sendBackLabelSession(SESSION_ID, "Fix set 2", deps(client)),
    ).toEqual({ error: ANOTHER_SESSION_OPEN });
    expectMatchUntouched(client.calls);
  });

  test("answers the raced sentence when nothing matched", async () => {
    const client = fakeClient({ raced: true });
    expect(
      await sendBackLabelSession(SESSION_ID, "Fix set 2", deps(client)),
    ).toEqual({
      error: "This session changed in another tab. Reload to see it.",
    });
    expectMatchUntouched(client.calls);
  });
});

test("the admin actions delegate and revalidate /admin/labels on success", () => {
  const source = readFileSync("src/app/admin/labels/actions.ts", "utf8");
  for (const [action, service] of [
    ["checkLabelSessionAction", "checkLabelSession(sessionId)"],
    ["sendBackLabelSessionAction", "sendBackLabelSession(sessionId, note)"],
  ]) {
    const start = source.indexOf(`export async function ${action}(`);
    expect(start).toBeGreaterThan(-1);
    const body = source.slice(start, source.indexOf("\n}\n", start));
    expect(body).toContain(`await ${service}`);
    expect(body).toContain(
      'if ("ok" in result) revalidatePath("/admin/labels");',
    );
  }
});

test("neither write names verify_match, unverify_match or the match tables", () => {
  const source = readFileSync(
    "src/lib/services/labels/check-session.ts",
    "utf8",
  )
    // Doc comments may name what is deliberately not called.
    .replace(/\/\*\*[\s\S]*?\*\//g, "");
  expect(source).not.toMatch(/verify_match|\.rpc\(/);
  expect(source).not.toMatch(/from\("(matches|points|shots)"\)/);
});
