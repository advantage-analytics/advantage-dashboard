import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test } from "@playwright/test";

import { createLoader } from "./fixtures/vm-modules";
import { AGE_REFUSAL, DOB_ERROR } from "../src/app/onboarding/age";

/**
 * The app's half of write-once identity
 * (`20261026090000_users_write_once_identity.sql`), offline.
 *
 * The database refuses a client change to `dob`, `role` and the guardian
 * fields once set; `users-write-once-identity.spec.ts` proves that live. What
 * is pinned here is that the app's own flows never ask it to: Settings ›
 * Profile sends a date of birth only when none is stored (through the age
 * rule), and draws a stored one as a locked field with a way to support. The
 * onboarding and join writers only ever fill these columns — `join-age-gate`
 * pins the join side's `.is("dob", null)`.
 */

interface ProfileWorld {
  dobOnFile: string | null;
}

function profileHarness(world: ProfileWorld) {
  const updates: Record<string, unknown>[] = [];
  const client = {
    auth: {
      getUser: async () => ({ data: { user: { id: "user-1" } }, error: null }),
    },
    from: (table: string) => {
      expect(table).toBe("users");
      return {
        select: () => ({
          eq: () => ({
            maybeSingle: async () => ({
              data: { dob: world.dobOnFile },
              error: null,
            }),
          }),
        }),
        update: (values: Record<string, unknown>) => ({
          eq: async () => {
            updates.push(values);
            return { error: null };
          },
        }),
      };
    },
  };
  const loader = createLoader({
    stubs: {
      "@/lib/supabase/server": { createClient: async () => client },
      "@/lib/supabase/admin": { createAdminClient: () => ({}) },
      "@/lib/services/matches/purge-match-storage": {},
      "@/lib/services/matches/release-storage-purge-claim": {},
      "next/cache": { revalidatePath: () => {} },
      "next/navigation": { redirect: () => {} },
      "next/headers": { headers: async () => new Map() },
      "@/lib/auth/recovery-handoff": { recoveryRedirectTo: () => "" },
    },
  });
  const { saveProfile } = loader.load(
    "src/components/dashboard/settings/actions.ts",
  ) as {
    saveProfile: (input: Record<string, string>) => Promise<{
      ok: boolean;
      error?: string;
    }>;
  };
  return { saveProfile, updates };
}

const PROFILE = {
  firstName: "Sam",
  lastName: "Lee",
  phone: "",
  country: "US",
  state: "",
  hand: "right",
  backhand: "two-handed",
};

test.describe("Settings › Profile save", () => {
  test("a stored date of birth is never sent, whatever the form holds", async () => {
    const { saveProfile, updates } = profileHarness({
      dobOnFile: "1990-01-01",
    });
    const result = await saveProfile({ ...PROFILE, birthdate: "1985-06-15" });
    expect(result.ok).toBe(true);
    expect(updates).toHaveLength(1);
    expect(updates[0]).not.toHaveProperty("dob");
    expect(updates[0]).toMatchObject({ first_name: "Sam" });
  });

  test("an empty stored date is filled once, through the age rule", async () => {
    const { saveProfile, updates } = profileHarness({ dobOnFile: null });
    expect(
      (await saveProfile({ ...PROFILE, birthdate: "2010-03-04" })).ok,
    ).toBe(true);
    expect(updates[0]).toMatchObject({ dob: "2010-03-04" });
  });

  test("a first date under 13 is refused with the onboarding sentence", async () => {
    const today = new Date().toISOString().slice(0, 10);
    const eleven = `${Number(today.slice(0, 4)) - 11}${today.slice(4)}`;
    const { saveProfile, updates } = profileHarness({ dobOnFile: null });
    expect(await saveProfile({ ...PROFILE, birthdate: eleven })).toEqual({
      ok: false,
      error: AGE_REFUSAL.child,
    });
    expect(updates).toHaveLength(0);
  });

  test("a date that is not a real day is refused", async () => {
    const { saveProfile, updates } = profileHarness({ dobOnFile: null });
    expect(await saveProfile({ ...PROFILE, birthdate: "2010-02-31" })).toEqual({
      ok: false,
      error: DOB_ERROR,
    });
    expect(updates).toHaveLength(0);
  });

  test("no date and none stored sends no date at all", async () => {
    const { saveProfile, updates } = profileHarness({ dobOnFile: null });
    expect((await saveProfile({ ...PROFILE, birthdate: "" })).ok).toBe(true);
    expect(updates[0]).not.toHaveProperty("dob");
  });
});

test.describe("the screens and the database", () => {
  const read = (path: string) =>
    readFileSync(resolve(__dirname, "..", path), "utf8");

  test("Profile draws a saved date as a locked field naming support", () => {
    const form = read("src/components/dashboard/settings/profile-form.tsx");
    expect(form).toContain("saved.birthdate ? (");
    expect(form).toContain("<SettingsLockedField");
    expect(form).toContain("To correct it, email ${SUPPORT_EMAIL}.");
  });

  test("the trigger covers all five columns and lets only null be filled", () => {
    const sql = read(
      "supabase/migrations/20261026090000_users_write_once_identity.sql",
    );
    expect(sql).toMatch(
      /before update of dob, role, guardian_consent_at, junior_player_name,\s+junior_class_year/,
    );
    for (const column of [
      "dob",
      "role",
      "guardian_consent_at",
      "junior_player_name",
      "junior_class_year",
    ]) {
      expect(sql, column).toContain(`old.${column} is not null`);
      expect(sql, column).toContain(
        `new.${column} is distinct from old.${column}`,
      );
    }
    expect(sql).toContain("in ('authenticated', 'anon')");
    expect(sql).toContain("new.dob > (current_date - interval '13 years')");
  });
});
