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
  const h = await atPaywall({ onSale: false, plan: "player" });
  expect(h.current.plansActive).toBe(true);
  expect(h.current.quotaPlanId).toBe("player");
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
  h.current.handlePurchase({ kind: "plan", plan: "player", period: "monthly" });
  h.render();
  expect(h.current.paywall).toBeNull();
  expect(h.current.error).toBeNull();
  expect(h.current.quotaPlanId).toBe("player");
  expect(h.current.step).toBe("match");
});

test("an upgrade is counted the same way", async () => {
  const h = await atPaywall({ onSale: false, plan: "player" });
  h.current.handlePurchase({
    kind: "upgrade",
    plan: "player-pro",
    period: "monthly",
  });
  h.render();
  expect(h.current.quotaPlanId).toBe("player-pro");
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

  h.current.syncPlan("player-pro", "2027-01-14T08:00:00.000Z");
  h.render();
  expect(h.current.quotaPlanId).toBe("player-pro");
  expect(h.current.paymentPending).toBe(false);

  // A stale read of the old plan must not undo it.
  h.current.syncPlan("player", "2027-01-14T08:00:00.000Z");
  h.render();
  expect(h.current.quotaPlanId).toBe("player-pro");
});

test.describe("a failed payment fixed in another tab", () => {
  const PAID = {
    workspaceId: "user",
    remainingSeconds: 7200,
    capSeconds: 7200,
    creditSeconds: 0,
    grantedSeconds: 0,
    nextCreditExpiresAt: null,
    resetsOn: null,
    pastDue: false,
  };

  /** A Player subscriber, payment failed, stopped at the trim step's paywall. */
  async function pastDueAtPaywall(
    hoursLeftReads: NonNullable<
      Parameters<typeof uploadWizardHarness>[0]
    >["hoursLeftReads"],
  ) {
    delete process.env[ON_SALE];
    const h = uploadWizardHarness({
      quotaCapSeconds: 7200,
      props: { initialProvider: "splitstep" },
      workspace: { plan: "player", planStatus: "past_due" },
      hoursLeftReads,
    });
    await h.flush();
    expect(h.current.quotaPastDue).toBe(true);
    expect(h.current.quotaFreeSeconds).toBe(0);
    h.current.handleTrimChange(0, 1200);
    h.render();
    h.current.handleTrimContinue();
    h.render();
    expect(h.current.paywall).toEqual({ neededSeconds: 1200 });
    return h;
  }

  /** What a reload would lose: the answers, the step and the picked video. */
  const formState = (h: Awaited<ReturnType<typeof pastDueAtPaywall>>) => ({
    formData: h.current.formData,
    step: h.current.step,
    uploadedFile: h.current.uploadedFile,
    selectedProvider: h.current.selectedProvider,
  });

  test("the re-read lifts the flag and brings the plan's hours back, form untouched", async () => {
    const h = await pastDueAtPaywall([PAID]);
    const before = formState(h);

    // Back from the portal tab: the paywall is closed by hand.
    h.current.closeAddHours();
    await h.flush();

    expect(h.hoursLeftCallCount).toBe(1);
    expect(h.current.quotaPastDue).toBe(false);
    expect(h.current.quotaFreeSeconds).toBe(7200);
    expect(h.current.quotaPlanId).toBe("player");
    expect(h.current.paywall).toBeNull();
    // The same objects, not equal copies: nothing was reset or remounted.
    expect(h.current.formData).toBe(before.formData);
    expect(formState(h)).toEqual(before);
    expect(h.current.formData.videoEndSeconds).toBe(1200);

    // And the trim step now lets the same twenty minutes through.
    h.current.handleTrimContinue();
    h.render();
    expect(h.current.paywall).toBeNull();
    expect(h.current.step).toBe("match");
  });

  test("the tab coming back asks the same question", async () => {
    const h = await pastDueAtPaywall([PAID]);
    await h.current.refreshPastDue();
    await h.flush();
    expect(h.current.quotaPastDue).toBe(false);
    expect(h.current.quotaFreeSeconds).toBe(7200);
    // The dialog was not closed for them, and is not asked about again.
    expect(h.current.paywall).toEqual({ neededSeconds: 1200 });
    await h.current.refreshPastDue();
    expect(h.hoursLeftCallCount).toBe(1);
  });

  for (const [name, read] of [
    ["a 503", "error"],
    ["no connection", "offline"],
    [
      "a payment still failing",
      { ...PAID, remainingSeconds: 0, pastDue: true },
    ],
    [
      "an older answer with no word on the payment",
      { ...PAID, pastDue: undefined },
    ],
    ["another workspace's answer", { ...PAID, workspaceId: "team-a" }],
  ] as const) {
    test(`${name} leaves the wizard as it was`, async () => {
      const h = await pastDueAtPaywall([read]);
      const before = formState(h);
      await h.current.refreshPastDue();
      await h.flush();
      expect(h.hoursLeftCallCount).toBe(1);
      expect(h.current.quotaPastDue).toBe(true);
      expect(h.current.quotaFreeSeconds).toBe(0);
      expect(h.current.error).toBeNull();
      expect(h.current.paywall).toEqual({ neededSeconds: 1200 });
      expect(h.current.formData).toBe(before.formData);
      expect(formState(h)).toEqual(before);
    });
  }

  test("an account that is not past due is never asked about", async () => {
    const h = await atPaywall({ onSale: false, plan: "player" });
    h.current.closeAddHours();
    await h.current.refreshPastDue();
    await h.flush();
    expect(h.hoursLeftCallCount).toBe(0);
  });

  test("it runs on focus and on the tab becoming visible, and never navigates", () => {
    const hook = readFileSync(
      "src/components/dashboard/matches/new-match-wizard/useUploadMatchWizard.ts",
      "utf8",
    );
    expect(hook).toMatch(
      /if \(!open \|\| !quotaPastDue\) return;[\s\S]*?if \(document\.visibilityState === "visible"\) void refreshPastDue\(\);[\s\S]*?addEventListener\("visibilitychange", onVisible\);\s*window\.addEventListener\("focus", onVisible\);/,
    );
    const body = hook.slice(
      hook.indexOf("const refreshPastDue = useCallback("),
      hook.indexOf("const openAddHours = useCallback("),
    );
    expect(body).toContain('fetch("/api/splitstep/hours-left"');
    expect(body).not.toMatch(/router\.|location\.|reload/);

    // The route says it, as a boolean, from the peek the uploads refuse on.
    expect(
      readFileSync("src/app/api/splitstep/hours-left/route.ts", "utf8"),
    ).toContain("pastDue: peek.pastDue === true,");
  });
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

  test("the file step shows the hours note below the drop zone in place of the idle strip, and the old red notice only before the sale", () => {
    const steps = read("UploadWizardSteps.tsx");
    expect(steps).toContain("enabled: plansActive && isProcessingProvider");
    expect(steps).toContain("hoursNote={hoursNoteNode}");
    expect(steps).toMatch(
      /plansActive \|\|\s*!canBuyCredits \|\|\s*!isProcessingProvider/,
    );
    // It rides inside FileStepContent, in the idle strip's slot.
    expect(steps.indexOf("<FileStepContent")).toBeLessThan(
      steps.indexOf("hoursNote={hoursNoteNode}"),
    );
    // One line, never wrapped; grey, with the Info glyph in ink-400.
    expect(steps).toContain('<span className="min-w-0 flex-1 truncate">');
    expect(steps).toContain(
      'className={cn(noteIconCls, "text-[var(--ink-400)]")}',
    );
    // "See plans" opens the dialog in place: no link that leaves the wizard.
    expect(steps).not.toContain('href="/dashboard/settings/plan"');

    const content = read("FileStepContent.tsx");
    expect(content).toMatch(
      /\{hoursNote \?\?\s*\(isVideo && warnings\.length === 0 && notices\.length === 0 &&/,
    );
    // Under the drop zone too, before a file is picked.
    expect(content.indexOf("{hoursNote}")).toBeGreaterThan(
      content.indexOf("aria-label={`Drop ${whose} ${noun} here, or browse`}"),
    );
  });

  test("the footer meter stops naming the pilot once the suffix is a plan's", () => {
    const footer = read("UploadWizardFooter.tsx");
    expect(footer).toContain("pilotNote={planSuffix === null}");
    expect(footer).toContain("`0h · ${planSuffix}`");
  });
});
