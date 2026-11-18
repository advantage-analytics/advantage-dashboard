import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

/**
 * Match and roster rows open their page (tables.md rule 3, 2026-11-17), and
 * the links that used to land with a peek drawer open still lead somewhere.
 * Read from source: these are wiring facts a render would need the whole
 * dashboard shell to show.
 */

const read = (path: string) => readFileSync(path, "utf8");

test.describe("links saved while the drawers existed", () => {
  test("the Roster's ?player= redirects above the boundary that would swallow it", () => {
    const page = read("src/app/dashboard/team/roster/(list)/page.tsx");
    const redirectAt = page.indexOf(
      "redirect(`/dashboard/team/roster/${player}`)",
    );
    const boundaryAt = page.indexOf("<WidgetBoundary");
    expect(redirectAt).toBeGreaterThan(-1);
    // `redirect()` throws; an error boundary above it catches the throw and
    // the link lands on the list with nothing open.
    expect(redirectAt).toBeLessThan(boundaryAt);
    expect(page).not.toContain("initialSelectedId");
  });

  test("the Matches list sends ?match= to the report and ?draft= to the wizard", () => {
    const page = read("src/app/dashboard/matches/(list)/page.tsx");
    // Only a match this workspace lists: anything else stays on the list
    // rather than landing on the report's not-found page.
    expect(page).toContain(".some((row) => row.id === linkedMatch)");
    expect(page).toContain("redirect(`/dashboard/matches/${linkedMatch}`)");
    expect(page).toMatch(/redirect\(\s*draftHref\(\s*linkedDraft,/);
    // `draftHref` must come from the module with no "use client": a client
    // module's export is a reference on the server, not a function.
    expect(page).toContain('from "@/components/dashboard/matches/draft-href"');
    expect(read("src/components/dashboard/matches/draft-href.ts")).not.toMatch(
      /^["']use client["'];/m,
    );
  });

  test("search opens a player's page, not the roster with a drawer", () => {
    const palette = read(
      "src/components/dashboard/search/search-command-palette.tsx",
    );
    expect(palette).not.toContain("roster?player=");
  });
});

test.describe("the roster row", () => {
  const table = read("src/components/dashboard/team/roster-table.tsx");

  test("travels to the player page on click and on Enter, and holds no second link", () => {
    expect(table.match(/router\.push\(href\)/g)).toHaveLength(2);
    expect(table).not.toContain("onToggle");
    // The name is plain text: the row is already the link.
    expect(table).not.toContain('from "next/link"');
  });

  test("ends in the staff menu and the record chevron, outside lineup mode", () => {
    expect(table).toMatch(
      /\{!inLineupMode && canManage && \(\s*<RosterRowMenu/,
    );
    expect(table).toMatch(/\{!inLineupMode && \(\s*<ChevronRight/);
  });

  test("the menu stops clicks, so a press in it never opens the player page", () => {
    const menu = read("src/components/dashboard/team/roster-row-menu.tsx");
    expect(menu).toContain("onClick={(event) => event.stopPropagation()}");
    for (const label of [
      "Can send video",
      "Invite to claim",
      "Edit player",
      "Remove from roster",
    ]) {
      expect(menu).toContain(label);
    }
  });
});
