import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * T2 — existing custom teams listed under the 7.2 team-name field
 * (`existing-team-matches.tsx`, rendered by `TeamSetupForm`).
 *
 * The list renders FOR REAL through `createLoader()` with fixture rows in the
 * `/api/programs/custom-search` shape. No server, no database.
 */

const loader = createLoader();
const { ExistingTeamMatches } = loader.load(
  "src/components/claim/existing-team-matches.tsx",
) as { ExistingTeamMatches: React.ComponentType<Record<string, unknown>> };

const NOTE =
  "Already on Advantage. If this is your team, ask its owner to add you instead of creating another.";

const rows = [
  {
    programId: "p-1",
    name: "Riverside High — JV",
    orgType: "high_school",
    ownerDisplay: "Elena V.",
  },
  {
    programId: "p-2",
    name: "Riverside Tennis Club",
    orgType: "club",
    ownerDisplay: null,
  },
  {
    programId: "p-3",
    name: "Riverside Academy",
    orgType: "academy",
    ownerDisplay: "Sam K.",
  },
];

function render(list: unknown[], term: string) {
  return renderToStaticMarkup(
    React.createElement(ExistingTeamMatches, { rows: list, term }),
  );
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

const rowNames = (html: string) =>
  [...html.matchAll(/<li[^>]*><span[^>]*>([^<]*)<\/span>/g)].map((m) => m[1]);

test.describe("ExistingTeamMatches", () => {
  test("no rows renders nothing, and no Nothing-matched line", () => {
    const html = render([], "Riverside");
    expect(html).toBe("");
    expect(html).not.toContain("Nothing matched");
  });

  test("three rows show name, type label and owner or Set up", () => {
    const html = render(rows, "Riverside");
    const out = text(html);
    expect(out).toContain(NOTE);
    expect((html.match(/<li/g) ?? []).length).toBe(3);
    expect(out).toContain("Riverside High — JV High school Elena V.");
    expect(out).toContain("Riverside Tennis Club Tennis club Set up");
    expect(out).toContain("Riverside Academy Academy Sam K.");
    // Informational only: nothing on a row is clickable.
    expect(html).not.toMatch(/<(button|a)\b/);
    expect(out.indexOf(NOTE)).toBeLessThan(out.indexOf("Riverside High"));
  });

  test("an exact case-insensitive name match is ordered first", () => {
    const html = render(rows, "  riverside ACADEMY ");
    expect(rowNames(html)).toEqual([
      "Riverside Academy",
      "Riverside High — JV",
      "Riverside Tennis Club",
    ]);
  });

  test("without an exact match the endpoint's order stands", () => {
    expect(rowNames(render(rows, "River"))).toEqual([
      "Riverside High — JV",
      "Riverside Tennis Club",
      "Riverside Academy",
    ]);
  });
});
