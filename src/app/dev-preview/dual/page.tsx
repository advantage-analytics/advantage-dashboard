"use client";

// TEMPORARY preview route — outside /dashboard so it needs no session.
// Delete before `npm test`: tests/generate-map.spec.ts fails on an unlisted route.
// Mounts the real NewDualFlow over fixture data so steps 1–3 can be driven
// without a login. Nothing here writes: Continue on step 3 would call
// createDual and fail on auth, which is fine for a focus/selection audit.

import { NewDualFlow } from "@/components/dashboard/schedule/static/new-dual-flow";
import {
  NewDualDataProvider,
  type NewDualData,
} from "@/components/dashboard/schedule/static/dual-school-step";
import type { ProgramSearchResult } from "@/lib/data/programs-server";

const program = (
  key: string,
  schoolName: string,
  team: "mens" | "womens",
  conference: string | null
): ProgramSearchResult => ({
  programKey: key,
  schoolName,
  team,
  division: "D-I",
  conference,
  state: "MI",
  status: "unclaimed",
  ownerDisplay: null,
});

const DATA: NewDualData = {
  ladder: [
    { userId: "u-ana", name: "Ana Vasquez", ladderPosition: 1 },
    { userId: "u-ben", name: "Ben Cole", ladderPosition: 2 },
    { userId: "u-cara", name: "Cara Diaz", ladderPosition: 3 },
    { userId: "u-dana", name: "Dana Brooks", ladderPosition: 4 },
    { userId: "u-eli", name: "Eli Frost", ladderPosition: 5 },
    { userId: "u-faye", name: "Faye Grant", ladderPosition: 6 },
    { userId: "u-gus", name: "Gus Hale", ladderPosition: null },
  ],
  defaultSurface: "hard",
  ourConference: "Big Ten Conference (B1G)",
  ourTeam: "mens",
  ourDivision: "D-I",
  ourProgramKey: "us",
  conferencePrograms: [
    program("mich-m", "University of Michigan", "mens", "Big Ten Conference (B1G)"),
    program("mich-w", "University of Michigan", "womens", "Big Ten Conference (B1G)"),
    program("osu-m", "Ohio State University", "mens", "Big Ten Conference (B1G)"),
    program("ill-m", "University of Illinois", "mens", "Big Ten Conference (B1G)"),
  ],
  historyEntries: [],
  directoryTotal: 1940,
};

export default function DualPreview() {
  return (
    <div className="flex h-screen w-screen bg-[var(--surface-page)]">
      <aside
        data-fake-sidebar
        className="h-full w-[232px] shrink-0 border-r border-[var(--border-hairline)] bg-[var(--surface-card)]"
      />
      <div className="flex min-w-0 flex-1 flex-col overflow-y-auto">
        <header
          data-fake-header
          className="h-11 shrink-0 border-b border-[var(--border-hairline)] bg-[var(--surface-card)]"
        />
        <main data-content-area className="flex min-h-0 flex-1 flex-col">
          <NewDualDataProvider data={DATA}>
            <NewDualFlow />
          </NewDualDataProvider>
        </main>
      </div>
    </div>
  );
}
