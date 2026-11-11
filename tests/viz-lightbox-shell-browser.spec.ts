import { expect, test } from "@playwright/test";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

let origin: string;
let close: () => Promise<void>;

test.beforeAll(async () => {
  ({ origin, close } = await startStyledHarness(
    "tests/fixtures/viz-lightbox-shell-harness.tsx",
  ));
});

test.afterAll(async () => {
  await close?.();
});

test("the shell renders from plain props with no providers: court, legend filter, Filters and Statistics; no Points, Watch, Save or player switch", async ({
  page,
}) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.setViewportSize({ width: 1512, height: 982 });
  await page.goto(`${origin}/`);
  const dialog = page.getByRole("dialog", { name: "Serve placement" });
  await expect(dialog).toBeVisible();

  // The court, from the handed-in result.
  const marks = dialog.locator("[data-court-stage] [data-viz-mark]");
  const all = await marks.count();
  expect(all).toBeGreaterThan(0);

  // The legend filters the court, and the strip names it — with no count,
  // since no points were handed in.
  const legend = dialog.getByRole("group", { name: "Filter by outcome" });
  const won = legend.getByRole("button", { name: /^Won/ });
  const wonCount = Number((await won.textContent())!.replace(/\D/g, ""));
  await won.click();
  await expect(marks).toHaveCount(wonCount);
  const strip = dialog.locator("[data-viz-filter-strip]");
  await expect(strip).toContainText("Won");
  await expect(strip).not.toContainText(/of \d+ points?/);
  await strip.getByRole("button", { name: "Clear filter" }).click();
  await expect(marks).toHaveCount(all);

  // Filters: the Matches panel over the cut's keys, counted by the host.
  await dialog.getByRole("button", { name: "Filters" }).click();
  const panel = page.getByRole("dialog", { name: "Filter the court" });
  await expect(panel).toContainText("Zone");
  await expect(panel).toContainText("Set");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);

  // The right column is Statistics alone.
  await expect(
    dialog.getByRole("button", { name: "Statistics" }),
  ).toHaveAttribute("aria-pressed", "true");
  await expect(
    dialog
      .getByRole("group", { name: "Right panel" })
      .getByRole("button", { name: "Points", exact: true }),
  ).toHaveCount(0);
  const row = dialog
    .getByRole("button", { name: /% of \d+ points won$/ })
    .first();
  const label = (await row.getAttribute("aria-label"))!;
  await row.click();
  await expect(marks).toHaveCount(
    Number(/of (\d+) points won$/.exec(label)![1]),
  );

  // Nothing that writes or leaves.
  await expect(dialog.getByRole("button", { name: /^Watch/ })).toHaveCount(0);
  await expect(
    dialog.getByRole("button", { name: "Save as view" }),
  ).toHaveCount(0);
  await expect(dialog.getByRole("group", { name: "Player" })).toHaveCount(0);

  // Close reaches the host.
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("closed")).toBeVisible();
  expect(errors).toEqual([]);
});
