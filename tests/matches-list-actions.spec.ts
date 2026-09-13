import { test, expect } from "@playwright/test";
import {
  ACTIONS_LANE,
  TEAM_LIST_GRID_COLS,
} from "../src/components/dashboard/matches/match-card-list";
import { matchesFilterGroups } from "../src/lib/data/match-filters";
test("roster selections union while other facets intersect", () => {
  const filters = [
    { key: "player", value: "Dana" },
    { key: "player", value: "Sam" },
    { key: "court", value: "Hard" },
  ];
  const rows = [
    { player: "Dana", court: "Hard" },
    { player: "Sam", court: "Hard" },
    { player: "Dana", court: "Clay" },
    { player: "Alex", court: "Hard" },
  ];
  expect(
    rows.filter((row) =>
      matchesFilterGroups(
        row,
        filters,
        (item, filter) =>
          item[filter.key as keyof typeof item] === filter.value,
      ),
    ),
  ).toEqual(rows.slice(0, 2));
  expect(matchesFilterGroups(rows[0], [], () => false)).toBe(true);
});

test("desktop action trigger receives pointer above the stretched match link", async ({
  page,
}) => {
  // Same stretched-link geometry as MatchCardList. Import the action lane
  // rather than hard-coding its positioning so removing the fix fails this test.
  const row = `<div class="relative grid items-center gap-x-4 h-[52px]" style="grid-template-columns:${TEAM_LIST_GRID_COLS.gridTemplateColumns}">
    <span>Sep 10</span><span>Dana Brooks</span>
    <a href="/dashboard/matches/test" class="after:absolute after:inset-0">Sam Reid</a>
    <span>Season opener</span><span>6–4</span><span>Won</span><span></span>
    <span class="${ACTIONS_LANE}"><button aria-label="Match actions">…</button></span><span>›</span>
  </div>`;
  // Critical Tailwind utilities used by the real rendered row, isolated from auth.
  await page.setContent(`<style>
    .relative { position:relative } .grid { display:grid } .items-center { align-items:center }
    .gap-x-4 { column-gap:16px } .h-\\[52px\\] { height:52px }
    .z-\\[1\\] { z-index:1 } .after\\:absolute::after { content:''; position:absolute }
    .after\\:inset-0::after { inset:0 } .size-\\[13px\\] { width:13px; height:13px }
    svg { width:14px; height:14px } body { width:1200px }
  </style>${row}`);
  const button = page.getByRole("button", { name: "Match actions" });
  await expect(button).toBeVisible();
  const intercepted = await button.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return !element.contains(
      document.elementFromPoint(
        rect.x + rect.width / 2,
        rect.y + rect.height / 2,
      ),
    );
  });
  expect(intercepted).toBe(false);
});
