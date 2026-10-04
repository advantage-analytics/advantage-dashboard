import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

/**
 * T7's two actions — `adminSetMemberUploadEnabled` and `adminAddProgramPlayer`
 * — run for real with only their request-bound dependencies replaced.
 *
 * NOT a live-DB spec, deliberately, and not registered in
 * `tests/fixtures/live-db-specs.ts`. T3's `admin-member-roster-writes.spec.ts`
 * already proves both RPCs' widened gates against a real database. What no
 * database can witness is the claim this file exists for: that a non-admin
 * caller is turned away *before* `supabase.rpc` is reached — "the RPC was never
 * invoked" is a fact about a call that did not happen. So `requireAdmin`,
 * `createClient` and `revalidatePath` are stubbed, every `rpc()` is recorded,
 * and the assertion is that the recording is empty.
 *
 * Same harness as `admin-team-details-pilot-actions.spec.ts`: the real
 * `admin-team-actions.ts`, transpiled and run in a fresh context, which is the
 * only way to import a `"use server"` module that pulls in `next/cache`. No
 * request, no credentials, no network, no data.
 */
type Call = { name: string; args: Record<string, unknown> };

function actions(
  options: { admin?: boolean; rpcError?: string; data?: unknown } = {},
): {
  actions: Record<string, (...args: unknown[]) => Promise<unknown>>;
  calls: Call[];
  refreshed: unknown[];
} {
  const calls: Call[] = [];
  const refreshed: unknown[] = [];
  const isAdmin = options.admin ?? true;

  const client = {
    async rpc(name: string, args: Record<string, unknown>) {
      calls.push({ name, args });
      return {
        data: options.data ?? null,
        error: options.rpcError ? { message: options.rpcError } : null,
      };
    },
  };

  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const code = ts.transpileModule(
    readFileSync("src/lib/services/programs/admin-team-actions.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;

  runInNewContext(code, {
    exports,
    console,
    require(name: string) {
      if (name === "next/cache")
        return {
          revalidatePath: (...args: unknown[]) => refreshed.push(args),
        };
      if (name === "@/lib/supabase/server")
        return { createClient: async () => client };
      if (name === "./admin-guard")
        return { requireAdmin: async () => (isAdmin ? { id: "admin" } : null) };
      // Nothing else is reached by the two actions under test; the module's
      // other imports are only referenced inside functions this spec never
      // calls, and `AddPlayerResult` is a type-only import that never emits a
      // require at all.
      return {};
    },
  });

  return { actions: exports, calls, refreshed };
}

const NOT_AUTHORIZED = { ok: false, error: "Not authorized." };

const UPLOAD_ARGS = {
  programId: "program",
  userId: "member",
  enabled: true,
};

/**
 * Exactly the object `add-player-dialog.tsx`'s `submit()` builds, plus the one
 * id an admin has no workspace to infer. If this ever stops type-checking as an
 * argument, the dialog can no longer take the action as a prop unchanged.
 */
const PLAYER_ARGS = {
  programId: "program",
  firstName: "Ada",
  lastName: "Lovelace",
  classYear: "2029",
  lineupSpot: 3,
  email: "ada@example.test",
  hand: "left",
  backhand: "one-handed",
};

// ── The gate: a non-admin never reaches either RPC ──────────────────────────

test("a non-admin caller is refused and no RPC is invoked", async () => {
  const cases: Array<[string, unknown[]]> = [
    ["adminSetMemberUploadEnabled", [UPLOAD_ARGS]],
    ["adminAddProgramPlayer", [PLAYER_ARGS]],
  ];

  for (const [name, args] of cases) {
    const run = actions({ admin: false });
    expect(typeof run.actions[name], `${name} is exported`).toBe("function");
    expect(await run.actions[name](...args), name).toEqual(NOT_AUTHORIZED);
    expect(run.calls, `${name} reached no RPC`).toEqual([]);
    expect(run.refreshed, `${name} revalidated nothing`).toEqual([]);
  }
});

// ── The member upload switch ───────────────────────────────────────────────

test("the upload switch passes an explicit p_program_id and revalidates", async () => {
  const run = actions();
  expect(await run.actions.adminSetMemberUploadEnabled(UPLOAD_ARGS)).toEqual({
    ok: true,
  });
  expect(run.calls).toEqual([
    {
      name: "set_member_upload_enabled",
      args: {
        p_program_id: "program",
        p_user_id: "member",
        p_enabled: true,
      },
    },
  ]);
  expect(run.refreshed).toEqual([["/admin", "layout"]]);

  // Off is a value, not an absence.
  const off = actions();
  await off.actions.adminSetMemberUploadEnabled({
    ...UPLOAD_ARGS,
    enabled: false,
  });
  expect(off.calls[0].args.p_enabled).toBe(false);
});

test("the upload RPC's own refusal is passed through verbatim", async () => {
  const run = actions({
    rpcError: "They are no longer on this team.",
  });
  expect(await run.actions.adminSetMemberUploadEnabled(UPLOAD_ARGS)).toEqual({
    ok: false,
    error: "They are no longer on this team.",
  });
  expect(run.refreshed).toEqual([]);
});

// ── Adding a player ────────────────────────────────────────────────────────

test("adding a player forwards the dialog's own fields and returns the new id", async () => {
  const run = actions({ data: "player-id" });
  expect(await run.actions.adminAddProgramPlayer(PLAYER_ARGS)).toEqual({
    ok: true,
    profileId: "player-id",
  });
  expect(run.calls).toEqual([
    {
      name: "add_program_player",
      args: {
        p_program_id: "program",
        p_first_name: "Ada",
        p_last_name: "Lovelace",
        p_class_year: "2029",
        p_lineup_spot: 3,
        p_email: "ada@example.test",
        p_hand: "left",
        p_backhand: "one-handed",
      },
    },
  ]);
  expect(run.refreshed).toEqual([["/admin", "layout"]]);
});

test("the optional fields default to null, and a non-uuid return reads as null", async () => {
  const run = actions({ data: null });
  expect(
    await run.actions.adminAddProgramPlayer({
      programId: "program",
      firstName: "Ada",
      lastName: "Lovelace",
    }),
  ).toEqual({ ok: true, profileId: null });
  expect(run.calls[0].args).toEqual({
    p_program_id: "program",
    p_first_name: "Ada",
    p_last_name: "Lovelace",
    p_class_year: null,
    p_lineup_spot: null,
    p_email: null,
    p_hand: null,
    p_backhand: null,
  });
});

test("the add-player RPC's own refusal is passed through verbatim", async () => {
  const run = actions({
    rpcError: "Every player seat is taken.",
  });
  expect(await run.actions.adminAddProgramPlayer(PLAYER_ARGS)).toEqual({
    ok: false,
    error: "Every player seat is taken.",
  });
  expect(run.refreshed).toEqual([]);
});
