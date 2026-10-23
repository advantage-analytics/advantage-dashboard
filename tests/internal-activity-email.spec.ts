import { expect, test } from "@playwright/test";

import {
  signupInternalEmail,
  uploadInternalEmail,
  type UploadInternalInput,
} from "@/lib/services/email";
import {
  isTestAccountEmail,
  parseInternalEvent,
} from "@/lib/services/notifications/internal-activity-mail";

/**
 * The signup and upload alerts to the internal inbox. Offline: the templates
 * are pure, and so are the two helpers that decide what the route accepts and
 * which accounts it stays quiet about. Nothing here touches a database.
 */

const USER = "6f1c2a3b-4d5e-4f60-8a7b-9c0d1e2f3a4b";
const MATCH = "0a1b2c3d-4e5f-4061-8273-8495a6b7c8d9";

function expectResendSafeTags(tags: Record<string, string> | undefined) {
  // Resend rejects anything outside ASCII letters, numbers, `_` and `-`.
  for (const value of Object.values(tags ?? {})) {
    expect(value).toMatch(/^[A-Za-z0-9_-]+$/);
  }
}

test("signup: subject, facts and tags with a name", () => {
  const msg = signupInternalEmail({
    to: "team@advantage-analytics.com",
    userId: USER,
    email: "maya@stanford.edu",
    name: "Maya Chen",
    signInMethod: "google",
    adminUrl: "https://app.example.test/admin",
  });

  expect(msg.subject).toBe("New signup: maya@stanford.edu");
  expect(msg.tags).toEqual({ type: "signup_internal" });
  expectResendSafeTags(msg.tags);
  expect(msg.text).toContain("Name: Maya Chen");
  expect(msg.text).toContain("Sign-in: google");
  expect(msg.text).toContain(`Account: ${USER}`);
  expect(msg.html).toContain('<a href="https://app.example.test/admin"');
});

test("signup: no name yet says so and drops the Name fact", () => {
  const msg = signupInternalEmail({
    to: "team@advantage-analytics.com",
    userId: USER,
    email: "maya@stanford.edu",
    name: null,
    signInMethod: null,
    adminUrl: "https://app.example.test/admin",
  });

  expect(msg.text.split("\n")[0]).toBe("maya@stanford.edu signed up");
  expect(msg.text).toContain("no name yet");
  expect(msg.text).not.toContain("Name:");
  expect(msg.text).not.toContain("Sign-in:");
});

function upload(kind: UploadInternalInput["kind"]): UploadInternalInput {
  return {
    to: "team@advantage-analytics.com",
    kind,
    matchId: MATCH,
    matchTitle: "Maya Chen vs. Lena Ortiz",
    context: "Personal match",
    uploaderName: "Maya Chen",
    uploaderEmail: "maya@stanford.edu",
    matchUrl: `https://app.example.test/dashboard/matches/${MATCH}`,
  };
}

for (const [kind, label] of [
  ["video", "Video"],
  ["swingvision", "SwingVision"],
] as const) {
  test(`upload (${kind}): subject, Source fact, tags and CTA`, () => {
    const msg = uploadInternalEmail(upload(kind));

    expect(msg.subject).toBe(`${label} upload: Maya Chen vs. Lena Ortiz`);
    expect(msg.tags).toEqual({ type: "upload_internal", kind });
    expectResendSafeTags(msg.tags);
    expect(msg.text).toContain(`Source: ${label}`);
    expect(msg.text).toContain("Uploader: Maya Chen (maya@stanford.edu)");
    expect(msg.html).toContain(
      `<a href="https://app.example.test/dashboard/matches/${MATCH}"`,
    );
  });
}

test("upload: a deleted uploader still renders", () => {
  const msg = uploadInternalEmail({
    ...upload("video"),
    uploaderName: null,
    uploaderEmail: null,
  });
  expect(msg.text).toContain("Uploader: Unknown — account deleted");
});

test("parseInternalEvent accepts the three kinds the triggers send", () => {
  for (const kind of ["signup", "video_upload", "swingvision_upload"]) {
    expect(parseInternalEvent({ kind, id: USER })).toEqual({ kind, id: USER });
  }
});

test("parseInternalEvent refuses anything else", () => {
  for (const body of [
    null,
    "signup",
    [],
    {},
    { kind: "signup" },
    { kind: "deleted", id: USER },
    { kind: "signup", id: "not-a-uuid" },
    { kind: "signup", id: `${USER}; drop table users` },
    { kind: ["signup"], id: USER },
  ]) {
    expect(parseInternalEvent(body)).toBeNull();
  }
});

test("isTestAccountEmail matches the live-spec logins only", () => {
  expect(isTestAccountEmail("run42-coach@example.com")).toBe(true);
  expect(isTestAccountEmail("someone@EXAMPLE.org")).toBe(true);
  expect(isTestAccountEmail("maya@stanford.edu")).toBe(false);
  expect(isTestAccountEmail("me@example.company.com")).toBe(false);
  expect(isTestAccountEmail(null)).toBe(false);
});
