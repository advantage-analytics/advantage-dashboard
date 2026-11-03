import { expect, test } from "@playwright/test";

import {
  SUPPORT_ORIGINS,
  SUPPORT_TOPICS,
  foldOlderDays,
  hasUnreadStaff,
  lastAuthorRole,
  messagePreview,
  originLabel,
  sendErrorMessage,
  threadLastAt,
  topicLabel,
  waitingOn,
} from "@/lib/data/support-view";

/**
 * The pure half of in-app player messaging (`support-view.ts`). Offline —
 * no database, no browser.
 */

const at = (iso: string) => ({ createdAt: iso });

test.describe("waitingOn", () => {
  test("is 'you' when the player wrote last", () => {
    expect(
      waitingOn({
        lastPlayerMessageAt: "2026-11-02T10:00:00Z",
        lastStaffMessageAt: "2026-11-02T09:00:00Z",
      }),
    ).toBe("you");
  });

  test("is 'you' when only the player has written", () => {
    expect(
      waitingOn({
        lastPlayerMessageAt: "2026-11-02T10:00:00Z",
        lastStaffMessageAt: null,
      }),
    ).toBe("you");
  });

  test("is 'them' once staff reply", () => {
    expect(
      waitingOn({
        lastPlayerMessageAt: "2026-11-02T10:00:00Z",
        lastStaffMessageAt: "2026-11-02T10:05:00Z",
      }),
    ).toBe("them");
  });

  test("is 'them' for a thread with no messages", () => {
    expect(
      waitingOn({ lastPlayerMessageAt: null, lastStaffMessageAt: null }),
    ).toBe("them");
  });

  test("compares moments, not strings across offsets", () => {
    // 10:30+02:00 is 08:30Z — before the staff reply at 09:00Z.
    expect(
      waitingOn({
        lastPlayerMessageAt: "2026-11-02T10:30:00+02:00",
        lastStaffMessageAt: "2026-11-02T09:00:00Z",
      }),
    ).toBe("them");
  });
});

test.describe("lastAuthorRole / threadLastAt", () => {
  test("names the newer stamp and its moment", () => {
    const thread = {
      lastPlayerMessageAt: "2026-11-01T10:00:00Z",
      lastStaffMessageAt: "2026-11-02T10:00:00Z",
      createdAt: "2026-11-01T09:59:00Z",
    };
    expect(lastAuthorRole(thread)).toBe("staff");
    expect(threadLastAt(thread)).toBe("2026-11-02T10:00:00Z");
  });

  test("falls back to created_at with no messages", () => {
    const thread = {
      lastPlayerMessageAt: null,
      lastStaffMessageAt: null,
      createdAt: "2026-11-01T09:59:00Z",
    };
    expect(lastAuthorRole(thread)).toBeNull();
    expect(threadLastAt(thread)).toBe("2026-11-01T09:59:00Z");
  });
});

test.describe("hasUnreadStaff", () => {
  test("no staff message is never unread", () => {
    expect(
      hasUnreadStaff({ lastStaffMessageAt: null, playerReadAt: null }),
    ).toBe(false);
  });

  test("a staff message never opened is unread", () => {
    expect(
      hasUnreadStaff({
        lastStaffMessageAt: "2026-11-02T10:00:00Z",
        playerReadAt: null,
      }),
    ).toBe(true);
  });

  test("a staff message after the last read is unread", () => {
    expect(
      hasUnreadStaff({
        lastStaffMessageAt: "2026-11-02T10:00:00Z",
        playerReadAt: "2026-11-02T09:00:00Z",
      }),
    ).toBe(true);
  });

  test("reading at or after the reply clears it", () => {
    expect(
      hasUnreadStaff({
        lastStaffMessageAt: "2026-11-02T10:00:00Z",
        playerReadAt: "2026-11-02T10:00:00Z",
      }),
    ).toBe(false);
  });
});

test.describe("foldOlderDays", () => {
  const messages = [
    at("2026-10-28T12:00:00Z"),
    at("2026-10-31T23:59:59Z"),
    at("2026-11-01T00:00:00Z"),
    at("2026-11-02T08:00:00Z"),
  ];

  test("keeps today and yesterday, folds everything before", () => {
    const { earlier, recent } = foldOlderDays(messages, "2026-11-02");
    expect(earlier).toEqual([messages[0], messages[1]]);
    expect(recent).toEqual([messages[2], messages[3]]);
  });

  test("accepts today as a moment", () => {
    const { earlier, recent } = foldOlderDays(
      messages,
      new Date("2026-11-02T15:00:00Z"),
    );
    expect(earlier).toHaveLength(2);
    expect(recent).toHaveLength(2);
  });

  test("reads days in the given zone", () => {
    // In Los Angeles, 2026-11-01T00:00Z is still Oct 31 — before yesterday
    // (Nov 1) once today is Nov 2 there.
    const { earlier, recent } = foldOlderDays(
      messages,
      "2026-11-02",
      "America/Los_Angeles",
    );
    expect(earlier).toEqual([messages[0], messages[1], messages[2]]);
    expect(recent).toEqual([messages[3]]);
  });

  test("crosses a month and a year boundary", () => {
    const list = [at("2025-12-30T12:00:00Z"), at("2025-12-31T12:00:00Z")];
    const { earlier, recent } = foldOlderDays(list, "2026-01-01");
    expect(earlier).toEqual([list[0]]);
    expect(recent).toEqual([list[1]]);
  });

  test("a quiet thread keeps its newest day visible", () => {
    // Nothing today or yesterday: the reply someone came to read must not
    // fold away with the rest.
    const { earlier, recent } = foldOlderDays(messages, "2026-11-09");
    expect(earlier).toEqual([messages[0], messages[1], messages[2]]);
    expect(recent).toEqual([messages[3]]);
  });

  test("a quiet thread keeps every message of its newest day", () => {
    const list = [
      at("2026-10-20T09:00:00Z"),
      at("2026-10-28T09:00:00Z"),
      at("2026-10-28T17:00:00Z"),
    ];
    const { earlier, recent } = foldOlderDays(list, "2026-11-09");
    expect(earlier).toEqual([list[0]]);
    expect(recent).toEqual([list[1], list[2]]);
  });

  test("an empty thread folds to two empty halves", () => {
    expect(foldOlderDays([], "2026-11-02")).toEqual({
      earlier: [],
      recent: [],
    });
  });

  test("an undatable message stays visible", () => {
    const list = [at("not a date")];
    expect(foldOlderDays(list, "2026-11-02").recent).toEqual(list);
  });
});

test.describe("topicLabel", () => {
  test("labels every topic the CHECK allows", () => {
    expect(SUPPORT_TOPICS.map((topic) => topicLabel(topic))).toEqual([
      "A match",
      "An upload",
      "Billing",
      "My team",
      "An idea",
      "Something else",
    ]);
  });

  test("is null for no topic or an unknown one", () => {
    expect(topicLabel(null)).toBeNull();
    expect(topicLabel(undefined)).toBeNull();
    expect(topicLabel("refund")).toBeNull();
  });
});

test.describe("originLabel", () => {
  test("labels every origin the CHECK allows", () => {
    expect(SUPPORT_ORIGINS.map((origin) => originLabel(origin))).toEqual([
      "First-match feedback",
      "Account menu",
      "Match report",
      "Help",
      "Started by Advantage",
    ]);
  });

  test("an unknown origin reads 'Unknown'", () => {
    expect(originLabel("email")).toBe("Unknown");
    expect(originLabel(null)).toBe("Unknown");
  });
});

test.describe("messagePreview", () => {
  test("collapses whitespace to one line", () => {
    expect(messagePreview("  Thanks!\n\nWe fixed   it. ")).toBe(
      "Thanks! We fixed it.",
    );
  });

  test("cuts a long message at a word with an ellipsis", () => {
    const preview = messagePreview("word ".repeat(60), 30);
    expect(preview.length).toBeLessThanOrEqual(30);
    expect(preview.endsWith("word…")).toBe(true);
  });
});

test.describe("sendErrorMessage", () => {
  test("maps the rate limit", () => {
    expect(
      sendErrorMessage({ code: "P0001", message: "support_rate_limited" }),
    ).toMatch(/last hour/);
  });

  test("maps a match the player cannot see", () => {
    expect(
      sendErrorMessage({
        code: "42501",
        message: "send_support_message: match not found",
      }),
    ).toMatch(/couldn't find that match/);
  });

  test("maps signed out, blank and too long", () => {
    expect(
      sendErrorMessage({
        code: "42501",
        message: "send_support_message: no signed-in user",
      }),
    ).toMatch(/signed out/);
    expect(
      sendErrorMessage({
        code: "22023",
        message: "send_support_message: message is blank",
      }),
    ).toMatch(/Write a message/);
    expect(
      sendErrorMessage({
        code: "22023",
        message: "send_support_message: message is over 4000 characters",
      }),
    ).toMatch(/4,000/);
  });

  test("anything else gets the generic line", () => {
    expect(sendErrorMessage({ code: "XX000", message: "boom" })).toBe(
      "Your message didn't send. Please try again.",
    );
    expect(sendErrorMessage(null)).toBe(
      "Your message didn't send. Please try again.",
    );
  });
});
