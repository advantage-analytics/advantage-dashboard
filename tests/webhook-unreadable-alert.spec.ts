import { expect, test } from "@playwright/test";

import { webhookUnreadableInternalEmail } from "@/lib/services/email";
import {
  parseVendorJson,
  parseWebhookPayload,
  unreadableWebhookReason,
} from "@/lib/services/splitstep/webhook-payload";

/**
 * The alert for a signed SplitStep delivery we cannot act on. On 2026-10-25
 * three completions were stored and answered 200 with nothing read from them,
 * and nobody knew for thirteen hours. Offline: both pieces are pure.
 */

const reason = (body: string) => {
  let parsed: unknown = null;
  try {
    parsed = parseVendorJson(body);
  } catch {
    /* unreadable */
  }
  return unreadableWebhookReason(parsed, parseWebhookPayload(parsed));
};

test.describe("unreadableWebhookReason", () => {
  test("a body that is not JSON", () => {
    expect(reason("<html>502</html>")).toBe("the body is not valid JSON");
    expect(reason('{"job_id": "a",')).toBe("the body is not valid JSON");
  });

  test("JSON with no job id", () => {
    expect(reason('{"status": "job_completed"}')).toBe("it names no job id");
  });

  test("a job id but no status we recognise", () => {
    expect(reason('{"job_id": "a", "status": "job_exploded"}')).toBe(
      "it carries no status we recognise",
    );
  });

  test("a readable delivery, NaN included, is not unreadable", () => {
    expect(
      reason(
        '{"job_id": "a", "status": "job_completed", "homography_score": NaN}',
      ),
    ).toBeNull();
    expect(reason('{"job_id": "a", "status": "queued"}')).toBeNull();
  });
});

test.describe("webhookUnreadableInternalEmail", () => {
  const msg = webhookUnreadableInternalEmail({
    to: "team@advantage-analytics.com",
    deliveryId: "3087ff46-e458-4800-9a34-99ee9a783a5c",
    reason: "the body is not valid JSON",
    externalJobId: null,
    bodyExcerpt: '{"job_id": "36a0015a", "status": "job_completed", "x": oops',
  });

  test("goes to the alerts inbox, tagged, naming the reason", () => {
    expect(msg.to).toBe("team@advantage-analytics.com");
    expect(msg.subject).toBe(
      "SplitStep webhook unreadable: the body is not valid JSON",
    );
    expect(msg.tags).toEqual({ type: "webhook_unreadable_internal" });
  });

  test("carries the delivery id to recover from and the start of the body", () => {
    expect(msg.text).toContain("3087ff46-e458-4800-9a34-99ee9a783a5c");
    expect(msg.text).toContain('"status": "job_completed"');
    expect(msg.text).not.toContain("Vendor job");
  });
});
