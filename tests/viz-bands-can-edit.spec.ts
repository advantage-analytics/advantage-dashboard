import { expect, test } from "@playwright/test";
import {
  canEditBandsFor,
  type ProgramRole,
  type WorkspaceKind,
} from "@/lib/workspace/types";

/**
 * Fix round 1 (blocking #2): `canEditBandsFor`'s lost-session fallback must
 * be RESTRICTIVE (false), matching `workspaceRole`'s own `?? "player"`
 * fallback shape — a permissive default here would show an enabled bands
 * editor whose Save then always fails `viz_band_settings`'s own RLS.
 */
test.describe("canEditBandsFor", () => {
  test("personal workspace: always editable, regardless of role", () => {
    expect(canEditBandsFor("personal", "owner")).toBe(true);
    expect(canEditBandsFor("personal", "player")).toBe(true);
    expect(canEditBandsFor("personal", null)).toBe(true);
    expect(canEditBandsFor("personal", undefined)).toBe(true);
  });

  test("team workspace: owner, coach and staff may edit", () => {
    const staffRoles: ProgramRole[] = ["owner", "coach", "staff"];
    for (const role of staffRoles) {
      expect(canEditBandsFor("team", role)).toBe(true);
    }
  });

  test("team workspace: a player may not edit", () => {
    expect(canEditBandsFor("team", "player")).toBe(false);
  });

  test("team workspace with no resolved role reads as a player — restrictive, not permissive", () => {
    expect(canEditBandsFor("team", null)).toBe(false);
    expect(canEditBandsFor("team", undefined)).toBe(false);
  });

  test("an unknown or missing workspace kind (lost session) is restrictive, never editable", () => {
    expect(canEditBandsFor(null, "owner")).toBe(false);
    expect(canEditBandsFor(undefined, "owner")).toBe(false);
    expect(canEditBandsFor(null, null)).toBe(false);
    expect(canEditBandsFor(undefined, undefined)).toBe(false);
    // Not a real WorkspaceKind, but the function reads anything other than
    // "personal"/"team" as unrecognised — same restrictive outcome.
    expect(canEditBandsFor("bogus" as WorkspaceKind, "owner")).toBe(false);
  });
});
