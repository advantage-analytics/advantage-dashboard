import { readdirSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import { expect, test } from "@playwright/test";
import type { SupabaseClient } from "@supabase/supabase-js";

import { firstUploadNudgeEmail, type EmailMessage } from "@/lib/services/email";
import {
  unsubscribeLinks,
  unsubscribeToken,
  verifyUnsubscribeToken,
} from "@/lib/services/email/unsubscribe";
import {
  FIRST_UPLOAD_STEPS,
  firstUploadClaimKey,
  sweepFirstUploadNudges,
  type FirstUploadCandidate,
  type FirstUploadSweepDeps,
  type FirstUploadWindow,
} from "@/lib/services/notifications/first-upload-mail";

/**
 * The first-upload nudges: the two emails, the signed unsubscribe link, and
 * the sweep that sends them. Offline — candidates, claim and send are
 * injected, so nothing reads the database or mails anyone.
 */

const SITE = "https://app.example.test";
const USER = "0b7c9a1e-4f2d-4b8a-9c3e-2d1f5a6b7c8d";
const OTHER = "1c8dab2f-5a3e-4c9b-8d4f-3e2a6b7c8d9e";

// Set for this file and put back after it, so a later spec in the same
// worker never inherits a fake service-role key.
const SAVED_ENV = {
  NEXT_PUBLIC_SITE_URL: process.env.NEXT_PUBLIC_SITE_URL,
  SUPABASE_SERVICE_ROLE_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
};

test.beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
  process.env.SUPABASE_SERVICE_ROLE_KEY = "test-service-role-key";
});

test.afterAll(() => {
  for (const [name, value] of Object.entries(SAVED_ENV)) {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

const LINKS = {
  page: `${SITE}/email/unsubscribe?u=${USER}&t=tok`,
  oneClick: `${SITE}/api/email/unsubscribe?u=${USER}&t=tok`,
};

function mail(step: 1 | 2, firstName: string | null = "Jordan") {
  return firstUploadNudgeEmail({
    to: "jordan@example.test",
    step,
    firstName,
    unsubscribe: LINKS,
    postalAddress: "123 Example St, San Diego, CA 92101",
  });
}

// ─── The emails ────────────────────────────────────────────────────────────

test("step 1 leads with the SwingVision import, step 2 with video", () => {
  const one = mail(1);
  const two = mail(2);
  expect(one.subject).toBe("Your first match takes about two minutes");
  expect(one.text).toContain("SwingVision");
  expect(one.text).toContain(".xlsx");
  expect(two.subject).toBe("Got match video? We'll do the charting");
  expect(two.text).toContain("Advantage Intelligence");
  for (const m of [one, two]) {
    expect(m.text).toContain(`${SITE}/dashboard/matches/new`);
    expect(m.tags?.type).toBe("first_upload_nudge");
  }
  expect(one.tags?.step).toBe("1");
  expect(two.tags?.step).toBe("2");
});

test("both carry a postal address, a footer unsubscribe and one-click headers", () => {
  for (const m of [mail(1), mail(2)]) {
    expect(m.text).toContain("123 Example St, San Diego, CA 92101");
    expect(m.text).toContain(`Unsubscribe: ${LINKS.page}`);
    expect(m.html).toContain("Unsubscribe</a>");
    // The header goes to the POST endpoint, never the page a scanner GETs.
    expect(m.headers?.["List-Unsubscribe"]).toBe(`<${LINKS.oneClick}>`);
    expect(m.headers?.["List-Unsubscribe-Post"]).toBe(
      "List-Unsubscribe=One-Click",
    );
  }
});

test("a missing first name drops the name, not the sentence", () => {
  expect(mail(1, null).text).toContain(
    "\nIf you track matches with SwingVision",
  );
  expect(mail(2, null).text).toContain("\nYou don't need a tracking app");
  expect(mail(1, "  ").text).not.toContain("Hi ,");
  expect(mail(1).text).toContain("Hi Jordan, if you track");
});

// ─── The unsubscribe link ──────────────────────────────────────────────────

test("a token verifies for its own user only", () => {
  const token = unsubscribeToken(USER)!;
  expect(token).toBeTruthy();
  expect(verifyUnsubscribeToken(USER, token)).toBe(true);
  expect(verifyUnsubscribeToken(OTHER, token)).toBe(false);
  expect(verifyUnsubscribeToken(USER, token.slice(1))).toBe(false);
  expect(verifyUnsubscribeToken(USER, "")).toBe(false);
});

test("links point at the confirm page and the one-click endpoint", () => {
  const links = unsubscribeLinks(USER)!;
  const token = encodeURIComponent(unsubscribeToken(USER)!);
  expect(links.page).toBe(`${SITE}/email/unsubscribe?u=${USER}&t=${token}`);
  expect(links.oneClick).toBe(
    `${SITE}/api/email/unsubscribe?u=${USER}&t=${token}`,
  );
});

test("without the service-role key there is no link, and so no send", () => {
  const saved = process.env.SUPABASE_SERVICE_ROLE_KEY;
  delete process.env.SUPABASE_SERVICE_ROLE_KEY;
  try {
    expect(unsubscribeLinks(USER)).toBeNull();
    expect(verifyUnsubscribeToken(USER, "anything")).toBe(false);
  } finally {
    process.env.SUPABASE_SERVICE_ROLE_KEY = saved;
  }
});

test("the unsubscribe page only acts on POST", () => {
  const page = readFileSync(
    resolve(process.cwd(), "src/app/(auth)/email/unsubscribe/page.tsx"),
    "utf8",
  );
  expect(page).not.toContain("applyUnsubscribe");
  expect(page).toContain("action={unsubscribeForm}");
  const route = readFileSync(
    resolve(process.cwd(), "src/app/api/email/unsubscribe/route.ts"),
    "utf8",
  );
  expect(route).toContain("export async function POST");
  expect(route).not.toContain("export async function GET");
  // Refusals go through the shared helper, as AGENTS.md asks.
  expect(route).toContain("errorResponse(");
  expect(route).not.toContain("NextResponse.json");
});

test("a failed write sends the person back with their link, so they can retry", () => {
  const action = readFileSync(
    resolve(process.cwd(), "src/app/(auth)/email/unsubscribe/actions.ts"),
    "utf8",
  );
  expect(action).toMatch(/outcome === "failed"[^}]*query\.set\("u"/);
  expect(action).toMatch(/query\.set\("t"/);
});

// ─── The sweep ─────────────────────────────────────────────────────────────

const db = {} as SupabaseClient;

function deps(
  byStep: Partial<Record<1 | 2, FirstUploadCandidate[]>>,
  overrides: Partial<FirstUploadSweepDeps> = {},
) {
  const claimed = new Set<string>();
  const sent: EmailMessage[] = [];
  const seen: FirstUploadWindow[] = [];
  const limits: number[] = [];
  const pauses: number[] = [];
  const d: FirstUploadSweepDeps = {
    candidates: async (_db, window, limit) => {
      seen.push(window);
      limits.push(limit);
      return (byStep[window.step] ?? []).slice(0, limit);
    },
    claim: async (key) => {
      if (claimed.has(key)) return false;
      claimed.add(key);
      return true;
    },
    send: async (message) => {
      sent.push(message);
      return { ok: true };
    },
    postalAddress: () => "123 Example St",
    links: () => LINKS,
    pause: async (ms) => {
      pauses.push(ms);
    },
    now: () => 0,
    ...overrides,
  };
  return { d, claimed, sent, seen, limits, pauses };
}

const person = (id: string, email = `${id}@example.test`) => ({
  user_id: id,
  email,
  first_name: "Sam",
});

test("the windows run 2–7 and 7–14 days and do not overlap", () => {
  expect(FIRST_UPLOAD_STEPS).toEqual([
    { step: 1, minDays: 2, maxDays: 7 },
    { step: 2, minDays: 7, maxDays: 14 },
  ]);
});

test("each window's candidates get that step, claimed once each", async () => {
  const { d, claimed, sent } = deps({
    1: [person(USER)],
    2: [person(OTHER)],
  });
  const result = await sweepFirstUploadNudges(db, d);
  expect(result).toEqual({
    skipped: null,
    outOfTime: false,
    sent: { 1: 1, 2: 1 },
  });
  expect(sent.map((m) => m.tags?.step)).toEqual(["1", "2"]);
  expect([...claimed]).toEqual([
    firstUploadClaimKey(1, USER),
    firstUploadClaimKey(2, OTHER),
  ]);
});

test("a second run sends nothing already claimed", async () => {
  const { d, sent } = deps({ 1: [person(USER)] });
  await sweepFirstUploadNudges(db, d);
  await sweepFirstUploadNudges(db, d);
  expect(sent).toHaveLength(1);
});

test("no postal address sends nothing at all", async () => {
  const { d, sent, seen } = deps(
    { 1: [person(USER)] },
    { postalAddress: () => null },
  );
  const result = await sweepFirstUploadNudges(db, d);
  expect(result.skipped).toBe("no_postal_address");
  expect(sent).toHaveLength(0);
  expect(seen).toHaveLength(0);
});

test("no unsubscribe link sends nothing and claims nothing", async () => {
  const { d, sent, claimed } = deps(
    { 1: [person(USER)] },
    { links: () => null },
  );
  await sweepFirstUploadNudges(db, d);
  expect(sent).toHaveLength(0);
  expect(claimed.size).toBe(0);
});

test("a blank address is skipped before it is claimed", async () => {
  const { d, sent, claimed } = deps({ 1: [person(USER, "  ")] });
  await sweepFirstUploadNudges(db, d);
  expect(sent).toHaveLength(0);
  expect(claimed.size).toBe(0);
});

test("a run stops at 40 emails across both steps", async () => {
  const many = (prefix: string) =>
    Array.from({ length: 30 }, (_, i) => person(`${prefix}-${i}`));
  const { d, sent } = deps({ 1: many("a"), 2: many("b") });
  const result = await sweepFirstUploadNudges(db, d);
  expect(sent).toHaveLength(40);
  expect(result.sent).toEqual({ 1: 30, 2: 10 });
});

test("a failed read of one window still runs the other", async () => {
  const { d, sent } = deps(
    {},
    {
      candidates: async (_db, w) => (w.step === 1 ? null : [person(OTHER)]),
    },
  );
  const result = await sweepFirstUploadNudges(db, d);
  expect(sent).toHaveLength(1);
  expect(result.sent[2]).toBe(1);
});

test("sends are spaced under Resend's rate limit, with no wait before the first", async () => {
  const { d, sent, pauses } = deps({
    1: [person(USER)],
    2: [person(OTHER), person("third")],
  });
  await sweepFirstUploadNudges(db, d);
  expect(sent).toHaveLength(3);
  expect(pauses).toEqual([600, 600]);
});

test("each window is asked only for what the run can still send", async () => {
  const many = (prefix: string) =>
    Array.from({ length: 30 }, (_, i) => person(`${prefix}-${i}`));
  const { d, limits } = deps({ 1: many("a"), 2: many("b") });
  await sweepFirstUploadNudges(db, d);
  expect(limits).toEqual([40, 10]);
});

test("the candidate query leaves out people already mailed for that step", () => {
  const sweep = readFileSync(
    resolve(
      process.cwd(),
      "src/lib/services/notifications/first-upload-mail.ts",
    ),
    "utf8",
  );
  expect(sweep).toContain("p_dedupe_prefix: claimPrefix(step)");
  expect(firstUploadClaimKey(2, USER)).toBe(`first_upload_nudge:2:${USER}`);
  // By name suffix: the version prefix becomes whatever live records.
  const dir = resolve(process.cwd(), "supabase/migrations");
  const file = readdirSync(dir).find((name) =>
    name.endsWith("_first_upload_nudges_skip_mailed.sql"),
  );
  expect(file).toBeTruthy();
  const migration = readFileSync(resolve(dir, file!), "utf8");
  expect(migration).toContain(
    "where s.dedupe_key = p_dedupe_prefix || u.id::text",
  );
});

test("a slow run stops before claiming once its time budget is spent", async () => {
  // Each send costs ten seconds on this clock.
  let clock = 0;
  const many = Array.from({ length: 10 }, (_, i) => person(`slow-${i}`));
  const { d, sent, claimed } = deps(
    { 1: many },
    {
      now: () => clock,
      send: async (message) => {
        clock += 10_000;
        sent.push(message);
        return { ok: true };
      },
    },
  );
  const result = await sweepFirstUploadNudges(db, d);
  expect(result.outOfTime).toBe(true);
  // 0, 10, 20, 30, 40 s pass the check; at 50 s nothing more is claimed.
  expect(sent).toHaveLength(5);
  expect(claimed.size).toBe(5);
});

test("the pause comes before the claim, so a kill never lands between claim and send", () => {
  const sweep = readFileSync(
    resolve(
      process.cwd(),
      "src/lib/services/notifications/first-upload-mail.ts",
    ),
    "utf8",
  );
  const pause = sweep.indexOf("await deps.pause(");
  const clock = sweep.indexOf("deps.now() - startedAt");
  const claim = sweep.indexOf("await deps.claim(");
  const send = sweep.indexOf("await deps.send(");
  expect(pause).toBeLessThan(clock);
  expect(clock).toBeLessThan(claim);
  expect(claim).toBeLessThan(send);
});

test("Settings writes the getting-started switch only when that switch changed", () => {
  // An unsubscribe from the email must survive a stale Settings tab saving
  // some other switch.
  const action = readFileSync(
    resolve(
      process.cwd(),
      "src/components/dashboard/settings/preferences-actions.ts",
    ),
    "utf8",
  );
  expect(action).toMatch(
    /gettingStarted\s*\?\s*\{ email_getting_started: next\.emailGettingStarted \}\s*:\s*\{\}/,
  );
  const form = readFileSync(
    resolve(
      process.cwd(),
      "src/components/dashboard/settings/preferences-form.tsx",
    ),
    "utf8",
  );
  expect(form).toContain('gettingStarted: "emailGettingStarted" in patch');
});
