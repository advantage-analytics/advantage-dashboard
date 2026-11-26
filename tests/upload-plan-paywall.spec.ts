import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import { uploadWizardHarness } from "./fixtures/upload-wizard-hook";

/**
 * The upload wizard once plans are on sale: the paywall still opens at Send
 * and never earlier, and what the plan checkout dialog hands back — extra
 * hours, a new plan, an upgrade — is counted and carries the trim step on,
 * without a reload (the picked video is an in-memory `File`).
 *
 * `plansOnSale()` is the real one, switched by its own environment variable.
 */

const ON_SALE = "NEXT_PUBLIC_PLANS_ON_SALE";
let before: string | undefined;
test.beforeAll(() => {
  before = process.env[ON_SALE];
});
test.afterEach(() => {
  if (before === undefined) delete process.env[ON_SALE];
  else process.env[ON_SALE] = before;
});

async function atPaywall(options: { onSale: boolean; plan?: string }) {
  if (options.onSale) process.env[ON_SALE] = "1";
  else delete process.env[ON_SALE];
  const h = uploadWizardHarness({
    quotaCapSeconds: 600,
    props: { initialProvider: "splitstep" },
    workspace: options.plan ? { plan: options.plan } : undefined,
  });
  await h.flush();
  // Twenty minutes selected against ten remaining.
  h.current.handleTrimChange(0, 1200);
  h.render();
  expect(h.current.paywall).toBeNull();
  h.current.handleTrimContinue();
  h.render();
  expect(h.current.paywall).toEqual({ neededSeconds: 1200 });
  return h;
}

test("before plans are on sale a Free player keeps the beta's credit packs", async () => {
  const h = await atPaywall({ onSale: false });
  expect(h.current.plansActive).toBe(false);
  expect(h.current.quotaPlanId).toBe("free");
});

test("on sale, the paywall is the plan checkout — still opened at Send, not before", async () => {
  const h = await atPaywall({ onSale: true });
  expect(h.current.plansActive).toBe(true);
  expect(h.current.step).not.toBe("match");
});

test("an account already on a paid plan gets the plan checkout whatever the date", async () => {
  const h = await atPaywall({ onSale: false, plan: "coach" });
  expect(h.current.plansActive).toBe(true);
  expect(h.current.quotaPlanId).toBe("coach");
});

test("extra hours that cover the video carry the trim step on", async () => {
  const h = await atPaywall({ onSale: true });
  h.current.handlePurchase({
    kind: "hours",
    hours: 1,
    seconds: 3600,
    expiresAt: "2028-01-05T00:00:00.000Z",
  });
  h.render();
  expect(h.current.paywall).toBeNull();
  expect(h.current.quotaCreditSeconds).toBe(3600);
  expect(h.current.step).toBe("match");
  expect(h.current.quotaPlanId).toBe("free");
});

test("a new plan counts its full hours at once and carries on", async () => {
  const h = await atPaywall({ onSale: true });
  h.current.handlePurchase({ kind: "plan", plan: "coach", period: "monthly" });
  h.render();
  expect(h.current.paywall).toBeNull();
  expect(h.current.error).toBeNull();
  expect(h.current.quotaPlanId).toBe("coach");
  expect(h.current.step).toBe("match");
});

test("an upgrade is counted the same way", async () => {
  const h = await atPaywall({ onSale: false, plan: "coach" });
  h.current.handlePurchase({
    kind: "upgrade",
    plan: "coach-pro",
    period: "monthly",
  });
  h.render();
  expect(h.current.quotaPlanId).toBe("coach-pro");
  expect(h.current.step).toBe("match");
});

test("a plan that lands after the dialog gave up waiting is picked up from the row, and never stepped down", async () => {
  const h = await atPaywall({ onSale: true });
  h.current.handlePaymentPending();
  h.render();
  expect(h.current.paymentPending).toBe(true);

  // The row still says Free: the webhook has not landed. Nothing changes.
  h.current.syncPlan("free", null);
  h.render();
  expect(h.current.quotaPlanId).toBe("free");
  expect(h.current.paymentPending).toBe(true);

  h.current.syncPlan("coach-pro", "2027-01-14T08:00:00.000Z");
  h.render();
  expect(h.current.quotaPlanId).toBe("coach-pro");
  expect(h.current.paymentPending).toBe(false);

  // A stale read of the old plan must not undo it.
  h.current.syncPlan("coach", "2027-01-14T08:00:00.000Z");
  h.render();
  expect(h.current.quotaPlanId).toBe("coach-pro");
});

test.describe("wiring", () => {
  const dir = "src/components/dashboard/matches/new-match-wizard";
  const read = (file: string) => readFileSync(`${dir}/${file}`, "utf8");

  test("the paywall mount picks the dialog by plansActive and keeps AddHoursDialog for the other path", () => {
    const flow = read("UploadMatchFlow.tsx");
    expect(flow).toMatch(
      /\{plansActive \? \(\s*<PlanCheckoutDialog[\s\S]*?\) : \(\s*<AddHoursDialog/,
    );
    // Both open on the same state, set only by the trim step's Continue,
    // the Save re-check and the file step's own button.
    expect(flow.match(/open=\{paywall !== null\}/g)).toHaveLength(2);
    expect(flow).toContain("onDone={handlePurchase}");
  });

  test("the file step shows the hours note above the drop zone in place of the idle strip, and the old red notice only before the sale", () => {
    const steps = read("UploadWizardSteps.tsx");
    expect(steps).toContain("enabled: plansActive && isProcessingProvider");
    expect(steps).toContain('hideIdleNote={hoursNote.kind !== "none"}');
    expect(steps).toMatch(
      /plansActive \|\|\s*!canBuyCredits \|\|\s*!isProcessingProvider/,
    );
    expect(steps.indexOf("<FileHoursNote note={hoursNote}")).toBeLessThan(
      steps.indexOf("<FileStepContent"),
    );
    // One line, never wrapped; grey, with the Info glyph in ink-400.
    expect(steps).toContain('<span className="min-w-0 flex-1 truncate">');
    expect(steps).toContain(
      'className={cn(noteIconCls, "text-[var(--ink-400)]")}',
    );
    // "See plans" opens the dialog in place: no link that leaves the wizard.
    expect(steps).not.toContain('href="/dashboard/settings/plan"');

    const content = read("FileStepContent.tsx");
    expect(content).toMatch(/notices\.length === 0 &&\s*!hideIdleNote && \(/);
  });

  test("the footer meter stops naming the pilot once the suffix is a plan's", () => {
    const footer = read("UploadWizardFooter.tsx");
    expect(footer).toContain("pilotNote={planSuffix === null}");
    expect(footer).toContain("`0h · ${planSuffix}`");
  });
});
