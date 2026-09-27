import { expect, test } from "@playwright/test";

import {
  DEFAULT_PROVIDER_ID,
  resolveStartingProvider,
} from "@/components/dashboard/matches/new-match-wizard/resolve-starting-provider";
import { providerForRecordingSource } from "@/app/onboarding/answers";

/**
 * The upload wizard's starting source (T5): `?source=` link > the provider
 * stored by an earlier pick > the onboarding recording-source answer > the
 * default. Offline — the resolver is a pure module beside the hook.
 */
test.describe("resolveStartingProvider", () => {
  test("the default is a processing source, so the fallback tier is real", () => {
    expect(DEFAULT_PROVIDER_ID).toBe("splitstep");
  });

  test("a link wins over everything, including a preference", () => {
    expect(
      resolveStartingProvider({
        linked: "swing-vision",
        stored: "splitstep",
        preferred: "splitstep",
      }),
    ).toBe("swing-vision");
    expect(
      resolveStartingProvider({
        linked: "splitstep",
        stored: null,
        preferred: providerForRecordingSource("swing-vision"),
      }),
    ).toBe("splitstep");
  });

  test("a stored pick beats the onboarding preference", () => {
    expect(
      resolveStartingProvider({
        linked: null,
        stored: "splitstep",
        preferred: "swing-vision",
      }),
    ).toBe("splitstep");
  });

  test("an unsupported stored value falls through to the preference", () => {
    expect(
      resolveStartingProvider({
        linked: null,
        stored: "atp-tour",
        preferred: "swing-vision",
      }),
    ).toBe("swing-vision");
  });

  test("the preference applies when nothing was linked or stored", () => {
    expect(
      resolveStartingProvider({
        linked: null,
        stored: null,
        preferred: providerForRecordingSource("swing-vision"),
      }),
    ).toBe("swing-vision");
  });

  test("a null preference falls through to the default", () => {
    expect(
      resolveStartingProvider({
        linked: null,
        stored: null,
        preferred: providerForRecordingSource("none"),
      }),
    ).toBe(DEFAULT_PROVIDER_ID);
    expect(
      resolveStartingProvider({ linked: null, stored: null, preferred: null }),
    ).toBe(DEFAULT_PROVIDER_ID);
  });

  test("an unsupported value in any tier is skipped, never returned", () => {
    expect(
      resolveStartingProvider({
        linked: "retired",
        stored: "also-retired",
        preferred: "nope",
      }),
    ).toBe(DEFAULT_PROVIDER_ID);
  });
});
