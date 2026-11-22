import { expect, test } from "@playwright/test";

import { unlistedProgramDeclinedEmail } from "@/lib/services/email";

/**
 * The "we can't add your school" email, sent when an admin dismisses an
 * unlisted-program request. Offline: the template is pure.
 */

const msg = unlistedProgramDeclinedEmail({
  to: "coach@example.edu",
  programName: "HZCU Men's",
});

test("envelope: recipient, subject and tag", () => {
  expect(msg.to).toBe("coach@example.edu");
  // The answer is in the mail, not the subject line.
  expect(msg.subject).toBe("Update on your request to add HZCU Men's");
  expect(msg.subject).not.toMatch(/can't|declin|reject/i);
  expect(msg.tags).toEqual({ type: "unlisted_program_declined" });
});

for (const kind of ["html", "text"] as const) {
  test(`${kind} names the program and offers signing up alone`, () => {
    const out = msg[kind] ?? "";
    expect(out).toContain("right now");
    expect(out).toContain("on your own");
    expect(out).toContain("/sign-up");
  });
}

test("html escapes the program name the requester typed", () => {
  const typed = unlistedProgramDeclinedEmail({
    to: "x@example.edu",
    programName: `<script>alert(1)</script> Men's`,
  });
  expect(typed.html).not.toContain("<script>alert(1)</script>");
});
