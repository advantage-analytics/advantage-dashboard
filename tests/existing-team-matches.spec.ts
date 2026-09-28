import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { createLoader } from "./fixtures/vm-modules";

/**
 * T2/T3 — existing custom teams listed under the 7.2 team-name field
 * (`existing-team-matches.tsx`, rendered by `TeamSetupForm`), and the
 * "Ask to join" button T3 put on each row.
 *
 * The list renders FOR REAL through `createLoader()` with fixture rows in the
 * `/api/programs/custom-search` shape. No server, no database — which is the
 * reason the button's handler is a prop: the leaf must load with nothing but
 * `react` and the repo's own pure modules.
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

function render(
  list: unknown[],
  term: string,
  extra: Record<string, unknown> = {},
) {
  return renderToStaticMarkup(
    React.createElement(ExistingTeamMatches, { rows: list, term, ...extra }),
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
    // Without a handler the list is informational: nothing on a row is
    // clickable.
    expect(html).not.toMatch(/<(button|a)\b/);
    expect(html).not.toContain("Ask to join");
    expect(out.indexOf(NOTE)).toBeLessThan(out.indexOf("Riverside High"));
  });

  test("with a handler every row gains an Ask to join button, named for its team", () => {
    const html = render(rows, "Riverside", { onAskToJoin: () => {} });
    const buttons = [...html.matchAll(/<button[^>]*>/g)].map((m) => m[0]);
    expect(buttons).toHaveLength(3);
    for (const button of buttons) {
      expect(button).toContain('type="button"');
      // The attribute, not the word: `advButton()` carries `disabled:`
      // utilities on every button.
      expect(button).not.toMatch(/\sdisabled(=""|\s|>)/);
    }
    expect(html).toContain('aria-label="Ask to join Riverside High — JV"');
    expect(html).toContain('aria-label="Ask to join Riverside Tennis Club"');
    expect((html.match(/>Ask to join</g) ?? []).length).toBe(3);
    // Still no links: the ask is a button that calls the handler, never a
    // navigation the row could carry on its own.
    expect(html).not.toMatch(/<a\b/);
  });

  test("a pending row reads Asking… and every button is disabled meanwhile", () => {
    const html = render(rows, "Riverside", {
      onAskToJoin: () => {},
      pendingProgramId: "p-2",
    });
    const buttons = [...html.matchAll(/<button[^>]*>[^<]*<\/button>/g)].map(
      (m) => m[0],
    );
    expect(buttons).toHaveLength(3);
    for (const button of buttons)
      expect(button).toMatch(/\sdisabled(=""|\s|>)/);
    expect(buttons.filter((b) => b.includes(">Asking…<"))).toHaveLength(1);
    expect(buttons.filter((b) => b.includes(">Ask to join<"))).toHaveLength(2);
    expect(buttons.find((b) => b.includes(">Asking…<"))).toContain(
      "Riverside Tennis Club",
    );
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
