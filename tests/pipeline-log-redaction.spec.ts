import { expect, test } from "@playwright/test";

import { redactSignedUrls } from "@/lib/services/splitstep/pipeline-log";

/**
 * The webhook logs the raw delivery to the console, and a completion payload
 * carries 7-day SAS URLs whose query string is the credential. The console
 * line is printed verbatim, so the query is blanked before it is logged; the
 * stored delivery row keeps the raw body for recovery by hand.
 */

const BLOB =
  "https://splitstepclientvideos.blob.core.windows.net/results/x.json";

test.describe("redactSignedUrls", () => {
  test("blanks the SAS query but keeps host and path", () => {
    const body = JSON.stringify({
      results_url: `${BLOB}?sv=2024-11-04&se=2026-10-06T00%3A00%3A00Z&sig=abc123`,
    });
    const out = redactSignedUrls(body);

    expect(out).toContain(`${BLOB}?[redacted]`);
    expect(out).not.toContain("sig=");
    expect(out).not.toContain("se=");
    expect(out).not.toContain("abc123");
  });

  test("redacts every URL in the body", () => {
    const body = JSON.stringify({
      results_url: `${BLOB}?sv=1&sig=first`,
      video_url: `https://splitstepclientvideos.blob.core.windows.net/video/y.mp4?sv=1&sig=second`,
    });
    const out = redactSignedUrls(body);

    expect(out).toContain(`${BLOB}?[redacted]`);
    expect(out).toContain("/video/y.mp4?[redacted]");
    expect(out).not.toContain("first");
    expect(out).not.toContain("second");
    expect(JSON.parse(out).video_url).toBe(
      "https://splitstepclientvideos.blob.core.windows.net/video/y.mp4?[redacted]",
    );
  });

  test("returns a body with no URL byte-for-byte", () => {
    const body = '{"status":"completed","job_id":"ext-1","n":3}';
    expect(redactSignedUrls(body)).toBe(body);
    expect(redactSignedUrls(`${BLOB}`)).toBe(BLOB);
  });
});
