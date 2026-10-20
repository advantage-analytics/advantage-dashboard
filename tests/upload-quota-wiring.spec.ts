import { expect, test } from "@playwright/test";

import { uploadWizardHarness } from "./fixtures/upload-wizard-hook";

/**
 * Where `quotaRefusal` is wired into the wizard (T3).
 *
 * `tests/upload-quota-gate.spec.ts` already pins the sentences the pure
 * function returns. This file pins the three places the hook asks it, through
 * the real hook in `uploadWizardHarness` — a VM, no DOM, no network, and the
 * stubbed usage reads return zero used, so `quotaCapSeconds` IS the remaining
 * allowance.
 *
 * The rules under test are user decisions. A team's allowance blocks Advantage
 * Intelligence at step 1 when nothing is left and refuses an over-long trim ON
 * CLICK. A personal player is never refused at step 1, and an over-long trim
 * opens the credit-pack paywall on Continue (Cj, 2026-10-16). A SwingVision
 * import — which never bills — is not asked at all.
 */

test("a spent month blocks a TEAM's processing provider at step 1", async () => {
  const h = uploadWizardHarness({
    team: true,
    quotaCapSeconds: 0,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();

  expect(h.current.step).toBe("provider");
  expect(h.current.providerQuotaRefusal).toBe(
    "Your team's analysis hours for this month are used up. They reset on Oct 1.",
  );
});

test("a personal player out of hours is not refused at step 1 — they can add hours", async () => {
  const h = uploadWizardHarness({
    quotaCapSeconds: 0,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();

  expect(h.current.providerQuotaRefusal).toBeNull();
  expect(h.current.remainingQuotaSeconds).toBe(0);
  h.current.handleProviderContinue();
  h.render();
  expect(h.current.step).toBe("file");
});

test("the import provider advances on a spent month", async () => {
  // Same zero allowance, the other kind. A .xlsx export is parsed here and
  // never sent for analysis, so the video budget has no bearing on it.
  const h = uploadWizardHarness({
    quotaCapSeconds: 0,
    props: { initialProvider: "swing-vision" },
  });
  await h.flush();

  expect(h.current.providerQuotaRefusal).toBeNull();

  h.current.handleProviderContinue();
  h.render();

  expect(h.current.step).toBe("file");
  expect(h.current.error).toBeNull();
});

test("an over-allowance trim opens the paywall on Continue, not before it", async () => {
  const h = uploadWizardHarness({
    quotaCapSeconds: 600,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();

  // Something is left, so step 1 says nothing.
  expect(h.current.providerQuotaRefusal).toBeNull();

  // Twenty minutes selected against ten remaining.
  h.current.handleTrimChange(0, 1200);
  h.render();
  const stepBefore = h.current.step;
  expect(h.current.paywall).toBeNull();

  h.current.handleTrimContinue();
  h.render();

  // Continue stays on and opens the dialog; no dead-end error.
  expect(h.current.step).toBe(stepBefore);
  expect(h.current.error).toBeNull();
  expect(h.current.paywall).toEqual({ neededSeconds: 1200 });
});

test("credits count toward what fits: free hours plus credits", async () => {
  const h = uploadWizardHarness({
    quotaCapSeconds: 600,
    creditSeconds: 900,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();

  expect(h.current.quotaFreeSeconds).toBe(600);
  expect(h.current.quotaCreditSeconds).toBe(900);
  expect(h.current.remainingQuotaSeconds).toBe(1500);

  h.current.handleTrimChange(0, 1200);
  h.render();
  h.current.handleTrimContinue();
  h.render();
  expect(h.current.paywall).toBeNull();
  expect(h.current.step).toBe("match");
});

test("a pack that covers the video carries the trim step on to the match step", async () => {
  const h = uploadWizardHarness({
    quotaCapSeconds: 600,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();

  h.current.handleTrimChange(0, 1200);
  h.render();
  h.current.handleTrimContinue();
  h.render();
  expect(h.current.paywall).not.toBeNull();

  h.current.handleCreditsAdded({
    pack: "1h",
    seconds: 3600,
    expiresAt: "2027-10-16T00:00:00.000Z",
  });
  h.render();

  expect(h.current.paywall).toBeNull();
  expect(h.current.quotaCreditSeconds).toBe(3600);
  expect(h.current.step).toBe("match");
});

test("a team's over-allowance trim is still refused on Continue", async () => {
  const h = uploadWizardHarness({
    team: true,
    quotaCapSeconds: 600,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();

  h.current.handleTrimChange(0, 1200);
  h.render();
  const stepBefore = h.current.step;
  h.current.handleTrimContinue();
  h.render();

  expect(h.current.step).toBe(stepBefore);
  expect(h.current.paywall).toBeNull();
  expect(h.current.error).toContain("Shorten the selection to continue.");
});

test("moving a handle shortens the trim back into what fits", async () => {
  const h = uploadWizardHarness({
    quotaCapSeconds: 600,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();

  h.current.handleTrimChange(0, 1200);
  h.render();
  h.current.handleTrimContinue();
  h.render();
  expect(h.current.paywall).not.toBeNull();
  // "Shorten the trim instead" closes it.
  h.current.closeAddHours();
  h.render();

  h.current.handleTrimChange(0, 300);
  h.render();
  expect(h.current.error).toBeNull();

  // And a window that fits now advances.
  h.current.handleTrimContinue();
  h.render();
  expect(h.current.step).toBe("match");
  expect(h.current.error).toBeNull();
});
