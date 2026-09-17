import { expect, test } from "@playwright/test";
import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import ts from "typescript";
import * as lookup from "@/lib/wizard/lookup-scope-server";
import * as person from "@/lib/data/person-name";
import * as opponents from "@/lib/data/opponents-server";
import * as roster from "@/lib/data/roster-ids";
import * as attach from "@/lib/schedule/attach-line-state";
import * as entry from "@/lib/schedule/entry-state";
import type { WorkspaceContextValue } from "@/lib/workspace/types";
import type { AdminUploadContextResult } from "@/lib/data/admin-upload-server";
import type { SupabaseClient } from "@supabase/supabase-js";

type Row = Record<string, unknown>;
const target = "11111111-1111-4111-8111-111111111111";
const adminScope = { source: "admin" as const, programId: target };

function harness(role = "owner", admin = true, personal = false) {
  const calls: string[] = [];
  const rows: Row[] = [target, "active", null].map((program_id) => ({
    program_id,
    created_by: "actor",
    player1_id: "profile",
    player_hand: program_id === target ? "left" : "right",
    player_backhand: "two-handed",
    player2_name: String(program_id),
    date: "2026-09-16",
    tournament_name: String(program_id),
    match_type: "Dual Match",
  }));
  const tables: Record<string, Row[]> = {
    matches: rows,
    programs: [{ id: "opponent" }],
    program_events: [
      {
        id: "event",
        program_id: target,
        kind: "dual",
        name: "Target dual",
        starts_on: "2026-09-16",
        ends_on: "2026-09-16",
        site: "home",
        format: { best_of: 3, ad_scoring: true },
      },
    ],
    program_event_entries: [
      {
        id: "entry",
        event_id: "event",
        program_id: target,
        discipline: "singles",
        slot: "S1",
        position: 1,
        player_user_ids: ["login"],
        player_labels: ["Previous name"],
        opponent_labels: ["Opponent"],
        forfeit: null,
      },
    ],
    program_event_outcomes: [],
    processing_jobs: [],
  };
  function client(service: boolean) {
    const label = service ? "service" : "session";
    return {
      auth: { getUser: async () => ({ data: { user: { id: "actor" } } }) },
      rpc(name: string) {
        calls.push(`${label}:${name}`);
        if (service)
          throw new Error("Pool/roster RPC must keep session authorization");
        return Promise.resolve({ data: [], error: null });
      },
      from(table: string) {
        calls.push(`${label}:${table}`);
        // A non-member session cannot read target-program matches.
        let data = (tables[table] ?? []).filter(
          (r) => service || r.program_id !== target,
        );
        let single = false;
        const q = {
          select: () => q,
          order: () => q,
          limit: () => q,
          not: () => q,
          eq(key: string, value: unknown) {
            data = data.filter((r) => r[key] === value || table === "programs");
            return q;
          },
          in(key: string, values: unknown[]) {
            data = data.filter((r) => values.includes(r[key]));
            return q;
          },
          is(key: string, value: unknown) {
            data = data.filter((r) => r[key] === value);
            return q;
          },
          maybeSingle() {
            single = true;
            return q;
          },
          then(resolve: (value: unknown) => unknown) {
            return Promise.resolve({
              data: single ? (data[0] ?? null) : data,
              error: null,
            }).then(resolve);
          },
        };
        return q;
      },
    } as unknown as SupabaseClient;
  }
  const session = client(false);
  const service = client(true);
  const workspace = {
    viewer: { id: "actor" },
    active: {
      kind: personal ? "personal" : "team",
      id: "active",
      role,
      eventsPolicy: "staff",
    },
  } as WorkspaceContextValue;
  const deps = {
    createClient: async () => session,
    createAdminClient: () => {
      calls.push("service-created");
      return service;
    },
    getWorkspaceContext: async () => workspace,
    getAdminUploadContext: async (
      programId: string,
    ): Promise<AdminUploadContextResult> => {
      calls.push(`admin-guard:${programId}`);
      return admin && programId === target
        ? ({
            ok: true,
            context: {
              actorId: "actor",
              workspace: { id: target },
              roster: [{ playerId: "profile", userId: "login" }],
            },
          } as AdminUploadContextResult)
        : { ok: false, reason: "admin-required", message: "Denied" };
    },
  };
  const exports: Record<string, (...args: unknown[]) => Promise<unknown>> = {};
  const code = ts.transpileModule(
    readFileSync("src/lib/wizard/actions.ts", "utf8"),
    {
      compilerOptions: {
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2022,
      },
    },
  ).outputText;
  runInNewContext(code, {
    exports,
    require(name: string) {
      if (name === "./lookup-scope-server")
        return {
          ...lookup,
          resolveWizardLookupScope: (scope: lookup.WizardLookupScope) =>
            lookup.resolveWizardLookupScope(scope, deps),
        };
      if (name === "@/lib/supabase/server")
        return { createClient: deps.createClient };
      if (name === "@/lib/data/person-name") return person;
      if (name === "@/lib/data/opponents-server") return opponents;
      if (name === "@/lib/data/roster-ids") return roster;
      if (name === "@/lib/schedule/attach-line-state") return attach;
      if (name === "@/lib/schedule/entry-state") return entry;
      return {};
    },
  });
  return { actions: exports, calls, deps, workspace, service, session, tables };
}

test("non-member admin history and style use the explicit program and fresh authorization", async () => {
  const h = harness();
  expect(await h.actions.opponentsPlayed(adminScope)).toMatchObject([
    { name: target },
  ]);
  expect(await h.actions.yourEvents(adminScope)).toMatchObject([
    { name: target },
  ]);
  expect(
    await h.actions.playerStyleFromMatches({
      playerId: "profile",
      playerName: "Player",
      scope: adminScope,
    }),
  ).toEqual({ hand: "left", backhand: "two-handed" });
  expect(h.calls.filter((c) => c.startsWith("admin-guard"))).toHaveLength(3);
  expect(h.calls.filter((c) => c === "service:matches")).toHaveLength(3);
  expect(h.workspace.active.id).toBe("active");
});

test("forged admin mode and cross-program dashboard requests refuse before privileged reads", async () => {
  const h = harness("owner", false);
  for (const scope of [
    adminScope,
    { source: "dashboard", programId: target },
    { source: "fake", programId: target },
    null,
  ]) {
    expect(await h.actions.opponentsPlayed(scope)).toEqual([]);
    expect(await h.actions.yourEvents(scope)).toEqual([]);
    expect(
      await h.actions.playerStyleFromMatches({
        playerId: "profile",
        playerName: "Player",
        scope,
      }),
    ).toBeNull();
    expect(
      await h.actions.findUploadLines({ date: "2026-09-16", scope }),
    ).toMatchObject({ ok: false });
    expect(
      await h.actions.findLineOffers({ date: "2026-09-16", scope }),
    ).toEqual([]);
    expect(
      await h.actions.opponentRosterForLine({
        opponentProgramKey: "opponent",
        slot: "S1",
        scope,
      }),
    ).toEqual([]);
  }
  expect(h.calls).not.toContain("service-created");
  expect(h.calls.some((c) => c.endsWith(":matches"))).toBe(false);
});

test("dashboard defaults retain team/personal scope and player schedule restrictions", async () => {
  const h = harness("player", false);
  expect(await h.actions.opponentsPlayed()).toMatchObject([{ name: "active" }]);
  expect(await h.actions.findUploadLines({ date: "2026-09-16" })).toMatchObject(
    { ok: false },
  );
  expect(await h.actions.findLineOffers({ date: "2026-09-16" })).toEqual([]);
  const personal = harness("owner", false, true);
  expect(await personal.actions.opponentsPlayed()).toMatchObject([
    { name: "null" },
  ]);
  expect(h.calls).not.toContain("service-created");
});

test("admin roster identity reuses the verified target and opponent pools stay session-scoped", async () => {
  const h = harness();
  const scope = await lookup.resolveWizardLookupScope(adminScope, h.deps);
  expect(scope?.client).toBe(h.service);
  expect(await lookup.readWizardRosterIds(scope!)).toEqual([
    { player_id: "profile", user_id: "login" },
  ]);
  expect(
    await h.actions.opponentRosterForLine({
      opponentProgramKey: "opponent",
      slot: "S1",
      scope: adminScope,
    }),
  ).toEqual([]);
  expect(h.calls).toContain("service:matches");
  expect(h.calls).toContain("session:pooled_roster");
  expect(h.calls).toContain("session:pooled_lineups");
  expect(h.calls).not.toContain("service:program_players");
});

test("admin event lines use scoped service reads and canonical claimed-player IDs", async () => {
  const h = harness();
  h.tables.program_event_entries.push({
    ...h.tables.program_event_entries[0],
    id: "foreign-entry",
    program_id: "other",
  });
  h.tables.matches.push({
    id: "foreign-match",
    program_id: "other",
    event_entry_id: "entry",
    round: null,
  });
  const result = await h.actions.findUploadLines({
    date: "2026-09-16",
    round: "S1",
    player: { id: "profile", name: "New name" },
    bestOf: 3,
    adScoring: true,
    scope: adminScope,
  });
  expect(result).toMatchObject({
    ok: true,
    suggested: [
      {
        entryId: "entry",
        state: "available",
        existingMatchId: null,
        playerOnLineup: true,
        offer: { eventName: "Target dual" },
      },
    ],
  });
  const groups = result as {
    suggested: { entryId: string }[];
    sameDay: { entryId: string }[];
    search: { entryId: string }[];
  };
  expect(
    [...groups.suggested, ...groups.sameDay, ...groups.search].map(
      (line) => line.entryId,
    ),
  ).not.toContain("foreign-entry");
  expect(h.calls).toContain("service:program_events");
  expect(h.calls).toContain("service:program_event_entries");
  expect(h.calls).toContain("service:program_event_outcomes");
  expect(h.calls).not.toContain("session:program_roster_full");
  expect(h.calls.filter((c) => c.startsWith("admin-guard"))).toHaveLength(1);
});
