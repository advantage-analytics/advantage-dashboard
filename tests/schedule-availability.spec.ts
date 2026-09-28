import fs from "node:fs";
import path from "node:path";

import { expect, test } from "@playwright/test";

import { TEAM_NAV } from "@/lib/dashboard/nav";
import { SCHEDULE_ENABLED } from "@/lib/schedule/availability";

/**
 * While the team Schedule is a coming-soon page, nothing in the app may still
 * lead into it (`src/lib/schedule/availability.ts`).
 *
 * Only a render can say for certain that a link is hidden, and most of these
 * files are client components deep inside a page. So this checks the next best
 * thing: every file outside the schedule's own subtree that names a schedule
 * URL either reads `SCHEDULE_ENABLED` or is listed below with the reason it
 * needs no gate. A new link into the schedule has to pick one of the two, and
 * an entry here that stops naming a schedule URL fails as stale.
 */
const UNGATED: Record<string, string> = {
  "src/app/dashboard/header.tsx":
    "breadcrumb patterns for schedule paths, which next.config redirects",
  "src/lib/dashboard/nav.ts": "the nav row itself and breadcrumb labels",
  "src/components/dashboard/loading/event-wizard-pending.tsx": "comments only",
  "src/components/dashboard/loading/page-skeletons.tsx": "comments only",
  "src/components/dashboard/loading/score-flow-pending.tsx": "comments only",
  "src/components/dashboard/team/list-page-heading.tsx":
    "ScheduleTitleRow, drawn only by the schedule page and its skeleton",
  "src/components/dashboard/team/dual-sheet.tsx":
    "Team Home's dual region, which the page gates",
  "src/components/dashboard/team/dual-sheet-empty.tsx":
    "Team Home's dual region, which the page gates",
  "src/components/dashboard/team/court-record-mosaic.tsx":
    "inside CourtRecord, which Team Home gates",
  "src/components/dashboard/team/dual-history.tsx":
    "Team Home's history region, which the page gates",
  "src/components/dashboard/team/player-profile/line-history-card.tsx":
    "the player profile page gates the card",
  "src/components/dashboard/matches/match-actions/attach-line-picker.tsx":
    "opened only from the gated 'Add to an event' controls",
  "src/lib/schedule/actions.ts": "revalidatePath after schedule writes",
  "src/lib/schedule/attach-line.ts": "revalidatePath after an attach",
  "src/lib/schedule/writes-server.ts": "revalidatePath after schedule writes",
  "src/lib/schedule/dual-primary-action.ts": "the schedule's own row actions",
  "src/lib/schedule/score-seed.ts": "the schedule's own score flow",
};

const OWN_SUBTREE = [
  "src/app/dashboard/team/schedule/",
  "src/components/dashboard/schedule/",
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(full);
    return /\.tsx?$/.test(entry.name) ? [full] : [];
  });
}

test.describe("Schedule availability", () => {
  test.skip(SCHEDULE_ENABLED, "the Schedule is open; nothing to guard");

  test("the nav marks Schedule coming soon", () => {
    const schedule = TEAM_NAV.find((link) => link.name === "Schedule");
    expect(schedule?.comingSoon).toBe(true);
  });

  test("every link into the schedule is gated or listed", () => {
    const root = process.cwd();
    const linking = sourceFiles(path.join(root, "src"))
      .map((file) => path.relative(root, file))
      .filter((file) => !OWN_SUBTREE.some((dir) => file.startsWith(dir)))
      .filter((file) => file !== "src/lib/schedule/availability.ts")
      .filter((file) => {
        const text = fs.readFileSync(path.join(root, file), "utf8");
        return (
          text.includes("/dashboard/team/schedule") &&
          !text.includes("SCHEDULE_ENABLED")
        );
      })
      .sort();

    expect(linking).toEqual(Object.keys(UNGATED).sort());
  });

  test("next.config sends every schedule sub-route to the stub", () => {
    const config = fs.readFileSync(
      path.join(process.cwd(), "next.config.ts"),
      "utf8",
    );
    expect(config).toContain('source: "/dashboard/team/schedule/:path+"');
    expect(config).toContain('destination: "/dashboard/team/schedule"');
  });
});
