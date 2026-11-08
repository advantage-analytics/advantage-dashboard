import { expect, test } from "@playwright/test";
import type { RosterPlayerOption } from "@/lib/data/roster-shared";
import { DEFAULT_FORM_DATA } from "@/components/dashboard/matches/new-match-wizard/types";
import { resolveRosterSubject } from "@/lib/wizard/roster-subject";

// Who the wizard's For field opens on when a team draft resumes or a
// `?player=` link names someone. Pure; no browser, no database.

function row(
  playerId: string,
  name: string,
  userId: string | null = null,
): RosterPlayerOption {
  return {
    playerId,
    userId,
    name,
    ladderPosition: null,
    classYear: null,
    email: null,
  } as RosterPlayerOption;
}

const AVERY = row("p-avery", "Avery Zzseed", "u-avery");
const RILEY = row("p-riley", "Riley Marsh");
const ROSTER = [AVERY, RILEY];

const draft = (over: {
  subject?: { kind: "roster"; playerId: string; name: string } | null;
  playerName?: string;
  preset?: unknown;
}) => ({
  subject: over.subject,
  formData: { ...DEFAULT_FORM_DATA, playerName: over.playerName ?? "" },
  preset: (over.preset ?? null) as never,
});

const subjectOf = (r: RosterPlayerOption) => ({
  kind: "roster" as const,
  playerId: r.playerId,
  name: r.name,
});

test.describe("resolveRosterSubject", () => {
  test("the link outranks the draft", () => {
    expect(
      resolveRosterSubject(ROSTER, {
        linkPlayerId: "p-riley",
        draft: draft({ subject: subjectOf(AVERY) }),
      }),
    ).toEqual(subjectOf(RILEY));
  });

  test("a link that misses falls through to the draft's own player", () => {
    expect(
      resolveRosterSubject(ROSTER, {
        linkPlayerId: "gone",
        draft: draft({ subject: subjectOf(AVERY) }),
      }),
    ).toEqual(subjectOf(AVERY));
  });

  test("ids match in both eras and resolve to the roster's own id and name", () => {
    expect(
      resolveRosterSubject(ROSTER, {
        draft: draft({
          subject: { kind: "roster", playerId: "u-avery", name: "Old Name" },
        }),
      }),
    ).toEqual(subjectOf(AVERY));
  });

  test("an older draft with no saved id resolves by a unique exact name", () => {
    expect(
      resolveRosterSubject(ROSTER, {
        draft: draft({ playerName: "Avery Zzseed" }),
      }),
    ).toEqual(subjectOf(AVERY));
    // Surrounding whitespace is not a different name.
    expect(
      resolveRosterSubject(ROSTER, {
        draft: draft({ playerName: "  Riley Marsh " }),
      }),
    ).toEqual(subjectOf(RILEY));
  });

  test("a name two players share resolves to nobody", () => {
    const twins = [...ROSTER, row("p-avery-2", "Avery Zzseed")];
    expect(
      resolveRosterSubject(twins, {
        draft: draft({ playerName: "Avery Zzseed" }),
      }),
    ).toBeNull();
  });

  test("a name is never a near match", () => {
    expect(
      resolveRosterSubject(ROSTER, {
        draft: draft({ playerName: "avery zzseed" }),
      }),
    ).toBeNull();
    expect(
      resolveRosterSubject(ROSTER, { draft: draft({ playerName: "Avery" }) }),
    ).toBeNull();
  });

  test("a saved id that misses never falls back to the name", () => {
    // The player left; someone else carrying the name must not stand in.
    expect(
      resolveRosterSubject(ROSTER, {
        draft: draft({
          subject: { kind: "roster", playerId: "gone", name: "Avery Zzseed" },
          playerName: "Avery Zzseed",
        }),
      }),
    ).toBeNull();
  });

  test("a preset draft is never resolved by name", () => {
    expect(
      resolveRosterSubject(ROSTER, {
        draft: draft({ playerName: "Avery Zzseed", preset: { entryId: "e" } }),
      }),
    ).toBeNull();
  });

  test("nothing to look up resolves to nobody", () => {
    expect(resolveRosterSubject(ROSTER, {})).toBeNull();
    expect(
      resolveRosterSubject(ROSTER, { draft: draft({ playerName: "" }) }),
    ).toBeNull();
  });
});
