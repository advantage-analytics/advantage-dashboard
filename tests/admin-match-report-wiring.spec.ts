import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

/**
 * The admin match report (`/admin/matches/[matchId]`) is read-only like the
 * public share page, but its reader is a signed-in admin, not someone holding
 * a link. Three things the share-page recipe would get wrong for an admin are
 * pinned here, at the source, because the page is a Server Component behind
 * `requireAdminOrNotFound()` and cannot be mounted offline:
 *
 * - the ball-paths file is read from the page's own `is_admin` route (the
 *   match's route asks the caller's RLS, which an admin does not pass), or the
 *   Lob and Passed figures are a dash on a match that has the data;
 * - no `match_viewed` is sent (a read-only report's is tagged `share_link`);
 * - the Video tab is not marked a shared link, which would count the admin's
 *   plays and answer a refused renewal with "This link no longer includes the
 *   video".
 */
const read = (file: string) =>
  readFileSync(path.join(process.cwd(), file), "utf8");

test.describe("admin match report wiring", () => {
  const page = read("src/app/admin/matches/[matchId]/page.tsx");

  test("reads ball paths from its own route and sends no view", () => {
    const provider = page.match(/<MatchReportProvider[\s\S]*?>\n/)?.[0] ?? "";
    expect(provider).toMatch(/\n\s+readOnly\n/);
    expect(provider).toContain("recordView={false}");
    expect(provider).toContain(
      "ballPathsEndpoint={`/admin/matches/${encodeURIComponent(match.id)}/ball-paths`}",
    );
  });

  test("the Video tab is not mounted as a shared link", () => {
    const filmTab = page.match(/<FilmTab[\s\S]*?\/>/)?.[0] ?? "";
    expect(filmTab).toContain("playbackEndpoint=");
    expect(filmTab).not.toMatch(/\breadOnly\b/);
  });

  test("the ball-paths route is GET-only and gated by is_admin first", () => {
    const route = read("src/app/admin/matches/[matchId]/ball-paths/route.ts");
    const exported = [
      ...route.matchAll(/^export\s+(?:async\s+)?(?:function|const)\s+(\w+)/gm),
    ]
      .map((m) => m[1])
      .sort();
    expect(exported).toEqual(["GET", "dynamic", "runtime"]);
    expect(route).toContain("lazyAdminClient()");
    expect(route).not.toContain("createAdminClient");
    // The gate answers before the loader is reached.
    expect(route.indexOf("await checkAdmin()")).toBeGreaterThan(-1);
    expect(route.indexOf("await checkAdmin()")).toBeLessThan(
      route.indexOf("return respondWithBallPaths("),
    );
  });

  test("a report that asks not to be counted sends no match_viewed", () => {
    const context = read(
      "src/components/dashboard/matches/match-detail/match-report-context.tsx",
    );
    expect(context).toContain("if (sample || !recordView) return;");
  });
});
