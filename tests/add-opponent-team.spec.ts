import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import type { OpponentTeamChange } from "@/components/dashboard/matches/opponent-team-field";
import {
  TEAM_WRITE_CHUNK,
  TEAM_WRITE_FAILED,
  TEAM_WRITE_FORBIDDEN,
  applyOpponentTeam,
  buildTeamPatch,
  canAddTeam,
  chunkMatchIds,
  describeApplies,
  teamAction,
  describeUnsaved,
  teamWriteMode,
  UNATTACHED_CHOICE,
} from "@/components/dashboard/opponents/add-opponent-team";

/**
 * T15 — "No team · Add their team" on the team opponent drawer, offline.
 *
 * Imports `.ts` only and opens no database: the two writes run against a fake
 * client that records what it was asked. What these pin is what the drawer
 * can get wrong with nothing looking broken — a control offered to somebody
 * whose write changes nothing, a sentence promising more matches than the
 * pick reaches, a patch that leaves both columns set, and a partial save
 * reported as a clean one.
 */

const PROGRAM_ID = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const OTHER_PROGRAM = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

const PICKED: OpponentTeamChange = {
  program: {
    id: OTHER_PROGRAM,
    schoolName: "Harbor Ridge",
    shortCode: "HRU",
    crestUrl: null,
    conference: "Tidewater",
    division: "D1",
  },
  school: null,
  source: "picked",
};

const TYPED: OpponentTeamChange = {
  program: null,
  school: "  Quarry Lane Academy ",
  source: "typed",
};

const ids = (count: number, prefix = "m") =>
  Array.from({ length: count }, (_, index) => `${prefix}${index + 1}`);

type Reply = { data: unknown; error: { code?: string } | null };

/** A client that records every call and answers from `reply`. */
function fakeClient(reply: (call: number, sent: string[]) => Reply) {
  const rpcCalls: { fn: string; args: Record<string, unknown> }[] = [];
  const updates: { table: string; patch: unknown; ids: string[] }[] = [];
  let call = 0;
  const client = {
    rpc(fn: string, args: Record<string, unknown>) {
      rpcCalls.push({ fn, args });
      return Promise.resolve(reply(call++, args.p_match_ids as string[]));
    },
    from(table: string) {
      return {
        update(patch: unknown) {
          return {
            in(_column: string, sent: string[]) {
              return {
                select(_columns: string) {
                  updates.push({ table, patch, ids: sent });
                  return Promise.resolve(reply(call++, sent));
                },
              };
            },
          };
        },
      };
    },
  };
  return {
    supabase: client as unknown as SupabaseClient,
    rpcCalls,
    updates,
  };
}

const allSaved = (_call: number, sent: string[]): Reply => ({
  data: sent,
  error: null,
});

test.describe("canAddTeam", () => {
  test("owner, coach and staff may, whatever they recorded", () => {
    expect(canAddTeam("owner", 0)).toBe(true);
    expect(canAddTeam("coach", 0)).toBe(true);
    expect(canAddTeam("staff", 0)).toBe(true);
  });

  test("a player may only where they recorded a match", () => {
    expect(canAddTeam("player", 0)).toBe(false);
    expect(canAddTeam("player", 3)).toBe(true);
  });

  test("teamWriteMode picks the door: staff, creator, or none", () => {
    expect(teamWriteMode({ kind: "team", role: "coach" }, 0)).toBe("staff");
    expect(teamWriteMode({ kind: "team", role: "player" }, 2)).toBe("creator");
    expect(teamWriteMode({ kind: "team", role: "player" }, 0)).toBeNull();
    // A personal workspace's role is always "owner", and it is not staff of
    // any program: only the matches it recorded.
    expect(teamWriteMode({ kind: "personal", role: "owner" }, 0)).toBeNull();
    expect(teamWriteMode({ kind: "personal", role: "owner" }, 1)).toBe(
      "creator",
    );
  });
});

test.describe("describeApplies", () => {
  test("staff reach every match, however many they recorded", () => {
    expect(describeApplies("staff", 0, 8, "Mara")).toBe(
      "Applies to all 8 matches against Mara.",
    );
    expect(describeApplies("staff", 3, 8, "Mara")).toBe(
      "Applies to all 8 matches against Mara.",
    );
  });

  test("a player who recorded every match reads the same sentence", () => {
    expect(describeApplies("creator", 5, 5, "Mara")).toBe(
      "Applies to all 5 matches against Mara.",
    );
  });

  test("a player who recorded some is told the share", () => {
    expect(describeApplies("creator", 3, 8, "Mara")).toBe(
      "Applies to the 3 of 8 matches you recorded.",
    );
    expect(describeApplies("creator", 1, 2, "Mara")).toBe(
      "Applies to the 1 of 2 matches you recorded.",
    );
  });

  test("one match is not “all 1 matches”", () => {
    expect(describeApplies("staff", 0, 1, "Mara")).toBe(
      "Applies to the 1 match against Mara.",
    );
    expect(describeApplies("creator", 1, 1, "Mara")).toBe(
      "Applies to the 1 match against Mara.",
    );
  });
});

test.describe("teamAction — what Plays for offers", () => {
  test("no team: anyone who can write may add one", () => {
    expect(teamAction("staff", false, 0, 5)).toBe("add");
    expect(teamAction("creator", false, 1, 5)).toBe("add");
  });

  test("a team: staff may change it on every match", () => {
    expect(teamAction("staff", true, 0, 5)).toBe("change");
  });

  test("a team: a player only when they recorded every match", () => {
    expect(teamAction("creator", true, 5, 5)).toBe("change");
    // Rewriting 1 of 5 could leave the newest match's team showing.
    expect(teamAction("creator", true, 1, 5)).toBeNull();
  });

  test("nobody who cannot write is offered anything", () => {
    expect(teamAction(null, false, 0, 5)).toBeNull();
    expect(teamAction(null, true, 0, 5)).toBeNull();
  });
});

test.describe("describeApplies — replacing a team", () => {
  test("a change names the team it overwrites", () => {
    expect(
      describeApplies("staff", 0, 2, "Theo", "University of San Diego"),
    ).toBe("Replaces University of San Diego on all 2 matches against Theo.");
    expect(describeApplies("staff", 0, 1, "Theo", "Harbor Tennis Club")).toBe(
      "Replaces Harbor Tennis Club on the 1 match against Theo.",
    );
    expect(describeApplies("creator", 1, 2, "Theo", "USD")).toBe(
      "Replaces USD on the 1 of 2 matches you recorded.",
    );
  });

  test("no team to replace is the first-pick sentence", () => {
    expect(describeApplies("staff", 0, 2, "Theo", null)).toBe(
      "Applies to all 2 matches against Theo.",
    );
  });
});

test.describe("buildTeamPatch", () => {
  test("a picked program nulls the school", () => {
    expect(buildTeamPatch(PICKED)).toEqual({
      opponent_program_id: OTHER_PROGRAM,
      opponent_school: null,
      opponent_unattached: false,
    });
  });

  test("a typed school nulls the program, and is trimmed", () => {
    expect(buildTeamPatch(TYPED)).toEqual({
      opponent_program_id: null,
      opponent_school: "Quarry Lane Academy",
      opponent_unattached: false,
    });
  });

  test("a blank typed school is neither — never an empty string", () => {
    expect(
      buildTeamPatch({ program: null, school: "   ", source: "typed" }),
    ).toEqual({
      opponent_program_id: null,
      opponent_school: null,
      opponent_unattached: false,
    });
  });

  test("unattached nulls both and says so", () => {
    expect(buildTeamPatch(UNATTACHED_CHOICE)).toEqual({
      opponent_program_id: null,
      opponent_school: null,
      opponent_unattached: true,
    });
  });
});

test.describe("chunkMatchIds", () => {
  test("drops repeats and cuts at the RPC's cap", () => {
    expect(chunkMatchIds(["a", "b", "a"])).toEqual([["a", "b"]]);
    const chunks = chunkMatchIds(ids(450));
    expect(chunks.map((chunk) => chunk.length)).toEqual([200, 200, 50]);
    expect(TEAM_WRITE_CHUNK).toBe(200);
    expect(chunkMatchIds([])).toEqual([]);
  });
});

test.describe("applyOpponentTeam — staff", () => {
  test("one RPC with the program, every match and the patch", async () => {
    const fake = fakeClient(allSaved);
    const result = await applyOpponentTeam({
      mode: "staff",
      programId: PROGRAM_ID,
      matchIds: ids(8),
      editableMatchIds: ids(2),
      choice: PICKED,
      supabase: fake.supabase,
    });

    expect(result).toEqual({ saved: 8, total: 8, error: null });
    expect(fake.updates).toEqual([]);
    expect(fake.rpcCalls).toEqual([
      {
        fn: "set_opponent_team",
        args: {
          p_program_id: PROGRAM_ID,
          p_match_ids: ids(8),
          p_opponent_program_id: OTHER_PROGRAM,
          p_opponent_school: null,
          p_unattached: false,
        },
      },
    ]);
  });

  test("unattached goes as the flag, with neither program nor school", async () => {
    const fake = fakeClient(allSaved);
    const result = await applyOpponentTeam({
      mode: "staff",
      programId: PROGRAM_ID,
      matchIds: ids(2),
      editableMatchIds: [],
      choice: UNATTACHED_CHOICE,
      supabase: fake.supabase,
    });
    expect(result).toEqual({ saved: 2, total: 2, error: null });
    expect(fake.rpcCalls[0]?.args).toMatchObject({
      p_opponent_program_id: null,
      p_opponent_school: null,
      p_unattached: true,
    });
  });

  test("a typed school goes as the school, with a null program", async () => {
    const fake = fakeClient(allSaved);
    await applyOpponentTeam({
      mode: "staff",
      programId: PROGRAM_ID,
      matchIds: ids(1),
      editableMatchIds: [],
      choice: TYPED,
      supabase: fake.supabase,
    });
    expect(fake.rpcCalls[0].args).toMatchObject({
      p_opponent_program_id: null,
      p_opponent_school: "Quarry Lane Academy",
    });
  });

  test("42501 is the program sentence; anything else the generic one", async () => {
    const refused = await applyOpponentTeam({
      mode: "staff",
      programId: PROGRAM_ID,
      matchIds: ids(3),
      editableMatchIds: [],
      choice: PICKED,
      supabase: fakeClient(() => ({ data: null, error: { code: "42501" } }))
        .supabase,
    });
    expect(refused).toEqual({
      saved: 0,
      total: 3,
      error: "You can't change matches for this program.",
    });
    expect(TEAM_WRITE_FORBIDDEN).toBe(
      "You can't change matches for this program.",
    );

    for (const code of ["22023", "23503", undefined]) {
      const failed = await applyOpponentTeam({
        mode: "staff",
        programId: PROGRAM_ID,
        matchIds: ids(3),
        editableMatchIds: [],
        choice: PICKED,
        supabase: fakeClient(() => ({ data: null, error: { code } })).supabase,
      });
      expect(failed.error).toBe("Couldn't set their team. Try again.");
      expect(failed.saved).toBe(0);
    }
    expect(TEAM_WRITE_FAILED).toBe("Couldn't set their team. Try again.");
  });

  test("more than 200 matches go out in runs and all save", async () => {
    const fake = fakeClient(allSaved);
    const result = await applyOpponentTeam({
      mode: "staff",
      programId: PROGRAM_ID,
      matchIds: ids(450),
      editableMatchIds: [],
      choice: PICKED,
      supabase: fake.supabase,
    });
    expect(result).toEqual({ saved: 450, total: 450, error: null });
    expect(
      fake.rpcCalls.map((call) => (call.args.p_match_ids as string[]).length),
    ).toEqual([200, 200, 50]);
  });

  test("a later run failing is reported as what did not save", async () => {
    const fake = fakeClient((call, sent) =>
      call === 0
        ? { data: sent, error: null }
        : { data: null, error: { code: "42501" } },
    );
    const result = await applyOpponentTeam({
      mode: "staff",
      programId: PROGRAM_ID,
      matchIds: ids(450),
      editableMatchIds: [],
      choice: PICKED,
      supabase: fake.supabase,
    });
    // Stops at the failure: the third run is never sent.
    expect(fake.rpcCalls).toHaveLength(2);
    expect(result).toEqual({
      saved: 200,
      total: 450,
      error: "250 of 450 matches did not save.",
    });
  });

  test("a client that throws is the generic sentence, not a crash", async () => {
    const supabase = {
      rpc: () => Promise.reject(new Error("offline")),
    } as unknown as SupabaseClient;
    const result = await applyOpponentTeam({
      mode: "staff",
      programId: PROGRAM_ID,
      matchIds: ids(2),
      editableMatchIds: [],
      choice: PICKED,
      supabase,
    });
    expect(result).toEqual({
      saved: 0,
      total: 2,
      error: "Couldn't set their team. Try again.",
    });
  });

  test("nothing to write sends nothing", async () => {
    const fake = fakeClient(allSaved);
    const noMatches = await applyOpponentTeam({
      mode: "staff",
      programId: PROGRAM_ID,
      matchIds: [],
      editableMatchIds: ids(2),
      choice: PICKED,
      supabase: fake.supabase,
    });
    const noTeam = await applyOpponentTeam({
      mode: "staff",
      programId: PROGRAM_ID,
      matchIds: ids(2),
      editableMatchIds: [],
      choice: { program: null, school: " ", source: "typed" },
      supabase: fake.supabase,
    });
    expect(noMatches.error).toBe(TEAM_WRITE_FAILED);
    expect(noTeam.error).toBe(TEAM_WRITE_FAILED);
    expect(fake.rpcCalls).toEqual([]);
    expect(fake.updates).toEqual([]);
  });
});

test.describe("applyOpponentTeam — creator", () => {
  test("a plain update on the matches the viewer recorded", async () => {
    const fake = fakeClient((_call, sent) => ({
      data: sent.map((id) => ({ id })),
      error: null,
    }));
    const result = await applyOpponentTeam({
      mode: "creator",
      programId: PROGRAM_ID,
      matchIds: ids(8),
      editableMatchIds: ids(3),
      choice: PICKED,
      supabase: fake.supabase,
    });

    expect(result).toEqual({ saved: 3, total: 3, error: null });
    expect(fake.rpcCalls).toEqual([]);
    expect(fake.updates).toEqual([
      {
        table: "matches",
        patch: {
          opponent_program_id: OTHER_PROGRAM,
          opponent_school: null,
          opponent_unattached: false,
        },
        ids: ids(3),
      },
    ]);
  });

  test("fewer rows back than asked says how many did not save", async () => {
    const some = await applyOpponentTeam({
      mode: "creator",
      programId: PROGRAM_ID,
      matchIds: ids(8),
      editableMatchIds: ids(5),
      choice: TYPED,
      supabase: fakeClient((_call, sent) => ({
        data: sent.slice(0, 3).map((id) => ({ id })),
        error: null,
      })).supabase,
    });
    expect(some).toEqual({
      saved: 3,
      total: 5,
      error: "2 of 5 matches did not save.",
    });

    // RLS filtering every row raises nothing — it is counted instead.
    const none = await applyOpponentTeam({
      mode: "creator",
      programId: PROGRAM_ID,
      matchIds: ids(8),
      editableMatchIds: ids(2),
      choice: TYPED,
      supabase: fakeClient(() => ({ data: [], error: null })).supabase,
    });
    expect(none).toEqual({
      saved: 0,
      total: 2,
      error: "2 of 2 matches did not save.",
    });
  });

  test("an update error is the generic sentence, even a 42501", async () => {
    const result = await applyOpponentTeam({
      mode: "creator",
      programId: PROGRAM_ID,
      matchIds: ids(4),
      editableMatchIds: ids(4),
      choice: PICKED,
      supabase: fakeClient(() => ({ data: null, error: { code: "42501" } }))
        .supabase,
    });
    expect(result).toEqual({
      saved: 0,
      total: 4,
      error: "Couldn't set their team. Try again.",
    });
  });
});

test("describeUnsaved counts in the singular for one match", () => {
  expect(describeUnsaved(1, 1)).toBe("1 of 1 match did not save.");
  expect(describeUnsaved(2, 5)).toBe("2 of 5 matches did not save.");
});
