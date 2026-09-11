"use client";

import { HeaderStatusProvider } from "@/components/dashboard/header-status";
import { UploadMatchFlow } from "@/components/dashboard/matches/new-match-wizard/UploadMatchFlow";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import type { EventPreset } from "@/components/dashboard/matches/new-match-wizard/types";
import type { WorkspaceContextValue } from "@/lib/workspace/types";

/**
 * The production flow asks Supabase for the current user before it crosses its
 * submission boundary. Give this development-only route an inert browser
 * session so browser coverage can reach that boundary without an account or a
 * local Supabase fixture. The Playwright test fulfills the matching auth read
 * and blocks every actual data, upload, Azure, and vendor request.
 */
if (typeof window !== "undefined") {
  const projectRef = new URL(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
  ).hostname.split(".")[0];
  const session = JSON.stringify({
    access_token:
      "eyJhbGciOiJub25lIn0.eyJzdWIiOiJ3aXphcmQtcmVwcm9kdWN0aW9uLXVzZXIifQ.fixture",
    refresh_token: "wizard-reproduction-refresh-token",
    token_type: "bearer",
    expires_at: 4_102_444_800,
    expires_in: 60 * 60,
    user: { id: "wizard-reproduction-user" },
  });
  const encoded = btoa(session)
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
  document.cookie = `sb-${projectRef}-auth-token=base64-${encoded}; path=/; SameSite=Lax`;
}

const workspace: WorkspaceContextValue = {
  active: {
    id: "wizard-reproduction-user",
    kind: "personal",
    name: "Personal",
    team: null,
    orgType: null,
    timeZone: "America/Los_Angeles",
    role: "owner",
    mark: "WR",
    canSubmitVideo: true,
    playersCanUpload: false,
    memberUploadEnabled: true,
    uploadPolicy: "everyone",
    myPlayerId: null,
  },
  available: [],
  viewer: {
    id: "wizard-reproduction-user",
    email: "wizard-reproduction@example.test",
    name: "Riley Reproduction",
    firstName: "Riley",
    initials: "RR",
    plan: "free",
    role: "player",
    memberSince: null,
    onboardedAt: "2026-09-10T00:00:00.000Z",
  },
};

const oneSetPreset: EventPreset = {
  entryId: "wizard-reproduction-entry",
  eventId: "wizard-reproduction-event",
  eventName: "Reproduction Open",
  matchId: null,
  round: "R16",
  playerName: "Riley Reproduction",
  playerUserId: "wizard-reproduction-user",
  opponentName: "Casey Opponent",
  date: "2026-09-10",
  surface: "hard",
  bestOf: 3,
  adScoring: true,
  score: { player1: [6], player2: [4] },
  supportsVideo: false,
  eventHref: "/dashboard/matches",
  site: "home",
  eventKind: "tournament",
  opponentProgramKey: null,
  opponentSchool: null,
};

export function WizardReproductionHarness({
  mode,
}: {
  mode: "new" | "preset";
}) {
  return (
    <WorkspaceProvider value={{ ...workspace, available: [workspace.active] }}>
      <HeaderStatusProvider>
        <UploadMatchFlow preset={mode === "preset" ? oneSetPreset : null} />
      </HeaderStatusProvider>
    </WorkspaceProvider>
  );
}
