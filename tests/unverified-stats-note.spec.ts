import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";

import {
  showsUnverifiedStatsNote,
  UNVERIFIED_STATS_NOTE,
  VERIFIED_UPDATE_NOTE,
} from "@/lib/data/match-verification";

/**
 * The note above an unverified match's statistics, and the wiring that keeps
 * an open report (dashboard or share link) from holding stale numbers once
 * Advantage verifies the match. No database, no browser: the rule is pure and
 * the wiring is read from source.
 */

const VERIFIED = { verifiedAt: "2026-11-10T12:00:00Z" };

test.describe("showsUnverifiedStatsNote", () => {
  test("a match waiting on review draws the note", () => {
    expect(
      showsUnverifiedStatsNote({
        verification: null,
        verificationPending: true,
      }),
    ).toBe(true);
  });

  test("an unverified match nobody will review does not", () => {
    // SwingVision, hand-scored, the sample, or a video match analysed before
    // the queue opened: no pending flag, so no promise of a review.
    for (const verificationPending of [false, undefined]) {
      expect(
        showsUnverifiedStatsNote({ verification: null, verificationPending }),
      ).toBe(false);
    }
  });

  test("a verified match does not, whatever the flag says", () => {
    expect(
      showsUnverifiedStatsNote({
        verification: VERIFIED,
        verificationPending: true,
      }),
    ).toBe(false);
  });

  test("the copy speaks about the match, not to the player", () => {
    // The share link's reader is not the player: no "you" / "your".
    expect(UNVERIFIED_STATS_NOTE).not.toMatch(/\byou(r)?\b/i);
    expect(VERIFIED_UPDATE_NOTE).not.toMatch(/\byou(r)?\b/i);
  });
});

test.describe("wiring", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  test("the share loader computes pending instead of forcing it off", () => {
    const source = read("src/lib/data/match-share-server.ts");
    expect(source).toContain("resolveSharedLabelPending(admin, dbRow)");
    expect(source).toMatch(
      /match\.verificationPending = showsVerificationPending\(/,
    );
  });

  test("the share page asks its token route for verification", () => {
    const source = read("src/app/m/[token]/page.tsx");
    expect(source).toContain("verificationEndpoint={`/api/share/");
  });

  test("the dashboard report and the share page mount the watcher", () => {
    for (const path of [
      "src/app/dashboard/matches/(detail)/[matchId]/page.tsx",
      "src/app/m/[token]/page.tsx",
    ]) {
      expect(read(path)).toContain("<VerificationWatch />");
    }
  });

  test("the watcher never refreshes on an unverified answer", () => {
    const source = read(
      "src/components/dashboard/matches/match-detail/verification-watch.tsx",
    );
    // A republish is unverified while it replaces the points; only a new
    // verified_at may trigger the refresh.
    expect(source).toMatch(/if \(cancelled \|\| !now\) return;/);
    expect(source).toContain("router.refresh()");
  });

  test("'updated after review' waits for the refreshed verified_at", () => {
    const source = read(
      "src/components/dashboard/matches/match-detail/verification-watch.tsx",
    );
    // Marked with the value asked for, read against what the report draws.
    expect(source).toContain("markJustVerified(match.id, now)");
    expect(source).toMatch(
      /justVerified\.get\(matchId\) === renderedVerifiedAt/,
    );
    expect(source).toContain("forgetJustVerified(match.id)");
  });

  test("the watcher retries a refresh that did not land", () => {
    const source = read(
      "src/components/dashboard/matches/match-detail/verification-watch.tsx",
    );
    // The same verified_at may ask again once RETRY_MS has passed.
    expect(source).toMatch(/Date\.now\(\) - last\.at < RETRY_MS/);
  });

  test("the share loader skips the label reads for non-video matches", () => {
    const source = read("src/lib/data/match-share-server.ts");
    expect(source).toContain('dbRow.source_provider !== "splitstep"');
  });
});
