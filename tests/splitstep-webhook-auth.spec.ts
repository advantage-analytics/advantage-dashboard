import { expect, test } from "@playwright/test";
import { NextRequest } from "next/server";
import { createHmac } from "crypto";

import { verifyWebhookAuth } from "@/lib/services/splitstep/webhook-auth";
import { withEnv } from "./fixtures/with-env";

/**
 * `verifyWebhookAuth()` — the accept/refuse decision in front of the SplitStep
 * results webhook. What this pins: with the secret set, a delivery with no
 * signature header is refused (fail-closed), not waved through as it was
 * during the pilot; the only way back to accepting one is the explicit
 * `SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED=true`, and even then it is recorded
 * unverified. `SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE` is inert either way.
 *
 * Pure, so no browser, no dev server and no database — the same as
 * `tests/request-origin.spec.ts`. The function reads `process.env` on every
 * call, which is what lets `withEnv` drive each scenario.
 */

const ENV_KEYS = [
  "SPLITSTEP_WEBHOOK_SECRET",
  "SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED",
  "SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE",
] as const;

const SECRET = "test-webhook-secret";
const RAW_BODY = JSON.stringify({ job_id: "job-1", status: "job_completed" });

function sign(secret: string, rawBody: string): string {
  return createHmac("sha256", secret).update(rawBody, "utf8").digest("base64");
}

function deliveryWith(headers: Record<string, string>): NextRequest {
  return new NextRequest("http://localhost/api/webhooks/splitstep", {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: RAW_BODY,
  });
}

test.describe("verifyWebhookAuth · fail-closed once the secret is set", () => {
  test("secret set, no signature header → refused", async () => {
    await withEnv(ENV_KEYS, { SPLITSTEP_WEBHOOK_SECRET: SECRET }, async () => {
      const outcome = verifyWebhookAuth(deliveryWith({}), RAW_BODY);
      expect(outcome).toMatchObject({ ok: false, verified: false });
    });
  });

  test("REQUIRE_SIGNATURE no longer reopens the endpoint either way", async () => {
    for (const value of ["true", "false"]) {
      await withEnv(
        ENV_KEYS,
        {
          SPLITSTEP_WEBHOOK_SECRET: SECRET,
          SPLITSTEP_WEBHOOK_REQUIRE_SIGNATURE: value,
        },
        async () => {
          const outcome = verifyWebhookAuth(deliveryWith({}), RAW_BODY);
          expect(outcome).toMatchObject({ ok: false, verified: false });
        },
      );
    }
  });

  test("secret set, wrong x-hmac-signature → refused", async () => {
    await withEnv(ENV_KEYS, { SPLITSTEP_WEBHOOK_SECRET: SECRET }, async () => {
      const outcome = verifyWebhookAuth(
        deliveryWith({
          "x-hmac-signature": sign("some-other-secret", RAW_BODY),
        }),
        RAW_BODY,
      );
      expect(outcome).toMatchObject({ ok: false, verified: false });
    });
  });

  test("secret set, correct x-hmac-signature → accepted and verified", async () => {
    await withEnv(ENV_KEYS, { SPLITSTEP_WEBHOOK_SECRET: SECRET }, async () => {
      const outcome = verifyWebhookAuth(
        deliveryWith({ "x-hmac-signature": sign(SECRET, RAW_BODY) }),
        RAW_BODY,
      );
      expect(outcome).toMatchObject({ ok: true, verified: true });
    });
  });

  test("secret set, no header, ALLOW_UNSIGNED=true → accepted but unverified", async () => {
    await withEnv(
      ENV_KEYS,
      {
        SPLITSTEP_WEBHOOK_SECRET: SECRET,
        SPLITSTEP_WEBHOOK_ALLOW_UNSIGNED: "true",
      },
      async () => {
        const outcome = verifyWebhookAuth(deliveryWith({}), RAW_BODY);
        expect(outcome).toMatchObject({ ok: true, verified: false });
      },
    );
  });

  test("no secret at all → accepted, unverified (open endpoint)", async () => {
    await withEnv(ENV_KEYS, {}, async () => {
      const outcome = verifyWebhookAuth(deliveryWith({}), RAW_BODY);
      expect(outcome).toMatchObject({ ok: true, verified: false });
    });
  });
});
