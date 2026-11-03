import { expect, test } from "@playwright/test";

import { SUPPORT_ADDRESS, supportReplyEmail } from "@/lib/services/email";

/** The staff-reply email to a player. Offline: the template is pure. */

const msg = supportReplyEmail({
  to: "maya@stanford.edu",
  playerFirstName: "Maya",
  adminFirstName: "Cj",
  body: "Thanks for flagging this.\nWe fixed the score on your Tuesday match.",
  sentAt: new Date("2026-11-02T15:00:00Z"),
});

test("envelope: subject, tags and replyTo", () => {
  expect(msg.to).toBe("maya@stanford.edu");
  expect(msg.subject).toBe("Cj at Advantage replied");
  expect(msg.tags).toEqual({ type: "support_reply" });
  expect(msg.replyTo).toBe(SUPPORT_ADDRESS);
});

for (const kind of ["html", "text"] as const) {
  test(`${kind} carries body, sign-off, button and link`, () => {
    const out = msg[kind] ?? "";
    expect(out).toContain("Thanks for flagging this.");
    expect(out).toContain("We fixed the score on your Tuesday match.");
    expect(out).toContain("Cj at Advantage");
    expect(out).toContain("Reply in Advantage");
    expect(out).toContain("/dashboard/messages");
  });
}

test("html links the button and splits lines into paragraphs", () => {
  expect(msg.html).toMatch(/href="[^"]*\/dashboard\/messages"/);
  expect(msg.html).toContain("Thanks for flagging this.</p>");
});
