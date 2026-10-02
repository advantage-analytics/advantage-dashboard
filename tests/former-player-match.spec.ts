import { expect, test } from "@playwright/test";

import { formerPlayerMatch } from "@/components/dashboard/team/add-player-dialog";
import type { FormerPlayer } from "@/lib/data/team-roster-server";

/**
 * `formerPlayerMatch` — the Add player dialog's recognition of somebody who was
 * already on this roster and got taken off it.
 *
 * Pure, so no browser and no dev server, the same as `tests/date-value.spec.ts`.
 * The dialog around it cannot be rendered from a spec — `@playwright/test`
 * rewrites the JSX, the reason `tests/add-player-prefill.spec.ts` works from a
 * replica — but the rule is the part with teeth, and it is a plain function.
 *
 * Both ways of being wrong are quiet. Miss the archived profile and the coach
 * gets a second, historyless row while every match anybody uploaded for that
 * athlete stays stranded on a profile nobody will open again. Match too eagerly
 * and the dialog offers to un-archive a stranger by name. Neither looks broken.
 *
 * What this cannot catch: whether the dialog actually renders the note and the
 * Restore button off this return value, or whether `restore()` calls the right
 * RPC. That wiring lives in the component and is not reachable from here.
 */

function former(
  name: string,
  email: string | null,
  extra: Partial<FormerPlayer> = {},
): FormerPlayer {
  return {
    profileId: `p-${name.toLowerCase().replace(/\s+/g, "-")}`,
    name,
    email,
    archivedOn: "Aug 20",
    matchCount: 14,
    ...extra,
  };
}

const archived = [
  former("Jane Doe", "jane.doe@school.edu"),
  former("Maya Ruiz", null),
  former("Maya Ruiz Jr", "maya.jr@school.edu", { profileId: "p-maya-jr" }),
];

test.describe("formerPlayerMatch", () => {
  test("an archived address is the strong signal, whatever the name says", () => {
    // Casing and stray whitespace are noise on both sides, and the typed name
    // here matches nobody — the address alone is enough.
    const hit = formerPlayerMatch(archived, {
      firstName: "Janet",
      lastName: "Doherty",
      email: "  JANE.DOE@school.edu ",
    });
    expect(hit?.profileId).toBe("p-jane-doe");
  });

  test("the roster's own name rule matches when there is no address", () => {
    // `normalizedPersonName` is what the live-roster duplicate note and
    // `merge_program_players` both apply: case and internal whitespace only.
    const hit = formerPlayerMatch(archived, {
      firstName: "maya",
      lastName: "  ruiz ",
      email: "",
    });
    expect(hit?.profileId).toBe("p-maya-ruiz");
  });

  test("an address match beats a name match", () => {
    // The case that decides which of two same-named archived athletes is on
    // offer: the name points at "Maya Ruiz", the address at her namesake.
    const hit = formerPlayerMatch(archived, {
      firstName: "Maya",
      lastName: "Ruiz",
      email: "maya.jr@school.edu",
    });
    expect(hit?.profileId).toBe("p-maya-jr");
  });

  test("an empty typed address never matches a stored empty one", () => {
    // Half the archived rows have no email. "Blank equals blank" would put the
    // first of them on offer to anybody who starts typing a name.
    expect(
      formerPlayerMatch(archived, {
        firstName: "Chris",
        lastName: "Okafor",
        email: "   ",
      }),
    ).toBeNull();
  });

  test("no signal at all is no match", () => {
    // Half a name matches nothing either — the note has to stay away while
    // somebody is still typing.
    expect(
      formerPlayerMatch(archived, {
        firstName: "Maya",
        lastName: "",
        email: "",
      }),
    ).toBeNull();
    expect(
      formerPlayerMatch(archived, {
        firstName: "Nia",
        lastName: "Patel",
        email: "nia@school.edu",
      }),
    ).toBeNull();
    expect(
      formerPlayerMatch([], { firstName: "Jane", lastName: "Doe", email: "" }),
    ).toBeNull();
  });
});
