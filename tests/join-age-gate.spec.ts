import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";
import { AGE_REFUSAL } from "../src/app/onboarding/age";

/**
 * The age gate on the two paths that join a team without onboarding's name
 * step — the gaps PR #561 listed as (a) and (b):
 *
 *  (a) an account that already has a name (a Google sign-up) opening a join
 *      link — `acceptJoinLink`;
 *  (b) an account accepting a pending invitation from the onboarding
 *      intercept, `/invitations/[id]` or the tray — `acceptPendingInvite`;
 *
 * plus the emailed invitation's two doors, `acceptInvite` and
 * `createAccountAndAccept`, which reach the same accept RPC.
 *
 * The rule (`src/app/onboarding/age.ts`): these are team-invitation paths, so
 * 13–17 joins and under 13 never does; a date already on file wins; an
 * under-13 date is refused, not stored. The real `join-actions.ts` runs here
 * against a fake Supabase and stubbed accept RPCs, so what is pinned is the
 * order — the date settled BEFORE the RPC that reads it back — and what
 * reaches the database. The SQL half (`join_age_refusal()` inside both
 * accept RPCs) is pinned from the migration below and was exercised against
 * the live schema in a rolled-back transaction when it was written.
 */

const TODAY = new Date().toISOString().slice(0, 10);
/** `YYYY-MM-DD` for someone `years` old today (born on today's date). */
function bornYearsAgo(years: number): string {
  return `${Number(TODAY.slice(0, 4)) - years}${TODAY.slice(4)}`;
}
const ADULT = bornYearsAgo(30);
const TEEN = bornYearsAgo(15);
const CHILD = bornYearsAgo(11);

const REDIRECT = "NEXT_REDIRECT";

interface World {
  /** `users.dob` on file for the signed-in user. */
  dobOnFile: string | null;
  /** The account has no `public.users` row at all. */
  noUsersRow?: boolean;
  /** What the accept RPC answers. */
  outcome: { ok: true; programId: string } | { ok: false; status: string };
}

function harness(world: World) {
  const calls = {
    rpc: [] as string[],
    dobWrites: [] as string[],
    createUser: 0,
    redirects: [] as string[],
  };

  const sessionClient = {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
      signInWithPassword: async () => ({ error: null }),
    },
    from: (table: string) => {
      expect(table).toBe("users");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: world.noUsersRow ? null : { dob: world.dobOnFile },
              error: null,
            }),
          }),
        }),
        // `.update().eq().is("dob", null).select("id")`: only an empty
        // date is written, and a write that matched no row reads as none.
        update: (values: { dob: string }) => ({
          eq: () => ({
            is: () => ({
              select: async () => {
                if (world.noUsersRow || world.dobOnFile !== null) {
                  return { data: [], error: null };
                }
                calls.dobWrites.push(values.dob);
                world.dobOnFile = values.dob;
                return { data: [{ id: "user-1" }], error: null };
              },
            }),
          }),
        }),
      };
    },
  };

  const adminClient = {
    auth: {
      admin: {
        createUser: async () => {
          calls.createUser += 1;
          return { data: { user: { id: "new-user" } }, error: null };
        },
      },
    },
    from: () => ({
      update: (values: { dob?: string; onboarded_at?: string }) => {
        if (values.dob) calls.dobWrites.push(values.dob);
        const chain = {
          eq: () => chain,
          is: async () => ({ error: null }),
          then: (resolve: (v: { error: null }) => void) =>
            resolve({ error: null }),
        };
        return chain;
      },
      select: () => {
        const chain = {
          eq: () => chain,
          maybeSingle: async () => ({ data: null, error: null }),
        };
        return chain;
      },
    }),
  };

  const accept = (name: string) => async () => {
    calls.rpc.push(name);
    return world.outcome;
  };

  const loader = createLoader({
    stubs: {
      "next/server": { after: () => {} },
      "next/navigation": {
        redirect: (href: string) => {
          calls.redirects.push(href);
          throw new Error(REDIRECT);
        },
      },
      "next/cache": { revalidatePath: () => {} },
      "next/headers": { cookies: async () => ({ set: () => {} }) },
      "@/lib/supabase/server": { createClient: async () => sessionClient },
      "@/lib/supabase/admin": { createAdminClient: () => adminClient },
      "@/lib/auth/error-messages": { validatePassword: () => null },
      "@/lib/workspace/active-workspace-server": { WORKSPACE_COOKIE: "ws" },
      "@/lib/services/email": {},
      "@/lib/data/programs-server": { programDisplayName: () => "Team" },
      "@/lib/services/notifications/should-notify": {
        wantsNotification: async () => false,
      },
      "./program-owner": { getProgramOwner: async () => null },
      "./join-links": {
        joinHref: (t: string) => `/join/${t}`,
        signInThenHref: (h: string) => `/login?next=${h}`,
      },
      "./invite-acceptance": {
        acceptWithSession: accept("accept_program_invite"),
        acceptPendingWithSession: accept("accept_pending_invite"),
        acceptJoinLinkWithSession: accept("accept_program_join_link"),
        accountExists: async () => false,
        displayName: () => "Someone",
        loadInvite: async () => null,
        resolveJoinState: async () => ({
          kind: "sign_up",
          email: "new@example.com",
        }),
      },
    },
  });

  const actions = loader.load("src/lib/services/programs/join-actions.ts") as {
    acceptJoinLink: (token: string, dob?: string) => Promise<unknown>;
    acceptPendingInvite: (id: string, dob?: string) => Promise<unknown>;
    acceptInvite: (token: string, dob?: string) => Promise<unknown>;
    createAccountAndAccept: (
      token: string,
      input: {
        firstName: string;
        lastName: string;
        password: string;
        dob: string;
      },
    ) => Promise<unknown>;
  };
  return { actions, calls };
}

/** Run an action, turning a redirect (success) into a marker. */
async function run(action: () => Promise<unknown>): Promise<unknown> {
  try {
    return await action();
  } catch (error) {
    if (error instanceof Error && error.message === REDIRECT) return REDIRECT;
    throw error;
  }
}

const INVITE_ID = "3b9c2c1e-6a2f-4c8e-9a51-2f6f1d2c9e10";

/** The two gap paths, plus the emailed invitation's signed-in door. */
const DOORS: {
  label: string;
  rpc: string;
  call: (
    actions: ReturnType<typeof harness>["actions"],
    dob?: string,
  ) => Promise<unknown>;
}[] = [
  {
    label: "(a) join link, account already named",
    rpc: "accept_program_join_link",
    call: (a, dob) => a.acceptJoinLink("link-token", dob),
  },
  {
    label: "(b) pending invitation from the onboarding intercept",
    rpc: "accept_pending_invite",
    call: (a, dob) => a.acceptPendingInvite(INVITE_ID, dob),
  },
  {
    label: "emailed invitation, signed in",
    rpc: "accept_program_invite",
    call: (a, dob) => a.acceptInvite("invite-token", dob),
  },
];

for (const door of DOORS) {
  test.describe(door.label, () => {
    test("no date on file and none sent: asks for one, never reaches the RPC", async () => {
      const { actions, calls } = harness({
        dobOnFile: null,
        outcome: { ok: true, programId: "p1" },
      });
      const result = await run(() => door.call(actions));
      expect(result).toMatchObject({ ok: false, age: "required" });
      expect(calls.rpc).toEqual([]);
      expect(calls.dobWrites).toEqual([]);
    });

    test("under 13: refused with the onboarding refusal, nothing stored, no RPC", async () => {
      const { actions, calls } = harness({
        dobOnFile: null,
        outcome: { ok: true, programId: "p1" },
      });
      const result = await run(() => door.call(actions, CHILD));
      expect(result).toEqual({
        ok: false,
        error: AGE_REFUSAL.child,
        age: "too-young",
      });
      expect(calls.rpc).toEqual([]);
      expect(calls.dobWrites).toEqual([]);
    });

    test("13–17: allowed — the date is written, then the RPC joins", async () => {
      const { actions, calls } = harness({
        dobOnFile: null,
        outcome: { ok: true, programId: "p1" },
      });
      const result = await run(() => door.call(actions, TEEN));
      expect(result).toBe(REDIRECT);
      expect(calls.dobWrites).toEqual([TEEN]);
      expect(calls.rpc).toEqual([door.rpc]);
    });

    test("18+: allowed the same way", async () => {
      const { actions, calls } = harness({
        dobOnFile: null,
        outcome: { ok: true, programId: "p1" },
      });
      expect(await run(() => door.call(actions, ADULT))).toBe(REDIRECT);
      expect(calls.dobWrites).toEqual([ADULT]);
      expect(calls.rpc).toEqual([door.rpc]);
    });

    test("a date on file wins: no field needed, and a sent date never edits it", async () => {
      const { actions, calls } = harness({
        dobOnFile: ADULT,
        outcome: { ok: true, programId: "p1" },
      });
      expect(await run(() => door.call(actions, CHILD))).toBe(REDIRECT);
      expect(calls.dobWrites).toEqual([]);
      expect(calls.rpc).toEqual([door.rpc]);
    });

    test("an under-13 date already on file is refused before the RPC", async () => {
      const { actions, calls } = harness({
        dobOnFile: CHILD,
        outcome: { ok: true, programId: "p1" },
      });
      expect(await run(() => door.call(actions))).toMatchObject({
        age: "too-young",
      });
      expect(calls.rpc).toEqual([]);
    });

    test("a date that saved nowhere (no users row) never reaches the RPC", async () => {
      const { actions, calls } = harness({
        dobOnFile: null,
        noUsersRow: true,
        outcome: { ok: true, programId: "p1" },
      });
      const result = await run(() => door.call(actions, ADULT));
      expect(result).toMatchObject({ ok: false });
      expect(calls.rpc).toEqual([]);
    });

    test("the database's own refusal comes back with its age code", async () => {
      const { actions } = harness({
        dobOnFile: ADULT,
        outcome: { ok: false, status: "too_young" },
      });
      expect(await run(() => door.call(actions))).toEqual({
        ok: false,
        error: AGE_REFUSAL.child,
        age: "too-young",
      });
      const required = harness({
        dobOnFile: ADULT,
        outcome: { ok: false, status: "age_required" },
      });
      expect(await run(() => door.call(required.actions))).toMatchObject({
        ok: false,
        age: "required",
      });
    });
  });
}

test.describe("emailed invitation, no account yet", () => {
  const input = (dob: string) => ({
    firstName: "Sam",
    lastName: "Lee",
    password: "a-long-enough-password",
    dob,
  });

  test("under 13: refused before an account is created", async () => {
    const { actions, calls } = harness({
      dobOnFile: null,
      outcome: { ok: true, programId: "p1" },
    });
    const result = await run(() =>
      actions.createAccountAndAccept("invite-token", input(CHILD)),
    );
    expect(result).toMatchObject({ ok: false, age: "too-young" });
    expect(calls.createUser).toBe(0);
    expect(calls.rpc).toEqual([]);
  });

  test("no date: refused before an account is created", async () => {
    const { actions, calls } = harness({
      dobOnFile: null,
      outcome: { ok: true, programId: "p1" },
    });
    const result = await run(() =>
      actions.createAccountAndAccept("invite-token", input("")),
    );
    expect(result).toMatchObject({ ok: false, age: "required" });
    expect(calls.createUser).toBe(0);
  });

  test("13–17: the account is created, the date written, then the accept", async () => {
    const { actions, calls } = harness({
      dobOnFile: null,
      outcome: { ok: true, programId: "p1" },
    });
    const result = await run(() =>
      actions.createAccountAndAccept("invite-token", input(TEEN)),
    );
    expect(result).toBe(REDIRECT);
    expect(calls.createUser).toBe(1);
    expect(calls.dobWrites[0]).toBe(TEEN);
    expect(calls.rpc).toEqual(["accept_program_invite"]);
  });
});

test.describe("the database half", () => {
  const sql = readFileSync(
    resolve(
      __dirname,
      "..",
      "supabase",
      "migrations",
      "20261026190848_join_age_gate.sql",
    ),
    "utf8",
  );
  /** One function's body, from its `create or replace` to the next. */
  function body(name: string): string {
    const start = sql.indexOf(`create or replace function public.${name}(`);
    expect(start).toBeGreaterThan(-1);
    const next = sql.indexOf("create or replace function", start + 1);
    return sql.slice(start, next === -1 ? undefined : next);
  }

  test("both accept RPCs check the age before writing a membership", () => {
    for (const name of ["accept_program_invite", "accept_program_join_link"]) {
      const fn = body(name);
      const gate = fn.indexOf("public.join_age_refusal(v_uid)");
      expect(gate, name).toBeGreaterThan(-1);
      expect(gate, name).toBeLessThan(
        fn.indexOf("insert into public.program_members"),
      );
    }
  });

  test("the join link checks it before an approve-mode request is filed", () => {
    const fn = body("accept_program_join_link");
    expect(fn.indexOf("public.join_age_refusal(v_uid)")).toBeLessThan(
      fn.indexOf("insert into public.program_requests"),
    );
  });

  test("missing date and under 13 refuse; the helper is not callable from a browser", () => {
    const helper = body("join_age_refusal");
    expect(helper).toContain("when u.dob is null then 'age_required'");
    // No users row answers null, and both callers turn null into a refusal.
    expect(helper).toContain("else 'ok'");
    for (const name of ["accept_program_invite", "accept_program_join_link"]) {
      expect(body(name)).toContain(
        "coalesce(public.join_age_refusal(v_uid), 'age_required')",
      );
    }
    expect(helper).toContain(
      "when u.dob > (current_date - interval '13 years') then 'too_young'",
    );
    expect(sql).toMatch(
      /revoke execute on function public\.join_age_refusal\(uuid\)\s+from public, anon, authenticated;/,
    );
  });
});

test.describe("the screens ask when no date is on file", () => {
  const read = (path: string) =>
    readFileSync(resolve(__dirname, "..", path), "utf8");

  test("(a) the join page passes needsDob to both Join buttons", () => {
    const page = read("src/app/join/[token]/page.tsx");
    expect(page.match(/needsDob=\{await sessionNeedsDob\(\)\}/g)).toHaveLength(
      2,
    );
  });

  test("(b) the onboarding intercept and the invitation page pass needsDob", () => {
    expect(read("src/app/onboarding/page.tsx")).toContain(
      "needsDob={!row?.dob}",
    );
    expect(read("src/app/invitations/[inviteId]/page.tsx")).toContain(
      "needsDob={await sessionNeedsDob()}",
    );
  });

  test("every join form runs the gate and shows the refusal", () => {
    const forms = read("src/components/join/join-forms.tsx");
    expect(forms.match(/useJoinAge\(/g)).toHaveLength(3);
    expect(forms.match(/<AgeRefusal /g)).toHaveLength(3);
    const offer = read("src/components/join/invite-offer.tsx");
    expect(offer).toContain("useJoinAge(needsDob)");
    expect(offer).toContain("<AgeRefusal signedIn />");
  });

  test("the tray sends an accept that needs a date to the invitation page", () => {
    const tray = read("src/components/dashboard/activity/activity-tray.tsx");
    expect(tray).toContain('result.age === "required"');
    expect(tray).toContain("window.location.assign(invitationHref(invite.id))");
  });
});
