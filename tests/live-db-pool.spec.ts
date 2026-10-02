import { expect, test } from "@playwright/test";
import { AuthApiError, type SupabaseClient } from "@supabase/supabase-js";

import type { SignInAttempt } from "./fixtures/live-db";
// Imported under other names: the drift test in live-db-target-guard.spec.ts
// counts a spec that calls the pool helpers by name as a live one, and this
// spec never leaves the process.
import {
  POOL_USER_DEFAULTS,
  poolEmail,
  poolLogin as loginSlot,
  poolLogins as loginSlots,
  poolPassword,
} from "./fixtures/live-db-pool";

/**
 * The live-DB user pool, offline.
 *
 * A stub admin client stands in for auth and PostgREST, recording every call,
 * so the pool's promises — create once, never delete, reset before hand-out,
 * refuse leftovers, repair a stale password once — are pinned without a
 * network or a target project.
 */

const SECRET = "test-service-role-key";

interface Row {
  id: string;
  email: string;
  [column: string]: unknown;
}

interface Query {
  table: string;
  op: "select" | "update" | "insert";
  values?: Record<string, unknown>;
  filters: [string, unknown][];
  head: boolean;
}

/** An auth + PostgREST double holding just enough state for the pool. */
function fakeProject() {
  const state = {
    authUsers: [] as { id: string; email: string; password: string }[],
    rows: [] as Row[],
    leftovers: {} as Record<string, number>,
    /** Whether creating an auth user writes its profile row, as the trigger does. */
    trigger: true,
    queries: [] as Query[],
    authCalls: [] as string[],
  };

  function run(q: Query): { data: unknown; error: null; count?: number } {
    if (q.table !== "users") {
      return { data: null, error: null, count: state.leftovers[q.table] ?? 0 };
    }
    const [column, value] = q.filters[0] ?? [];
    if (q.op === "insert") {
      state.rows.push(q.values as Row);
      return { data: null, error: null };
    }
    const matches = state.rows.filter((row) => row[column as string] === value);
    if (q.op === "update") {
      for (const row of matches) Object.assign(row, q.values);
    }
    return { data: matches.map(({ id }) => ({ id })), error: null };
  }

  function from(table: string) {
    const q: Query = { table, op: "select", filters: [], head: false };
    const builder = {
      select(_columns: string, options?: { head?: boolean }) {
        q.head = Boolean(options?.head);
        return builder;
      },
      update(values: Record<string, unknown>) {
        q.op = "update";
        q.values = values;
        return builder;
      },
      insert(values: Record<string, unknown>) {
        q.op = "insert";
        q.values = values;
        return builder;
      },
      eq(column: string, value: unknown) {
        q.filters.push([column, value]);
        return builder;
      },
      or(expression: string) {
        q.filters.push(["or", expression]);
        return builder;
      },
      limit() {
        return builder;
      },
      then<T>(
        resolve: (value: ReturnType<typeof run>) => T,
        reject?: (reason: unknown) => T,
      ) {
        state.queries.push(q);
        return Promise.resolve(run(q)).then(resolve, reject);
      },
    };
    return builder;
  }

  let nextId = 1;
  const auth = {
    admin: {
      async listUsers() {
        state.authCalls.push("listUsers");
        return { data: { users: state.authUsers }, error: null };
      },
      async createUser(input: { email: string; password: string }) {
        state.authCalls.push("createUser");
        const user = { id: `user-${nextId++}`, ...input };
        state.authUsers.push(user);
        if (state.trigger) state.rows.push({ id: user.id, email: user.email });
        return { data: { user }, error: null };
      },
      async updateUserById(id: string, input: { password: string }) {
        state.authCalls.push("updateUserById");
        const user = state.authUsers.find((u) => u.id === id)!;
        user.password = input.password;
        return { data: { user }, error: null };
      },
      async deleteUser() {
        state.authCalls.push("deleteUser");
        return { data: {}, error: null };
      },
    },
  };

  const admin = { from, auth } as unknown as SupabaseClient;

  const signIns: string[] = [];
  async function signIn(
    email: string,
    password: string,
  ): Promise<SignInAttempt> {
    signIns.push(email);
    const user = state.authUsers.find((u) => u.email === email);
    const error =
      user && user.password === password
        ? null
        : new AuthApiError(
            "Invalid login credentials",
            400,
            "invalid_credentials",
          );
    return { client: {} as SupabaseClient, error, suffix: "" };
  }

  const guarded: string[] = [];
  const options = {
    secret: SECRET,
    signIn,
    guard: (caller: string) => guarded.push(caller),
  };

  return { state, admin, options, signIns, guarded };
}

test.describe("pool passwords", () => {
  test("are derived deterministically from the secret and the slot", () => {
    expect(poolPassword("coach", SECRET)).toBe(poolPassword("coach", SECRET));
    expect(poolPassword("coach", SECRET)).not.toBe(
      poolPassword("player", SECRET),
    );
    expect(poolPassword("coach", SECRET)).not.toBe(
      poolPassword("coach", "another-key"),
    );
    expect(poolPassword("coach", SECRET)).not.toContain(SECRET);
  });

  test("need a secret", () => {
    expect(() => poolPassword("coach", "")).toThrow(/SERVICE_ROLE_KEY/);
  });
});

test.describe("pool emails", () => {
  test("are one fixed address per slot", () => {
    expect(poolEmail("coach")).toBe("live-pool-coach@example.com");
    expect(() => poolEmail("Coach Two")).toThrow(/pool slot/);
  });
});

test.describe("handing out a slot", () => {
  test("creates the user once; a second hand-out issues no createUser and no delete", async () => {
    const { state, admin, options, guarded } = fakeProject();

    const first = await loginSlot(admin, "coach", options);
    const second = await loginSlot(admin, "coach", options);

    expect(second.userId).toBe(first.userId);
    expect(state.authCalls.filter((c) => c === "createUser")).toHaveLength(1);
    expect(state.authCalls).not.toContain("deleteUser");
    expect(state.authCalls).not.toContain("updateUserById");
    expect(state.authUsers[0]).toMatchObject({
      email: "live-pool-coach@example.com",
      password: poolPassword("coach", SECRET),
    });
    // The writing path goes through the production guard every time.
    expect(guarded).toHaveLength(2);
    expect(guarded.every((caller) => caller.includes("coach"))).toBe(true);
  });

  test("an auth user with no profile row is found through auth, not re-created", async () => {
    const { state, admin, options } = fakeProject();
    await loginSlot(admin, "coach", options);
    // `handle_new_user` swallows its failures, so the row can go missing.
    state.rows.length = 0;
    state.authCalls.length = 0;

    await loginSlot(admin, "coach", options);

    expect(state.authCalls).toContain("listUsers");
    expect(state.authCalls).not.toContain("createUser");
    expect(state.rows).toHaveLength(1);
  });

  test("resets the profile row to the defaults before signing in", async () => {
    const { state, admin, options } = fakeProject();
    const { userId } = await loginSlot(admin, "admin", options);

    // What a spec leaves behind.
    Object.assign(state.rows[0], {
      is_admin: true,
      plan: "pro",
      first_name: "Pending",
      last_name: "Owner",
      avatar_path: `${userId}/avatar-test.png`,
    });
    state.queries.length = 0;

    await loginSlot(admin, "admin", options);

    const reset = state.queries.find(
      (q) => q.table === "users" && q.op === "update",
    );
    expect(reset?.values).toEqual(POOL_USER_DEFAULTS);
    expect(reset?.filters).toEqual([["id", userId]]);
    expect(state.rows[0]).toMatchObject(POOL_USER_DEFAULTS);
    expect(state.rows[0].email).toBe("live-pool-admin@example.com");
  });

  test("never resets identity columns", () => {
    for (const column of ["id", "email", "created_at"]) {
      expect(Object.keys(POOL_USER_DEFAULTS)).not.toContain(column);
    }
    expect(POOL_USER_DEFAULTS).toMatchObject({ is_admin: false, plan: "free" });
  });

  test("inserts the profile row with the defaults when it is missing", async () => {
    const { state, admin, options } = fakeProject();
    state.trigger = false;

    const { userId } = await loginSlot(admin, "coach", options);

    const insert = state.queries.find(
      (q) => q.table === "users" && q.op === "insert",
    );
    expect(insert?.values).toEqual({
      id: userId,
      email: "live-pool-coach@example.com",
      ...POOL_USER_DEFAULTS,
    });
  });

  for (const table of ["program_members", "programs"]) {
    test(`fails, naming ${table}, when leftover rows reference the user`, async () => {
      const { state, admin, options, signIns } = fakeProject();
      await loginSlot(admin, "coach", options);
      state.leftovers[table] = 2;
      signIns.length = 0;

      await expect(loginSlot(admin, "coach", options)).rejects.toThrow(
        new RegExp(`2 ${table} row`),
      );
      expect(signIns).toEqual([]);
    });
  }

  test("a stale password is repaired once, then signs in", async () => {
    const { state, admin, options, signIns } = fakeProject();
    await loginSlot(admin, "coach", options);
    // The service-role key was rotated since this user was made.
    state.authUsers[0].password = poolPassword("coach", "old-key");
    signIns.length = 0;

    await loginSlot(admin, "coach", options);

    expect(state.authCalls.filter((c) => c === "updateUserById")).toHaveLength(
      1,
    );
    expect(signIns).toHaveLength(2);
    expect(state.authUsers[0].password).toBe(poolPassword("coach", SECRET));
  });

  test("several slots at once, each its own user; a duplicate slot is refused", async () => {
    const { state, admin, options } = fakeProject();

    const sessions = await loginSlots(admin, ["coach", "player"], options);

    expect(new Set(sessions.map((s) => s.userId)).size).toBe(2);
    expect(state.authUsers.map((u) => u.email).sort()).toEqual([
      "live-pool-coach@example.com",
      "live-pool-player@example.com",
    ]);
    await expect(
      loginSlots(admin, ["coach", "coach"], options),
    ).rejects.toThrow(/duplicate slot/);
  });
});
