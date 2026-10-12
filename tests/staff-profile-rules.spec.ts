import { expect, test } from "@playwright/test";

import {
  isOwnAddress,
  mayAddSelf,
  mayRemoveStaffProfile,
} from "@/components/dashboard/team/staff-profile-rules";

/**
 * A player profile held by the owner, a coach or staff is removed and merged
 * under a ladder, not plain staff authority. The database enforces it
 * (`archive_program_player`, `merge_program_players`); these are the rules the
 * roster's remove control and its "Possible duplicate" chip read, and the two
 * must not drift apart — a chip the function refuses is a button that fails,
 * and a hidden one it allows is a repair nobody can reach.
 *
 * Every viewer-role × holder-role pair is spelled out, because the screen
 * cannot be looked at from four accounts at once and this table can.
 */

const VIEWERS = ["owner", "coach", "staff", "player"] as const;
const HOLDERS = ["owner", "coach", "staff"] as const;

test.describe("who may remove or merge a staff-held player profile", () => {
  // viewer → holder → allowed, for somebody acting on ANOTHER person's profile.
  const others: Record<
    (typeof VIEWERS)[number],
    Record<(typeof HOLDERS)[number], boolean>
  > = {
    owner: { owner: true, coach: true, staff: true },
    coach: { owner: false, coach: false, staff: true },
    staff: { owner: false, coach: false, staff: false },
    player: { owner: false, coach: false, staff: false },
  };

  for (const viewer of VIEWERS) {
    for (const holder of HOLDERS) {
      test(`a ${viewer} acting on a ${holder}'s profile: ${
        others[viewer][holder] ? "allowed" : "refused"
      }`, () => {
        expect(mayRemoveStaffProfile(viewer, holder, false)).toBe(
          others[viewer][holder],
        );
      });
    }
  }

  test("the holder may always act on their own profile, whatever their role", () => {
    for (const viewer of VIEWERS) {
      for (const holder of HOLDERS) {
        expect(mayRemoveStaffProfile(viewer, holder, true)).toBe(true);
      }
    }
  });
});

test.describe("who is offered Add yourself as a player", () => {
  test("the owner, a coach or staff with no profile of their own", () => {
    expect(mayAddSelf("owner", false)).toBe(true);
    expect(mayAddSelf("coach", false)).toBe(true);
    expect(mayAddSelf("staff", false)).toBe(true);
  });

  test("never somebody who already holds a profile, and never a player", () => {
    expect(mayAddSelf("owner", true)).toBe(false);
    expect(mayAddSelf("coach", true)).toBe(false);
    expect(mayAddSelf("staff", true)).toBe(false);
    expect(mayAddSelf("player", false)).toBe(false);
    expect(mayAddSelf("player", true)).toBe(false);
  });
});

test.describe("recognising the viewer's own address", () => {
  const offer = { email: "Jordan.Lee@Example.com", onAddSelf: () => {} };

  test("case and surrounding space do not matter", () => {
    expect(isOwnAddress(offer, "  jordan.lee@example.com ")).toBe(true);
  });

  test("a different address, an empty field, or no offer is not it", () => {
    expect(isOwnAddress(offer, "someone.else@example.com")).toBe(false);
    expect(isOwnAddress(offer, "   ")).toBe(false);
    expect(isOwnAddress(null, "jordan.lee@example.com")).toBe(false);
  });
});
