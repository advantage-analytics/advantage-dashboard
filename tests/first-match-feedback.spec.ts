import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { expect, test } from "@playwright/test";

import {
  FIRST_MATCH_FEEDBACK_RATINGS,
  FIRST_MATCH_FEEDBACK_RETURN_MS,
  MAX_FIRST_MATCH_FEEDBACK_NOTE,
  firstMatchFeedbackDue,
  readFirstMatchFeedbackRequest,
} from "@/lib/feedback/first-match-feedback";
import { TOUR_COLUMN } from "@/lib/onboarding/tours";

/**
 * Offline spec for the first-match feedback prompt: when the shell asks
 * (`firstMatchFeedbackDue`), what the route accepts
 * (`readFirstMatchFeedbackRequest`), and the migration's limits agreeing
 * with the code's.
 */

const SEEN = "2026-10-20T10:00:00.000Z";
const seen = Date.parse(SEEN);

/** Signed in an hour before reading the report, deciding a minute after. */
const SAME_VISIT = {
  workspaceKind: "personal" as const,
  firstReportSeenAt: SEEN,
  lastSignInAt: "2026-10-20T09:00:00.000Z",
  doneAt: null,
  now: seen + 60_000,
};

test.describe("firstMatchFeedbackDue", () => {
  test("not in the visit the report was first read", () => {
    expect(firstMatchFeedbackDue(SAME_VISIT)).toBe(false);
  });

  test("due once the player has signed in again", () => {
    expect(
      firstMatchFeedbackDue({
        ...SAME_VISIT,
        lastSignInAt: "2026-10-21T08:00:00.000Z",
        now: Date.parse("2026-10-21T08:00:10.000Z"),
      }),
    ).toBe(true);
  });

  test("due a day later on a session that never signed in again", () => {
    expect(
      firstMatchFeedbackDue({
        ...SAME_VISIT,
        now: seen + FIRST_MATCH_FEEDBACK_RETURN_MS,
      }),
    ).toBe(true);
    expect(
      firstMatchFeedbackDue({
        ...SAME_VISIT,
        now: seen + FIRST_MATCH_FEEDBACK_RETURN_MS - 1,
      }),
    ).toBe(false);
  });

  test("a sign-in with no last_sign_in_at still counts a day later", () => {
    expect(
      firstMatchFeedbackDue({
        ...SAME_VISIT,
        lastSignInAt: null,
        now: seen + FIRST_MATCH_FEEDBACK_RETURN_MS,
      }),
    ).toBe(true);
  });

  test("never in a team workspace, once settled, or before a report was read", () => {
    const returned = {
      ...SAME_VISIT,
      lastSignInAt: "2026-10-21T08:00:00.000Z",
      now: Date.parse("2026-10-21T08:00:10.000Z"),
    };
    expect(firstMatchFeedbackDue(returned)).toBe(true);
    expect(firstMatchFeedbackDue({ ...returned, workspaceKind: "team" })).toBe(
      false,
    );
    expect(
      firstMatchFeedbackDue({ ...returned, doneAt: "2026-10-21T08:00:05Z" }),
    ).toBe(false);
    expect(
      firstMatchFeedbackDue({ ...returned, firstReportSeenAt: null }),
    ).toBe(false);
  });

  test("unreadable or future facts answer no", () => {
    expect(
      firstMatchFeedbackDue({ ...SAME_VISIT, firstReportSeenAt: "garbage" }),
    ).toBe(false);
    // A clock ahead of the server's: the reading is "in the future" — wait.
    expect(
      firstMatchFeedbackDue({
        ...SAME_VISIT,
        lastSignInAt: "2026-10-21T08:00:00.000Z",
        now: seen - 1,
      }),
    ).toBe(false);
    expect(
      firstMatchFeedbackDue({ ...SAME_VISIT, lastSignInAt: "garbage" }),
    ).toBe(false);
  });
});

test.describe("readFirstMatchFeedbackRequest", () => {
  test("a rating with a trimmed note", () => {
    expect(
      readFirstMatchFeedbackRequest({ rating: 4, note: "  more serve stats " }),
    ).toEqual({ ok: true, value: { rating: 4, note: "more serve stats" } });
  });

  test("a rating alone, or with an empty note, has no note", () => {
    expect(readFirstMatchFeedbackRequest({ rating: 2 })).toEqual({
      ok: true,
      value: { rating: 2, note: null },
    });
    expect(readFirstMatchFeedbackRequest({ rating: 5, note: "   " })).toEqual({
      ok: true,
      value: { rating: 5, note: null },
    });
    expect(readFirstMatchFeedbackRequest({ rating: 1, note: null })).toEqual({
      ok: true,
      value: { rating: 1, note: null },
    });
  });

  test("anything off the scale or the shape is refused, never trimmed", () => {
    const refused: unknown[] = [
      null,
      [],
      "4",
      {},
      { rating: 0 },
      { rating: 6 },
      { rating: "4" },
      { rating: 4.5 },
      { rating: 4, note: 7 },
      { rating: 4, extra: 1 },
      { rating: 4, note: "x".repeat(MAX_FIRST_MATCH_FEEDBACK_NOTE + 1) },
    ];
    for (const body of refused) {
      expect(readFirstMatchFeedbackRequest(body).ok, JSON.stringify(body)).toBe(
        false,
      );
    }
    // The limit itself is fine.
    expect(
      readFirstMatchFeedbackRequest({
        rating: 3,
        note: "x".repeat(MAX_FIRST_MATCH_FEEDBACK_NOTE),
      }).ok,
    ).toBe(true);
  });
});

test.describe("the migration agrees with the code", () => {
  const dir = join(process.cwd(), "supabase", "migrations");
  const file = readdirSync(dir).find((name) =>
    name.endsWith("_first_match_feedback.sql"),
  );
  const sql = file ? readFileSync(join(dir, file), "utf8") : "";

  test("the migration exists", () => {
    expect(file).toBeTruthy();
  });

  test("the scale and the note's limit are the table's checks", () => {
    const top =
      FIRST_MATCH_FEEDBACK_RATINGS[FIRST_MATCH_FEEDBACK_RATINGS.length - 1];
    expect(sql).toContain(`rating between 1 and ${top}`);
    expect(sql).toContain(
      `char_length(note) between 1 and ${MAX_FIRST_MATCH_FEEDBACK_NOTE}`,
    );
  });

  test("the dismiss column is granted to the signed-in user", () => {
    const column = TOUR_COLUMN["first-match-feedback"];
    expect(sql).toMatch(
      new RegExp(
        `grant update \\([^)]*${column}[^)]*\\)\\s*on public\\.users to authenticated`,
      ),
    );
  });
});
