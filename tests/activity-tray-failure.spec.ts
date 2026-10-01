import { expect, test } from "@playwright/test";

import {
  isTrayFailure,
  trayFailureAction,
  trayFailureReason,
} from "@/components/dashboard/activity/tray-failure";
import { STEPPER_COPY } from "@/components/dashboard/matches/match-detail/analysis-steps";
import type { AnalysisStatus } from "@/lib/data/match-analysis";

/**
 * T32: which activity-tray rows count as failures (`isTrayFailure`), where a
 * failed row's single action goes (`trayFailureAction`), and the one-line
 * reason it carries (`trayFailureReason`) — Direction E on the design canvas,
 * chosen by the author 2026-09-28.
 *
 * `isTrayFailure` is pinned against `matchListGroup`'s own decision rather
 * than re-deriving it: a `stats_unavailable` row reads "Ready" there (the
 * match page renders fine; only a chart is missing), so it must never show up
 * as a tray failure, and every in-flight status groups under "In progress".
 *
 * T34 adds the one deliberate divergence from that pin: a stalled
 * `uploaded` hand-off — `status: "uploaded"` carrying a server-classified
 * `recovery` (`retry` or `wait_or_ask`) — is a tray failure even though
 * `matchListGroup` keeps it under "In progress".
 */

const MATCH_ID = "0d6c6c1e-6f7b-4c9a-9b0e-1c2f3a4b5c6d";

test.describe("isTrayFailure matches matchListGroup's Failed group exactly", () => {
  test("a failed row with no recovery is a tray failure", () => {
    expect(isTrayFailure({ status: "failed", recovery: undefined })).toBe(true);
  });

  test("a derivation_failed row classified rederive is a tray failure", () => {
    expect(
      isTrayFailure({ status: "derivation_failed", recovery: "rederive" }),
    ).toBe(true);
  });

  test("stats_unavailable is never a tray failure", () => {
    expect(
      isTrayFailure({ status: "failed", recovery: "stats_unavailable" }),
    ).toBe(false);
    expect(
      isTrayFailure({
        status: "derivation_failed",
        recovery: "stats_unavailable",
      }),
    ).toBe(false);
  });

  test("every in-flight status is not a tray failure", () => {
    const inFlight: AnalysisStatus[] = [
      "uploading",
      "uploaded",
      "queued",
      "processing",
      "deriving",
      "processed",
    ];
    for (const status of inFlight) {
      expect(isTrayFailure({ status, recovery: undefined })).toBe(false);
    }
  });

  test("a ready or manual row is not a tray failure", () => {
    expect(isTrayFailure({ status: "completed", recovery: undefined })).toBe(
      false,
    );
    expect(isTrayFailure({ status: "manual", recovery: undefined })).toBe(
      false,
    );
  });

  test("no analysis at all is not a tray failure", () => {
    expect(isTrayFailure(null)).toBe(false);
    expect(isTrayFailure(undefined)).toBe(false);
  });
});

test.describe("T34: a stalled uploaded hand-off is a tray failure", () => {
  test("uploaded + retry is a tray failure", () => {
    expect(isTrayFailure({ status: "uploaded", recovery: "retry" })).toBe(true);
  });

  test("uploaded + wait_or_ask is a tray failure", () => {
    expect(isTrayFailure({ status: "uploaded", recovery: "wait_or_ask" })).toBe(
      true,
    );
  });

  test("uploaded with no recovery is still in flight, not a tray failure", () => {
    expect(isTrayFailure({ status: "uploaded", recovery: undefined })).toBe(
      false,
    );
  });

  test("a stalled uploaded row's action is Open at the match page", () => {
    expect(trayFailureAction({ recovery: "retry" }, MATCH_ID)).toEqual({
      label: "Open",
      href: `/dashboard/matches/${MATCH_ID}`,
    });
    expect(trayFailureAction({ recovery: "wait_or_ask" }, MATCH_ID)).toEqual({
      label: "Open",
      href: `/dashboard/matches/${MATCH_ID}`,
    });
  });

  test("a stalled uploaded retry row's reason is the stepper's stalled title", () => {
    expect(trayFailureReason({ status: "uploaded", recovery: "retry" })).toBe(
      STEPPER_COPY.titles.stalled,
    );
    expect(STEPPER_COPY.titles.stalled).toBe("Couldn't send for analysis");
  });

  test("a stalled uploaded wait_or_ask row reads its cause, not the stalled title", () => {
    expect(
      trayFailureReason({
        status: "uploaded",
        recovery: "wait_or_ask",
        errorCode: "QUOTA_EXCEEDED",
        attemptsUsed: 1,
      }),
    ).toBe("Not enough analysis time left this month");
    expect(
      trayFailureReason({
        status: "uploaded",
        recovery: "wait_or_ask",
        errorCode: "NOT_ELIGIBLE",
        attemptsUsed: 1,
      }),
    ).toBe("Needs your team's owner");
    expect(
      trayFailureReason({
        status: "uploaded",
        recovery: "wait_or_ask",
        errorCode: undefined,
        attemptsUsed: 3,
      }),
    ).toBe("Tried three times");
  });
});

test.describe("trayFailureAction reuses analysisAction's own hrefs", () => {
  test("upload_again opens the wizard on this match, labeled Add video", () => {
    expect(trayFailureAction({ recovery: "upload_again" }, MATCH_ID)).toEqual({
      label: "Add video",
      href: `/dashboard/matches/new?match=${MATCH_ID}`,
    });
  });

  test("fix_recording opens the wizard on this match, labeled Add video", () => {
    expect(trayFailureAction({ recovery: "fix_recording" }, MATCH_ID)).toEqual({
      label: "Add video",
      href: `/dashboard/matches/new?match=${MATCH_ID}`,
    });
  });

  test("retry opens the match page, labeled Open", () => {
    expect(trayFailureAction({ recovery: "retry" }, MATCH_ID)).toEqual({
      label: "Open",
      href: `/dashboard/matches/${MATCH_ID}`,
    });
  });

  test("rederive opens the match page, labeled Open", () => {
    expect(trayFailureAction({ recovery: "rederive" }, MATCH_ID)).toEqual({
      label: "Open",
      href: `/dashboard/matches/${MATCH_ID}`,
    });
  });

  test("wait_or_ask opens the match page, labeled Open", () => {
    expect(trayFailureAction({ recovery: "wait_or_ask" }, MATCH_ID)).toEqual({
      label: "Open",
      href: `/dashboard/matches/${MATCH_ID}`,
    });
  });

  test("no recovery falls back to Start over, into a fresh wizard", () => {
    expect(trayFailureAction({ recovery: undefined }, MATCH_ID)).toEqual({
      label: "Start over",
      href: "/dashboard/matches/new",
    });
  });
});

test.describe("trayFailureReason's one-line reason per class", () => {
  test("upload_again", () => {
    expect(trayFailureReason({ recovery: "upload_again" })).toBe(
      "Upload didn't finish",
    );
  });

  test("fix_recording", () => {
    expect(trayFailureReason({ recovery: "fix_recording" })).toBe(
      "Recording didn't meet the requirements",
    );
  });

  test("retry", () => {
    expect(trayFailureReason({ recovery: "retry" })).toBe(
      "Analysis stopped · Retry available",
    );
  });

  test("rederive", () => {
    expect(trayFailureReason({ recovery: "rederive" })).toBe(
      "Stats need rebuilding",
    );
  });

  test("no recovery reads as the plain fact", () => {
    expect(trayFailureReason({ recovery: undefined })).toBe("Analysis failed");
  });

  test("wait_or_ask allowance — QUOTA_EXCEEDED", () => {
    expect(
      trayFailureReason({
        recovery: "wait_or_ask",
        errorCode: "QUOTA_EXCEEDED",
        attemptsUsed: 1,
      }),
    ).toBe("Not enough analysis time left this month");
  });

  test("wait_or_ask permission — NOT_ELIGIBLE", () => {
    expect(
      trayFailureReason({
        recovery: "wait_or_ask",
        errorCode: "NOT_ELIGIBLE",
        attemptsUsed: 1,
      }),
    ).toBe("Needs your team's owner");
  });

  test("wait_or_ask permission — NO_BILLING_WORKSPACE", () => {
    expect(
      trayFailureReason({
        recovery: "wait_or_ask",
        errorCode: "NO_BILLING_WORKSPACE",
        attemptsUsed: 1,
      }),
    ).toBe("Needs your team's owner");
  });

  test("wait_or_ask ceiling — attempts used up, no special code", () => {
    expect(
      trayFailureReason({
        recovery: "wait_or_ask",
        errorCode: undefined,
        attemptsUsed: 3,
      }),
    ).toBe("Tried three times");
  });
});
