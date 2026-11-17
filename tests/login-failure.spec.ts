import { expect, test } from "@playwright/test";
import { loginFailureReason } from "../src/lib/auth/login-failure";

// `login_failed` carries this slug and nothing else from the error, so the
// daily UX report can tell a forgotten password from a lockout without a
// Supabase message — which can quote the typed address — reaching PostHog.

test("Supabase's error code decides the reason", () => {
  expect(loginFailureReason({ code: "invalid_credentials" })).toBe(
    "invalid_credentials",
  );
  expect(loginFailureReason({ code: "email_not_confirmed" })).toBe(
    "email_not_confirmed",
  );
  expect(loginFailureReason({ code: "over_request_rate_limit" })).toBe(
    "rate_limited",
  );
});

test("without a known code the message is matched, not sent", () => {
  expect(loginFailureReason(new Error("Invalid login credentials"))).toBe(
    "invalid_credentials",
  );
  expect(loginFailureReason(new TypeError("Failed to fetch"))).toBe("network");
  expect(
    loginFailureReason(new Error("For security purposes, retry in 42s")),
  ).toBe("rate_limited");
});

test("anything else is 'unknown', never the text itself", () => {
  const reason = loginFailureReason(
    new Error("player@example.com could not be found"),
  );
  expect(reason).toBe("unknown");
  expect(loginFailureReason(undefined)).toBe("unknown");
  expect(loginFailureReason({ code: "something_new" })).toBe("unknown");
});
