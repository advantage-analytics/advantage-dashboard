import { expect, test, type Locator, type Page } from "@playwright/test";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

/**
 * The Approaches cut's Filters panel and applied sentence (plan step 9),
 * through the real `ShotsTab` → `VizLightbox` over the shared net-point
 * match (`fixtures/viz-approach-filters-harness.tsx`): the panel's three
 * checklist groups, the card's baseline (`entry: ["approach"]`) kept out of
 * the strip, Clear going back to approaches only, and the right-handed
 * caveat.
 */

let origin: string;
let close: () => Promise<void>;

test.beforeAll(async () => {
  ({ origin, close } = await startStyledHarness(
    "tests/fixtures/viz-approach-filters-harness.tsx",
  ));
});

test.afterAll(async () => {
  await close?.();
});

const APPROACH_SECTIONS = ["Way to the net", "Approach to", "Direction"];

/** Opens the Approaches wall card, as a reader does. */
async function openApproaches(page: Page, query = "") {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots${query}`);
  await page.getByRole("link", { name: /^Approaches, / }).click();
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  return { dialog, errors };
}

async function openPanel(page: Page) {
  await page
    .getByRole("dialog")
    .first()
    .getByRole("button", { name: "Filters" })
    .click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await expect(panel).toBeVisible();
  return panel;
}

test("the approaches cut's panel has three checklist groups; no other cut has them", async ({
  page,
}) => {
  const { errors } = await openApproaches(page);
  const panel = await openPanel(page);
  const labels = panel.locator("[data-filter-panel-sections] p");
  for (const label of APPROACH_SECTIONS)
    await expect(
      labels.filter({ hasText: new RegExp(`^${label}$`) }),
    ).toHaveCount(1);

  // Checklists, not segmented rows: every option is a checkbox, none a radio.
  for (const name of [
    /^Approach\b/,
    /^Serve and volley\b/,
    /^Drawn in\b/,
    /^Their backhand\b/,
    /^Middle\b/,
    /^Their forehand\b/,
    /^Crosscourt\b/,
    /^Down the line\b/,
  ])
    await expect(panel.getByRole("checkbox", { name })).not.toHaveCount(0);
  await expect(panel.getByRole("checkbox", { name: /^Middle\b/ })).toHaveCount(
    2,
  );
  for (const name of ["Their backhand", "Crosscourt", "Approach"])
    await expect(panel.getByRole("radio", { name })).toHaveCount(0);
  // The card is approaches: its own tick is on, the others off.
  await expect(
    panel.getByRole("checkbox", { name: /^Approach\b/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    panel.getByRole("checkbox", { name: /^Serve and volley\b/ }),
  ).toHaveAttribute("aria-checked", "false");
  await page.keyboard.press("Escape");

  // Every other cut: none of the three.
  for (const cut of [
    "serve",
    "returnPlacement",
    "returnContact",
    "rallyPlacement",
    "errors",
  ]) {
    await page.goto(`${origin}/?tab=shots&cut=${cut}`);
    const other = await openPanel(page);
    for (const label of APPROACH_SECTIONS)
      await expect(other).not.toContainText(label);
    await page.keyboard.press("Escape");
  }
  expect(errors).toEqual([]);
});

test("the approaches menu leads with its three groups, then Rally length, Pressure, Court, Set, with Advanced filters last", async ({
  page,
}) => {
  const { errors } = await openApproaches(page);
  const panel = await openPanel(page);
  const labels = (
    await panel
      .locator("[data-filter-panel-sections] > div > p")
      .allTextContents()
  ).filter((l) => l !== "Set");
  // Set shows for a match of two sets or more; Serve (1st · 2nd) stays after
  // the shared run until the toolbar's serve chips replace it.
  expect(labels).toEqual([
    ...APPROACH_SECTIONS,
    "Rally length",
    "Pressure",
    "Court",
    "Serve",
  ]);
  const advancedLast = await panel.evaluate((root) => {
    const sections = root.querySelector("[data-filter-panel-sections]")!;
    const advanced = [...root.querySelectorAll("button")].find((b) =>
      b.textContent?.startsWith("Advanced filters"),
    );
    return (
      advanced !== undefined &&
      !sections.contains(advanced) &&
      Boolean(
        sections.compareDocumentPosition(advanced) &
        Node.DOCUMENT_POSITION_FOLLOWING,
      )
    );
  });
  expect(advancedLast).toBe(true);
  expect(errors).toEqual([]);
});

test("the card's baseline is not an applied filter; Serve and volley is, and Clear returns to approaches only", async ({
  page,
}) => {
  const { dialog, errors } = await openApproaches(page, "&hand=known");
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(page).toHaveURL(/ventry=approach/);
  // Approaches only is the card itself: nothing applied, nothing to clear.
  await expect(strip).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Filters" }),
  ).not.toHaveAttribute("data-engaged", "true");

  // Narrowed on the baseline: the strip names the narrowing alone.
  let panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their backhand\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("To their backhand");
  await expect(strip).not.toContainText("Approach ·");
  await expect(strip).not.toContainText(/^Approach\b/);
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL(/ventry=approach/);
  await expect(page).not.toHaveURL(/vto=/);

  // Serve and volley ticked: an applied filter, named in the strip.
  panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Serve and volley\b/ }).click();
  await expect(page).toHaveURL(/ventry=serve-volley/);
  await page.keyboard.press("Escape");
  await expect(strip).toBeVisible();
  await expect(strip).toContainText("Serve and volley");

  // Clear: back to approaches only — not every net point.
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL(/ventry=approach(&|$)/);
  await expect(page).not.toHaveURL(/serve-volley/);
  panel = await openPanel(page);
  await expect(
    panel.getByRole("checkbox", { name: /^Approach\b/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    panel.getByRole("checkbox", { name: /^Serve and volley\b/ }),
  ).toHaveAttribute("aria-checked", "false");

  // Approach unticked (every way in): named, and Clear undoes it too.
  await panel.getByRole("checkbox", { name: /^Approach\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(strip).toContainText("Way to the net: any");
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  await expect(page).toHaveURL(/ventry=approach/);
  expect(errors).toEqual([]);
});

test("opened by URL with no ventry, the cut is on its baseline: no strip, Filters not engaged, Approach ticked", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=approaches&hand=known`);
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  await expect(page).not.toHaveURL(/ventry=/);
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Filters" }),
  ).not.toHaveAttribute("data-engaged", "true");
  const panel = await openPanel(page);
  await expect(
    panel.getByRole("checkbox", { name: /^Approach\b/ }),
  ).toHaveAttribute("aria-checked", "true");
  await expect(
    panel.getByRole("checkbox", { name: /^Serve and volley\b/ }),
  ).toHaveAttribute("aria-checked", "false");

  // Every way in survives a reload under its own spelling.
  await panel.getByRole("checkbox", { name: /^Approach\b/ }).click();
  await expect(page).toHaveURL(/ventry=any/);
  await page.reload();
  const reloaded = page.getByRole("dialog", { name: "Approaches" });
  await expect(reloaded.locator("[data-viz-filter-strip]")).toContainText(
    "Way to the net: any",
  );
  expect(errors).toEqual([]);
});

test("opened by URL for a player with no approaches, the stage says none are recorded, not that filters hid them", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=approaches&net=never`);
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText(/No approaches recorded for .+ yet/);
  await expect(dialog).not.toContainText("No approaches match these filters");
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the applied sentence says it assumes right-handed only where a shown approach assumed the hand", async ({
  page,
}) => {
  // The opponent's hand is not on the match: the wing words assume it.
  const assumed = await openApproaches(page);
  const strip = assumed.dialog.locator("[data-viz-filter-strip]");
  let panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their backhand\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(strip).toContainText("To their backhand");
  // Said once, in the legend row's line — never again in the strip.
  await expect(strip).not.toContainText(/assumes right-handed/i);
  await expect(handAssumed(assumed.dialog)).toHaveText("assumes right-handed");
  await expect(assumed.dialog.getByText(/assumes right-handed/i)).toHaveCount(
    1,
  );
  // A caveat never opens a strip of its own.
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(strip).toHaveCount(0);
  expect(assumed.errors).toEqual([]);

  // The hand is on the match: no caveat.
  const known = await openApproaches(page, "&hand=known");
  const knownStrip = known.dialog.locator("[data-viz-filter-strip]");
  panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their backhand\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(knownStrip).toContainText("To their backhand");
  await expect(knownStrip).not.toContainText(/assumes right-handed/i);
  expect(known.errors).toEqual([]);
});

const handAssumed = (dialog: Locator) =>
  dialog.locator("[data-viz-hand-assumed]");

test("the opened Approaches court says it assumes right-handed beside its legend with no filter ticked, and only where a drawn approach assumed the hand", async ({
  page,
}) => {
  // The card's floor alone: no filter ticked, so no strip — the line still
  // says the wings assume the opponent's hand.
  const assumed = await openApproaches(page);
  await expect(assumed.dialog.locator("[data-viz-filter-strip]")).toHaveCount(
    0,
  );
  await expect(handAssumed(assumed.dialog)).toHaveCount(1);
  await expect(handAssumed(assumed.dialog)).toBeVisible();
  await expect(handAssumed(assumed.dialog)).toHaveText("assumes right-handed");
  await expect(assumed.dialog.getByText(/assumes right-handed/i)).toHaveCount(
    1,
  );
  expect(assumed.errors).toEqual([]);

  // The hand is on the match: nothing assumed.
  const known = await openApproaches(page, "&hand=known");
  await expect(known.dialog.locator("[data-court-stage]")).toBeVisible();
  await expect(handAssumed(known.dialog)).toHaveCount(0);
  await expect(known.dialog).not.toContainText(/assumes right-handed/i);

  // No approach drawn: no wing was worked out, so nothing was assumed.
  await page.goto(`${origin}/?tab=shots&cut=approaches&landing=none`);
  const bare = page.getByRole("dialog", { name: "Approaches" });
  await expect(bare.locator("[data-viz-not-drawn]")).toHaveCount(1);
  await expect(handAssumed(bare)).toHaveCount(0);
  await expect(bare).not.toContainText(/assumes right-handed/i);

  // Another cut's opened court, same unknown hand: never the line.
  for (const cut of ["serve", "rallyPlacement", "errors"]) {
    await page.goto(`${origin}/?tab=shots&cut=${cut}`);
    const other = page.getByRole("dialog").first();
    await expect(other.locator("[data-court-stage]")).toBeVisible();
    await expect(handAssumed(other)).toHaveCount(0);
    await expect(other).not.toContainText(/assumes right-handed/i);
  }
});

/** The Statistics column's approaches KPI tile: "6 approaches" → 6. */
async function kpiCount(dialog: Locator): Promise<number> {
  const label = await dialog
    .locator("[data-stat-summary] p")
    .first()
    .locator(".sr-only")
    .textContent();
  const match = /^(\d+) .*approach/.exec(label?.trim() ?? "");
  expect(match, `KPI tile reads "${label}"`).not.toBeNull();
  return Number(match![1]);
}

const notDrawn = (dialog: Locator) => dialog.locator("[data-viz-not-drawn]");
const courtMarks = (dialog: Locator) =>
  dialog.locator("[data-court-stage] [data-viz-mark]");

test("approaches with no landing anywhere: the stage says how many are not drawn — the Statistics count — never that none are recorded or filtered", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=approaches&landing=none`);
  const dialog = page.getByRole("dialog", { name: "Approaches" });
  await expect(dialog).toBeVisible();
  await expect(courtMarks(dialog)).toHaveCount(0);
  const n = await kpiCount(dialog);
  expect(n).toBeGreaterThan(0);
  await expect(notDrawn(dialog)).toHaveCount(1);
  await expect(notDrawn(dialog)).toHaveText(
    `${n} not drawn: no landing recorded`,
  );
  await expect(dialog).not.toContainText("No approaches recorded for");
  await expect(dialog).not.toContainText("match these filters");
  expect(errors).toEqual([]);
});

test("some approaches drawn, some not: the line names the undrawn ones beside the drawn marks, and is gone when every approach draws", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=approaches&landing=some`);
  const some = page.getByRole("dialog", { name: "Approaches" });
  await expect(some).toBeVisible();
  // The fixture took the landing off two of your approaches.
  await expect(notDrawn(some)).toHaveText("2 not drawn: no landing recorded");
  await expect(notDrawn(some)).toBeVisible();
  await expect(courtMarks(some).first()).toBeVisible();
  const n = await kpiCount(some);
  expect(n).toBeGreaterThan(2);
  // Not the honest-zero card: the court has marks on it.
  await expect(some).not.toContainText("No approaches recorded for");
  await expect(some).not.toContainText("match these filters");

  // Every counted approach drawn: no line at all.
  await page.goto(`${origin}/?tab=shots&cut=approaches`);
  const all = page.getByRole("dialog", { name: "Approaches" });
  await expect(all).toBeVisible();
  await expect(courtMarks(all).first()).toBeVisible();
  await expect(notDrawn(all)).toHaveCount(0);
  await expect(all).not.toContainText("not drawn");
  expect(errors).toEqual([]);
});

test("another cut's opened court never carries the not-drawn line, even over a match with no landings", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  for (const cut of ["serve", "rallyPlacement", "errors"]) {
    await page.goto(`${origin}/?tab=shots&cut=${cut}&landing=none`);
    const dialog = page.getByRole("dialog").first();
    await expect(dialog).toBeVisible();
    await expect(dialog.locator("[data-court-stage]")).toBeVisible();
    await expect(notDrawn(dialog)).toHaveCount(0);
    await expect(dialog).not.toContainText("not drawn");
  }
  expect(errors).toEqual([]);
});

/* ── The Points pane lists every counted approach (T20) ───────────────── */

/** The fixture's points in match order: `pointNumber` is index + 1. */
const MATCH_ORDER = [
  "serve-volley",
  "passed-dtl",
  "passed-cc",
  "drawn-in",
  "lobbed",
  "opp-error",
  "opp-approach",
  "baseline",
];

/** The KPI tile's count, whatever the cut counts it in ("7 times at the net"). */
async function kpiN(dialog: Locator): Promise<number> {
  const label = await dialog
    .locator("[data-stat-summary] p")
    .first()
    .locator(".sr-only")
    .textContent();
  const match = /^(\d+)\b/.exec(label?.trim() ?? "");
  expect(match, `KPI tile reads "${label}"`).not.toBeNull();
  return Number(match![1]);
}

const pointRows = (dialog: Locator) =>
  dialog.getByRole("list", { name: "Points" }).locator("[data-point-id]");

/** The pane's "N / M" beside the Points chip, as [N, M]. */
async function paneCount(dialog: Locator): Promise<[number, number]> {
  const text = await dialog
    .locator("span.mono.tabular[aria-label]")
    .first()
    .textContent();
  const match = /^\s*(\d+)\s*\/\s*(\d+)\s*$/.exec(text ?? "");
  expect(match, `pane count reads "${text}"`).not.toBeNull();
  return [Number(match![1]), Number(match![2])];
}

/** The applied strip's "N of M …" (`AppliedFilterStrip`'s count). */
const stripCount = (strip: Locator) => strip.locator("span.text-micro.tabular");

async function showPoints(dialog: Locator) {
  await dialog.getByRole("button", { name: "Points", exact: true }).click();
}

async function showStats(dialog: Locator) {
  await dialog.getByRole("button", { name: "Statistics", exact: true }).click();
}

test("no approach has a landing: the Points pane lists every counted one, N / N with N the KPI's, never 'No points to play'", async ({
  page,
}) => {
  const { dialog, errors } = await openApproaches(page, "&landing=none");
  await expect(courtMarks(dialog)).toHaveCount(0);
  const n = await kpiN(dialog);
  expect(n).toBeGreaterThan(0);

  await showPoints(dialog);
  await expect(pointRows(dialog)).toHaveCount(n);
  expect(await paneCount(dialog)).toEqual([n, n]);
  await expect(
    dialog.locator(`[aria-label="${n} of ${n} approaches"]`),
  ).toHaveCount(1);
  await expect(dialog).not.toContainText("No points to play");
  await expect(dialog).not.toContainText("match these filters");
  // In match order.
  const ids = await pointRows(dialog).evaluateAll((rows) =>
    rows.map((r) => r.getAttribute("data-point-id")),
  );
  expect(ids).toEqual(
    [...ids].sort((a, b) => MATCH_ORDER.indexOf(a!) - MATCH_ORDER.indexOf(b!)),
  );
  expect(errors).toEqual([]);
});

test("no approach has a landing: the Statistics pane shows the KPI count and How it ended, and no Approach to group", async ({
  page,
}) => {
  const { dialog, errors } = await openApproaches(page, "&landing=none");
  await expect(courtMarks(dialog)).toHaveCount(0);
  // The pane that opens on Statistics: LightboxStats' own column.
  const pane = dialog.locator("[data-stat-summary]").locator("xpath=..");
  await expect(pane).toHaveCount(1);
  const n = await kpiN(dialog);
  expect(n).toBeGreaterThan(0);
  await expect(pane.locator("[data-stat-summary]")).toContainText(String(n));
  await expect(pane).toContainText("How it ended");
  for (const text of ["Approach to", "Their backhand", "Their forehand"])
    await expect(pane).not.toContainText(text);
  expect(errors).toEqual([]);
});

test("an Approach to wing and a legend pick narrow the Points pane to the count the court and KPI show", async ({
  page,
}) => {
  const { dialog, errors } = await openApproaches(
    page,
    "&landing=some&hand=known",
  );
  const all = await kpiN(dialog);

  // A legend pick (Won): the pane's N is the Won key's count, which counts
  // the undrawn approaches too, so Won + Lost is the KPI's.
  const legend = dialog.getByRole("group", { name: "Filter by outcome" });
  const keyCount = async (name: string) =>
    Number(
      /(\d+)\s*$/.exec(
        (await legend
          .getByRole("button", { name: new RegExp(`^${name}`) })
          .textContent()) ?? "",
      )![1],
    );
  const won = await keyCount("Won");
  const lost = await keyCount("Lost");
  expect(won + lost).toBe(all);
  await showPoints(dialog);
  await legend.getByRole("button", { name: /^Won/ }).click();
  await expect(pointRows(dialog)).toHaveCount(won);
  expect((await paneCount(dialog))[0]).toBe(won);
  await legend.getByRole("button", { name: /^Won/ }).click();
  await expect(pointRows(dialog)).toHaveCount(all);

  // An Approach to wing: an undrawn approach has no wing, so the KPI and
  // the court drop it, and the pane does too.
  const panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their forehand\b/ }).click();
  await page.keyboard.press("Escape");
  await showStats(dialog);
  const wing = await kpiN(dialog);
  expect(wing).toBeLessThan(all);
  await showPoints(dialog);
  await expect(pointRows(dialog)).toHaveCount(wing);
  expect((await paneCount(dialog))[0]).toBe(wing);
  await expect(courtMarks(dialog)).not.toHaveCount(0);
  expect(errors).toEqual([]);
});

test("the second click, or Enter, on the row of an approach with no landing watches that point", async ({
  page,
}) => {
  for (const how of ["click", "enter"] as const) {
    const { dialog, errors } = await openApproaches(
      page,
      "&landing=none&video=1",
    );
    await showPoints(dialog);
    const row = pointRows(dialog).first();
    const id = await row.getAttribute("data-point-id");
    expect(id).not.toBeNull();
    await row.click();
    // The row lights though there is no mark to ring.
    await expect(row).toHaveAttribute("data-playing", "true");
    await expect(row).toContainText("Click again to watch");
    await expect(courtMarks(dialog)).toHaveCount(0);
    expect(new URL(page.url()).searchParams.get("tab")).not.toBe("film");
    if (how === "click") await row.click();
    else await row.press("Enter");
    await expect(page).toHaveURL(/tab=film/);
    expect(new URL(page.url()).searchParams.get("pn")).toBe(
      String(MATCH_ORDER.indexOf(id!) + 1),
    );
    expect(errors).toEqual([]);
  }
});

test("the strip counts what the approaches cut counts — never points — and another cut's still reads points", async ({
  page,
}) => {
  for (const landing of ["", "&landing=none"]) {
    await page.setViewportSize({ width: 1512, height: 982 });
    await page.goto(`${origin}/?tab=shots&cut=approaches&ventry=any${landing}`);
    const dialog = page.getByRole("dialog", { name: "Approaches" });
    await expect(dialog).toBeVisible();
    const strip = dialog.locator("[data-viz-filter-strip]");
    await expect(strip).toContainText("Way to the net: any");
    const n = await kpiN(dialog);
    expect(n).toBeGreaterThan(0);
    // Only the first number must agree with the KPI: the denominator is the
    // cut's widest pool, which `entry` off the card's floor can pass.
    await expect(stripCount(strip)).toHaveText(
      new RegExp(`^${n} of \\d+ times at the net$`),
    );
    await expect(strip).not.toContainText(/points?/);
  }

  // On the card's own entry, narrowed by a wing: approaches, not points.
  const { dialog } = await openApproaches(page, "&landing=some&hand=known");
  const panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their forehand\b/ }).click();
  await page.keyboard.press("Escape");
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(stripCount(strip)).toHaveText(/^\d+ of \d+ approach(es)?$/);
  await expect(strip).not.toContainText(/points?/);

  // Another cut's strip still counts points.
  await page.goto(`${origin}/?tab=shots&cut=serve&ball=first`);
  const serve = page.getByRole("dialog").first();
  await expect(stripCount(serve.locator("[data-viz-filter-strip]"))).toHaveText(
    /^\d+ of \d+ points?$/,
  );
});

/* ── The player switch is not a filter (T21) ─────────────────────────── */

const stage = (dialog: Locator) => dialog.locator("[data-court-stage]");
const statsEmpty = (dialog: Locator) => dialog.locator("[data-stats-empty]");

/** Switches the opened court to the opponent with the player chip. */
async function toOpponent(dialog: Locator) {
  await dialog.getByRole("button", { name: "Rivera", exact: true }).click();
  await expect(dialog).toContainText("Approaches · Rivera");
}

test("switched to an opponent who never came in, with no filter ticked, the stage says none are recorded — no Clear, no strip", async ({
  page,
}) => {
  // Only you came in: you have approaches, the opponent has none.
  const { dialog, errors } = await openApproaches(page, "&net=you");
  await expect(courtMarks(dialog).first()).toBeVisible();
  await toOpponent(dialog);

  await expect(stage(dialog)).toContainText(
    /No approaches recorded for .+ yet/,
  );
  await expect(dialog).not.toContainText("match these filters");
  await expect(
    stage(dialog).getByRole("button", { name: "Clear", exact: true }),
  ).toHaveCount(0);
  await expect(dialog.locator("[data-viz-filter-strip]")).toHaveCount(0);
  expect(errors).toEqual([]);
});

test("a ticked filter nothing matches still reads 'match these filters' with its Clear, on your court and on the opponent's", async ({
  page,
}) => {
  // Your court: you never came in (the wall's card is no link then, so the
  // URL opens it), and a wing is ticked.
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/?tab=shots&cut=approaches&net=never&hand=known`);
  const yours = { dialog: page.getByRole("dialog", { name: "Approaches" }) };
  await expect(yours.dialog).toBeVisible();
  let panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their backhand\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(stage(yours.dialog)).toContainText(
    "No approaches match these filters",
  );
  await expect(
    stage(yours.dialog).getByRole("button", { name: "Clear", exact: true }),
  ).toHaveCount(1);
  expect(errors).toEqual([]);

  // The opponent's court: they never came in, and a wing is ticked.
  const theirs = await openApproaches(page, "&net=you&hand=known");
  await toOpponent(theirs.dialog);
  panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their backhand\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(stage(theirs.dialog)).toContainText(
    "No approaches match these filters",
  );
  const clear = stage(theirs.dialog).getByRole("button", {
    name: "Clear",
    exact: true,
  });
  await expect(clear).toHaveCount(1);
  // Clear keeps the player: the opponent's court, none recorded.
  await clear.click();
  await expect(stage(theirs.dialog)).toContainText(
    /No approaches recorded for .+ yet/,
  );
  await expect(theirs.dialog).toContainText("Approaches · Rivera");
  expect(theirs.errors).toEqual([]);
});

test("the Statistics pane of a player with no approaches says what the stage says: none recorded with no filter, none matching with one", async ({
  page,
}) => {
  const { dialog, errors } = await openApproaches(page, "&net=you&hand=known");
  await toOpponent(dialog);
  await showStats(dialog);
  const stageLine = await stage(dialog)
    .getByText(/No approaches recorded for .+ yet/)
    .textContent();
  await expect(statsEmpty(dialog)).toHaveText(stageLine!.trim());
  await expect(statsEmpty(dialog)).not.toContainText("match these filters");

  const panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their backhand\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(statsEmpty(dialog)).toHaveText(/^No .+ match these filters$/);
  await expect(statsEmpty(dialog)).toHaveText(
    "No approaches match these filters",
  );
  expect(errors).toEqual([]);
});

test("the Points pane of a player with no approaches says what the stage says: none recorded with no filter, none matching with one", async ({
  page,
}) => {
  const { dialog, errors } = await openApproaches(page, "&net=you");
  await toOpponent(dialog);
  await showPoints(dialog);
  await expect(dialog).toContainText("No points to play");
  await expect(dialog).toContainText(/No approaches recorded for .+ yet/);
  await expect(dialog).not.toContainText("match these filters");

  const panel = await openPanel(page);
  await panel.getByRole("checkbox", { name: /^Their backhand\b/ }).click();
  await page.keyboard.press("Escape");
  await expect(dialog).toContainText("No approaches match these filters");
  await expect(dialog).not.toContainText("recorded for");
  expect(errors).toEqual([]);
});
