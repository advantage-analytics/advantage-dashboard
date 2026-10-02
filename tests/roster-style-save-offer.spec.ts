import { expect, test } from "@playwright/test";

import {
  canSaveRosterStyle,
  firstNameOf,
  styleSaveChecked,
  styleSaveChoice,
  styleSaveOffer,
  type SavedStyle,
} from "@/components/dashboard/matches/new-match-wizard/style-save-offer";
import {
  backhandOptions,
  handOptions,
} from "@/components/dashboard/team/player-fields";

/**
 * The upload wizard's "use for future matches" offer — the three cases the
 * design settled (nothing saved → ticked, saved and unchanged → hidden, saved
 * and changed → unticked), and the roster dialogs' Hand / Backhand menus.
 */

const NOTHING: SavedStyle = { hand: null, backhand: null };
const SAVED: SavedStyle = { hand: "right", backhand: "two-handed" };

test("nothing saved: offered as 'save', ticked by default", () => {
  expect(styleSaveOffer(NOTHING, "right", "two-handed")).toEqual({
    mode: "save",
    defaultChecked: true,
  });
});

test("saved and unchanged: not offered", () => {
  expect(styleSaveOffer(SAVED, "right", "two-handed")).toBeNull();
});

test("saved and changed: offered as 'update', unticked by default", () => {
  expect(styleSaveOffer(SAVED, "left", "two-handed")).toEqual({
    mode: "update",
    defaultChecked: false,
  });
  expect(styleSaveOffer(SAVED, "right", "one-handed")?.mode).toBe("update");
});

test("half saved and completed without contradicting it is a 'save'", () => {
  expect(
    styleSaveOffer({ hand: "left", backhand: null }, "left", "one-handed"),
  ).toEqual({ mode: "save", defaultChecked: true });
  expect(
    styleSaveOffer({ hand: "left", backhand: null }, "right", "one-handed")
      ?.mode,
  ).toBe("update");
});

test("nothing is offered until both answers are in", () => {
  expect(styleSaveOffer(NOTHING, "right", undefined)).toBeNull();
  expect(styleSaveOffer(NOTHING, undefined, "two-handed")).toBeNull();
});

test("a tick is remembered against the mode it answered", () => {
  const save = styleSaveOffer(NOTHING, "right", "two-handed");
  const update = styleSaveOffer(SAVED, "left", "two-handed");
  expect(styleSaveChecked(save, undefined)).toBe(true);
  expect(styleSaveChecked(save, styleSaveChoice("save", false))).toBe(false);
  expect(styleSaveChecked(update, undefined)).toBe(false);
  expect(styleSaveChecked(update, styleSaveChoice("update", true))).toBe(true);
  // An untick given to "save" does not carry into "update", nor back.
  expect(styleSaveChecked(update, styleSaveChoice("save", true))).toBe(false);
  expect(styleSaveChecked(null, styleSaveChoice("save", true))).toBe(false);
});

test("the label uses the first name", () => {
  expect(firstNameOf("Maya Rodriguez")).toBe("Maya");
  expect(firstNameOf("  Cher ")).toBe("Cher");
});

test("the roster menus offer the wizard's vocabulary, then Not set", () => {
  expect(handOptions("").map((o) => o.label)).toEqual([
    "Right",
    "Left",
    "Not set",
  ]);
  expect(backhandOptions("two-handed").map((o) => o.value)).toEqual([
    "two-handed",
    "one-handed",
    "__not-set",
  ]);
});

test("only staff, or the player on their own profile, may save a style", () => {
  expect(
    canSaveRosterStyle({ staff: true, rowUserId: null, viewerId: "coach" }),
  ).toBe(true);
  expect(
    canSaveRosterStyle({ staff: false, rowUserId: "me", viewerId: "me" }),
  ).toBe(true);
  // A player picking a teammate, claimed or not, gets the prefill only.
  expect(
    canSaveRosterStyle({ staff: false, rowUserId: "them", viewerId: "me" }),
  ).toBe(false);
  expect(
    canSaveRosterStyle({ staff: false, rowUserId: null, viewerId: "me" }),
  ).toBe(false);
});
