import { expect, test } from "@playwright/test";
import { startStyledHarness } from "./fixtures/viz-styled-harness-server";

/**
 * The date-of-birth calendar jumps by year.
 *
 * PostHog, 2026-11-17: a new player made 296 clicks in 80 seconds on
 * `/onboarding`, paging the date-of-birth calendar back one month at a time —
 * it opens on today and had only previous/next-month chevrons, so a birth
 * year twenty years back cost about 240 presses. `DateField`'s `yearSelect`
 * puts month and year menus in the calendar header; this walks the
 * onboarding field's props (`dob-date-field-harness.tsx`) in a real browser.
 */

let origin: string;
let close: () => Promise<void>;

test.beforeAll(async () => {
  ({ origin, close } = await startStyledHarness(
    "tests/fixtures/dob-date-field-harness.tsx",
  ));
});

test.afterAll(async () => {
  await close?.();
});

async function openCalendar(page: import("@playwright/test").Page) {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(`${origin}/`);
  await expect(page.locator("html[data-hydrated]")).toHaveCount(1);
  await page
    .getByRole("group", { name: "Date of birth" })
    .getByRole("button")
    .click();
  const calendar = page.getByRole("dialog", { name: "Date of birth calendar" });
  await expect(calendar).toBeVisible();
  return { calendar, errors };
}

test("a birth year two decades back is two picks, and the day lands in the field", async ({
  page,
}) => {
  const { calendar, errors } = await openCalendar(page);
  const thisYear = new Date().getUTCFullYear();
  await expect(
    calendar.getByRole("button", { name: "Date of birth year" }),
  ).toHaveText(String(thisYear));

  await calendar.getByRole("button", { name: "Date of birth year" }).click();
  await page.getByRole("menuitemradio", { name: "2005", exact: true }).click();
  // Picking from the menu leaves the calendar open on the new year.
  await expect(calendar).toBeVisible();
  await expect(
    calendar.getByRole("button", { name: "Date of birth year" }),
  ).toHaveText("2005");

  await calendar.getByRole("button", { name: "Date of birth month" }).click();
  await page.getByRole("menuitemradio", { name: "March", exact: true }).click();
  await expect(
    calendar.getByRole("button", { name: "Date of birth month" }),
  ).toHaveText("March");

  await calendar.getByRole("button", { name: /March 14, 2005/ }).click();
  await expect(page.locator("#dob-value")).toHaveText("2005-03-14");
  expect(errors).toEqual([]);
});

test("the menus offer only what min and max allow", async ({ page }) => {
  const { calendar } = await openCalendar(page);
  const now = new Date();
  const thisYear = now.getUTCFullYear();

  await calendar.getByRole("button", { name: "Date of birth year" }).click();
  const years = page.getByRole("menuitemradio");
  await expect(years.first()).toHaveText(String(thisYear));
  await expect(years.last()).toHaveText("1900");
  // Escape closes the menu, not the calendar it opened from.
  await page.keyboard.press("Escape");
  await expect(years).toHaveCount(0);
  await expect(calendar).toBeVisible();

  // In the current year, no month after this one is offered.
  await calendar.getByRole("button", { name: "Date of birth month" }).click();
  await expect(page.getByRole("menuitemradio")).toHaveCount(
    now.getUTCMonth() + 1,
  );
});
