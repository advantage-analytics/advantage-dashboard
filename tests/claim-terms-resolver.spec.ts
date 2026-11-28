import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  PILOT_TERMS_VERSION,
  TEAM_TERMS_VERSION,
} from "@/lib/services/programs/pilot-terms";
import {
  forgetTeamTermsProbe,
  resolveClaimTerms,
  resolveTermsVersion,
  termsRefusal,
} from "@/lib/services/programs/pilot-terms-server";

/**
 * Which terms a claim is made under, decided in one place and enforced where
 * a browser cannot step round it (`pilot-terms-server.ts`). Offline: the
 * resolver takes its clients as arguments, so each case runs it against a
 * fake database; the `"use server"` callers need a request to run in and are
 * pinned by their source.
 *
 * Three things reviews found, each of which looked fine on screen:
 *
 *  1. The terms screen and its accept action resolved the version from
 *     different inputs, so a program on a running pilot with no pending claim
 *     was shown the pilot terms and told "terms changed" on every accept.
 *  2. Any error from `accepted_terms_versions()` read as "migration not
 *     applied" and put a January claim back on the pilot terms.
 *  3. The database accepts either live version, so the version a claim needs
 *     was enforced only by the screens in front of three server actions.
 */

const BEFORE = new Date("2026-12-31T23:59:59.999Z");
const AFTER = new Date("2027-01-15T12:00:00Z");

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "c@x.edu" };

const read = (path: string) =>
  readFileSync(resolve(__dirname, "..", path), "utf8");

type RpcAnswer = {
  data: unknown;
  error: { code?: string; message: string } | null;
};

interface World {
  /** `accepted_terms_versions()`'s answer. */
  versions?: RpcAnswer;
  /** Programs by key: whether each is on a running pilot. */
  programs?: Record<string, { pilot: boolean }>;
  /** The program key of this session's anonymous-slot pending claim. */
  pending?: string | null;
  /** The versions this coach has accepted. */
  accepted?: string[];
}

/** A database that answers the five reads the module makes, and counts them. */
function fakeDb(world: World) {
  const calls: string[] = [];
  const programs = world.programs ?? {};

  const rows = (table: string, filters: Record<string, unknown>) => {
    if (table === "programs") {
      const program = programs[filters.program_key as string];
      return program
        ? {
            pilot_eligible: program.pilot,
            pilot_ends_on: program.pilot ? "2027-05-31" : null,
            pilot_ended_at: null,
          }
        : null;
    }
    if (table === "pending_claims") {
      return world.pending
        ? {
            program_key: world.pending,
            claimant_user_id: null,
            expires_at: "2099-01-01T00:00:00Z",
          }
        : null;
    }
    if (table === "pilot_terms_acceptances") {
      return (world.accepted ?? []).includes(filters.terms_version as string)
        ? [{ id: "a" }]
        : [];
    }
    throw new Error(`unexpected table ${table}`);
  };

  const query = (table: string) => {
    const filters: Record<string, unknown> = {};
    const answer = () => {
      const data = rows(table, filters);
      return Promise.resolve({ data, error: null });
    };
    const chain = {
      select: () => chain,
      eq: (column: string, value: unknown) => {
        filters[column] = value;
        return chain;
      },
      is: () => chain,
      limit: () => chain,
      maybeSingle: answer,
      then: (
        onDone: (value: { data: unknown; error: null }) => unknown,
        onError?: (reason: unknown) => unknown,
      ) => answer().then(onDone, onError),
    };
    return chain;
  };

  const client = {
    from: (table: string) => {
      calls.push(`from:${table}`);
      return query(table);
    },
    rpc: (name: string, args?: { p_program_key?: string }) => {
      calls.push(`rpc:${name}`);
      if (name === "accepted_terms_versions") {
        return Promise.resolve(
          world.versions ?? {
            data: [PILOT_TERMS_VERSION, TEAM_TERMS_VERSION],
            error: null,
          },
        );
      }
      if (name === "program_public_status") {
        const key = args?.p_program_key ?? "";
        const data = programs[key]
          ? { program_key: key, school_name: "X", team: "men" }
          : null;
        return { maybeSingle: () => Promise.resolve({ data, error: null }) };
      }
      throw new Error(`unexpected rpc ${name}`);
    },
  };
  return { client: client as unknown as SupabaseClient, calls };
}

/** Run with `console.error` / `console.warn` captured instead of printed. */
async function quietly<T>(run: () => Promise<T>) {
  const logged: unknown[][] = [];
  const { error, warn } = console;
  console.error = (...args: unknown[]) => void logged.push(args);
  console.warn = (...args: unknown[]) => void logged.push(args);
  try {
    return { value: await run(), logged };
  } finally {
    console.error = error;
    console.warn = warn;
  }
}

test.beforeEach(() => forgetTeamTermsProbe());

// ── 2. Only a missing function means "migration not applied" ────────────────

test("before the date the database is not asked", async () => {
  const db = fakeDb({});
  expect(await resolveTermsVersion(db.client, { now: BEFORE })).toBe(
    PILOT_TERMS_VERSION,
  );
  expect(db.calls).toEqual([]);
});

test("a missing accepted_terms_versions() serves the pilot terms", async () => {
  for (const code of ["PGRST202", "42883"]) {
    const db = fakeDb({
      versions: { data: null, error: { code, message: "no such function" } },
    });
    const { value } = await quietly(() =>
      resolveTermsVersion(db.client, { now: AFTER }),
    );
    expect(value).toBe(PILOT_TERMS_VERSION);
  }
});

test("any other error is thrown and logged, never read as the pilot terms", async () => {
  for (const error of [
    // What a signed-out caller gets: the function is not theirs to execute.
    { code: "42501", message: "permission denied for function" },
    { code: "57014", message: "canceling statement due to statement timeout" },
    { message: "fetch failed" },
  ]) {
    const db = fakeDb({ versions: { data: null, error } });
    const { value, logged } = await quietly(() =>
      resolveTermsVersion(db.client, { now: AFTER }).then(
        (version) => ({ version }),
        (thrown: unknown) => ({ thrown }),
      ),
    );
    expect(value).toHaveProperty("thrown");
    expect(JSON.stringify(logged)).toContain(error.message);
  }
});

test("an answer that is not a list is thrown too", async () => {
  const db = fakeDb({ versions: { data: null, error: null } });
  const { value } = await quietly(() =>
    resolveTermsVersion(db.client, { now: AFTER }).then(
      () => "resolved",
      () => "thrown",
    ),
  );
  expect(value).toBe("thrown");
});

test("the team terms once the database lists them, and not before", async () => {
  const lists = fakeDb({});
  expect(await resolveTermsVersion(lists.client, { now: AFTER })).toBe(
    TEAM_TERMS_VERSION,
  );

  forgetTeamTermsProbe();
  const pilotOnly = fakeDb({
    versions: { data: [PILOT_TERMS_VERSION], error: null },
  });
  const { value } = await quietly(() =>
    resolveTermsVersion(pilotOnly.client, { now: AFTER }),
  );
  expect(value).toBe(PILOT_TERMS_VERSION);
});

// ── 1. One resolver, the same inputs, the same answer ───────────────────────

const PROGRAMS = { "on-pilot": { pilot: true }, "no-pilot": { pilot: false } };

test("no pending claim: the screen and its accept both follow the screen's program", async () => {
  // The bug: the accept passed no key, resolved the team terms, and refused
  // the pilot terms the screen had just shown, for ever.
  const db = fakeDb({ programs: PROGRAMS, pending: null });
  const inputs = { token: null, programKey: "on-pilot", now: AFTER };

  const page = await resolveClaimTerms(db.client, USER, {
    ...inputs,
    admin: db.client,
  });
  const action = await resolveClaimTerms(db.client, USER, {
    ...inputs,
    admin: db.client,
  });

  expect(page).toEqual({
    pendingKey: null,
    programKey: "on-pilot",
    version: PILOT_TERMS_VERSION,
  });
  expect(action).toEqual(page);
});

test("a pending claim's program decides, whatever key the browser sends", async () => {
  const db = fakeDb({ programs: PROGRAMS, pending: "no-pilot" });
  const withSwappedKey = await resolveClaimTerms(db.client, USER, {
    programKey: "on-pilot",
    now: AFTER,
    admin: db.client,
  });
  expect(withSwappedKey).toEqual({
    pendingKey: "no-pilot",
    programKey: "no-pilot",
    version: TEAM_TERMS_VERSION,
  });
  // The browser's key was not even looked up.
  expect(db.calls).not.toContain("rpc:program_public_status");

  // `/claim/verify` passes no key and reaches the same answer.
  const verify = await resolveClaimTerms(db.client, USER, {
    now: AFTER,
    admin: db.client,
  });
  expect(verify).toEqual(withSwappedKey);
});

test("a key that is no program selects nothing", async () => {
  for (const programKey of ["made-up", "", 7, null, "x".repeat(201)]) {
    const db = fakeDb({ programs: PROGRAMS, pending: null });
    const terms = await resolveClaimTerms(db.client, USER, {
      programKey,
      now: AFTER,
      admin: db.client,
    });
    expect(terms).toEqual({
      pendingKey: null,
      programKey: null,
      version: TEAM_TERMS_VERSION,
    });
    // Checked by the screen's own read, never by reading `programs` on trust.
    expect(db.calls).not.toContain("from:programs");
  }
});

test("the screen, its accept and verify all call the one resolver", () => {
  const page = read("src/app/claim/[programKey]/terms/page.tsx");
  const action = read("src/lib/services/programs/pilot-terms-actions.ts");
  const verify = read("src/app/claim/verify/route.ts");
  const form = read("src/components/claim/pilot-terms-form.tsx");

  for (const source of [page, action, verify]) {
    expect(source).toContain("resolveClaimTerms(supabase, user, {");
    // No second way to the version or the claim's program.
    expect(source).not.toMatch(
      /\b(claimTermsVersion|pendingClaimProgramKey)\(/,
    );
  }
  // The same two inputs on the screen and its accept, the key passed back.
  expect(page).toMatch(
    /resolveClaimTerms\(supabase, user, \{\s*token,\s*programKey,\s*\}\)/,
  );
  expect(page).toContain("programKey={programKey}");
  expect(form).toContain(
    "acceptPilotTermsForClaim({ version, token, programKey })",
  );
  expect(action).toMatch(
    /resolveClaimTerms\(supabase, user, \{\s*token,\s*programKey: input\?\.programKey,\s*\}\)/,
  );
  // Verify has no browser key to offer: the pending claim or nothing.
  expect(verify).toContain("resolveClaimTerms(supabase, user, { token })");
});

// ── 3. The applicable version is required by the completions themselves ─────

test("the pilot acceptance does not finish a January claim for a program on no pilot", async () => {
  const db = fakeDb({ programs: PROGRAMS, accepted: [PILOT_TERMS_VERSION] });
  expect(await termsRefusal(db.client, USER.id, "no-pilot", AFTER)).toBe(
    "terms-not-accepted",
  );
  // A program on a running pilot is still on the pilot's terms.
  expect(await termsRefusal(db.client, USER.id, "on-pilot", AFTER)).toBeNull();
  // And before the date every claim is.
  expect(await termsRefusal(db.client, USER.id, "no-pilot", BEFORE)).toBeNull();
});

test("a custom team goes by the date alone", async () => {
  const pilotOnly = fakeDb({ accepted: [PILOT_TERMS_VERSION] });
  expect(
    await termsRefusal(pilotOnly.client, USER.id, null, BEFORE),
  ).toBeNull();
  expect(await termsRefusal(pilotOnly.client, USER.id, null, AFTER)).toBe(
    "terms-not-accepted",
  );
  expect(pilotOnly.calls).not.toContain("from:programs");

  const both = fakeDb({ accepted: [PILOT_TERMS_VERSION, TEAM_TERMS_VERSION] });
  expect(await termsRefusal(both.client, USER.id, null, AFTER)).toBeNull();
});

test("the team acceptance does not finish a claim for a program on a running pilot", async () => {
  const db = fakeDb({ programs: PROGRAMS, accepted: [TEAM_TERMS_VERSION] });
  expect(await termsRefusal(db.client, USER.id, "on-pilot", AFTER)).toBe(
    "terms-not-accepted",
  );
  expect(await termsRefusal(db.client, USER.id, "no-pilot", AFTER)).toBeNull();
});

test("no acceptance, or a version nobody can say: nothing goes ahead", async () => {
  const none = fakeDb({ programs: PROGRAMS });
  expect(await termsRefusal(none.client, USER.id, "no-pilot", AFTER)).toBe(
    "terms-not-accepted",
  );

  forgetTeamTermsProbe();
  const broken = fakeDb({
    programs: PROGRAMS,
    accepted: [PILOT_TERMS_VERSION, TEAM_TERMS_VERSION],
    versions: { data: null, error: { code: "57014", message: "timeout" } },
  });
  const { value } = await quietly(() =>
    termsRefusal(broken.client, USER.id, "no-pilot", AFTER),
  );
  expect(value).toBe("failed");
});

test("each browser-callable completion asks before its RPC", () => {
  const claims = read("src/lib/services/programs/claim-actions.ts");
  const create = read("src/lib/services/programs/create-actions.ts");
  const body = (source: string, from: string, to?: string) => {
    const start = source.indexOf(from);
    expect(start).toBeGreaterThan(-1);
    return source.slice(start, to ? source.indexOf(to, start) : undefined);
  };

  const cases = [
    {
      source: body(
        claims,
        "export async function completeClaim()",
        "export async function completeClaimWithToken",
      ),
      // The claim's own program, from the pending row it is about to spend.
      gate: "await termsRefusal(supabase, user.id, pending.programKey)",
      rpc: 'db.rpc("complete_program_claim"',
    },
    {
      source: body(claims, "export async function completeClaimWithToken"),
      gate: /await termsRefusal\(\s*supabase,\s*user\.id,\s*row\.program_key as string,\s*\)/,
      rpc: 'db.rpc("complete_program_claim_with_token"',
    },
    {
      source: body(create, "export async function createCustomProgram"),
      // No program yet: the date alone.
      gate: "await termsRefusal(supabase, user.id, null)",
      rpc: 'supabase.rpc("create_custom_program"',
    },
  ];

  for (const { source, gate, rpc } of cases) {
    const at = source.search(
      typeof gate === "string"
        ? new RegExp(gate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
        : gate,
    );
    expect(at).toBeGreaterThan(-1);
    expect(source.indexOf(rpc)).toBeGreaterThan(at);
    // The refusal the action already had, not a new sentence.
    expect(source.slice(at, source.indexOf(rpc))).toContain(
      "if (refusal) return { ok: false, reason: refusal };",
    );
  }
});

// ── 2, the signed-out half ──────────────────────────────────────────────────

test("nothing resolves a version before it holds a session", () => {
  // `accepted_terms_versions()` is not executable signed out.
  const before = (source: string, call: string) => {
    const at = source.indexOf(call);
    expect(at).toBeGreaterThan(-1);
    return source.slice(0, at);
  };

  expect(
    before(
      read("src/app/claim/team/terms/page.tsx"),
      "await resolveTermsVersion(supabase)",
    ),
  ).toContain('if (!user) redirect(await loginRedirectPath("/claim/team"));');
  expect(
    before(
      read("src/app/claim/[programKey]/terms/page.tsx"),
      "await resolveClaimTerms(",
    ),
  ).toContain("if (!user) redirect(verify);");
  expect(
    before(
      read("src/lib/services/programs/pilot-terms-actions.ts"),
      "await resolveClaimTerms(",
    ),
  ).toContain('if (!user) return { ok: false, reason: "no-session" };');

  const team = read("src/app/claim/team/actions.ts");
  const accept = team.slice(
    team.indexOf("export async function acceptPilotTermsAndCreateTeam"),
  );
  expect(before(accept, "await resolveTermsVersion(supabase)")).toContain(
    'if (!user) return { ok: false, reason: "no-session" };',
  );
  // Every call in that file passes a client it has just read the user from.
  expect(team).not.toContain("resolveTermsVersion(await createClient())");

  expect(read("src/app/claim/verify/route.ts")).toMatch(
    /if \(user\) \{\s*try \{\s*terms = await resolveClaimTerms\(/,
  );
});

test("the missing-terms ending keeps its approved heading", () => {
  expect(read("src/lib/billing/claim-copy.ts")).toContain(
    'failedHeading: "Accept the terms first"',
  );
});
