import { expect, test } from "@playwright/test";

import { askEntryHref } from "@/lib/services/ask/entry";
import { createLoader } from "./fixtures/vm-modules";

/**
 * `useMatchAskHref`, the one gate both of the report's ways into Ask go
 * through ("Ask about this match" and "Why this"). Offline: the report and
 * match contexts are stubbed, and the hook is called as the plain function
 * it is once they are.
 */

const FILE =
  "src/components/dashboard/matches/match-detail/use-match-ask-href.ts";

function hrefFor(
  meta: { readOnly: boolean; workspaceKind: "personal" | "team" },
  programId: string | null,
  question?: string,
): string | null {
  const loader = createLoader({
    stubs: {
      "@/components/dashboard/matches/match-detail/match-report-context": {
        useMatchReport: () => ({ meta: { ...meta, matchId: "m1" } }),
      },
      "@/components/dashboard/matches/match-data-provider": {
        useMatchData: () => ({ match: { programId } }),
      },
      "@/lib/services/ask/entry": { askEntryHref },
    },
  });
  // Renamed on the way out: with its contexts stubbed it is a plain
  // function, and the hooks lint rule cannot see that.
  const { useMatchAskHref: matchAskHref } = loader.load(FILE) as {
    useMatchAskHref: (question?: string) => string | null;
  };
  return matchAskHref(question);
}

test.describe("useMatchAskHref", () => {
  test("a personal match in the personal workspace: Ask with the match", () => {
    expect(hrefFor({ readOnly: false, workspaceKind: "personal" }, null)).toBe(
      "/dashboard/ask?match=m1",
    );
  });

  test("a team match in its team workspace: the team page, with the question", () => {
    expect(
      hrefFor({ readOnly: false, workspaceKind: "team" }, "prog-1", "Why?"),
    ).toBe("/dashboard/team/ask?match=m1&q=Why%3F");
  });

  test("read-only (share link, sample): no way into Ask", () => {
    expect(hrefFor({ readOnly: true, workspaceKind: "personal" }, null)).toBe(
      null,
    );
  });

  test("the match and the workspace disagree: no link, in either direction", () => {
    expect(
      hrefFor({ readOnly: false, workspaceKind: "personal" }, "prog-1"),
    ).toBe(null);
    expect(hrefFor({ readOnly: false, workspaceKind: "team" }, null)).toBe(
      null,
    );
  });
});
