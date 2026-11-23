import Link from "next/link";
import { ChevronRight } from "lucide-react";
import type { RosterMember } from "@/lib/data/team-roster-server";
import { topMovers } from "@/lib/data/team-movers";
import { ANALYSIS_LABEL, inFlightMark } from "@/lib/data/match-analysis";
import { formatDelta } from "@/lib/data/match-utils";
import { recordLabel } from "@/lib/data/player-profile";
import { advButton } from "@/lib/ui/adv-button";
import { EmptyMark } from "@/components/ui/empty-mark";
import { PlayerMark } from "@/components/ui/player-mark";
import { ResultMark } from "@/components/dashboard/result-mark";
import { FormStrip } from "@/components/dashboard/shared/form-strip";
import { AnalysisStatusLine } from "@/components/dashboard/shared/analysis-status-line";
import { COL, ROW } from "@/components/dashboard/team/roster-table-layout";
import { cn } from "@/lib/utils";
import { EmptyBand, GhostBar, HEAD_LINK, SectionHead } from "./home-title";

const ROSTER = "/dashboard/team/roster";
const ADD_PLAYERS = `${ROSTER}?add=player`;
/** The Home shows the top of the lineup; Roster is the whole list. */
const PLAYER_ROWS = 6;
/** The one column Roster does not have: each player's biggest mover. */
const CHANGE = "w-[240px] shrink-0";
const HEAD = [
  [COL.spot, "#"],
  [COL.player, "Player"],
  [COL.record, "Record"],
  [COL.form, "Form"],
  [CHANGE, "Biggest change, latest match"],
  [COL.last, "Last Match"],
] as const;

function Header() {
  return (
    <div
      className={cn(
        ROW,
        "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
      )}
    >
      {HEAD.map(([col, label]) => (
        <span
          key={label}
          className={cn(col, "eyebrow-sm", label === "#" && "text-center")}
        >
          {label}
        </span>
      ))}
    </div>
  );
}

/**
 * The last match: its result mark, the opponent, then either the day or —
 * while the report is on its way — the status. The mark stays in both cases:
 * the result comes from the score entered at upload, not from analysis.
 */
function LastMatch({ member }: { member: RosterMember }) {
  const { lastMatch } = member;
  if (lastMatch === null) {
    return (
      <span className={cn(COL.last, "flex items-center")}>
        <EmptyMark label="No matches yet" />
      </span>
    );
  }
  const { analysis } = lastMatch;
  return (
    <span className={cn(COL.last, "flex items-center gap-2.5 pr-7")}>
      <span className="flex w-3.5 shrink-0 items-center justify-center">
        {lastMatch.won === null ? (
          <span aria-hidden className="text-[11px] text-[var(--ink-400)]">
            –
          </span>
        ) : (
          <ResultMark won={lastMatch.won} />
        )}
      </span>
      <span className="w-[136px] min-w-0 shrink truncate text-[12px] text-[var(--ink-700)]">
        {lastMatch.opponent}
      </span>
      {analysis ? (
        <AnalysisStatusLine
          mark={inFlightMark(analysis.status)}
          className="tabular shrink-0"
        >
          {analysis.status === "uploading" &&
          analysis.uploadPercent !== undefined
            ? `${ANALYSIS_LABEL.uploading} ${Math.round(analysis.uploadPercent)}%`
            : ANALYSIS_LABEL[analysis.status]}
        </AnalysisStatusLine>
      ) : (
        <span className="text-micro tabular shrink-0 whitespace-nowrap">
          {lastMatch.date}
        </span>
      )}
    </span>
  );
}

/**
 * The roster, in the Roster page's own columns plus each player's biggest
 * change. A player row is a record row: it opens the player's page.
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
    <section aria-label="Players" className="flex flex-col gap-2.5">
      <SectionHead title="Players">
        {canManage && players.length > 0 ? (
          <Link href={ADD_PLAYERS} className={HEAD_LINK}>
            Add players
          </Link>
        ) : null}
        <Link href={ROSTER} className={HEAD_LINK}>
          All players
        </Link>
      </SectionHead>
      <div
        className="surface-card overflow-x-auto"
        style={{ padding: "2px 24px 6px" }}
      >
        <div className="min-w-[980px]">
          <Header />
          {rows.map((member, index) => {
            const mover = movers.get(member.playerId);
            const delta =
              mover && !mover.firstMatch ? formatDelta(mover.delta) : null;
            return (
              <div
                key={member.playerId}
                className={cn(
                  ROW,
                  "group relative -mx-4 h-[52px] rounded-[var(--radius-element)] px-4 transition-colors duration-[var(--duration-hover)] focus-within:bg-[var(--surface-muted)] hover:bg-[var(--surface-muted)]",
                )}
              >
                <Link
                  href={`${ROSTER}/${member.playerId}`}
                  aria-label={`Open ${member.name}`}
                  className="absolute inset-0 rounded-[var(--radius-element)] focus-visible:outline-none"
                />
                <span
                  className={cn(
                    COL.spot,
                    "tabular text-center text-[12px] text-[var(--ink-500)]",
                  )}
                >
                  {member.lineupSpot ?? index + 1}
                </span>
                <span
                  className={cn(
                    COL.player,
                    "flex min-w-0 items-center gap-2.5",
                  )}
                >
                  <PlayerMark
                    name={member.name}
                    viewer={member.userId === viewer.id ? viewer : null}
                    photoUrl={member.avatarUrl}
                  />
                  <span className="min-w-0 truncate text-[13px] font-medium text-[var(--ink-900)]">
                    {member.name}
                  </span>
                </span>
                <span
                  className={cn(
                    COL.record,
                    "tabular flex items-center text-[13px] text-[var(--ink-900)]",
                  )}
                >
                  {member.wins + member.losses === 0 ? (
                    <EmptyMark label="No record yet" />
                  ) : (
                    recordLabel(member.wins, member.losses)
                  )}
                </span>
                <span
                  className={cn(COL.form, "relative z-10 flex items-center")}
                >
                  <FormStrip bars={member.form} slots={5} />
                </span>
                <span className={cn(CHANGE, "flex min-w-0 items-center gap-2")}>
                  {mover && delta ? (
                    <>
                      <span className="min-w-0 truncate text-[12px] text-[var(--ink-700)]">
                        {mover.metric}
                      </span>
                      <span
                        className="tabular shrink-0 text-[11px] font-medium"
                        style={{ color: delta.color }}
                      >
                        {delta.label} pts
                      </span>
                    </>
                  ) : (
                    <EmptyMark label="No change to show yet" />
                  )}
                </span>
                <LastMatch member={member} />
                <ChevronRight
                  aria-hidden
                  strokeWidth={1.5}
                  className="pointer-events-none absolute top-1/2 right-4 size-[13px] -translate-y-1/2 text-[var(--ink-300)] transition-colors duration-[var(--duration-hover)] group-hover:text-[var(--ink-900)]"
                />
              </div>
            );
          })}
          {rows.length === 0 ? (
            <>
              {[1, 0.6, 0.3].map((opacity) => (
                <div
                  key={opacity}
                  aria-hidden
                  className={cn(ROW, "h-[52px]")}
                  style={{ opacity }}
                >
                  <span className={cn(COL.spot, "flex justify-center")}>
                    <GhostBar width={8} />
                  </span>
                  <span className={cn(COL.player, "flex items-center gap-2.5")}>
                    <GhostBar width={26} round />
                    <GhostBar width={112} />
                  </span>
                  <span className={COL.record}>
                    <GhostBar width={28} />
                  </span>
                  <span className={COL.form}>
                    <GhostBar width={30} />
                  </span>
                  <span className={CHANGE}>
                    <GhostBar width={150} />
                  </span>
                  <span className={COL.last}>
                    <GhostBar width={170} />
                  </span>
                </div>
              ))}
              <EmptyBand
                title={`Add ${teamName}’s players`}
                body={
                  canManage
                    ? "Add players yourself or invite them. Players who join see their own matches and stats."
                    : "Your coach adds players here. Players who join see their own matches and stats."
                }
              >
                {canManage ? (
                  <>
                    <Link
                      href={ADD_PLAYERS}
                      className={advButton("outline", "sm")}
                    >
                      Add players
                    </Link>
                    <Link href={ROSTER} className={advButton("outline", "sm")}>
                      Invite players
                    </Link>
                  </>
                ) : null}
              </EmptyBand>
            </>
          ) : null}
        </div>
      </div>
    </section>
  );
}
