import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import {
  EMPTY_MATCH_FILTERS,
  MATCH_FILTER_KEYS,
  MATCH_FILTER_OPTIONS,
  MATCH_FILTER_SECTIONS,
  optionAvailability,
  type MatchFilterAvailability,
  type MatchFilterContext,
  type MatchFilters,
} from "@/components/dashboard/matches/match-detail/match-filters/model";
import {
  canApply,
  draftClear,
  draftToggle,
  initialOpenSections,
  isOptionSelected,
  panelActions,
  panelSections,
} from "@/components/dashboard/matches/match-detail/match-filters/panel-draft";

import { pt } from "./fixtures/film-point";
import { createLoader } from "./fixtures/vm-modules";

/**
 * T5 — the shared match FiltersPanel (`match-filters/filters-panel.tsx`).
 *
 * The component renders FOR REAL through `createLoader()` (Playwright's JSX
 * transform breaks `renderToStaticMarkup` on an imported .tsx). A static
 * render cannot click, so the draft/apply behaviour is held through the pure
 * `panel-draft.ts` the component drives its handlers from.
 */

const loader = createLoader();
const { FiltersPanel } = loader.load(
  "src/components/dashboard/matches/match-detail/match-filters/filters-panel.tsx",
) as { FiltersPanel: React.ComponentType<Record<string, unknown>> };

const CTX: MatchFilterContext = {
  youIsPlayer1: true,
  hands: { player1: "right", player2: "right" },
};

/** Every catalog option available, and two sets. */
function fullAvailability(): MatchFilterAvailability {
  const out: Record<string, Set<unknown>> = {};
  for (const key of MATCH_FILTER_KEYS) {
    out[key] = new Set(
      key === "sets" ? [1, 2] : MATCH_FILTER_OPTIONS[key].map((o) => o.value),
    );
  }
  return out as unknown as MatchFilterAvailability;
}

function emptyAvailability(): MatchFilterAvailability {
  const out: Record<string, Set<unknown>> = {};
  for (const key of MATCH_FILTER_KEYS) out[key] = new Set();
  return out as unknown as MatchFilterAvailability;
}

function render(
  availability: MatchFilterAvailability,
  filters: MatchFilters = EMPTY_MATCH_FILTERS,
  extra: Record<string, unknown> = {},
) {
  return renderToStaticMarkup(
    React.createElement(FiltersPanel, {
      filters,
      availability,
      youName: "Rudy Quan",
      oppName: "Federico Gomez",
      onApply: () => {},
      ...extra,
    }),
  );
}

const text = (html: string) =>
  html
    .replace(/<[^>]+>/g, " ")
    .replace(/&#x27;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();

/** The markup of one section, from its `data-section` wrapper to the next. */
function sectionHtml(html: string, id: string): string {
  const start = html.indexOf(`data-section="${id}"`);
  if (start === -1) return "";
  const rest = html.slice(start + 1);
  const next = rest.search(/data-section="/);
  return next === -1 ? rest : rest.slice(0, next);
}

/** The text labels of every pill (a `<button aria-pressed>`) in `html`. */
function pillLabels(html: string): string[] {
  return [
    ...html.matchAll(/<button[^>]*aria-pressed="[^"]*"[^>]*>([^<]*)</g),
  ].map((m) => m[1]);
}

test.describe("FiltersPanel markup", () => {
  test("title, Clear all, and sections in order Score, Serve, Return, Result, Custom", () => {
    const html = render(fullAvailability());
    expect(html).toContain(">Filters</h2>");
    const order = [...html.matchAll(/data-section="([a-z]+)"/g)].map(
      (m) => m[1],
    );
    expect(order).toEqual(["score", "serve", "return", "result", "custom"]);
    const headers = [
      ...html.matchAll(
        /<button[^>]*aria-expanded="(?:true|false)"[^>]*>([^<]*)</g,
      ),
    ].map((m) => m[1]);
    expect(headers).toEqual(["Score", "Serve", "Return", "Result", "Custom"]);
  });

  test("group labels and option labels come from the catalog, with player names", () => {
    const html = render(fullAvailability());
    const groupLabels = (id: string) =>
      [
        ...sectionHtml(html, id).matchAll(
          /<span id="[^"]*" class="text-micro">([^<]*)<\/span>/g,
        ),
      ].map((m) => m[1]);
    expect(groupLabels("score")).toEqual(["Sets", "Type", "Points"]);
    expect(groupLabels("serve")).toEqual([
      "Player",
      "Side",
      "Type",
      "Spin",
      "Zone",
    ]);
    expect(groupLabels("return")).toEqual([
      "Player",
      "Side",
      "Type",
      "Spin",
      "Zone",
      "Contact",
    ]);
    // The Result row is "Shot" (the mockup's "Zone" was a typo).
    expect(groupLabels("result")).toEqual(["Player", "Shot", "Outcome"]);
    expect(groupLabels("custom")).toEqual([
      "Choose Player",
      "Side",
      "Direction",
      "Rally Shot",
    ]);

    const score = pillLabels(sectionHtml(html, "score"));
    expect(score).toEqual(
      expect.arrayContaining(["Set 1", "Set 2", "Pressure", "Match Point"]),
    );
    expect(score).toEqual(
      expect.arrayContaining(["0-0", "40-40", "Ad-40", "40-Ad"]),
    );

    const serve = pillLabels(sectionHtml(html, "serve"));
    expect(serve.slice(0, 2)).toEqual(["Rudy Quan", "Federico Gomez"]);
    expect(serve).toEqual(
      expect.arrayContaining(["First Serve", "Second Serve", "Kick", "T"]),
    );

    const result = pillLabels(sectionHtml(html, "result"));
    expect(result).toEqual([
      "Rudy Quan",
      "Federico Gomez",
      "Serve",
      "Return",
      "Forehand",
      "Backhand",
      "Volley",
      "Overhead",
      "Won",
      "Lost",
      "Winner",
      "Error",
    ]);
    expect(text(html)).not.toContain("Winnner");

    const custom = pillLabels(sectionHtml(html, "custom"));
    expect(custom.slice(-12)).toEqual([
      "1",
      "2",
      "3",
      "4",
      "5",
      "6",
      "7",
      "8",
      "9",
      "10",
      "11",
      "12",
    ]);
  });

  test("a match with no Ad scores draws no Ad-40/40-Ad, and empty groups are gone", () => {
    const points = [
      pt({
        id: "a",
        setNumber: 1,
        pointScoreRaw: "30-30",
        firstShotZone: "Wide",
      }),
      pt({ id: "b", setNumber: 2, pointScoreRaw: "40-15", firstShotZone: "T" }),
    ];
    const availability = optionAvailability(points, CTX);
    const html = render(availability);
    const score = pillLabels(sectionHtml(html, "score"));
    expect(score).toContain("30-30");
    expect(score).toContain("40-15");
    expect(score).not.toContain("Ad-40");
    expect(score).not.toContain("40-Ad");
    expect(score).not.toContain("0-0");
    expect(score).toEqual(expect.arrayContaining(["Set 1", "Set 2"]));

    const serve = pillLabels(sectionHtml(html, "serve"));
    expect(serve).toContain("Wide");
    expect(serve).not.toContain("Body");

    // No return contact was measured → the Contact group is not drawn at all.
    expect(sectionHtml(html, "return")).not.toContain(">Contact<");
    // No shot rows → no Custom rally shots → no Rally Shot group.
    expect(html).not.toContain(">Rally Shot<");
  });

  test("a group emptied by availability is not drawn; a one-set match has no Sets", () => {
    const av = fullAvailability() as unknown as Record<string, Set<unknown>>;
    av.returnContact = new Set();
    av.sets = new Set([1]);
    const html = render(av as unknown as MatchFilterAvailability);
    expect(sectionHtml(html, "return")).not.toContain(">Contact<");
    expect(sectionHtml(html, "return")).toContain(">Zone<");
    expect(html).not.toContain(">Sets<");
    expect(html).not.toContain("Set 1");
  });

  test("nothing filterable reads as one honest line, not a blank box", () => {
    const html = render(emptyAvailability());
    expect(html).not.toContain("data-section=");
    expect(text(html)).toContain("No filterable points in this match.");
  });

  test("pills are rounded-full toggles with aria-pressed", () => {
    const html = render(fullAvailability(), {
      ...EMPTY_MATCH_FILTERS,
      serveZone: ["T"],
    });
    const pills = [
      ...html.matchAll(/<button[^>]*aria-pressed="(true|false)"[^>]*>/g),
    ];
    expect(pills.length).toBeGreaterThan(50);
    for (const [tag] of pills) expect(tag).toContain("rounded-full");
    expect(html).toMatch(/<button[^>]*aria-pressed="true"[^>]*>T</);
  });

  test("Clear all is a blue text action with no icon; Apply is the advButton primary", () => {
    const html = render(fullAvailability());
    const clear = html.match(/<button[^>]*>Clear all<\/button>/)?.[0] ?? "";
    expect(clear).not.toBe("");
    expect(clear).toContain("text-[var(--blue)]");
    expect(clear).toContain("hover:text-[var(--blue-hover)]");
    expect(clear).not.toContain("<svg");
    expect(clear).not.toContain("border");
    expect(clear).not.toContain("rounded");

    const apply = html.match(/<button[^>]*>Apply<\/button>/)?.[0] ?? "";
    expect(apply).toContain("bg-[var(--blue)]");
    expect(apply).toContain("rounded-[var(--radius-button)]");
    // Nothing to commit yet: the draft equals the applied filters.
    expect(apply).toContain("disabled");
  });

  test("a section holding an applied filter starts open; the rest start closed", () => {
    const html = render(fullAvailability(), {
      ...EMPTY_MATCH_FILTERS,
      resultOutcome: ["winner"],
    });
    const expanded = [
      ...html.matchAll(/aria-expanded="(true|false)"[^>]*>([^<]*)</g),
    ].map((m) => [m[2], m[1]]);
    expect(Object.fromEntries(expanded)).toEqual({
      Score: "false",
      Serve: "false",
      Return: "false",
      Result: "true",
      Custom: "false",
    });
  });
});

test.describe("FiltersPanel draft", () => {
  const serveGroup = MATCH_FILTER_SECTIONS.find((s) => s.id === "serve")!
    .groups[0];
  const returnGroup = MATCH_FILTER_SECTIONS.find((s) => s.id === "return")!
    .groups[0];

  test("picking the Serve player shows the other player selected under Return", () => {
    const draft = draftToggle(EMPTY_MATCH_FILTERS, serveGroup, "you");
    expect(draft.server).toBe("you");
    expect(isOptionSelected(draft, serveGroup, "you")).toBe(true);
    // Return › Player reads the returner: the opponent.
    expect(isOptionSelected(draft, returnGroup, "opponent")).toBe(true);
    expect(isOptionSelected(draft, returnGroup, "you")).toBe(false);

    // And the other way round: picking yourself as the returner stores the
    // opponent as server.
    const back = draftToggle(EMPTY_MATCH_FILTERS, returnGroup, "you");
    expect(back.server).toBe("opponent");
    expect(isOptionSelected(back, serveGroup, "opponent")).toBe(true);
  });

  test("the rendered Return player pill is pressed for the opponent when you serve", () => {
    const html = render(fullAvailability(), {
      ...EMPTY_MATCH_FILTERS,
      server: "you",
    });
    expect(sectionHtml(html, "serve")).toMatch(
      /aria-pressed="true"[^>]*>Rudy Quan</,
    );
    expect(sectionHtml(html, "return")).toMatch(
      /aria-pressed="true"[^>]*>Federico Gomez</,
    );
    expect(sectionHtml(html, "return")).toMatch(
      /aria-pressed="false"[^>]*>Rudy Quan</,
    );
  });

  test("Return player availability follows the other side of `server`", () => {
    const av = fullAvailability() as unknown as Record<string, Set<unknown>>;
    av.server = new Set(["you"]); // only you ever served
    const sections = panelSections(av as unknown as MatchFilterAvailability, {
      you: "Rudy Quan",
      opponent: "Federico Gomez",
    });
    const players = (id: string) =>
      sections.find((s) => s.id === id)!.groups[0].options.map((o) => o.label);
    expect(players("serve")).toEqual(["Rudy Quan"]);
    // So only the opponent ever returned.
    expect(players("return")).toEqual(["Federico Gomez"]);
  });

  test("Clear all resets the draft to EMPTY_MATCH_FILTERS", () => {
    expect(draftClear()).toBe(EMPTY_MATCH_FILTERS);
  });

  test("only Apply calls onApply, with the draft", () => {
    let draft: MatchFilters = { ...EMPTY_MATCH_FILTERS, sets: [1] };
    const setDraft = (update: (prev: MatchFilters) => MatchFilters) => {
      draft = update(draft);
    };
    const applied: MatchFilters[] = [];
    const onApply = (next: MatchFilters) => applied.push(next);

    panelActions(draft, setDraft, onApply).toggle(serveGroup, "opponent");
    expect(draft.server).toBe("opponent");
    panelActions(draft, setDraft, onApply).clear();
    expect(draft).toBe(EMPTY_MATCH_FILTERS);
    panelActions(draft, setDraft, onApply).toggle(returnGroup, "you");
    expect(applied).toEqual([]);

    panelActions(draft, setDraft, onApply).apply();
    expect(applied).toHaveLength(1);
    expect(applied[0].server).toBe("opponent");
  });

  test("Apply is enabled only when the draft would change the applied filters", () => {
    const applied = {
      ...EMPTY_MATCH_FILTERS,
      serveZone: ["T", "Wide"] as const,
    };
    expect(canApply(applied, applied)).toBe(false);
    // Same members, different order → no change.
    expect(canApply({ ...applied, serveZone: ["Wide", "T"] }, applied)).toBe(
      false,
    );
    expect(canApply(draftClear(), applied)).toBe(true);
  });

  test("with nothing applied, the first shown section opens", () => {
    const shown = panelSections(fullAvailability(), {
      you: "a",
      opponent: "b",
    });
    expect(initialOpenSections(EMPTY_MATCH_FILTERS, shown)).toEqual(["score"]);
  });
});
