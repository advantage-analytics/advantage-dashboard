import { expect, test } from "@playwright/test";

import type { AdminRequestRow } from "@/lib/data/admin-requests-server";
import {
  RESOLVABLE_KINDS,
  claimOffersApprove,
  messageDrafts,
  sortLongestWaitFirst,
  todayActions,
  type TodayThreadRow,
} from "@/lib/data/admin-today-server";

/**
 * Admin › Today rows (T3) — pure, no I/O: the kind-to-actions mapping, the
 * support-message row builder and the longest-wait-first order.
 */

const ID = "11111111-2222-3333-4444-555555555555";

function claimRow(
  overrides: Partial<Omit<AdminRequestRow, "detail">> & {
    detail?: Partial<Extract<AdminRequestRow["detail"], { source: "claim" }>>;
  } = {},
): AdminRequestRow {
  const { detail, ...rest } = overrides;
  return {
    id: ID,
    source: "claim",
    date: "2026-11-01T10:00:00.000Z",
    team: "Stanford Women's Tennis",
    crestUrl: null,
    for: "Head coach",
    from: { name: "Pat Coach", email: "pat@example.com" },
    emailCheck: "none",
    status: "pending_review",
    ...rest,
    detail: {
      source: "claim",
      claimId: ID,
      programId: "p1",
      schoolName: "Stanford",
      team: null,
      division: null,
      state: null,
      staffPageUrl: null,
      reviewReasons: null,
      primaryDomain: null,
      claimantRole: "head_coach",
      claimantMessage: null,
      domainMatched: false,
      contactMatched: false,
      skipsManualReview: false,
      matchReason: null,
      reviewNotes: null,
      voucherNote: null,
      verificationSentAt: null,
      verificationOpenedAt: null,
      verifiedAt: null,
      reviewReason: "Needs a look",
      ...detail,
    },
  };
}

test.describe("todayActions", () => {
  test("a claim the drawer would approve gets Approve, then Decline", () => {
    const row = claimRow({ detail: { domainMatched: true } });
    expect(claimOffersApprove(row)).toBe(true);
    expect(
      todayActions({
        kind: "claim",
        requestId: row.id,
        claimId: ID,
        approvable: claimOffersApprove(row),
      }),
    ).toEqual([
      { type: "approve", label: "Approve", claimId: ID },
      { type: "link", label: "Decline", href: `/admin/requests?id=${ID}` },
    ]);
  });

  test("an unvouched or objected claim gets one Open into Requests", () => {
    expect(claimOffersApprove(claimRow())).toBe(false);
    expect(
      claimOffersApprove(
        claimRow({ status: "objected", detail: { verifiedAt: "x" } }),
      ),
    ).toBe(false);
    expect(
      todayActions({
        kind: "claim",
        requestId: ID,
        claimId: ID,
        approvable: false,
      }),
    ).toEqual([
      { type: "link", label: "Open", href: `/admin/requests?id=${ID}` },
    ]);
  });

  test("a request gets one Open into Requests", () => {
    expect(todayActions({ kind: "request", requestId: ID })).toEqual([
      { type: "link", label: "Open", href: `/admin/requests?id=${ID}` },
    ]);
  });

  test("a job opens Matches, then Resolve", () => {
    expect(RESOLVABLE_KINDS).toContain("job");
    expect(todayActions({ kind: "job", matchId: ID })).toEqual([
      { type: "link", label: "Open", href: `/admin/matches?id=${ID}` },
      { type: "resolve", label: "Resolve" },
    ]);
  });

  test("a label starts labelling, then Resolve", () => {
    expect(todayActions({ kind: "label", jobId: ID })).toEqual([
      { type: "label", label: "Open", startLabellingJobId: ID },
      { type: "resolve", label: "Resolve" },
    ]);
  });

  test("an ask opens Ask, then Resolve", () => {
    expect(todayActions({ kind: "ask", feedbackId: ID })).toEqual([
      { type: "link", label: "Open", href: `/admin/ask?id=${ID}` },
      { type: "resolve", label: "Resolve" },
    ]);
  });

  test("a pilot gets Add hours on Pilots", () => {
    expect(todayActions({ kind: "pilot" })).toEqual([
      { type: "link", label: "Add hours", href: "/admin/pilots" },
    ]);
  });

  test("a message gets Reply and no Resolve", () => {
    expect(RESOLVABLE_KINDS).not.toContain("message");
    const actions = todayActions({ kind: "message", threadId: ID });
    expect(actions).toEqual([
      { type: "link", label: "Reply", href: `/admin/messages?id=${ID}` },
    ]);
    expect(actions.some((a) => a.type === "resolve")).toBe(false);
  });

  test("RESOLVABLE_KINDS is job, label, ask", () => {
    expect([...RESOLVABLE_KINDS]).toEqual(["job", "label", "ask"]);
  });
});

test.describe("messageDrafts", () => {
  const thread = (over: Partial<TodayThreadRow>): TodayThreadRow => ({
    id: ID,
    user_id: "u1",
    last_player_message_at: "2026-11-10T09:00:00.000Z",
    last_staff_message_at: null,
    ...over,
  });

  test("one row per thread the player wrote last, since their message", () => {
    const rows = messageDrafts(
      [
        thread({}),
        // Staff answered last: waiting on the player, not on us.
        thread({
          id: "t2",
          last_player_message_at: "2026-11-10T09:00:00.000Z",
          last_staff_message_at: "2026-11-10T10:00:00.000Z",
        }),
        // The player wrote back after staff.
        thread({
          id: "t3",
          last_player_message_at: "2026-11-11T09:00:00.000Z",
          last_staff_message_at: "2026-11-10T10:00:00.000Z",
        }),
      ],
      new Map([["u1", { name: "Sam Player", photoUrl: null }]]),
    );
    expect(rows.map((row) => row.key)).toEqual([`message:${ID}`, "message:t3"]);
    const [first] = rows;
    expect(first.kind).toBe("message");
    expect(first.since).toBe("2026-11-10T09:00:00.000Z");
    expect(rows[1].since).toBe("2026-11-11T09:00:00.000Z");
    expect(first.cell).toMatchObject({ type: "person", name: "Sam Player" });
    expect(first.actions).toEqual([
      { type: "link", label: "Reply", href: `/admin/messages?id=${ID}` },
    ]);
  });
});

test("a mixed list sorts longest wait first", () => {
  const sorted = sortLongestWaitFirst([
    { key: "ask:1", since: "2026-11-12T08:00:00.000Z" },
    { key: "message:1", since: "2026-11-01T08:00:00.000Z" },
    { key: "job:1", since: "2026-11-05T08:00:00.000Z" },
    { key: "pilot:1", since: "2026-10-30T08:00:00.000Z" },
  ]);
  expect(sorted.map((row) => row.key)).toEqual([
    "pilot:1",
    "message:1",
    "job:1",
    "ask:1",
  ]);
});
