import { notFound, redirect } from "next/navigation";
import type { Metadata } from "next";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canUploadForProgram, isProgramStaff } from "@/lib/workspace/types";
import { getPlayerProfile } from "@/lib/data/player-profile-server";
import { getRosterData } from "@/lib/data/team-roster-server";
import { getMyPlayerIds } from "@/lib/data/player-identity-server";
import { ProfileHeaderSlot } from "@/components/dashboard/team/player-profile/profile-header-slot";
import { ProfileIdentity } from "@/components/dashboard/team/player-profile/profile-identity";
import { ProfileActions } from "@/components/dashboard/team/player-profile/profile-actions";
import { SeasonKpiStrip } from "@/components/dashboard/shared/season-kpi-strip";
import { LastMatchCard } from "@/components/dashboard/team/player-profile/last-match-card";
import { MatchHistoryCard } from "@/components/dashboard/team/player-profile/match-history-card";
import { LineHistoryCard } from "@/components/dashboard/team/player-profile/line-history-card";
import { ServePlacementCard } from "@/components/dashboard/team/player-profile/serve-placement-card";
import { ProfileDayZero } from "@/components/dashboard/team/player-profile/profile-day-zero";

/**
 * One player's page — Platform Audit `Te` (their own) and `Te2` (a coach's
 * view of it).
 *
 * Byte-for-byte the same page from both sides. A player's own data lives
 * here rather than in a personal workspace — that one is for people not on
 * a team — reached from their name at the foot of the rail; a coach reaches
 * the same page from the Roster. Three things differ, all chrome: the header
 * says the name alone or `Roster › name ⌄ 3 / 9` with a switcher; the
 * **You** pill marks whose page it is; and the ghost button is **Edit
 * profile** (a player owns their identity) or **Edit player** (a coach owns
 * the roster). No data is added or withheld — that is what "fully open"
 * buys a program.
 *
 * Five blocks in a 2:1 split: the things you scan repeatedly (the last
 * match, then every match) on the left, the things you consult (line
 * history, then serve placement) on the right.
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
  if (!workspace || workspace.active.kind !== "team") return { title: "Player" };
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

  const [profile, roster, myPlayerIds] = await Promise.all([
    getPlayerProfile(active.id, playerId),
    getRosterData(active.id),
    getMyPlayerIds(),
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

  const actions = (
    <ProfileActions
      mode={mode}
      playerId={profile.playerId}
      member={member}
      roster={mode === "staff" ? roster.members : []}
      canUpload={canUpload}
    />
  );

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      {mode === "staff" ? (
        <ProfileHeaderSlot
          mode="staff"
          name={profile.name}
          playerId={profile.playerId}
          players={players}
        />
      ) : (
        <ProfileHeaderSlot mode="self" name={profile.name} />
      )}

      <div className="mx-auto flex max-w-screen-2xl flex-col gap-5 px-6 pt-5 pb-8 sm:px-14">
        <ProfileIdentity profile={profile} isSelf={isSelf} actions={actions} />

        {profile.matchesPlayed === 0 ? (
          <ProfileDayZero
            mode={mode}
            firstName={profile.firstName}
            playerId={profile.playerId}
            canUpload={canUpload}
            serve={profile.serve}
          />
        ) : (
          <>
            <SeasonKpiStrip
              kpis={profile.kpis}
              hasStats={profile.hasStats}
              matchesPlayed={profile.matchesPlayed}
            />

            <div className="grid items-start gap-4 lg:grid-cols-[1.9fr_1fr]">
              <div className="flex min-w-0 flex-col gap-4">
                {profile.lastMatch && <LastMatchCard match={profile.lastMatch} />}
                <MatchHistoryCard rows={profile.history} playerName={profile.name} />
              </div>
              <div className="flex min-w-0 flex-col gap-4">
                <LineHistoryCard lines={profile.lines} />
                <ServePlacementCard
                  serve={profile.serve}
                  matchesPlayed={profile.matchesPlayed}
                  isSelf={isSelf}
                />
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
