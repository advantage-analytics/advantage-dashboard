import Link from "next/link";
import type { RosterMember } from "@/lib/data/team-roster-server";
import { topMovers } from "@/lib/data/team-movers";
import { formatDelta } from "@/lib/data/match-utils";
import { recordLabel } from "@/lib/data/player-profile";
import { EmptyMark } from "@/components/ui/empty-mark";
import { getInitials } from "@/lib/data/match-utils";
import { PersonAvatar } from "@/components/ui/person-avatar";
import { FormStrip } from "@/components/dashboard/shared/form-strip";
import { cn } from "@/lib/utils";
import {
  EmptyBand,
  GhostBar,
  GhostRows,
  HEAD_LINK,
  LIST_CARD,
  LIST_ROW,
  ROW_SUB,
  ROW_TITLE,
  RowChevron,
  SectionHead,
} from "./home-title";
import { RememberHomeRows } from "./home-shape-memory";

const ROSTER = "/dashboard/team/roster";
/** The Home shows the top of the lineup; Roster is the whole list. */
const PLAYER_ROWS = 6;

/**
 * The roster as a short list: each player, the statistic that moved most in
 * their latest match, their form and their record. A player row is a record
 * row: it opens the player's page.
 */
export function PlayersTable({
  members,
  teamName,
  canManage,
  viewer,
}: {
  members: readonly RosterMember[];
  teamName: string;
  canManage: boolean;
  viewer: { id: string; initials: string; avatarUrl: string | null };
}) {
  const players = members.filter((member) => member.role === "player");
  const movers = new Map(
    topMovers(members, players.length || 1).map((m) => [m.playerId, m]),
  );
  const rows = players.slice(0, PLAYER_ROWS);

  return (
    <section aria-label="Players" className="flex min-w-0 flex-col gap-2.5">
      <SectionHead title="Players">
        <Link href={ROSTER} className={HEAD_LINK}>
          Full roster
        </Link>
      </SectionHead>
      <RememberHomeRows list="players" rows={rows.length} />
      <div className={LIST_CARD}>
        {rows.length === 0 ? (
          <>
            <GhostRows
              lead={<GhostBar width={32} height={32} round />}
              lines={[110, 150]}
              tail={<GhostBar width={60} />}
            />
            <EmptyBand
              title={`Add ${teamName}’s players`}
              body={
                canManage
                  ? "Add them yourself or send an invite."
                  : "Players your coach adds show up here."
              }
              href={canManage ? `${ROSTER}?add=player` : undefined}
            />
          </>
        ) : (
          rows.map((member) => {
            const mover = movers.get(member.playerId);
            const delta =
              mover && !mover.firstMatch ? formatDelta(mover.delta) : null;
            return (
              <div
                key={member.playerId}
                className={cn(
                  LIST_ROW,
                  "focus-within:bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]",
                )}
              >
                {/* The row is the link; the form bars sit above it so each
                    bar still opens its own match. */}
                <Link
                  href={`${ROSTER}/${member.playerId}`}
                  aria-label={`Open ${member.name}`}
                  className="absolute inset-0 rounded-[var(--radius-element)] focus-visible:outline-none"
                />
                {/* `PlayerMark`'s own rule (the viewer's row shows the
                    viewer's photo), drawn a step larger than a table's 26px
                    mark: these rows are two lines tall. */}
                <PersonAvatar
                  initials={
                    member.userId === viewer.id
                      ? viewer.initials
                      : getInitials(member.name)
                  }
                  photoUrl={
                    member.userId === viewer.id
                      ? viewer.avatarUrl
                      : member.avatarUrl
                  }
                  className="size-8 text-[10px]"
                />
                <span className="flex min-w-0 flex-1 flex-col gap-0.5">
                  <b className={cn(ROW_TITLE, "font-medium")}>{member.name}</b>
                  <span className={ROW_SUB}>
                    {mover && delta ? (
                      <>
                        {mover.metric}
                        <span
                          className="tabular ml-2 text-[11px] font-medium"
                          style={{ color: delta.color }}
                        >
                          {delta.label} pts
                        </span>
                      </>
                    ) : (
                      <span className="text-[var(--ink-400)]">
                        No change to show yet
                      </span>
                    )}
                  </span>
                </span>
                <span className="relative z-10 flex shrink-0 items-center">
                  <FormStrip bars={member.form} slots={5} />
                </span>
                <span className="tabular flex w-[30px] shrink-0 items-center text-[13px] text-[var(--ink-900)]">
                  {member.wins + member.losses === 0 ? (
                    <EmptyMark label="No record yet" />
                  ) : (
                    recordLabel(member.wins, member.losses)
                  )}
                </span>
                <RowChevron />
              </div>
            );
          })
        )}
      </div>
    </section>
  );
}
