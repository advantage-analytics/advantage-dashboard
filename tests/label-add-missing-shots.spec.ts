import { expect, test } from "@playwright/test";
import { addMissingShots } from "@/lib/services/labels/add-missing-shots";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * "Add all missing shots", server side (add-missing-shots.ts): the admin gate,
 * one add per slot in order, refusals counted and skipped, the rows read back.
 */
const SESSION = "aa7b743e-c1cc-4784-b920-8e5b27c620fa";
const P1 = "11111111-1111-4111-8111-111111111111";
const S1 = "22222222-2222-4222-8222-222222222222";
const S2 = "33333333-3333-4333-8333-333333333333";

function deps(refuse: ReadonlySet<string> = new Set()) {
  const added: string[] = [];
  return {
    added,
    deps: {
      requireAdmin: async () => ({ id: "admin" }),
      createAdminClient: () => ({}) as AdminClient,
      readPoints: async () => [],
      addShot: async (_pointId: string, afterShotId: string) => {
        if (refuse.has(afterShotId)) return { error: "refused" };
        added.push(afterShotId);
        return { ok: true, shot: {} } as never;
      },
    },
  };
}

test("refused without an admin, and for a bad session id", async () => {
  const { deps: d, added } = deps();
  expect(
    await addMissingShots(SESSION, [{ pointId: P1, afterShotId: S1 }], {
      ...d,
      requireAdmin: async () => null,
    }),
  ).toEqual({ error: "Admin access required." });
  expect(await addMissingShots("nope", [], d)).toEqual({
    error: "No such session.",
  });
  expect(added).toEqual([]);
});

test("adds each slot in order, counts a refusal and carries on", async () => {
  const { deps: d, added } = deps(new Set([S1]));
  const result = await addMissingShots(
    SESSION,
    [
      { pointId: P1, afterShotId: S1 },
      { pointId: P1, afterShotId: S2 },
      { pointId: "bad", afterShotId: S2 },
    ],
    d,
  );
  expect(result).toEqual({ ok: true, added: 1, failed: 2, points: [] });
  expect(added).toEqual([S2]);
});
