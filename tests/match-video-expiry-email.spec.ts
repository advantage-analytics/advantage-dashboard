import { expect, test } from "@playwright/test";

import {
  MATCH_VIDEO_EXPIRY_DAYS,
  MATCH_VIDEO_EXPIRY_WARN_DAYS,
  matchVideoExpiry,
} from "@/lib/match-video/expiry";
import { matchFilmHref } from "@/lib/match-video/film-entry";
import { siteUrl } from "@/lib/site-url";
import {
  matchVideoExpiryEmail,
  type EmailMessage,
  type MatchVideoExpiryInput,
} from "@/lib/services/email";
import {
  expiryWarningDedupeKey,
  warnExpiringMatchVideos,
  type ExpiryWarningDeps,
  type ExpiryWarningRow,
} from "@/lib/services/match-video/expiry-sweep";

/**
 * SwingVision Add video T9 — the expiry warning email, and the step that
 * sends it. Offline: the template is pure, and the warning step runs against
 * a fake claim, a fake `claimSend` and a fake sender, so nothing is mailed.
 */

const SITE = "https://app.example.test";
const DAY = 24 * 60 * 60 * 1000;

test.beforeAll(() => {
  process.env.NEXT_PUBLIC_SITE_URL = SITE;
});

/** The canvas's ExpiryEmail, as input. */
const CANVAS: MatchVideoExpiryInput = {
  to: "marcus@example.edu",
  recipientName: "Marcus Reid",
  matchId: "8a4f3c1e-0000-4000-8000-000000000001",
  player1Name: "Marcus Reid",
  player2Name: "Jordan Alvarez",
  matchDate: new Date("2025-09-12T00:00:00Z"),
  expiresAt: new Date("2026-10-23T09:00:00Z"),
  teamLabel: "Cardinal · M",
};

/* -------------------------------------------------------------------------
 * The template
 * ---------------------------------------------------------------------- */

test("the heading, subject and tag", () => {
  const msg = matchVideoExpiryEmail(CANVAS);
  expect(msg.to).toBe("marcus@example.edu");
  expect(msg.subject).toBe("A match video will be removed on Oct 23");
  expect(msg.tags).toEqual({ type: "match_video_expiry" });
  expect(msg.html).toContain(">A match video will be removed on Oct 23</h1>");
  expect(msg.html).toContain(
    "<title>A match video will be removed on Oct 23</title>",
  );
  expect(msg.text.split("\n")[0]).toBe(
    "A match video will be removed on Oct 23",
  );
});

test("the body names the match in bold, its date, the months unwatched and that the statistics stay", () => {
  const msg = matchVideoExpiryEmail(CANVAS);
  expect(msg.html).toMatch(
    /Nobody has watched the video on <b[^>]*>Marcus Reid vs Jordan Alvarez<\/b> \(Sep 12, 2025\) in 11 months\. We remove match videos after a year without a view\. The statistics stay\./,
  );
  expect(msg.text).toContain(
    "Nobody has watched the video on Marcus Reid vs Jordan Alvarez (Sep 12, 2025) in 11 months. We remove match videos after a year without a view. The statistics stay.",
  );
});

test("a 'Keep this video' button links to the match's Film", () => {
  const msg = matchVideoExpiryEmail(CANVAS);
  const url = `${siteUrl()}${matchFilmHref(CANVAS.matchId)}`;
  expect(url).toBe(`${SITE}/dashboard/matches/${CANVAS.matchId}?tab=film`);
  const href = url.replace(/&/g, "&amp;");
  expect(msg.html).toMatch(
    new RegExp(
      `<a href="${href.replace(/[.?]/g, "\\$&")}"[^>]*>[\\s\\S]*?Keep this video`,
    ),
  );
  expect(msg.text).toContain(`Keep this video:\n${url}`);
});

test("the keep-by-watching line", () => {
  const msg = matchVideoExpiryEmail(CANVAS);
  const line =
    "Watching any point of it keeps it too. Nothing to do if you don't need the film.";
  expect(msg.html).toContain(line.replace(/'/g, "&#39;"));
  expect(msg.text).toContain(line);
});

test("the footer names the recipient and why, then the team label — for a team video only", () => {
  const team = matchVideoExpiryEmail(CANVAS);
  expect(team.html).toContain(
    "Sent to Marcus Reid because you added this video. Cardinal · M",
  );
  expect(team.text).toContain(
    "Sent to Marcus Reid because you added this video. Cardinal · M",
  );

  const personal = matchVideoExpiryEmail({ ...CANVAS, teamLabel: null });
  expect(personal.html).toContain(
    "Sent to Marcus Reid because you added this video.</p>",
  );
  expect(personal.text).toContain(
    "Sent to Marcus Reid because you added this video.\n",
  );
  expect(personal.html).not.toContain("Cardinal");
});

test("dates are UTC: an expiry just after midnight UTC is that day everywhere", () => {
  const msg = matchVideoExpiryEmail({
    ...CANVAS,
    // 00:30 UTC on Oct 23 is still Oct 22 in the Americas.
    expiresAt: new Date("2026-10-23T00:30:00Z"),
    matchDate: new Date("2025-09-12T23:30:00Z"),
  });
  expect(msg.subject).toBe("A match video will be removed on Oct 23");
  expect(msg.text).toContain("(Sep 12, 2025)");
});

test("names are escaped, and a missing match date drops the parenthetical", () => {
  const msg = matchVideoExpiryEmail({
    ...CANVAS,
    player2Name: "<script>O'Neil</script>",
    matchDate: null,
  });
  expect(msg.html).not.toContain("<script>");
  expect(msg.html).toContain("&lt;script&gt;O&#39;Neil&lt;/script&gt;");
  expect(msg.text).toContain(
    "on Marcus Reid vs <script>O'Neil</script> in 11 months.",
  );
});

test("the body always says 11 months, whatever the calendar count", () => {
  // Day 335 from Mar 1 is Jan 30: ten whole calendar months. The copy is the
  // approved design's fixed "11 months", not the computed count.
  const msg = matchVideoExpiryEmail({ ...CANVAS, matchDate: null });
  expect(msg.text).toContain(" in 11 months.");
  expect(msg.text).not.toMatch(/in 10 months/);
});

/* -------------------------------------------------------------------------
 * The warning step — fake claim, fake dedupe, fake sender
 * ---------------------------------------------------------------------- */

const NOW = new Date("2026-09-24T05:00:00Z");
/** Day 335 of the clock: the first day the warning is due. */
const CLOCK = new Date(
  NOW.getTime() -
    (MATCH_VIDEO_EXPIRY_DAYS - MATCH_VIDEO_EXPIRY_WARN_DAYS) * DAY,
);

function row(overrides: Partial<ExpiryWarningRow> = {}): ExpiryWarningRow {
  return {
    attachment_id: "att-1",
    match_id: "match-1",
    uploaded_by: "user-1",
    activated_at: new Date(CLOCK.getTime() - 40 * DAY).toISOString(),
    last_viewed_at: CLOCK.toISOString(),
    expiry_warned_at: NOW.toISOString(),
    player1_name: "Marcus Reid",
    player2_name: "Jordan Alvarez",
    match_date: "2025-09-12T00:00:00Z",
    program_id: "program-1",
    program_school_name: "Cardinal",
    program_team: "mens",
    uploader_email: "marcus@example.edu",
    uploader_first_name: "marcus",
    uploader_last_name: "reid",
    ...overrides,
  };
}

function harness(rows: ExpiryWarningRow[], spent: string[] = []) {
  const queue = [...rows];
  const keys = new Set(spent);
  const events: string[] = [];
  const sent: EmailMessage[] = [];
  const deps: ExpiryWarningDeps = {
    claimWarnings: async (limit) => {
      events.push(`claim:${limit}`);
      return queue.splice(0, limit);
    },
    claimSend: async (key) => {
      events.push(`claimSend:${key}`);
      if (keys.has(key)) return false;
      keys.add(key);
      return true;
    },
    send: async (message) => {
      events.push(`send:${message.to}`);
      sent.push(message);
      return { ok: true, id: "fake" };
    },
    now: () => NOW,
  };
  return { deps, events, sent, keys };
}

test("a warned row is emailed to its uploader only after claimSend returns true", async () => {
  const h = harness([row()]);
  const result = await warnExpiringMatchVideos(h.deps);

  const key = `match_video_expiry:att-1:${CLOCK.toISOString().slice(0, 10)}`;
  expect(expiryWarningDedupeKey("att-1", CLOCK)).toBe(key);
  expect(h.events).toEqual([
    "claim:1",
    `claimSend:${key}`,
    "send:marcus@example.edu",
    "claim:1",
  ]);
  expect(result).toEqual({ warned: 1, emailed: 1, skipped: 0, failed: 0 });

  const [msg] = h.sent;
  const expiry = matchVideoExpiry(
    { activatedAt: row().activated_at, lastViewedAt: row().last_viewed_at },
    NOW,
  );
  // The removal date comes from expiry.ts, never a constant.
  expect(msg.subject).toBe(
    `A match video will be removed on ${new Intl.DateTimeFormat("en-US", {
      month: "short",
      day: "numeric",
      timeZone: "UTC",
    }).format(expiry.expiresAt)}`,
  );
  expect(msg.text).toContain("in 11 months.");
  expect(msg.text).toContain(
    "Sent to Marcus Reid because you added this video. Cardinal · M",
  );
  expect(msg.html).toContain(`${SITE}/dashboard/matches/match-1?tab=film`);
});

test("a spent dedupe key sends nothing", async () => {
  const key = expiryWarningDedupeKey("att-1", CLOCK);
  const h = harness([row()], [key]);
  const result = await warnExpiringMatchVideos(h.deps);
  expect(h.sent).toEqual([]);
  expect(result).toEqual({ warned: 1, emailed: 0, skipped: 1, failed: 0 });
});

test("a row with a null uploader is skipped without claiming a key", async () => {
  const h = harness([
    row({ attachment_id: "orphaned", uploaded_by: null, uploader_email: null }),
    row({ attachment_id: "att-2" }),
  ]);
  const result = await warnExpiringMatchVideos(h.deps);
  expect(h.events.some((e) => e.includes("orphaned"))).toBe(false);
  expect(h.sent.map((m) => m.to)).toEqual(["marcus@example.edu"]);
  expect(result).toEqual({ warned: 2, emailed: 1, skipped: 1, failed: 0 });
});

test("a personal video drops the team label; the clock falls back to activation", async () => {
  const activated = new Date(NOW.getTime() - 340 * DAY).toISOString();
  const h = harness([
    row({
      program_id: null,
      program_school_name: null,
      program_team: null,
      last_viewed_at: null,
      activated_at: activated,
      uploader_first_name: null,
      uploader_last_name: null,
    }),
  ]);
  await warnExpiringMatchVideos(h.deps);
  const [msg] = h.sent;
  expect(msg.text).toContain(
    "Sent to marcus@example.edu because you added this video.\n",
  );
  expect(h.events).toContain(
    `claimSend:${expiryWarningDedupeKey("att-1", new Date(activated))}`,
  );
});

test("a refused send is counted, not thrown, and the next row still goes", async () => {
  const h = harness([row(), row({ attachment_id: "att-2" })]);
  let first = true;
  h.deps.send = async (message) => {
    h.sent.push(message);
    if (first) {
      first = false;
      return { ok: false, error: "resend_500" };
    }
    return { ok: true, id: "fake" };
  };
  const result = await warnExpiringMatchVideos(h.deps);
  expect(result).toEqual({ warned: 2, emailed: 1, skipped: 0, failed: 1 });
});

test("the step stops at its row limit and its time budget, leaving the rest unclaimed", async () => {
  const many = Array.from({ length: 5 }, (_, i) =>
    row({ attachment_id: `att-${i}` }),
  );

  const byLimit = harness(many);
  expect((await warnExpiringMatchVideos(byLimit.deps, 3)).warned).toBe(3);
  expect(byLimit.events.filter((e) => e.startsWith("claim:"))).toHaveLength(3);

  const byBudget = harness(many);
  let ms = 0;
  byBudget.deps.elapsedClock = () => ms;
  const send = byBudget.deps.send;
  byBudget.deps.send = async (message) => {
    ms += 6_000; // a slow sender
    return send(message);
  };
  const result = await warnExpiringMatchVideos(byBudget.deps, 25, 15_000);
  // 0 → 6 → 12 s are under budget; at 18 s nothing more is claimed.
  expect(result.warned).toBe(3);
  expect(byBudget.events.filter((e) => e.startsWith("claim:"))).toHaveLength(3);
});
