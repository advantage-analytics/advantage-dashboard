import { expect, test } from "@playwright/test";

import {
  normalizeMatchPatch,
  OPPONENT_SCHOOL_MAX,
  type StoredMatchForPatch,
} from "@/lib/matches/patch-match";

/**
 * T11 — the Edit Match dialog's "their team", offline.
 *
 * The opponent's team saves as two `matches` columns that are either/or on
 * the row (`matches_opponent_program_or_school_check`): `opponent_program_id`
 * for a directory program, `opponent_school` for a school as typed.
 * `normalizeMatchPatch` is the rule, so it is driven directly. Whether the
 * program exists is the route's question (`tests/match-route-guards.spec.ts`).
 */

const PROGRAM = "11111111-1111-4111-8111-111111111111";

const teamMatch: StoredMatchForPatch = {
  score: { player1: [6, 6], player2: [4, 3], winner: "player1" },
  format: { best_of: 3, ad_scoring: false },
  linked: false,
  analyzed: false,
  teamMatch: true,
};

test.describe("normalizeMatchPatch — the opponent's team", () => {
  test("a program passes through, with the school nulled beside it", () => {
    expect(
      normalizeMatchPatch(
        { opponent_program_id: PROGRAM, opponent_school: null },
        teamMatch,
      ),
    ).toEqual({
      ok: true,
      update: { opponent_program_id: PROGRAM, opponent_school: null },
    });
  });

  test("a typed school passes through trimmed, with the program nulled", () => {
    expect(
      normalizeMatchPatch(
        { opponent_program_id: null, opponent_school: "  Meridian State " },
        teamMatch,
      ),
    ).toEqual({
      ok: true,
      update: { opponent_program_id: null, opponent_school: "Meridian State" },
    });
  });

  test("both set at once is refused, naming the field", () => {
    const result = normalizeMatchPatch(
      { opponent_program_id: PROGRAM, opponent_school: "Meridian State" },
      teamMatch,
    );
    expect(result).toMatchObject({
      ok: false,
      field: "opponent_school",
      code: "opponent_team_exclusive",
    });
  });

  test("an empty string becomes null, for either key", () => {
    expect(
      normalizeMatchPatch(
        { opponent_program_id: "", opponent_school: "   " },
        teamMatch,
      ),
    ).toEqual({
      ok: true,
      update: { opponent_program_id: null, opponent_school: null },
    });
    // An emptied school beside a program is not "both set".
    expect(
      normalizeMatchPatch(
        { opponent_program_id: PROGRAM, opponent_school: "" },
        teamMatch,
      ),
    ).toMatchObject({
      ok: true,
      update: { opponent_program_id: PROGRAM, opponent_school: null },
    });
  });

  test("one key alone still writes both columns when it sets a team", () => {
    expect(
      normalizeMatchPatch({ opponent_program_id: PROGRAM }, teamMatch),
    ).toEqual({
      ok: true,
      update: { opponent_program_id: PROGRAM, opponent_school: null },
    });
    expect(
      normalizeMatchPatch({ opponent_school: "Meridian State" }, teamMatch),
    ).toEqual({
      ok: true,
      update: { opponent_program_id: null, opponent_school: "Meridian State" },
    });
  });

  test("a body without the keys never touches the team", () => {
    const result = normalizeMatchPatch({ player2_name: "Goodman" }, teamMatch);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.update).not.toHaveProperty("opponent_program_id");
    expect(result.update).not.toHaveProperty("opponent_school");
  });

  test("a malformed id, a non-text school and an overlong school are refused", () => {
    for (const id of ["meridian", 42, {}, `${PROGRAM}x`]) {
      expect(
        normalizeMatchPatch({ opponent_program_id: id }, teamMatch),
        String(id),
      ).toMatchObject({ ok: false, field: "opponent_program_id" });
    }
    expect(
      normalizeMatchPatch({ opponent_school: 42 }, teamMatch),
    ).toMatchObject({ ok: false, field: "opponent_school" });
    expect(
      normalizeMatchPatch(
        { opponent_school: "x".repeat(OPPONENT_SCHOOL_MAX + 1) },
        teamMatch,
      ),
    ).toMatchObject({ ok: false, field: "opponent_school" });
    expect(
      normalizeMatchPatch(
        { opponent_school: ` ${"x".repeat(OPPONENT_SCHOOL_MAX)} ` },
        teamMatch,
      ),
    ).toMatchObject({ ok: true });
  });

  test("a program id is stored lower-cased", () => {
    expect(
      normalizeMatchPatch(
        { opponent_program_id: "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA" },
        teamMatch,
      ),
    ).toMatchObject({
      ok: true,
      update: { opponent_program_id: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" },
    });
  });
});
