import { expect, test } from "@playwright/test";

import {
  defaultResultHosts,
  isAllowedResultUrl,
  resultUrlHostname,
} from "@/lib/services/splitstep/result-url-policy";
import { withEnv } from "./fixtures/with-env";

/**
 * `isAllowedResultUrl()` — the allowlist in front of every vendor result
 * fetch. What this pins: the match is on the exact `hostname` over `https:`
 * only, so a suffix-spoofed host, a host smuggled into the query, a plain-http
 * copy of the vendor host and the usual SSRF targets all refuse; and the two
 * env sources (`AZURE_STORAGE_ACCOUNT`, `SPLITSTEP_RESULT_HOSTS`) each extend
 * the set without replacing the vendor host.
 *
 * Pure, so no browser, no dev server and no database — the same as
 * `tests/splitstep-webhook-auth.spec.ts`. `defaultResultHosts()` reads
 * `process.env` on every call, which is what lets `withEnv` drive it.
 */

const ENV_KEYS = ["SPLITSTEP_RESULT_HOSTS", "AZURE_STORAGE_ACCOUNT"] as const;

const VENDOR = "splitstepclientvideos.blob.core.windows.net";
const VENDOR_URL = `https://${VENDOR}/out/job-1/strokes.json?sv=1&sig=abc`;

test.describe("isAllowedResultUrl — explicit host list", () => {
  const hosts = [VENDOR] as const;

  test("the vendor host over https passes", () => {
    expect(isAllowedResultUrl(VENDOR_URL, hosts)).toBe(true);
  });

  test("an http: copy of the vendor url fails", () => {
    expect(isAllowedResultUrl(`http://${VENDOR}/out/strokes.json`, hosts)).toBe(
      false,
    );
  });

  test("a suffix-spoofed host fails — matching is exact, not endsWith", () => {
    expect(
      isAllowedResultUrl(`https://${VENDOR}.evil.example/strokes.json`, hosts),
    ).toBe(false);
  });

  test("the vendor host in the query does not count", () => {
    expect(isAllowedResultUrl(`https://evil.example/?x=${VENDOR}`, hosts)).toBe(
      false,
    );
  });

  test("the vendor host as userinfo does not count", () => {
    expect(
      isAllowedResultUrl(`https://${VENDOR}@evil.example/strokes.json`, hosts),
    ).toBe(false);
  });

  for (const target of [
    "https://169.254.169.254/latest/meta-data/",
    "https://localhost/strokes.json",
    "https://[::1]/strokes.json",
    "https://127.0.0.1/strokes.json",
  ]) {
    test(`${target} fails`, () => {
      expect(isAllowedResultUrl(target, hosts)).toBe(false);
    });
  }

  test("a value that is not a url fails rather than throwing", () => {
    expect(isAllowedResultUrl("not a url", hosts)).toBe(false);
    expect(isAllowedResultUrl("", hosts)).toBe(false);
    expect(isAllowedResultUrl("/out/strokes.json", hosts)).toBe(false);
  });

  test("an empty host list allows nothing", () => {
    expect(isAllowedResultUrl(VENDOR_URL, [])).toBe(false);
  });

  test("hostname comparison is case-insensitive via the parser", () => {
    expect(
      isAllowedResultUrl(
        `https://SplitStepClientVideos.blob.core.windows.net/x.json`,
        hosts,
      ),
    ).toBe(true);
  });
});

test.describe("defaultResultHosts — env sources", () => {
  test("with neither env set the list is exactly the vendor host", async () => {
    await withEnv(ENV_KEYS, {}, async () => {
      expect(defaultResultHosts()).toEqual([VENDOR]);
      expect(isAllowedResultUrl(VENDOR_URL)).toBe(true);
      expect(
        isAllowedResultUrl("https://ourteam.blob.core.windows.net/x.json"),
      ).toBe(false);
    });
  });

  test("AZURE_STORAGE_ACCOUNT adds our own account beside the vendor's", async () => {
    await withEnv(ENV_KEYS, { AZURE_STORAGE_ACCOUNT: "ourteam" }, async () => {
      expect(defaultResultHosts()).toEqual([
        VENDOR,
        "ourteam.blob.core.windows.net",
      ]);
      expect(
        isAllowedResultUrl("https://ourteam.blob.core.windows.net/x.json"),
      ).toBe(true);
      // The account name is not itself a host.
      expect(isAllowedResultUrl("https://ourteam/x.json")).toBe(false);
    });
  });

  test("SPLITSTEP_RESULT_HOSTS adds each comma-separated entry, trimmed", async () => {
    await withEnv(
      ENV_KEYS,
      { SPLITSTEP_RESULT_HOSTS: " results.vendor.example, Mirror.Example ,, " },
      async () => {
        expect(defaultResultHosts()).toEqual([
          VENDOR,
          "results.vendor.example",
          "mirror.example",
        ]);
        expect(
          isAllowedResultUrl("https://results.vendor.example/strokes.json"),
        ).toBe(true);
        expect(isAllowedResultUrl("https://mirror.example/strokes.json")).toBe(
          true,
        );
        // Still exact: a subdomain of an allowed entry is not allowed.
        expect(
          isAllowedResultUrl("https://cdn.results.vendor.example/strokes.json"),
        ).toBe(false);
      },
    );
  });

  test("both sources together extend the set; neither replaces the vendor host", async () => {
    await withEnv(
      ENV_KEYS,
      {
        AZURE_STORAGE_ACCOUNT: "ourteam",
        SPLITSTEP_RESULT_HOSTS: "results.vendor.example",
      },
      async () => {
        expect(defaultResultHosts()).toEqual([
          VENDOR,
          "ourteam.blob.core.windows.net",
          "results.vendor.example",
        ]);
        expect(isAllowedResultUrl(VENDOR_URL)).toBe(true);
      },
    );
  });

  test("a blank SPLITSTEP_RESULT_HOSTS adds nothing", async () => {
    await withEnv(ENV_KEYS, { SPLITSTEP_RESULT_HOSTS: "  " }, async () => {
      expect(defaultResultHosts()).toEqual([VENDOR]);
    });
  });
});

test.describe("resultUrlHostname — what a refusal may name", () => {
  test("returns the host and nothing of the signed query", () => {
    expect(resultUrlHostname(VENDOR_URL)).toBe(VENDOR);
    expect(resultUrlHostname("https://[::1]/x")).toBe("[::1]");
  });

  test("never throws on junk", () => {
    expect(resultUrlHostname("not a url")).toBe("(unparseable)");
  });
});
