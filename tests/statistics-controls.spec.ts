import { expect, test } from "@playwright/test";
import * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";

import type { DbStatRow } from "@/lib/data/player-profile";
import {
  toStatisticsMatches,
  type StatisticsMatch,
  type StatisticsMatchRow,
} from "@/lib/data/statistics";
import type { StatisticsContextValue } from "@/components/dashboard/statistics/statistics-provider";
import {
  applyStatisticsFilters,
  parseStatisticsSearch,
  serializeStatisticsSearch,
  type StatisticsSearchState,
} from "@/components/dashboard/statistics/statistics-search";
import { createLoader } from "./fixtures/vm-modules";

/**
 * The Statistics controls row, offline: the real `StatisticsControls` inside
 * a real `StatisticsProvider`, rendered through `fixtures/vm-modules`.
 *
 * The row keeps no state — it draws the URL and patches it — so every test
 * here starts from a query string and ends at one. The popover is the one
 * stub in the markup tests: a closed Radix popover renders its trigger and
 * nothing else on the server, and the panel's segments are what is asserted.
 */

const DIR = "src/components/dashboard/statistics/";
const ME = "user-me";

function row(overrides: Partial<StatisticsMatchRow>): StatisticsMatchRow {
  return {
    id: "m",
    date: "2026-03-01",
    player1_id: ME,
    player2_id: null,
    player1_name: "Me Myself",
    player2_name: "Olivia Opponent",
    created_by: ME,
    score: null,
    court_type: "hard",
    opponent_hand: "right",
    opponent_backhand: "two-handed",
    source_provider: null,
    ...overrides,
  };
}

function season(rows: StatisticsMatchRow[]): StatisticsMatch[] {
  return toStatisticsMatches(
    rows,
    rows.map(
      (each) =>
        ({ match_id: each.id, is_player1: true }) as unknown as DbStatRow,
    ),
    [ME],
    ME,
  );
}

/** Three opponents; one left-hander, one one-hander, two surfaces. */
const SEASON = season([
  row({ id: "a", date: "2026-01-18" }),
  row({
    id: "b",
    date: "2026-05-02",
    player2_name: "Marcus Hale",
    opponent_hand: "left",
    opponent_backhand: "one-handed",
  }),
  row({
    id: "c",
    date: "2026-09-28",
    player2_name: "Priya Nair",
    court_type: "Clay",
  }),
  row({ id: "d", date: "2026-09-30", player2_name: "Marcus Hale" }),
]);

/** Inline stand-ins for the popover, so an open panel is in the markup. */
const inline = ({ children }: { children?: React.ReactNode }) =>
  React.createElement(React.Fragment, null, children);
const POPOVER = {
  Popover: inline,
  PopoverTrigger: inline,
  PopoverAnchor: inline,
  PopoverContent: ({
    children,
    "aria-label": label,
  }: {
    children?: React.ReactNode;
    "aria-label"?: string;
  }) =>
    React.createElement(
      "div",
      { role: "dialog", "aria-label": label },
      children,
    ),
};

type Controls = {
  StatisticsControls: React.ComponentType;
  opponentTypeSummary: (state: StatisticsSearchState) => string;
};
type Provider = {
  StatisticsProvider: React.ComponentType<{
    value: StatisticsContextValue;
    children?: React.ReactNode;
  }>;
};

/** What the last `setState` left in the URL, serialized. */
let url: string | null = null;

function value(query: string, all: StatisticsMatch[]): StatisticsContextValue {
  const state = parseStatisticsSearch(new URLSearchParams(query));
  return {
    all,
    filtered: applyStatisticsFilters(all, state),
    points: [],
    state,
    setState: (patch) => {
      url = serializeStatisticsSearch({ ...state, ...patch });
    },
  };
}

function render(
  query: string,
  all: StatisticsMatch[] = SEASON,
  stubs: Record<string, unknown> = { "@/components/ui/popover": POPOVER },
) {
  const loader = createLoader({ stubs });
  const { StatisticsControls } = loader.load(
    DIR + "statistics-controls.tsx",
  ) as Controls;
  const { StatisticsProvider } = loader.load(
    DIR + "statistics-provider.tsx",
  ) as Provider;
  return renderToStaticMarkup(
    React.createElement(
      StatisticsProvider,
      { value: value(query, all) },
      React.createElement(StatisticsControls),
    ),
  );
}

/** The props each stubbed control was rendered with. */
type Captured = {
  panel: Record<string, (...args: unknown[]) => unknown> | null;
  selects: Record<string, { onChange: (next: string) => void }>;
};

function capture(query: string): Captured {
  const captured: Captured = { panel: null, selects: {} };
  render(query, SEASON, {
    "@/components/dashboard/matches/matches-filter-panel": {
      MatchesFilterPanel: (props: Captured["panel"]) => {
        captured.panel = props;
        return null;
      },
    },
    "@/components/ui/menu-select": {
      MenuSelect: (props: {
        label: string;
        onChange: (next: string) => void;
      }) => {
        captured.selects[props.label] = props;
        return null;
      },
    },
  });
  return captured;
}

const text = (html: string) =>
  html
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The label of the one checked radio inside the named group. */
function checked(html: string, group: string): string | undefined {
  const start = html.indexOf(group);
  expect(start, group).toBeGreaterThan(-1);
  const body = html.slice(start, html.indexOf("</div>", start));
  const hits = [
    ...body.matchAll(/role="radio" aria-checked="true"[^>]*>([^<]*)</g),
  ];
  expect(hits.length, `${group}: one checked radio`).toBe(1);
  return hits[0][1];
}

/** What a select's trigger shows as its value. */
const selected = (html: string, label: string) =>
  html.match(
    new RegExp(`<button[^>]*aria-label="${label}"[^>]*><span[^>]*>([^<]*)<`),
  )?.[1];

test.describe("the row at rest", () => {
  const html = render("");

  test("four labelled controls, in the frame's order", () => {
    const labels = [
      ">Opponent</span>",
      ">Opponent type</span>",
      ">Matches</span>",
      ">Rolling window, in matches</span>",
    ].map((label) => html.indexOf(label));
    expect(labels.every((at) => at > -1)).toBe(true);
    expect([...labels].sort((a, b) => a - b)).toEqual(labels);
  });

  test("each control shows its default", () => {
    expect(selected(html, "Opponent")).toBe("All opponents");
    expect(html).toContain(
      '<span class="truncate">Any hand, any backhand</span>',
    );
    expect(selected(html, "Matches")).toBe("All 4 analyzed");
    expect(checked(html, 'role="radiogroup" aria-labelledby')).toBe("5");
  });

  test("the rolling window is a radio group of Off / 3 / 5 / 10 pills", () => {
    const group = html.slice(html.indexOf('role="radiogroup" aria-labelledby'));
    const pills = [
      ...group
        .slice(0, group.indexOf("</div>"))
        .matchAll(/<button[^>]*role="radio"[^>]*>([^<]*)</g),
    ];
    expect(pills.map((pill) => pill[1])).toEqual(["Off", "3", "5", "10"]);
    for (const pill of pills) expect(pill[0]).toContain("rounded-full");
    expect(group).toContain("h-[30px] w-[200px] items-center gap-1");
  });

  test("the opponent menu lists each opponent once, after All opponents", () => {
    const menu = capture("");
    expect(
      (
        menu.selects["Opponent"] as unknown as {
          options: { label: string }[];
        }
      ).options.map((option) => option.label),
    ).toEqual([
      "All opponents",
      "Marcus Hale",
      "Olivia Opponent",
      "Priya Nair",
    ]);
    expect(
      (
        menu.selects["Matches"] as unknown as {
          options: { label: string }[];
        }
      ).options.map((option) => option.label),
    ).toEqual(["All 4 analyzed", "Last 5", "Last 10", "Last 20"]);
  });

  test("the panel is the Matches filter panel: Opponent rows, Court list, count", () => {
    expect(html).toContain('role="dialog" aria-label="Filter statistics"');
    expect(html).toContain('role="radiogroup" aria-label="Hand"');
    expect(html).toContain('role="radiogroup" aria-label="Backhand"');
    const panel = text(html.slice(html.indexOf('role="dialog"')));
    expect(panel).toContain("Opponent Hand Any Right Left");
    expect(panel).toContain("Backhand Any One-hand Two-hand");
    // Read off the matches, one row per surface whatever its casing.
    expect(panel).toContain("Court Clay Hard");
    expect(panel).toContain("4 of 4 matches");
    // Nothing applied: no line under the row, and nothing to clear.
    expect(html).not.toContain("Clear filters");
  });
});

test.describe("the row is the URL", () => {
  const html = render("hand=left&window=3&opponent=Marcus+Hale");

  test("the checked pill, the active segment and the selected opponent", () => {
    expect(checked(html, 'role="radiogroup" aria-labelledby')).toBe("3");
    expect(checked(html, 'role="radiogroup" aria-label="Hand"')).toBe("Left");
    expect(checked(html, 'role="radiogroup" aria-label="Backhand"')).toBe(
      "Any",
    );
    expect(selected(html, "Opponent")).toBe("Marcus Hale");
  });

  test("the trigger states the cut, and the count answers it", () => {
    expect(html).toContain(
      '<span class="truncate">Left-handed opponents</span>',
    );
    expect(text(html)).toContain("1 of 4 matches Clear filters");
  });

  test("a court ticks one row and joins the sentence", () => {
    const clay = render("courtType=clay&matches=10");
    expect(clay.match(/role="checkbox" aria-checked="true"/g)).toHaveLength(1);
    expect(clay).toMatch(
      /role="checkbox" aria-checked="true"[^>]*>.*?<span[^>]*>Clay<\/span>/,
    );
    expect(clay).toContain("Any hand, any backhand · Clay</span>");
    expect(selected(clay, "Matches")).toBe("Last 10");
  });
});

test.describe("the opponent-type sentence", () => {
  const { opponentTypeSummary } = createLoader().load(
    DIR + "statistics-controls.tsx",
  ) as Controls;
  const sentence = (query: string) =>
    opponentTypeSummary(parseStatisticsSearch(new URLSearchParams(query)));

  test("hand and backhand together are the Matches page's scouting phrase", () => {
    expect(sentence("hand=left&backhand=one-handed")).toBe(
      "Left-handed opponents with a one-handed backhand",
    );
    expect(sentence("hand=right&backhand=two-handed")).toBe(
      "Right-handed opponents with a two-handed backhand",
    );
    expect(render("hand=left&backhand=one-handed")).toContain(
      '<span class="truncate">Left-handed opponents with a one-handed backhand</span>',
    );
  });

  test("one alone is its half; neither is the resting label", () => {
    expect(sentence("hand=right")).toBe("Right-handed opponents");
    expect(sentence("backhand=two-handed")).toBe(
      "Opponents with a two-handed backhand",
    );
    expect(sentence("")).toBe("Any hand, any backhand");
  });

  test("the Matches page reads its strip from the same helper", () => {
    const source = createLoader().load(
      "src/components/dashboard/matches/opponent-type-phrase.ts",
    ) as {
      opponentTypePhrase: (
        hand: string | null,
        backhand: string | null,
      ) => unknown;
    };
    expect(source.opponentTypePhrase("left", "one-handed")).toBe(
      sentence("hand=left&backhand=one-handed"),
    );
    expect(source.opponentTypePhrase(null, null)).toBeNull();
  });
});

test.describe("every change is a setState patch", () => {
  test("a facet's neutral option removes its param", () => {
    const { panel } = capture("hand=left&backhand=one-handed&window=3");
    url = null;
    panel!.onSelectSegment("hand", null);
    expect(url).toBe("backhand=one-handed&window=3");
    panel!.onSelectSegment("backhand", null);
    expect(url).toBe("hand=left&window=3");
  });

  test("a segment replaces its facet and leaves the rest of the URL", () => {
    const { panel } = capture("hand=left&opponent=Marcus+Hale");
    panel!.onSelectSegment("hand", "right");
    expect(url).toBe("opponent=Marcus+Hale&hand=right");
    expect(panel!.segmentedValue("hand")).toBe("left");
    expect(panel!.segmentedValue("backhand")).toBeNull();
  });

  test("the court list holds one court: another moves it, the same clears it", () => {
    const { panel } = capture("courtType=clay");
    expect(panel!.isChecklistActive("courtType", "clay")).toBe(true);
    expect(panel!.isChecklistActive("courtType", "hard")).toBe(false);
    panel!.onToggleChecklist("courtType", "hard");
    expect(url).toBe("courtType=hard");
    panel!.onToggleChecklist("courtType", "clay");
    expect(url).toBe("");
  });

  test("Clear all clears the panel's facets, not the row's other controls", () => {
    const { panel } = capture(
      "opponent=Marcus+Hale&hand=left&courtType=hard&matches=5",
    );
    expect(panel!.hasActive).toBe(true);
    panel!.onClear();
    expect(url).toBe("opponent=Marcus+Hale&matches=5");
  });

  test("All opponents and All analyzed remove their params", () => {
    const { selects } = capture("opponent=Marcus+Hale&matches=10&stat=aces");
    selects["Opponent"].onChange("");
    expect(url).toBe("matches=10&stat=aces");
    selects["Matches"].onChange("all");
    expect(url).toBe("opponent=Marcus+Hale&stat=aces");
    selects["Opponent"].onChange("Priya Nair");
    expect(url).toBe("opponent=Priya+Nair&matches=10&stat=aces");
    selects["Matches"].onChange("20");
    expect(url).toBe("opponent=Marcus+Hale&matches=20&stat=aces");
  });
});

test.describe("a facet no match carries is not offered", () => {
  const bare = (overrides: Partial<StatisticsMatchRow>) =>
    season([
      row({
        id: "x",
        opponent_hand: null,
        opponent_backhand: null,
        court_type: null,
        ...overrides,
      }),
    ]);

  test("no hand on any match: no Hand row", () => {
    const html = render("", bare({ opponent_backhand: "one-handed" }));
    expect(html).not.toContain('aria-label="Hand"');
    expect(html).toContain('aria-label="Backhand"');
    expect(html).not.toContain('role="checkbox"');
  });

  test("no backhand on any match: no Backhand row", () => {
    const html = render("", bare({ opponent_hand: "left" }));
    expect(html).toContain('aria-label="Hand"');
    expect(html).not.toContain('aria-label="Backhand"');
  });

  test("no court on any match: no Court list", () => {
    const html = render("", bare({ opponent_hand: "left" }));
    expect(text(html)).not.toContain("Court");
    const courts = render("", bare({ court_type: "grass" }));
    expect(text(courts)).toContain("Court Grass");
    expect(courts).not.toContain('role="radiogroup" aria-label="');
  });

  test("nothing to choose between: the control stays, and cannot open", () => {
    for (const all of [bare({}), []]) {
      const html = render("", all);
      expect(html).not.toContain('aria-label="Filter statistics"');
      expect(html).toMatch(
        /<button[^>]*disabled=""[^>]*aria-label="Opponent type: Any hand, any backhand"/,
      );
      expect(html).toContain(">Opponent type</span>");
    }
    // Day zero: no count to put in the label.
    expect(selected(render("", []), "Matches")).toBe("All analyzed");
  });
});
