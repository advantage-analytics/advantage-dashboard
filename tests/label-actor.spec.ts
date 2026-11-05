import { expect, test } from "@playwright/test";

import type { AdminClient } from "@/lib/supabase/admin";
import {
  requireLabelActor,
  requireLabelReader,
  type AdminCheck,
  type LabelActorDependencies,
} from "@/lib/services/programs/admin-guard";
import {
  requireLabelActorFor,
  resolveLabelSessionId,
} from "@/lib/services/labels/label-actor";

/**
 * The labelling gate over fake clients: who gets through
 * (`requireLabelActor`), and which session a point or shot belongs to
 * (`resolveLabelSessionId`). No database.
 */

const SESSION_A = "11111111-1111-4111-8111-111111111111";
const SESSION_B = "22222222-2222-4222-8222-222222222222";
const ADMIN = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const LABELLER = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const OTHER = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";
const SHOT_1 = "33333333-3333-4333-8333-333333333331";
const SHOT_2 = "33333333-3333-4333-8333-333333333332";
const POINT_1 = "44444444-4444-4444-8444-444444444441";

interface Row {
  id: string;
  [column: string]: unknown;
}

/**
 * A service-role client over in-memory tables: `select().eq().maybeSingle()`
 * and `select().in()`. Records every table it was asked for, so a spec can
 * assert the admin branch read nothing.
 */
function fakeAdminClient(tables: Record<string, Row[]>) {
  const reads: string[] = [];
  const client = {
    from(table: string) {
      reads.push(table);
      const rows = tables[table] ?? [];
      return {
        select: () => ({
          eq: (column: string, value: unknown) => ({
            maybeSingle: async () => ({
              data: rows.find((row) => row[column] === value) ?? null,
              error: null,
            }),
          }),
          in: async (column: string, values: unknown[]) => ({
            data: rows.filter((row) => values.includes(row[column])),
            error: null,
          }),
        }),
      };
    },
  };
  return { client: client as unknown as AdminClient, reads };
}

function deps(options: {
  admin: AdminCheck;
  /** The signed-in user the browser client reports; absent = signed out. */
  uid?: string;
  tables?: Record<string, Row[]>;
}) {
  const { client, reads } = fakeAdminClient(options.tables ?? {});
  let adminClients = 0;
  const value: LabelActorDependencies = {
    checkAdmin: async () => options.admin,
    createClient: async () => ({
      auth: {
        getUser: async () => ({
          data: { user: options.uid ? { id: options.uid } : null },
        }),
      },
    }),
    createAdminClient: () => {
      adminClients += 1;
      return client;
    },
  };
  return { deps: value, reads, adminClients: () => adminClients };
}

const session = (status: string, assignedTo: string | null): Row => ({
  id: SESSION_A,
  status,
  assigned_to: assignedTo,
});
const users = (isLabeller: boolean): Row[] => [
  { id: LABELLER, is_labeller: isLabeller },
];

test.describe("requireLabelReader", () => {
  /** The reader's answer for a non-admin signed in as `uid`. */
  async function readerFor(options: {
    status: string;
    assignedTo: string | null;
    isLabeller?: boolean;
    uid?: string;
  }) {
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: options.uid ?? LABELLER,
      tables: {
        users: users(options.isLabeller ?? true),
        label_sessions: [session(options.status, options.assignedTo)],
      },
    });
    return requireLabelReader(SESSION_A, d.deps);
  }

  test("an admin reads any session without reading it", async () => {
    const d = deps({
      admin: { ok: true, id: ADMIN },
      tables: { label_sessions: [session("complete", null)] },
    });
    expect(await requireLabelReader(SESSION_A, d.deps)).toEqual({
      id: ADMIN,
      kind: "admin",
    });
    expect(d.reads).toEqual([]);
  });

  test("the assigned labeller reads a labelling session", async () => {
    expect(
      await readerFor({ status: "labelling", assignedTo: LABELLER }),
    ).toEqual({ id: LABELLER, kind: "labeller" });
  });

  test("the assigned labeller reads their submitted session, which the actor gate refuses", async () => {
    expect(
      await readerFor({ status: "submitted", assignedTo: LABELLER }),
    ).toEqual({ id: LABELLER, kind: "labeller" });
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: LABELLER,
      tables: {
        users: users(true),
        label_sessions: [session("submitted", LABELLER)],
      },
    });
    expect(await requireLabelActor(SESSION_A, d.deps)).toBeNull();
  });

  test("an unassigned or someone else's session is refused", async () => {
    expect(await readerFor({ status: "labelling", assignedTo: null })).toBe(
      null,
    );
    expect(await readerFor({ status: "submitted", assignedTo: OTHER })).toBe(
      null,
    );
  });

  test("a complete session is refused, even to its labeller", async () => {
    expect(
      await readerFor({ status: "complete", assignedTo: LABELLER }),
    ).toBeNull();
  });

  test("an assigned user without is_labeller is refused", async () => {
    expect(
      await readerFor({
        status: "labelling",
        assignedTo: LABELLER,
        isLabeller: false,
      }),
    ).toBeNull();
  });

  test("signed out is refused before any read", async () => {
    const d = deps({ admin: { ok: false, status: 401 } });
    expect(await requireLabelReader(SESSION_A, d.deps)).toBeNull();
    expect(d.adminClients()).toBe(0);
  });
});

test.describe("requireLabelActor", () => {
  test("an admin passes on an unassigned session without reading it", async () => {
    const d = deps({
      admin: { ok: true, id: ADMIN },
      tables: { label_sessions: [session("labelling", null)] },
    });
    expect(await requireLabelActor(SESSION_A, d.deps)).toEqual({
      id: ADMIN,
      kind: "admin",
    });
    expect(d.reads).toEqual([]);
    expect(d.adminClients()).toBe(0);
  });

  test("signed out is refused before any read", async () => {
    const d = deps({ admin: { ok: false, status: 401 } });
    expect(await requireLabelActor(SESSION_A, d.deps)).toBeNull();
    expect(d.adminClients()).toBe(0);
  });

  test("a labeller is refused on an unassigned session", async () => {
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: LABELLER,
      tables: {
        users: users(true),
        label_sessions: [session("labelling", null)],
      },
    });
    expect(await requireLabelActor(SESSION_A, d.deps)).toBeNull();
  });

  test("a labeller is refused on a session assigned to someone else", async () => {
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: LABELLER,
      tables: {
        users: users(true),
        label_sessions: [session("labelling", OTHER)],
      },
    });
    expect(await requireLabelActor(SESSION_A, d.deps)).toBeNull();
  });

  test("a labeller is refused once the session is submitted", async () => {
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: LABELLER,
      tables: {
        users: users(true),
        label_sessions: [session("submitted", LABELLER)],
      },
    });
    expect(await requireLabelActor(SESSION_A, d.deps)).toBeNull();
  });

  test("a labeller is refused on a complete session", async () => {
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: LABELLER,
      tables: {
        users: users(true),
        label_sessions: [session("complete", LABELLER)],
      },
    });
    expect(await requireLabelActor(SESSION_A, d.deps)).toBeNull();
  });

  test("an assigned user without is_labeller is refused", async () => {
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: LABELLER,
      tables: {
        users: users(false),
        label_sessions: [session("labelling", LABELLER)],
      },
    });
    expect(await requireLabelActor(SESSION_A, d.deps)).toBeNull();
  });

  test("a labeller assigned to a labelling session gets through", async () => {
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: LABELLER,
      tables: {
        users: users(true),
        label_sessions: [session("labelling", LABELLER)],
      },
    });
    expect(await requireLabelActor(SESSION_A, d.deps)).toEqual({
      id: LABELLER,
      kind: "labeller",
    });
    // Both reads are service-role: `is_labeller` has no client grant.
    expect(d.reads.sort()).toEqual(["label_sessions", "users"]);
  });

  test("a session that does not exist refuses a labeller", async () => {
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: LABELLER,
      tables: { users: users(true), label_sessions: [] },
    });
    expect(await requireLabelActor(SESSION_B, d.deps)).toBeNull();
  });
});

test.describe("resolveLabelSessionId", () => {
  const shots: Row[] = [
    { id: SHOT_1, session_id: SESSION_A },
    { id: SHOT_2, session_id: SESSION_B },
  ];
  const points: Row[] = [{ id: POINT_1, session_id: SESSION_A }];

  test("a session id is answered as given", async () => {
    const { client, reads } = fakeAdminClient({});
    expect(await resolveLabelSessionId(client, { sessionId: SESSION_A })).toBe(
      SESSION_A,
    );
    expect(reads).toEqual([]);
    expect(
      await resolveLabelSessionId(client, { sessionId: "not-a-uuid" }),
    ).toBeNull();
  });

  test("a shot and a point resolve to their session", async () => {
    const { client, reads } = fakeAdminClient({
      label_shots: shots,
      label_points: points,
    });
    expect(await resolveLabelSessionId(client, { shotId: SHOT_2 })).toBe(
      SESSION_B,
    );
    expect(await resolveLabelSessionId(client, { pointId: POINT_1 })).toBe(
      SESSION_A,
    );
    expect(
      await resolveLabelSessionId(client, { pointIds: [POINT_1, POINT_1] }),
    ).toBe(SESSION_A);
    expect(reads).toEqual(["label_shots", "label_points", "label_points"]);
  });

  test("shot ids spanning two sessions resolve to none", async () => {
    const { client } = fakeAdminClient({ label_shots: shots });
    expect(
      await resolveLabelSessionId(client, { shotIds: [SHOT_1, SHOT_2] }),
    ).toBeNull();
  });

  test("unknown rows, an empty batch and a bad id resolve to none", async () => {
    const { client, reads } = fakeAdminClient({ label_shots: shots });
    expect(await resolveLabelSessionId(client, { shotId: POINT_1 })).toBeNull();
    expect(await resolveLabelSessionId(client, { shotIds: [] })).toBeNull();
    expect(
      await resolveLabelSessionId(client, { shotIds: [SHOT_1, "x"] }),
    ).toBeNull();
    // Neither the empty batch nor the malformed one reached the database.
    expect(reads).toEqual(["label_shots"]);
  });
});

test.describe("requireLabelActorFor", () => {
  test("an admin passes on any target without a read", async () => {
    const d = deps({ admin: { ok: true, id: ADMIN } });
    expect(await requireLabelActorFor({ shotId: SHOT_1 }, d.deps)).toEqual({
      id: ADMIN,
      kind: "admin",
    });
    expect(d.adminClients()).toBe(0);
  });

  test("a labeller is gated on the session the shot belongs to", async () => {
    const tables = {
      users: users(true),
      label_sessions: [session("labelling", LABELLER)],
      label_shots: [{ id: SHOT_1, session_id: SESSION_A }],
    };
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: LABELLER,
      tables,
    });
    expect(await requireLabelActorFor({ shotId: SHOT_1 }, d.deps)).toEqual({
      id: LABELLER,
      kind: "labeller",
    });
  });

  test("a batch across two sessions refuses a labeller assigned to one", async () => {
    const tables = {
      users: users(true),
      label_sessions: [session("labelling", LABELLER)],
      label_shots: [
        { id: SHOT_1, session_id: SESSION_A },
        { id: SHOT_2, session_id: SESSION_B },
      ],
    };
    const d = deps({
      admin: { ok: false, status: 403 },
      uid: LABELLER,
      tables,
    });
    expect(
      await requireLabelActorFor({ shotIds: [SHOT_1, SHOT_2] }, d.deps),
    ).toBeNull();
  });
});
