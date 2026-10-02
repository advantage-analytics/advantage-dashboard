import { test, expect } from "@playwright/test";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import ts from "typescript";
const id = (n: number) =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const req = createRequire(`${process.cwd()}/package.json`);
function harness({
  allowed = true,
  accessible = false,
  readError = false,
} = {}) {
  const calls: string[] = [];
  const item = {
    itemId: id(4),
    round: "R16",
    status: "succeeded",
    matchId: id(5),
    outcomeId: null,
    error: null,
  };
  const entries = [
    {
      id: id(3),
      discipline: "singles",
      player_user_ids: [id(1)],
      player_labels: ["Alex"],
      draw: "Main",
      seed: 2,
      fingerprint: "b".repeat(32),
      forfeit: null,
    },
    {
      id: id(6),
      discipline: "doubles",
      player_user_ids: [id(1), id(2)],
      player_labels: ["Alex", "Sam"],
      fingerprint: "c".repeat(32),
    },
  ];
  function query(table: string) {
    const q = {
      select: () => q,
      eq: () => q,
      in: async () => ({
        data:
          table === "matches"
            ? [
                {
                  event_entry_id: id(3),
                  round: "R16",
                  score: { player1: [6, 6], player2: [4, 3] },
                },
              ]
            : [],
        error: readError ? { message: "unavailable" } : null,
      }),
      then: (resolve: (v: unknown) => void) =>
        resolve({ data: [], error: readError ? {} : null }),
    };
    return q;
  }
  const mocks: Record<string, unknown> = {
    "@/lib/services/programs/admin-guard": {
      requireAdmin: async () => {
        calls.push("guard");
        return allowed ? { id: id(9) } : null;
      },
    },
    "@/lib/data/admin-upload-server": {
      getAdminUploadContext: async () => {
        calls.push("context");
        return { ok: true, context: { actorId: id(9) } };
      },
    },
    "@/lib/supabase/admin": {
      createAdminClient: () => {
        calls.push("admin");
        return { from: query };
      },
    },
    "@/lib/supabase/server": {
      createClient: async () => {
        calls.push("session");
        return {
          from: () => ({
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({
                  data: accessible ? { id: id(5) } : null,
                  error: null,
                }),
              }),
            }),
          }),
        };
      },
    },
    "@/lib/services/programs/admin-tournament-submission": {
      getAdminTournamentResultContext: async () => ({
        ok: true,
        context: {
          fingerprint: "a".repeat(32),
          event: {
            name: "Fall",
            starts_on: "2026-09-16",
            ends_on: "2026-09-18",
            site: "neutral",
            surface: "hard",
            host: null,
            format: { best_of: 3, ad_scoring: null },
          },
          entries,
        },
      }),
      submitAdminTournamentResult: async () => ({
        ok: true,
        operationId: id(10),
        eventId: id(70),
        entryId: id(3),
        item,
      }),
    },
    "@/components/dashboard/schedule/result-choice": {
      resultLabelFromOutcome: () => "Outcome recorded",
    },
  };
  const code = ts.transpileModule(
    readFileSync("src/app/admin/uploads/new/tournament-actions.ts", "utf8"),
    { compilerOptions: { module: ts.ModuleKind.CommonJS } },
  ).outputText;
  const compiled = {
    exports: {} as {
      loadAdminTournamentAction: (p: string, e: string) => Promise<any>;
      submitAdminTournamentAction: (v: unknown) => Promise<any>;
    },
  };
  new Function("require", "module", "exports", code)(
    (name: string) => (name in mocks ? mocks[name] : req(name)),
    compiled,
    compiled.exports,
  );
  return { ...compiled.exports, calls, item };
}
test("tournament adapter guards privileged context reads and exposes only one-player singles", async () => {
  const refused = harness({ allowed: false });
  expect((await refused.loadAdminTournamentAction(id(50), id(70))).ok).toBe(
    false,
  );
  expect(refused.calls).toEqual(["guard"]);
  const h = harness();
  const result = await h.loadAdminTournamentAction(id(50), id(70));
  expect(result.ok).toBe(true);
  expect(result.context.entries).toHaveLength(1);
  expect(result.context.entries[0].saved.R16).toBe("6–4 6–3");
  expect(result.context.tournament.adScoring).toBeNull();
  expect(h.calls).toEqual(["guard", "context", "admin"]);
});
test("saved-results read failure refuses editable context", async () => {
  const h = harness({ readError: true });
  expect(await h.loadAdminTournamentAction(id(50), id(70))).toMatchObject({
    ok: false,
  });
});
test("success report links require session access; non-member and outcome results use guarded recorded view", async () => {
  const input = { programId: id(50), round: "R16" };
  const h = harness();
  expect((await h.submitAdminTournamentAction(input)).resultHref).toBe(
    `/admin/uploads/new?team=${id(50)}&kind=tournament&event=${id(70)}&entry=${id(3)}&round=R16`,
  );
  expect(h.calls).toEqual(["session"]);
  const member = harness({ accessible: true });
  expect((await member.submitAdminTournamentAction(input)).resultHref).toBe(
    `/dashboard/matches/${id(5)}`,
  );
  member.item.matchId = null as unknown as string;
  expect(
    (await member.submitAdminTournamentAction(input)).resultHref,
  ).toContain("/admin/uploads/new?");
  expect(member.calls).toEqual(["session"]);
});
