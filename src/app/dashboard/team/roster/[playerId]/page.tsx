import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canUploadForProgram, isProgramStaff } from "@/lib/workspace/types";
import { getPlayerProfile } from "@/lib/data/player-profile-server";
import { getPlayerSeason } from "@/lib/data/player-season-server";
import { getRosterData } from "@/lib/data/team-roster-server";
import { getMyPlayerIds } from "@/lib/data/player-identity-server";
// The report frame's parts by their named exports: this is a Server
// Component, and dotting into a `"use client"` module's object (`MatchReport.
// Frame`) throws on the server — see `match-report.tsx`.
import {
  MatchReportFrame,
  MatchReportPane,
} from "@/components/dashboard/matches/match-detail/match-report";
import {
  MatchReportTitleActions,
  MatchReportTitleRow,
} from "@/components/dashboard/matches/match-detail/report-title-row";
import { ProfileHeaderSlot } from "@/components/dashboard/team/player-profile/profile-header-slot";
import { ProfileRail } from "@/components/dashboard/team/player-profile/profile-rail";
import { ProfileTitle } from "@/components/dashboard/team/player-profile/profile-frame";
import { ProfileActions } from "@/components/dashboard/team/player-profile/profile-actions";
import { askEntryHref } from "@/lib/services/ask/entry";

/**
 * One player's page — Platform Audit `Te` (their own) and `Te2` (a coach's
 * view of it).
 *
 * Byte-for-byte the same page from both sides. A player's own data lives
 * here rather than in a personal workspace — that one is for people not on
 * a team — reached from their name at the foot of the rail; a coach reaches
 * the same page from the Roster. Two things differ, both chrome: the
 * **You** pill marks whose page it is; and the ghost button is **Edit
 * profile** (a player owns their identity) or **Edit player** (a coach owns
 * the roster). The header reads `Roster › name ⌄ 3 / 9` from either side —
 * the trail and the switcher are the same walk whoever is walking it. No
 * data is added or withheld — that is what "fully open" buys a program.
 *
 * The frame is the match report's (design Q, 2026-11): a 300px rail — who
 * they are, Statistics · Visualizations, links to their matches and
 * opponents, New match at the foot — and a scrolling pane whose title row
 * names the active view (`?tab=`, `profile-view.ts`). Each view's content
 * arrives in its own task; until then the pane is the title row alone.
 *
 * ── Why the numbers match the roster's ──────────────────────────────────────
 * `getPlayerProfile` folds both of a claimed player's ids the way
 * `getRosterData` does, so the Record here is the roster's Record. Both
 * loaders are `cache()`d; the roster read is shared with the header's
 * switcher and Edit player, which need the whole squad.
 */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ playerId: string }>;
}): Promise<Metadata> {
  const { playerId } = await params;
  const workspace = await getWorkspaceContext();
  if (!workspace || workspace.active.kind !== "team")
    return { title: "Player" };
  const profile = await getPlayerProfile(workspace.active.id, playerId);
  return { title: profile?.name ?? "Player" };
}

export default async function PlayerProfilePage({
  params,
}: {
  params: Promise<{ playerId: string }>;
}) {
  const { playerId } = await params;

  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  const [profile, roster, myPlayerIds, season] = await Promise.all([
    getPlayerProfile(active.id, playerId),
    getRosterData(active.id),
    getMyPlayerIds(),
    // `cache()`d, and the Statistics and Visualizations views read the same
    // call; here it gives the rail its opponents count and the facts line
    // its analyzed count. Null only for an id that names nobody here, which
    // the profile read 404s on below.
    getPlayerSeason(active.id, playerId),
  ]);

  // The loader returns null for an id that names nobody on this roster. It
  // arrives from a URL, so it is untrusted; a 404 is the honest answer.
  if (!profile) notFound();

  // Both id eras count: the URL may carry the profile id or, for a claimed
  // player's old links, the user id. `getMyPlayerIds` knows both.
  const isSelf = myPlayerIds.includes(playerId);
  const isStaff = isProgramStaff(active);
  const canUpload = canUploadForProgram(active);

  // A staff member on their own row is still "self": the page is about them.
  // A player on a teammate's page is a viewer — they read it, and nothing
  // here is theirs to edit.
  const mode = isSelf ? "self" : isStaff ? "staff" : "viewer";

  const players = roster.members
    .filter((m) => m.role === "player")
    .map((m) => ({ id: m.playerId, name: m.name, lineupSpot: m.lineupSpot }));

  // Only staff can open Edit player, and only they need the squad behind it.
  // Everyone else gets nulls, which keeps a fat `RosterMember[]` out of the
  // page's client payload — see `ProfileActions`.
  const member =
    mode === "staff"
      ? (roster.members.find((m) => m.playerId === playerId) ?? null)
      : null;

  // `profile.playerId`, never the URL's: a claimed player's old links carry
  // their user id, and the wizard's For field wants the profile id. Gated by
  // `canUploadForProgram`, the predicate the wizard itself enforces — absent
  // rather than disabled, so this never opens a door the next page closes.
  const newMatchHref = canUpload
    ? `/dashboard/matches/new?player=${profile.playerId}`
    : null;

  // The same count either way: `getPlayerSeason` and `getPlayerProfile`
  // fold the one list of this player's matches.
  const matchesPlayed = season?.matchesPlayed ?? profile.matchesPlayed;
  const analyzed = season?.analyzed ?? 0;

  return (
    // The match detail layout's box: a fixed height from the viewport, so
    // the rail and the pane scroll on their own (`match-report.tsx`'s note).
    <div className="flex h-[calc(100dvh-var(--header-h))] w-full flex-col overflow-hidden bg-white">
      {/* `Roster › Name ⌄ n / N` for every viewer, the player included: the
          trail back to the roster and the switcher to walk it are the same
          from either side, and a player's own name alone left them with no
          way back to the squad. */}
      <ProfileHeaderSlot
        name={profile.name}
        playerId={profile.playerId}
        players={players}
      />

      <MatchReportFrame>
        <ProfileRail
          profile={profile}
          isSelf={isSelf}
          // The viewer's own from the workspace (fresh after a Profile
          // change); anyone else's from the roster row this page already read.
          photoUrl={
            isSelf
              ? workspace.viewer.avatarUrl
              : (roster.members.find((m) => m.playerId === profile.playerId)
                  ?.avatarUrl ?? null)
          }
          matchesCount={matchesPlayed}
          opponentsCount={season?.opponentsCount ?? 0}
          newMatchHref={newMatchHref}
        />

        <MatchReportPane>
          <MatchReportTitleRow>
            <div className="min-w-0">
              <ProfileTitle />
              {/* `.text-micro` is unlayered and paints ink-500, so the
                  report facts line's ink-700 goes inline. */}
              <p
                className="text-micro tabular mt-[9px] min-h-[18px]"
                style={{ color: "var(--ink-700)" }}
              >
                {matchesPlayed} {matchesPlayed === 1 ? "match" : "matches"} ·{" "}
                {analyzed} analyzed
              </p>
            </div>
            <MatchReportTitleActions>
              <ProfileActions
                mode={mode}
                member={member}
                roster={mode === "staff" ? roster.members : []}
                // Ask with this player tagged (`profile.playerId`, the
                // roster's own id, which the Ask page's player tags carry).
                askHref={askEntryHref(
                  {
                    kind: "team",
                    programId: active.id,
                    programName: active.name,
                  },
                  { kind: "player", id: profile.playerId },
                )}
                askSubject={profile.firstName}
              />
            </MatchReportTitleActions>
          </MatchReportTitleRow>
        </MatchReportPane>
      </MatchReportFrame>
    </div>
  );
}
