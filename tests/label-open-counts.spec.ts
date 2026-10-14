import { expect, test } from "@playwright/test";
import { recordLabelOpenCounts } from "@/lib/services/labels/open-counts-session";
import type { AdminClient } from "@/lib/supabase/admin";

/**
 * The console's open counts saved on its session for the Labels list
 * (open-counts-session.ts): the admin gate, the shape check, one update.
 */
const SESSION = "aa7b743e-c1cc-4784-b920-8e5b27c620fa";

function fakeDb(error: { message: string } | null = null) {
  const writes: { patch: unknown; id: unknown }[] = [];
  const db = {
    from: (table: string) => {
      expect(table).toBe("label_sessions");
      return {
        update: (patch: unknown) => ({
          eq: async (_column: string, id: unknown) => {
            writes.push({ patch, id });
            return { error };
          },
        }),
      };
    },
  } as unknown as AdminClient;
  return { db, writes };
}

test("refused without an admin, for a bad id and for counts that are not whole", async () => {
  const { db, writes } = fakeDb();
  const deps = { requireAdmin: async () => null, createAdminClient: () => db };
  expect(
    await recordLabelOpenCounts(SESSION, { amber: 1, grey: 2 }, deps),
  ).toEqual({ error: "Admin access required." });
  const admin = { ...deps, requireAdmin: async () => ({ id: "a" }) };
  expect(
    await recordLabelOpenCounts("nope", { amber: 1, grey: 2 }, admin),
  ).toEqual({ error: "No such session." });
  expect(
    await recordLabelOpenCounts(SESSION, { amber: -1, grey: 2 }, admin),
  ).toEqual({ error: "Counts must be whole numbers." });
  expect(
    await recordLabelOpenCounts(SESSION, { amber: 1.5, grey: 2 }, admin),
  ).toEqual({ error: "Counts must be whole numbers." });
  expect(writes).toEqual([]);
});

test("writes the two counts and when, on that session alone", async () => {
  const { db, writes } = fakeDb();
  const result = await recordLabelOpenCounts(
    SESSION,
    { amber: 78, grey: 100 },
    { requireAdmin: async () => ({ id: "a" }), createAdminClient: () => db },
  );
  expect(result).toEqual({ ok: true });
  expect(writes).toHaveLength(1);
  expect(writes[0].id).toBe(SESSION);
  expect(writes[0].patch).toMatchObject({
    open_counts: { amber: 78, grey: 100 },
  });
});
