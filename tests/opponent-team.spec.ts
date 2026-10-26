import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import {
  DEFAULT_FORM_DATA,
  type FormData,
  type OpponentTeamProgram,
} from "@/components/dashboard/matches/new-match-wizard/types";
import { buildMatchData } from "@/components/dashboard/matches/new-match-wizard/utils";
import {
  EMPTY_OPPONENT_TEAM,
  opponentTeamColumns,
  opponentTeamFromHistory,
  opponentTeamIsEmpty,
  opponentTeamUpdate,
} from "@/components/dashboard/matches/new-match-wizard/opponent-team";
import { redactForPlayer, searchPrograms } from "@/lib/data/programs-server";

/**
 * T9 — the opponent's team, offline.
 *
 * The wizard's optional "their team" answer saves as two `matches` columns
 * that are either/or on the row (`matches_opponent_program_or_school_check`):
 * `opponent_program_id` for a program we know, `opponent_school` for a school
 * as typed. `buildMatchData` is what writes them, so it is driven directly;
 * the history rule and the widened directory search are pure enough to sit
 * beside it. Nothing here opens a database.
 */

const MERIDIAN: OpponentTeamProgram = {
  id: "11111111-1111-4111-8111-111111111111",
  schoolName: "Meridian State",
  shortCode: "MSU",
  crestUrl: "https://example.test/crests/meridian.png",
  conference: "Big Sky",
  division: "D1",
};

const LINE_PROGRAM = "22222222-2222-4222-8222-222222222222";

function saved(team: Partial<FormData>, lineOpponentProgramId?: string | null) {
  const form: FormData = {
    ...DEFAULT_FORM_DATA,
    playerName: "Ace",
    opponentName: "Goodman",
    playerScores: [6, 6, null],
    opponentScores: [2, 2, null],
    ...team,
  };
  return buildMatchData(
    "m1",
    form,
    { id: null, name: "Ace", scores: [] },
    { id: null, name: "Goodman", scores: [] },
    false,
    {
      userId: "u1",
      sourceProvider: "swingvision",
      analysisMethod: "elc",
      lineOpponentProgramId,
    },
  );
}

test.describe("buildMatchData — the opponent's team columns", () => {
  test("(a) a picked program writes its id and no school", () => {
    const row = saved({
      opponentTeamProgram: MERIDIAN,
      opponentTeamSource: "picked",
    });
    expect(row.opponent_program_id).toBe(MERIDIAN.id);
    expect(row.opponent_school).toBeNull();
  });

  test("(b) a typed school writes the text, trimmed, and no program", () => {
    const row = saved({
      opponentTeamSchool: "  Valley Tennis Club ",
      opponentTeamSource: "typed",
    });
    expect(row.opponent_program_id).toBeNull();
    expect(row.opponent_school).toBe("Valley Tennis Club");
  });

  test("(c) neither writes both keys as null — present, never omitted", () => {
    const row = saved({});
    expect(row).toHaveProperty("opponent_program_id", null);
    expect(row).toHaveProperty("opponent_school", null);
    // Whitespace is not a school.
    expect(saved({ opponentTeamSchool: "   " }).opponent_school).toBeNull();
  });

  test("a program and a school never both reach the row", () => {
    // A school typed first, then a directory row picked over it: the form can
    // hold both for a moment, the row cannot.
    const both = saved({
      opponentTeamProgram: MERIDIAN,
      opponentTeamSchool: "Meridian",
      opponentTeamSource: "picked",
    });
    expect(both.opponent_program_id).toBe(MERIDIAN.id);
    expect(both.opponent_school).toBeNull();

    const cases: [Partial<FormData>, string | null][] = [
      [{}, null],
      [{}, LINE_PROGRAM],
      [{ opponentTeamProgram: MERIDIAN }, null],
      [{ opponentTeamProgram: MERIDIAN }, LINE_PROGRAM],
      [{ opponentTeamSchool: "Valley" }, null],
      [{ opponentTeamSchool: "Valley" }, LINE_PROGRAM],
      [{ opponentTeamProgram: MERIDIAN, opponentTeamSchool: "Valley" }, null],
      [{ opponentTeamProgram: null, opponentTeamSchool: "Valley" }, null],
    ];
    for (const [team, line] of cases) {
      const row = saved(team, line);
      expect(
        row.opponent_program_id !== null && row.opponent_school !== null,
        JSON.stringify(team),
      ).toBe(false);
    }
  });

  test("an empty field on a dual line takes the line's program", () => {
    expect(saved({}, LINE_PROGRAM)).toMatchObject({
      opponent_program_id: LINE_PROGRAM,
      opponent_school: null,
    });
  });

  test("an answered field outranks the line", () => {
    expect(
      saved({ opponentTeamProgram: MERIDIAN }, LINE_PROGRAM)
        .opponent_program_id,
    ).toBe(MERIDIAN.id);
    expect(saved({ opponentTeamSchool: "Valley" }, LINE_PROGRAM)).toMatchObject(
      { opponent_program_id: null, opponent_school: "Valley" },
    );
  });

  test("the line's own keys never reach the two columns", () => {
    // `opponentProgramKey` / `opponentSchool` are the dual line's. Set alone,
    // they save no team: only a resolved line program id does.
    const row = saved({
      opponentProgramKey: "meridian-state-mens",
      opponentSchool: "Meridian State",
    });
    expect(row.opponent_program_id).toBeNull();
    expect(row.opponent_school).toBeNull();
  });

  test("the team changes nothing else on the row", () => {
    const {
      opponent_program_id: _a,
      opponent_school: _b,
      ...plain
    } = saved({});
    const {
      opponent_program_id: _c,
      opponent_school: _d,
      ...withTeam
    } = saved({ opponentTeamProgram: MERIDIAN, opponentTeamSource: "picked" });
    expect(withTeam).toEqual(plain);
  });
});

test.describe("opponentTeamColumns / opponentTeamIsEmpty", () => {
  test("empty means no program id and no non-blank school", () => {
    expect(opponentTeamIsEmpty({})).toBe(true);
    expect(opponentTeamIsEmpty(EMPTY_OPPONENT_TEAM)).toBe(true);
    expect(opponentTeamIsEmpty({ opponentTeamSchool: "  " })).toBe(true);
    expect(opponentTeamIsEmpty({ opponentTeamProgram: null })).toBe(true);
    expect(opponentTeamIsEmpty({ opponentTeamSchool: "Valley" })).toBe(false);
    expect(opponentTeamIsEmpty({ opponentTeamProgram: MERIDIAN })).toBe(false);
  });

  test("no line and no answer is null/null, never an empty string", () => {
    expect(opponentTeamColumns({}, undefined)).toEqual({
      opponent_program_id: null,
      opponent_school: null,
    });
    expect(opponentTeamColumns({ opponentTeamSchool: "" }, "")).toEqual({
      opponent_program_id: null,
      opponent_school: null,
    });
  });
});

test.describe("opponentTeamUpdate — the patch for a match that exists", () => {
  test("a set field writes both keys together, one value and one null", () => {
    expect(opponentTeamUpdate({ opponentTeamProgram: MERIDIAN })).toEqual({
      opponent_program_id: MERIDIAN.id,
      opponent_school: null,
    });
    expect(opponentTeamUpdate({ opponentTeamSchool: " Valley " })).toEqual({
      opponent_program_id: null,
      opponent_school: "Valley",
    });
    // The field outranks the line here too.
    expect(
      opponentTeamUpdate({ opponentTeamSchool: "Valley" }, LINE_PROGRAM),
    ).toEqual({ opponent_program_id: null, opponent_school: "Valley" });
  });

  test("an empty field with a resolved line program writes both keys", () => {
    expect(opponentTeamUpdate({}, LINE_PROGRAM)).toEqual({
      opponent_program_id: LINE_PROGRAM,
      opponent_school: null,
    });
  });

  test("an empty field and no line program writes neither key", () => {
    for (const patch of [
      opponentTeamUpdate({}),
      opponentTeamUpdate({}, null),
      opponentTeamUpdate(EMPTY_OPPONENT_TEAM, ""),
      opponentTeamUpdate({ opponentTeamSchool: "   " }),
      opponentTeamUpdate({ opponentTeamProgram: null }),
    ]) {
      expect(patch).toEqual({});
      expect(patch).not.toHaveProperty("opponent_program_id");
      expect(patch).not.toHaveProperty("opponent_school");
    }
  });

  test("a patch is both keys or none — never one alone", () => {
    for (const patch of [
      opponentTeamUpdate({}),
      opponentTeamUpdate({}, LINE_PROGRAM),
      opponentTeamUpdate({ opponentTeamProgram: MERIDIAN }),
      opponentTeamUpdate({ opponentTeamSchool: "Valley" }),
    ]) {
      expect([0, 2]).toContain(Object.keys(patch).length);
    }
  });
});

test.describe("opponentTeamFromHistory — a remembered opponent's team", () => {
  test("a remembered program fills the field with source history", () => {
    expect(
      opponentTeamFromHistory(
        {},
        { opponentProgram: MERIDIAN, opponentSchool: null },
      ),
    ).toEqual({
      opponentTeamProgram: MERIDIAN,
      opponentTeamSchool: undefined,
      opponentTeamSource: "history",
    });
  });

  test("a remembered typed school fills the field with source history", () => {
    expect(
      opponentTeamFromHistory(
        { opponentTeamProgram: MERIDIAN, opponentTeamSource: "picked" },
        { opponentProgram: null, opponentSchool: " Valley Tennis Club " },
      ),
    ).toEqual({
      opponentTeamProgram: undefined,
      opponentTeamSchool: "Valley Tennis Club",
      opponentTeamSource: "history",
    });
  });

  test("nothing remembered clears a team that came from history", () => {
    const stale = {
      opponentTeamProgram: MERIDIAN,
      opponentTeamSource: "history" as const,
    };
    expect(opponentTeamFromHistory(stale, undefined)).toEqual(
      EMPTY_OPPONENT_TEAM,
    );
    expect(
      opponentTeamFromHistory(stale, {
        opponentProgram: null,
        opponentSchool: null,
      }),
    ).toEqual(EMPTY_OPPONENT_TEAM);
  });

  test("nothing remembered leaves a picked or typed team alone", () => {
    expect(
      opponentTeamFromHistory(
        { opponentTeamProgram: MERIDIAN, opponentTeamSource: "picked" },
        undefined,
      ),
    ).toBeNull();
    expect(
      opponentTeamFromHistory(
        { opponentTeamSchool: "Valley", opponentTeamSource: "typed" },
        { opponentProgram: null, opponentSchool: null },
      ),
    ).toBeNull();
    expect(opponentTeamFromHistory({}, undefined)).toBeNull();
  });
});

test.describe("searchPrograms — id, abbreviation and crest", () => {
  const RPC_ROW = {
    program_key: "meridian-state-mens",
    school_name: "Meridian State",
    team: "mens",
    division: "D1",
    conference: "Big Sky",
    state: "MT",
    status: "active",
    owner_display: "elena vasquez",
  };

  function fakeClient(opts: { facts?: unknown[]; factsError?: boolean } = {}) {
    const calls: string[] = [];
    const rpcArgs: Record<string, unknown>[] = [];
    const client = {
      rpc: async (fn: string, args: Record<string, unknown>) => {
        calls.push(`rpc:${fn}`);
        rpcArgs.push(args);
        return { data: [RPC_ROW], error: null };
      },
      from(table: string) {
        calls.push(`from:${table}`);
        return {
          select: (columns: string) => ({
            in: async (column: string, values: string[]) => {
              calls.push(`select:${columns}`, `in:${column}=${values.join()}`);
              return opts.factsError
                ? { data: null, error: { message: "boom" } }
                : { data: opts.facts ?? [], error: null };
            },
          }),
        };
      },
      storage: {
        from: (bucket: string) => ({
          getPublicUrl: (path: string) => ({
            data: { publicUrl: `https://cdn.test/${bucket}/${path}` },
          }),
        }),
      },
    };
    return { client: client as unknown as SupabaseClient, calls, rpcArgs };
  }

  test("a squad is sent as p_team, so the SQL limit counts only that squad", async () => {
    const { client, rpcArgs } = fakeClient();
    await searchPrograms(client, "usd", "womens");
    expect(rpcArgs).toEqual([{ p_term: "usd", p_team: "womens", p_limit: 8 }]);
  });

  test("no squad calls the two-argument search, with no p_team at all", async () => {
    const { client, rpcArgs } = fakeClient();
    await searchPrograms(client, "usd");
    await searchPrograms(client, "usd", null);
    expect(rpcArgs).toEqual([
      { p_term: "usd", p_limit: 8 },
      { p_term: "usd", p_limit: 8 },
    ]);
  });

  test("each row carries its id, abbreviation and crest URL", async () => {
    const { client, calls } = fakeClient({
      facts: [
        {
          id: MERIDIAN.id,
          program_key: "meridian-state-mens",
          school_abbrev: "MSU",
          crest_path: "meridian/crest.png",
        },
      ],
    });
    const [row] = await searchPrograms(client, "meri");
    expect(row).toMatchObject({
      id: MERIDIAN.id,
      programKey: "meridian-state-mens",
      schoolName: "Meridian State",
      schoolAbbrev: "MSU",
      crestUrl: "https://cdn.test/program-crests/meridian/crest.png",
      status: "active",
      ownerDisplay: "Elena Vasquez",
    });
    // One read for the page, keyed on the unique program_key.
    expect(calls).toEqual([
      "rpc:search_programs",
      "from:programs",
      "select:id, program_key, school_abbrev, crest_path",
      "in:program_key=meridian-state-mens",
    ]);
  });

  test("no crest key is a null crest, not a URL to nothing", async () => {
    const { client } = fakeClient({
      facts: [
        {
          id: MERIDIAN.id,
          program_key: "meridian-state-mens",
          school_abbrev: null,
          crest_path: null,
        },
      ],
    });
    const [row] = await searchPrograms(client, "meri");
    expect(row.crestUrl).toBeNull();
    expect(row.schoolAbbrev).toBeNull();
    expect(row.id).toBe(MERIDIAN.id);
  });

  test("a failed enrichment still lists the row", async () => {
    const errors: unknown[] = [];
    const original = console.error;
    console.error = (...args: unknown[]) => errors.push(args);
    try {
      const { client } = fakeClient({ factsError: true });
      const rows = await searchPrograms(client, "meri");
      expect(rows).toHaveLength(1);
      expect(rows[0]).toMatchObject({
        programKey: "meridian-state-mens",
        id: null,
        schoolAbbrev: null,
        crestUrl: null,
      });
    } finally {
      console.error = original;
    }
    expect(errors).toHaveLength(1);
  });

  test("a short term asks nothing", async () => {
    const { client, calls } = fakeClient();
    expect(await searchPrograms(client, "m")).toEqual([]);
    expect(calls).toEqual([]);
  });

  test("the player's row keeps the three facts and still loses the owner", async () => {
    const { client } = fakeClient({
      facts: [
        {
          id: MERIDIAN.id,
          program_key: "meridian-state-mens",
          school_abbrev: "MSU",
          crest_path: "meridian/crest.png",
        },
      ],
    });
    const [row] = await searchPrograms(client, "meri");
    const redacted = redactForPlayer(row);
    expect(redacted).toEqual({
      id: MERIDIAN.id,
      programKey: "meridian-state-mens",
      schoolName: "Meridian State",
      schoolAbbrev: "MSU",
      crestUrl: "https://cdn.test/program-crests/meridian/crest.png",
      team: "mens",
      division: "D1",
      conference: "Big Sky",
      state: "MT",
      onAdvantage: true,
    });
    expect(redacted).not.toHaveProperty("ownerDisplay");
    expect(redacted).not.toHaveProperty("status");
  });
});
