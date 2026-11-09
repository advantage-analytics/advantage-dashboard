import { Suspense } from "react";
import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canUploadForProgram, isProgramStaff } from "@/lib/workspace/types";
import {
  getPlayerMatchSides,
  getPlayerProfile,
} from "@/lib/data/player-profile-server";
import {
  getPlayerSeason,
  seasonOpponentCount,
} from "@/lib/data/player-season-server";
import {
  buildSeasonEvidence,
  seasonInsightSignature,
} from "@/lib/data/player-insight";
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
import {
  ProfileTitle,
  ProfileViewWhen,
} from "@/components/dashboard/team/player-profile/profile-frame";
import { ProfileActions } from "@/components/dashboard/team/player-profile/profile-actions";
import { ProfileStatisticsView } from "@/components/dashboard/team/player-profile/profile-statistics-view";
import {
  AnalyzedCountPending,
  ProfileStatisticsPanePending,
} from "@/components/dashboard/loading/player-profile-pending";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
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
 * names the active view (`?tab=`, `profile-view.ts`), then the view's body.
 *
 * ── What waits for the season ───────────────────────────────────────────────
 * `getPlayerSeason` is the heavy read — every analyzed match's points, stats
 * rows and lob file — so nothing above the pane body awaits it. The rail and
 * the title row render from `getPlayerProfile` and `getPlayerMatchSides`,
 * which the profile read has already made (both `cache()`d, so the match
 * sides cost nothing more): "N matches" is the profile's count and "N
 * opponents" is `seasonOpponentCount` over the same rows the season would
 * count them from. Two things do need the season, and each streams inside
 * its own `<Suspense>`: the facts line's "N analyzed" (a bar until it lands)
 * and the Statistics tab's body (`ProfileStatisticsPanePending` until it
 * lands — `player-profile-pending.tsx`, the same parts `loading.tsx` draws).
 * Visualizations draws no body yet; it arrives in its own task.
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

  const [profile, roster, myPlayerIds, sides] = await Promise.all([
    getPlayerProfile(active.id, playerId),
    getRosterData(active.id),
    getMyPlayerIds(),
    // The rows `getPlayerProfile` itself reads (`cache()`d, one roster RPC
    // and one matches read per request) — what the rail's opponents count is
    // taken from without waiting for the season. Null exactly when the
    // profile is.
    getPlayerMatchSides(active.id, playerId),
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

  // `getPlayerSeason` folds the same list, so its `matchesPlayed` and
  // `opponentsCount` are these two numbers; reading them here keeps the rail
  // off the season's critical path.
  const matchesPlayed = profile.matchesPlayed;
  const opponentsCount = sides ? seasonOpponentCount(sides.own) : 0;

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
          opponentsCount={opponentsCount}
          newMatchHref={newMatchHref}
        />

        <MatchReportPane>
          <MatchReportTitleRow>
            <div className="min-w-0">
              <ProfileTitle />
              {/* `.text-micro` is unlayered and paints ink-500, so the
                  report facts line's ink-700 goes inline. */}
              <p
                className="text-micro tabular mt-[9px] flex min-h-[18px] items-center gap-1"
                style={{ color: "var(--ink-700)" }}
              >
                <span>
                  {matchesPlayed} {matchesPlayed === 1 ? "match" : "matches"}
                </span>
                <Suspense fallback={<AnalyzedCountPending />}>
                  <AnalyzedCount programId={active.id} playerId={playerId} />
                </Suspense>
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

          {/* The pane body: the one place the season is awaited for the
              cards. `WidgetBoundary` outside the `Suspense`, so a season read
              that throws (it fails closed — `player-season-server.ts`) draws
              the retry in the body while the rail and title stay. */}
          <WidgetBoundary label="Statistics">
            <Suspense
              fallback={
                <ProfileViewWhen view="statistics">
                  <ProfileStatisticsPanePending />
                </ProfileViewWhen>
              }
            >
              <ProfileStatisticsBody
                programId={active.id}
                playerId={playerId}
                rosterPlayerId={profile.playerId}
                playerName={profile.name}
                firstName={profile.firstName}
              />
            </Suspense>
          </WidgetBoundary>
        </MatchReportPane>
      </MatchReportFrame>
    </div>
  );
}

/**
 * The facts line's "· N analyzed", once the season has landed. A season read
 * that fails is the body's to report (its retry); here it drops the clause
 * rather than print a count nobody measured.
 */
async function AnalyzedCount({
  programId,
  playerId,
}: {
  programId: string;
  playerId: string;
}) {
  const season = await getPlayerSeason(programId, playerId).catch(() => null);
  if (!season) return null;
  return <span>· {season.analyzed} analyzed</span>;
}

/**
 * The Statistics tab's body: the season, awaited here and nowhere above, then
 * `ProfileStatisticsView` inside the tab's panel. Null season is an id that
 * names nobody, which the page has already 404ed on.
 *
 * The insight card's evidence line and cache signature are composed here,
 * on the server, from the season fold (`player-insight.ts`): the figures the
 * card shows under the streamed claim are the same objects the Head to head
 * table draws, never the model's. `rosterPlayerId` is the roster's own id,
 * which is what `/api/player-insight` resolves.
 */
async function ProfileStatisticsBody({
  programId,
  playerId,
  rosterPlayerId,
  playerName,
  firstName,
}: {
  programId: string;
  playerId: string;
  rosterPlayerId: string;
  playerName: string;
  firstName: string;
}) {
  const season = await getPlayerSeason(programId, playerId);
  if (!season) return null;
  return (
    <ProfileViewWhen view="statistics">
      <ProfileStatisticsView
        playerId={rosterPlayerId}
        playerName={playerName}
        firstName={firstName}
        analyzed={season.analyzed}
        groups={season.groups}
        tallies={season.tallies}
        evidence={buildSeasonEvidence(season)}
        insightSignature={seasonInsightSignature(season)}
      />
    </ProfileViewWhen>
  );
}
