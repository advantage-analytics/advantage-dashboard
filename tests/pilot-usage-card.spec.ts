import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { expect, test, type Page } from "@playwright/test";
import { PILOT_LATEST_END, PLANS_BEGIN } from "@/lib/billing/plans";
import { DROPPED_CONNECTION } from "@/lib/ui/action-rejected";
import {
  boundaryErrors,
  capturedExceptions,
  failActionsWith,
  openHarness,
  serveHarness,
} from "./fixtures/admin-team-harness-server";

/**
 * The Admin › Teams Pilot card: what its writes do when the request never
 * comes back, and how each way of failing reads.
 *
 * PostHog issue 01a14f7d: `TypeError: Load failed` on /admin/teams/[id] in
 * Safari, right after an admin confirmed the card's Grant / Revoke team pool
 * dialog, and a full reload of the page six seconds later. The actions answer
 * refusals as `{ ok: false }`, but a fetch that fails rejects instead, and the
 * card awaited it inside `startTransition` with no handler — so the rejection
 * was thrown to the error boundary and the page was replaced by an error
 * screen. The harness' boundary records whatever reaches it.
 */

let harness: Awaited<ReturnType<typeof serveHarness>>;

test.beforeAll(async () => {
  harness = await serveHarness("tests/fixtures/pilot-usage-card-harness.tsx");
});

test.afterAll(async () => {
  await harness?.close();
});

const dialogOf = (page: Page) =>
  page.getByRole("alertdialog").or(page.getByRole("dialog"));

async function endPilot(page: Page) {
  await page.getByRole("button", { name: "End pilot" }).click();
  await dialogOf(page).getByRole("button", { name: "End pilot" }).click();
}

for (const { trigger, confirm } of [
  { trigger: "Grant team pool", confirm: "Grant pool" },
  { trigger: "End pilot", confirm: "End pilot" },
]) {
  test(`a dropped request on "${trigger}" stays in the dialog instead of the error screen`, async ({
    page,
  }) => {
    const errors: string[] = [];
    await openHarness(page, harness.origin, errors);
    await failActionsWith(page, "dropped");

    await page.getByRole("button", { name: trigger }).click();
    const dialog = dialogOf(page);
    await dialog.getByRole("button", { name: confirm }).click();

    await expect(dialog.getByText(DROPPED_CONNECTION)).toBeVisible();
    expect(await boundaryErrors(page)).toEqual([]);
    expect(errors).toEqual([]);
    // The card is still there behind the dialog — nothing replaced the page.
    await expect(
      page.getByRole("alert").filter({ hasText: "Page error" }),
    ).toHaveCount(0);
  });
}

test('a dropped request on "Change end date" stays in the popover', async ({
  page,
}) => {
  const errors: string[] = [];
  await openHarness(page, harness.origin, errors);
  await failActionsWith(page, "dropped");

  await page.getByRole("button", { name: "Change end date" }).click();
  const popover = page.getByRole("dialog", {
    name: "Change the pilot end date",
  });
  await popover.getByRole("spinbutton", { name: /year/i }).press("ArrowUp");
  await popover.getByRole("button", { name: "Save date" }).click();

  await expect(popover.getByText(DROPPED_CONNECTION)).toBeVisible();
  await expect(
    popover.getByRole("button", { name: "Save date" }),
  ).toBeEnabled();
  expect(await boundaryErrors(page)).toEqual([]);
  expect(errors).toEqual([]);
});

test('"Change end date" closes the popover and refreshes on success', async ({
  page,
}) => {
  const errors: string[] = [];
  await openHarness(page, harness.origin, errors);

  await page.getByRole("button", { name: "Change end date" }).click();
  const popover = page.getByRole("dialog", {
    name: "Change the pilot end date",
  });
  await popover.getByRole("spinbutton", { name: /year/i }).press("ArrowUp");
  await popover.getByRole("button", { name: "Save date" }).click();

  await expect(popover).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.routerRefreshes)).toBe(1);
  expect(errors).toEqual([]);
});

for (const failure of ["dropped", "closed", "closedInDev"] as const) {
  test(`a request failing as ${failure} reads as unreachable and is not reported`, async ({
    page,
  }) => {
    await openHarness(page, harness.origin, []);
    await failActionsWith(page, failure);
    await endPilot(page);

    await expect(dialogOf(page).getByText(DROPPED_CONNECTION)).toBeVisible();
    expect(await capturedExceptions(page)).toEqual([]);
  });
}

test("a throw inside the action reads differently and reaches PostHog", async ({
  page,
}) => {
  await openHarness(page, harness.origin, []);
  await failActionsWith(page, "server");
  await endPilot(page);

  await expect(
    dialogOf(page).getByText("Something went wrong on our side."),
  ).toBeVisible();
  await expect(dialogOf(page).getByText(DROPPED_CONNECTION)).toHaveCount(0);
  expect(await boundaryErrors(page)).toEqual([]);
  expect(await capturedExceptions(page)).toEqual([
    {
      message:
        "Minified React error #441; visit https://react.dev/errors/441 for the full message",
      digest: "1234567890",
    },
  ]);
});

test("a bad response from in front of the app reaches PostHog", async ({
  page,
}) => {
  await openHarness(page, harness.origin, []);
  await failActionsWith(page, "unexpected");
  await endPilot(page);

  await expect(
    dialogOf(page).getByText("Something went wrong on our side."),
  ).toBeVisible();
  expect(await capturedExceptions(page)).toHaveLength(1);
});

test("an action retired by a deploy asks for a reload and is not reported", async ({
  page,
}) => {
  await openHarness(page, harness.origin, []);
  await failActionsWith(page, "stale");
  await endPilot(page);

  await expect(
    dialogOf(page).getByText("This page is out of date."),
  ).toBeVisible();
  expect(await boundaryErrors(page)).toEqual([]);
  expect(await capturedExceptions(page)).toEqual([]);
});

for (const failure of ["redirect", "notFound"] as const) {
  test(`${failure === "redirect" ? "redirect()" : "notFound()"} is not swallowed by the catch`, async ({
    page,
  }) => {
    await openHarness(page, harness.origin, []);
    await failActionsWith(page, failure);
    await endPilot(page);

    // It keeps travelling to Next's own boundaries, and nothing is reported.
    await expect
      .poll(() => boundaryErrors(page))
      .toEqual([
        failure === "redirect"
          ? "NEXT_REDIRECT"
          : "NEXT_HTTP_ERROR_FALLBACK;404",
      ]);
    expect(await capturedExceptions(page)).toEqual([]);
  });
}

// ── The Grant dialog's copy (20261128070000_plans_2027_pilot_grant) ─────────
//
// `admin_set_pilot_eligible` takes a college now, and a grant that stamps
// dates stamps `PILOT_LATEST_END`. The dialog states that date, computed from
// the constant, wherever the RPC will stamp it: no end date, a pilot ended by
// hand, or one whose date has passed.

const asDay = (iso: string) =>
  new Date(`${iso}T00:00:00Z`).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
    timeZone: "UTC",
  });

const STAMPED = `The pilot end date is set to ${asDay(PILOT_LATEST_END)}, the latest a pilot may run`;

async function openGrant(page: Page, query: string) {
  await openHarness(page, harness.origin, [], `/?${query}`);
  await page.getByRole("button", { name: "Grant team pool" }).click();
  return dialogOf(page);
}

for (const pilot of ["none", "ended", "lapsed"] as const) {
  for (const begun of ["0", "1"] as const) {
    test(`a grant on a pilot that is ${pilot} states the stamped ${PILOT_LATEST_END} (plans begun: ${begun})`, async ({
      page,
    }) => {
      const dialog = await openGrant(page, `pilot=${pilot}&begun=${begun}`);
      await expect(dialog.getByText(STAMPED)).toBeVisible();
      await expect(dialog).not.toContainText("keeps its end date");
      // The old workaround: set a date by hand after granting.
      await expect(dialog).not.toContainText("afterwards:");
      await expect(dialog).not.toContainText("Dec 31, 2026");
    });
  }
}

test("a grant on a pilot with a future end date says it keeps that date", async ({
  page,
}) => {
  const dialog = await openGrant(page, "pilot=future");
  await expect(dialog).toContainText(
    `The pilot keeps its end date, ${asDay(`${new Date().getUTCFullYear() + 1}-12-31`)}.`,
  );
  await expect(dialog.getByText(STAMPED)).toHaveCount(0);
});

test("a college can be granted: before plans begin the dialog says nothing changes yet", async ({
  page,
}) => {
  const dialog = await openGrant(page, "org=college&pilot=none");
  await expect(dialog).toContainText(
    `so nothing changes before ${asDay(PLANS_BEGIN)}`,
  );
  await expect(dialog).not.toContainText("instead of the individual");
  await expect(dialog.getByText(STAMPED)).toBeVisible();
});

test("a college granted once plans have begun reads like any other team", async ({
  page,
}) => {
  const dialog = await openGrant(page, "org=college&pilot=none&begun=1");
  await expect(dialog).toContainText(
    "the team has no video hours unless it is on a plan",
  );
  await expect(dialog).not.toContainText("nothing changes before");
  await expect(dialog.getByText(STAMPED)).toBeVisible();
});

// ── What a team draws without the pool, either side of PLANS_BEGIN ─────────
//
// In the beta a team off the pool shares the individual figure. From
// `plansHaveBegun()` a team draws hours only from a season plan or a running
// pilot (`allowanceFor`), so the dialogs say it has none without one.

const NO_HOURS = "no video hours";

async function openRevoke(page: Page, query: string) {
  await openHarness(page, harness.origin, [], `/?eligible=1&${query}`);
  await page.getByRole("button", { name: "Revoke team pool" }).click();
  return dialogOf(page);
}

test("before plans begin, Grant names the individual figure it replaces", async ({
  page,
}) => {
  const dialog = await openGrant(page, "pilot=none");
  await expect(dialog).toContainText("instead of the individual");
  await expect(dialog).toContainText("from now on");
  await expect(dialog).not.toContainText(NO_HOURS);
});

test("once plans begin, Grant says the team has no video hours without the pilot", async ({
  page,
}) => {
  const dialog = await openGrant(page, "pilot=none&begun=1");
  await expect(dialog).toContainText("as a team while its pilot runs");
  await expect(dialog).toContainText(
    "the team has no video hours unless it is on a plan",
  );
  await expect(dialog).not.toContainText("individual");
});

test("before plans begin, Revoke says the team goes back to the individual figure", async ({
  page,
}) => {
  const dialog = await openRevoke(page, "pilot=future");
  await expect(dialog).toContainText(
    "The team goes back to the individual figure",
  );
  await expect(dialog).toContainText("will draw the individual");
  await expect(dialog).not.toContainText(NO_HOURS);
  // Revoking leaves the pilot as it is, and granting again restores the figure.
  await expect(dialog).toContainText("not whether it is on the pilot");
  await expect(dialog).toContainText(
    "Granting the pool again restores the figure.",
  );
  await expect(dialog).not.toContainText("stops drawing hours");
});

test("once plans begin, Revoke says the pilot stops drawing hours and a grant restarts it", async ({
  page,
}) => {
  const dialog = await openRevoke(page, "pilot=future&begun=1");
  await expect(dialog).toContainText(
    "approver and end date stay as they are, but the pilot stops drawing hours.",
  );
  await expect(dialog).toContainText(
    `Granting the pool again restarts the pilot, ending ${asDay(PILOT_LATEST_END)} if its end date has passed.`,
  );
  await expect(dialog).not.toContainText("not whether it is on the pilot");
  await expect(dialog).not.toContainText("restores the figure");
});

test("once plans begin, Revoke says the team has no video hours unless it is on a plan", async ({
  page,
}) => {
  const dialog = await openRevoke(page, "pilot=future&begun=1");
  await expect(dialog).toContainText(
    "The team has no video hours unless it is on a plan",
  );
  await expect(dialog).toContainText(
    "has no video hours from its next upload unless it is on a plan",
  );
  await expect(dialog).not.toContainText("individual");
});

test("a college's Revoke before plans begin keeps its college wording", async ({
  page,
}) => {
  const dialog = await openRevoke(page, "org=college&pilot=future");
  await expect(dialog).toContainText(
    `Nothing changes for the team before ${asDay(PLANS_BEGIN)}`,
  );
  await expect(dialog).not.toContainText("individual");
});

test("the card carries no literal pilot end date and no hand-set workaround", () => {
  const source = readFileSync(
    resolve(__dirname, "..", "src/components/admin/pilot-usage-card.tsx"),
    "utf8",
  );
  expect(source).not.toContain("2026-12-31");
  expect(source).not.toContain("2027-05-31");
  expect(source).not.toMatch(/(Dec|December) 31/);
  expect(source).not.toMatch(/May 31/);
  expect(source).not.toContain("formatPilotEnd");
  expect(source).not.toContain("end date from this card afterwards");
  // The grant is no longer hidden from a college.
  expect(source).not.toContain('orgType !== "college"');
});
