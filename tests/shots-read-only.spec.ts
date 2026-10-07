import { expect, test } from "@playwright/test";
import { shotsWriteAccess } from "@/components/dashboard/matches/match-detail/shots/shots-write-access";
import { canManageSavedView } from "@/lib/data/saved-views-logic";
import {
  canEditBandsFor,
  type ProgramRole,
  type WorkspaceKind,
} from "@/lib/workspace/types";

/**
 * `shotsWriteAccess` is the one gate every Shots-tab writer asks — the
 * "Create view" tile, "Save this view…" and its dialog, Manage mode's
 * rename/duplicate/share/delete, the band presets and the "Edit bands…"
 * editor. A read-only report (the share page, the sample match) must turn
 * all of them off; every other report must keep exactly today's rules.
 */

const KINDS: WorkspaceKind[] = ["personal", "team"];
const ROLES: ProgramRole[] = ["owner", "coach", "staff", "player"];

test.describe("shotsWriteAccess", () => {
  test("readOnly forces both writers off, whatever the band right says", () => {
    for (const canEditBands of [true, false]) {
      expect(shotsWriteAccess({ readOnly: true, canEditBands })).toEqual({
        canSaveViews: false,
        canEditBands: false,
      });
    }
  });

  test("readOnly turns off every role's band editing and view management", () => {
    for (const kind of KINDS) {
      for (const role of ROLES) {
        const access = shotsWriteAccess({
          readOnly: true,
          canEditBands: canEditBandsFor(kind, role),
        });
        expect(access.canEditBands).toBe(false);
        expect(access.canSaveViews).toBe(false);
        // The band ANDs `canSaveViews` with per-view ownership, so even the
        // viewer's own view is unmanageable on a read-only report.
        const ownView = { mine: true, shared: false };
        expect(access.canSaveViews && canManageSavedView(ownView, role)).toBe(
          false,
        );
      }
    }
  });

  test("not readOnly: saving stays on for everyone, players included", () => {
    for (const canEditBands of [true, false]) {
      expect(
        shotsWriteAccess({ readOnly: false, canEditBands }).canSaveViews,
      ).toBe(true);
    }
  });

  test("not readOnly: band editing is exactly meta.canEditBands", () => {
    for (const kind of KINDS) {
      for (const role of ROLES) {
        const canEditBands = canEditBandsFor(kind, role);
        expect(
          shotsWriteAccess({ readOnly: false, canEditBands }).canEditBands,
        ).toBe(canEditBands);
      }
    }
    // Spot-check the outcomes the predicate must not change.
    expect(
      shotsWriteAccess({
        readOnly: false,
        canEditBands: canEditBandsFor("team", "player"),
      }).canEditBands,
    ).toBe(false);
    expect(
      shotsWriteAccess({
        readOnly: false,
        canEditBands: canEditBandsFor("team", "coach"),
      }).canEditBands,
    ).toBe(true);
  });

  test("not readOnly: view management is still canManageSavedView per view", () => {
    const { canSaveViews } = shotsWriteAccess({
      readOnly: false,
      canEditBands: false,
    });
    const views = [
      { mine: true, shared: false },
      { mine: false, shared: true },
      { mine: false, shared: false },
    ];
    for (const role of ROLES) {
      for (const view of views) {
        expect(canSaveViews && canManageSavedView(view, role)).toBe(
          canManageSavedView(view, role),
        );
      }
    }
  });
});
