import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";

/**
 * T6's three actions, run for real with only their request-bound dependencies
 * replaced.
 *
 * NOT a live-DB spec, deliberately. `admin-program-pilot-rpcs.spec.ts` and
 * `admin-program-details-rpc.spec.ts` already prove the RPCs' own gates against
 * a real database. What is unproven is the ACTION's gate — that a non-admin
 * caller is turned away *before* `supabase.rpc` is reached — and "the RPC was
 * never invoked" is a claim about a call that did not happen, which no database
 * can witness. So `requireAdmin`, `createClient` and `revalidatePath` are stubbed
 * and every `rpc()` is recorded: the assertion is on the recording being empty.
 *
 * The module is the real `admin-team-actions.ts`, transpiled and run in a fresh
 * context — the same trick `schedule-outcome-actions.spec.ts` uses, and the only
 * way to import a `"use server"` module that pulls in `next/cache`. No request,
 * no credentials, no network, no data.
 */
type Call = { name: string; args: Record<string, unknown> };

function actions(options: { admin?: boolean; rpcError?: string } = {}): {
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
        data: null,
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
      // Nothing else is reached by the three actions under test; the module's
      // other imports are only referenced inside functions this spec never calls.
      return {};
    },
  });

  return { actions: exports, calls, refreshed };
}

const NOT_AUTHORIZED = { ok: false, error: "Not authorized." };

/** A calendar date offset from today, in the column's own `YYYY-MM-DD`. */
function day(offset: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + offset);
  return d.toISOString().slice(0, 10);
}

// ── The gate: a non-admin never reaches the RPC ─────────────────────────────

test("a non-admin caller is refused and no RPC is invoked", async () => {
  const cases: Array<[string, unknown[]]> = [
    [
      "adminUpdateProgramDetails",
      [{ programId: "program", patch: { city: "Palo Alto" } }],
    ],
    ["adminSetPilotEnd", [{ programId: "program", endsOn: day(30) }]],
    ["adminEndPilot", ["program"]],
    ["adminSetPilotEligible", [{ programId: "program", eligible: true }]],
  ];

  for (const [name, args] of cases) {
    const run = actions({ admin: false });
    expect(typeof run.actions[name], `${name} is exported`).toBe("function");
    expect(await run.actions[name](...args), name).toEqual(NOT_AUTHORIZED);
    expect(run.calls, `${name} reached no RPC`).toEqual([]);
    expect(run.refreshed, `${name} revalidated nothing`).toEqual([]);
  }
});

// ── Details ────────────────────────────────────────────────────────────────

test("details patch is sent as a jsonb patch of whitelisted columns", async () => {
  const run = actions();
  expect(
    await run.actions.adminUpdateProgramDetails({
      programId: "program",
      patch: {
        schoolName: "Stanford",
        team: "womens",
        city: "Palo Alto",
        state: "CA",
        staffPageUrl: "https://example.test/staff",
        primaryDomain: "stanford.edu",
        homeVenue: "Taube",
        defaultSurface: "hard",
        timeZone: "America/Los_Angeles",
        uploadPolicy: "staff",
        eventsPolicy: "owner_coaches",
        rosterPublic: true,
      },
    }),
  ).toEqual({ ok: true });

  expect(run.calls).toEqual([
    {
      name: "admin_update_program_details",
      args: {
        p_program_id: "program",
        p_patch: {
          school_name: "Stanford",
          team: "womens",
          city: "Palo Alto",
          state: "CA",
          staff_page_url: "https://example.test/staff",
          primary_domain: "stanford.edu",
          home_venue: "Taube",
          default_surface: "hard",
          time_zone: "America/Los_Angeles",
          upload_policy: "staff",
          events_policy: "owner_coaches",
          roster_public: true,
        },
      },
    },
  ]);
  expect(run.refreshed).toEqual([["/admin", "layout"]]);
});

test("an absent key is omitted, an explicit null is kept, undefined counts as absent", async () => {
  const run = actions();
  await run.actions.adminUpdateProgramDetails({
    programId: "program",
    patch: { city: null, state: undefined, homeVenue: "" },
  });
  // `city` clears the column, `homeVenue` is the RPC's own `''` → null case,
  // and `state` never left TypeScript.
  expect(run.calls[0].args.p_patch).toEqual({ city: null, home_venue: "" });
});

test("the RPC's own refusal is passed through verbatim", async () => {
  const run = actions({ rpcError: "A collegiate program must have a squad." });
  expect(
    await run.actions.adminUpdateProgramDetails({
      programId: "program",
      patch: { team: null },
    }),
  ).toEqual({ ok: false, error: "A collegiate program must have a squad." });
  expect(run.refreshed).toEqual([]);
});

// ── Pilot end date ─────────────────────────────────────────────────────────

test("a malformed or past end date is refused without touching the RPC", async () => {
  for (const endsOn of [
    "",
    "   ",
    "31/12/2026",
    "2026-12",
    "2026-13-01",
    "2026-02-30",
    "2026-12-31T00:00:00Z",
    "tomorrow",
    day(-1),
    day(-400),
  ]) {
    const run = actions();
    const result = (await run.actions.adminSetPilotEnd({
      programId: "program",
      endsOn,
    })) as { ok: boolean };
    expect(result.ok, `refused ${JSON.stringify(endsOn)}`).toBe(false);
    expect(run.calls, `no RPC for ${JSON.stringify(endsOn)}`).toEqual([]);
    expect(run.refreshed).toEqual([]);
  }
});

test("today is accepted — the date is the last free day, inclusive", async () => {
  const run = actions();
  expect(
    await run.actions.adminSetPilotEnd({
      programId: "program",
      endsOn: day(0),
    }),
  ).toEqual({ ok: true });
  expect(run.calls).toEqual([
    {
      name: "admin_set_pilot_end",
      args: { p_program_id: "program", p_ends_on: day(0) },
    },
  ]);
  expect(run.refreshed).toEqual([["/admin", "layout"]]);
});

test("a future date is sent trimmed, and the RPC's refusal is passed through", async () => {
  const run = actions();
  expect(
    await run.actions.adminSetPilotEnd({
      programId: "program",
      endsOn: ` ${day(90)} `,
    }),
  ).toEqual({ ok: true });
  expect(run.calls[0].args.p_ends_on).toBe(day(90));

  const failed = actions({ rpcError: "Program x not found" });
  expect(
    await failed.actions.adminSetPilotEnd({
      programId: "gone",
      endsOn: day(90),
    }),
  ).toEqual({ ok: false, error: "Program x not found" });
  expect(failed.refreshed).toEqual([]);
});

// ── Ending a pilot ─────────────────────────────────────────────────────────

test("ending a pilot calls admin_end_pilot and revalidates", async () => {
  const run = actions();
  expect(await run.actions.adminEndPilot("program")).toEqual({ ok: true });
  expect(run.calls).toEqual([
    { name: "admin_end_pilot", args: { p_program_id: "program" } },
  ]);
  expect(run.refreshed).toEqual([["/admin", "layout"]]);

  const failed = actions({ rpcError: "not authorized" });
  expect(await failed.actions.adminEndPilot("program")).toEqual({
    ok: false,
    error: "not authorized",
  });
  expect(failed.refreshed).toEqual([]);
});

// ── Pool eligibility ───────────────────────────────────────────────────────

test("granting and revoking the pool call admin_set_pilot_eligible with the flag, and revalidate", async () => {
  const grant = actions();
  expect(
    await grant.actions.adminSetPilotEligible({
      programId: "program",
      eligible: true,
    }),
  ).toEqual({ ok: true });
  expect(grant.calls).toEqual([
    {
      name: "admin_set_pilot_eligible",
      args: { p_program_id: "program", p_eligible: true },
    },
  ]);
  expect(grant.refreshed).toEqual([["/admin", "layout"]]);

  const revoke = actions();
  await revoke.actions.adminSetPilotEligible({
    programId: "program",
    eligible: false,
  });
  expect(revoke.calls[0].args).toEqual({
    p_program_id: "program",
    p_eligible: false,
  });

  // The RPC's own refusals — a college, a missing program — are written for
  // a person and pass straight through.
  const failed = actions({
    rpcError: "Collegiate programs already draw the program pool.",
  });
  expect(
    await failed.actions.adminSetPilotEligible({
      programId: "college",
      eligible: true,
    }),
  ).toEqual({
    ok: false,
    error: "Collegiate programs already draw the program pool.",
  });
  expect(failed.refreshed).toEqual([]);
});
