import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getOpponentDetail } from "@/lib/data/opponents-server";

export const metadata = { title: "Opponent" };

/**
 * One opponent: who they field, and how it has gone against us.
 *
 * Three blocks, in the order a coach needs them the week of a dual — the roster
 * with lineup spots, the lines they have actually played this season, and then
 * our own record against them.
 *
 * The first two are pooled: they are assembled from whatever every program on
 * the platform has recorded, which is what makes them worth reading. The third
 * is only ours, and is the only block on this page that could ever be.
 */
export default async function OpponentPage({
  params,
}: {
  params: Promise<{ programId: string }>;
}) {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  const { programId } = await params;
  const detail = await getOpponentDetail(active.id, programId);
  if (!detail) notFound();

  const { program, conference, roster, lineups, headToHead, wins, losses } = detail;

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-8 px-6 py-8 sm:px-10">
        <div>
          <Link
            href="/dashboard/opponents"
            className="text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--ink-900)]"
          >
            ← Opponents
          </Link>
          <h1 className="mt-2 text-[30px] leading-9 font-light tracking-[-0.6px] text-[var(--ink-900)]">
            {program.schoolName}
          </h1>
          <p className="mt-1 text-[12px] leading-[1.5] tabular-nums text-[var(--ink-700)]">
            {[
              program.team,
              conference,
              program.division,
              program.state,
              headToHead.length > 0 ? `${wins}–${losses} against us` : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-[var(--ink-900)]">Roster</h2>
            <p className="mt-0.5 text-[11px] leading-[1.6] text-[var(--ink-500)]">
              {roster.length > 0
                ? "Shared across programs. Open a player for what they did against your team."
                : "Nobody has recorded this program's roster yet."}
            </p>
          </div>

          {roster.length > 0 && (
            <ul className="border-t border-[var(--border-hairline)]">
              {roster.map((player) => (
                <li
                  key={player.id}
                  className="relative border-b border-[var(--border-hairline)] transition-colors hover:bg-[var(--surface-muted)]"
                >
                  <div className="flex items-center gap-3 py-[13px]">
                    <span className="w-8 shrink-0 text-[11px] tabular-nums text-[var(--ink-500)]">
                      {player.lineupSpot ? `#${player.lineupSpot}` : "—"}
                    </span>
                    <span className="min-w-0 flex-1">
                      <Link
                        href={`/dashboard/opponents/${program.id}/${player.id}`}
                        className="block truncate text-[13px] font-medium text-[var(--ink-900)] rounded-[var(--radius-cell)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none after:absolute after:inset-0 after:content-['']"
                      >
                        {player.name}
                      </Link>
                      {player.classYear && (
                        <span className="block text-[11px] text-[var(--ink-500)]">
                          {player.classYear}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-[var(--ink-900)]">Lineups</h2>
            <p className="mt-0.5 text-[11px] leading-[1.6] text-[var(--ink-500)]">
              {lineups.length > 0
                ? "Every line any program has recorded against them, newest first."
                : "No lines recorded against this program yet — by you or by anyone else."}
            </p>
          </div>

          {lineups.length > 0 && (
            <ul className="border-t border-[var(--border-hairline)]">
              {lineups.map((line) => (
                <li
                  key={line.entryId}
                  className="flex items-center gap-3 border-b border-[var(--border-hairline)] py-[13px]"
                >
                  <span className="w-8 shrink-0 text-[11px] tabular-nums text-[var(--ink-500)]">
                    {line.slot ?? "—"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-[var(--ink-900)]">
                      {line.players.length > 0 ? line.players.join(" / ") : "Unnamed"}
                    </span>
                    <span className="block truncate text-[11px] text-[var(--ink-500)]">
                      {line.eventName}
                    </span>
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink-700)]">
                    {line.score ?? "—"}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-[var(--ink-900)]">Against us</h2>
            <p className="mt-0.5 text-[11px] leading-[1.6] text-[var(--ink-500)]">
              {headToHead.length > 0
                ? "Your program's own matches. Not shared with anyone."
                : "You have not played this program yet."}
            </p>
          </div>

          {headToHead.length > 0 && (
            <ul className="border-t border-[var(--border-hairline)]">
              {headToHead.map((match) => (
                <li
                  key={match.matchId}
                  className="flex items-center gap-3 border-b border-[var(--border-hairline)] py-[13px]"
                >
                  <span
                    className="w-4 shrink-0 text-center text-[11px] font-medium"
                    style={{
                      color:
                        match.won === null
                          ? "var(--ink-400)"
                          : match.won
                            ? "var(--success)"
                            : "var(--danger)",
                    }}
                  >
                    {match.won === null ? "–" : match.won ? "W" : "L"}
                  </span>
                  <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-900)]">
                    {match.opponentName}
                  </span>
                  <span className="shrink-0 text-[12px] tabular-nums text-[var(--ink-700)]">
                    {match.score || "—"}
                  </span>
                  <span className="w-16 shrink-0 text-right text-[11px] tabular-nums text-[var(--ink-500)]">
                    {match.date}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
