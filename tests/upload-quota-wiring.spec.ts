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
 * The rule under test is a user decision: the allowance blocks Advantage
 * Intelligence at step 1 when nothing is left, an over-long trim is refused ON
 * CLICK rather than by a disabled Continue, and a SwingVision import — which
 * never bills — is not asked at all.
 */

test("a spent month blocks the processing provider at step 1", async () => {
  const h = uploadWizardHarness({
    quotaCapSeconds: 0,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();

  expect(h.current.step).toBe("provider");
  expect(h.current.providerQuotaRefusal).toBe(
    "This month's analysis hours are used up. They reset on Oct 1.",
  );

  h.current.handleProviderContinue();
  h.render();

  expect(h.current.step).toBe("provider");
  expect(h.current.error).toBe(
    "This month's analysis hours are used up. They reset on Oct 1.",
  );
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

test("an over-allowance trim is refused on Continue, not before it", async () => {
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

  h.current.handleTrimContinue();
  h.render();

  expect(h.current.step).toBe(stepBefore);
  expect(h.current.error).toContain("Shorten the selection to continue.");
});

test("moving a handle clears the refusal", async () => {
  const h = uploadWizardHarness({
    quotaCapSeconds: 600,
    props: { initialProvider: "splitstep" },
  });
  await h.flush();

  h.current.handleTrimChange(0, 1200);
  h.render();
  h.current.handleTrimContinue();
  h.render();
  expect(h.current.error).not.toBeNull();

  h.current.handleTrimChange(0, 300);
  h.render();
  expect(h.current.error).toBeNull();

  // And a window that fits now advances.
  h.current.handleTrimContinue();
  h.render();
  expect(h.current.step).toBe("match");
  expect(h.current.error).toBeNull();
});
