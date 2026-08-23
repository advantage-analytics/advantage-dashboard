import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ChevronLeft, Upload } from "lucide-react";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getPlayerProfile } from "@/lib/data/player-profile-server";
import { formatDelta, getInitials } from "@/lib/data/match-utils";
import { capitalize } from "@/lib/utils";
import { advButton } from "@/lib/ui/adv-button";

export const metadata = { title: "Player" };

/**
 * One player's page.
 *
 * The roster row has always pointed somewhere; until now that was Compare,
 * which answers a different question. Compare exists to put two people side by
 * side for a lineup call and says nothing until you have picked a second one. A
 * coach clicking a name wants this person: how they are playing, what they last
 * did, and where the season is trending.
 *
 * ── Why the numbers match an opponent's ─────────────────────────────────────
 * Both read `PLAYER_MEASURES` through the same loader shape. This page and an
 * opponent's profile disagreeing about what a first-serve percentage is would
 * make both untrustworthy, and there is no way for a reader to tell which one
 * lied.
 */
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

  const profile = await getPlayerProfile(active.id, playerId);
  // The loader returns null for an id that names nobody on this roster. It
  // arrives from a URL, so it is untrusted; a 404 is the honest answer.
  if (!profile) notFound();

  const canManage = active.role !== "player";
  const record =
    profile.wins + profile.losses > 0
      ? `${profile.wins}–${profile.losses}`
      : "No decided matches";

  const line = [
    profile.classYear,
    profile.lineupSpot !== null ? `#${profile.lineupSpot} singles` : null,
    profile.role !== "player" ? capitalize(profile.role) : null,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 py-8 sm:px-10">
        <Link
          href="/dashboard/team/roster"
          className="inline-flex w-fit items-center gap-1 text-[12px] text-[var(--ink-500)] transition-colors hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          <ChevronLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
          Roster
        </Link>

        {/* ── Who ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-col items-start justify-between gap-4 lg:flex-row lg:items-center">
          <div className="flex items-center gap-3.5">
            <span
              aria-hidden
              className="flex size-12 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[13px] font-medium text-[var(--ink-700)]"
            >
              {getInitials(profile.name)}
            </span>
            <div>
              <h1 className="text-[30px] leading-9 font-light tracking-[-0.6px] text-[var(--ink-900)]">
                {profile.name}
              </h1>
              <p className="mt-0.5 flex items-center gap-2 text-[12px] text-[var(--ink-500)]">
                {line || profile.email || "On the roster"}
                {profile.managedBy === "coach" && (
                  <span className="inline-flex h-[18px] items-center rounded-[var(--radius-pill)] bg-[var(--surface-subtle)] px-2 text-[10px] font-medium text-[var(--ink-700)]">
                    Coach-managed
                  </span>
                )}
              </p>
            </div>
          </div>

          {canManage && (
            <Link
              href={`/dashboard/team/upload?player=${profile.playerId}`}
              className={advButton("outline")}
            >
              <Upload className="size-3.5" strokeWidth={1.5} aria-hidden />
              Upload a match
            </Link>
          )}
        </div>

        {/* ── The season in four numbers ──────────────────────────────────── */}
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-medium)] bg-[var(--border-hairline)] sm:grid-cols-4">
          <Stat label="Matches" value={String(profile.matchesPlayed)} />
          <Stat label="Record" value={record} />
          <Stat
            label="Form"
            value={
              profile.form.length === 0 ? (
                "—"
              ) : (
                <span className="flex items-center gap-1">
                  <span className="sr-only">
                    {profile.form.map((r) => (r === "win" ? "W" : "L")).join(" ")}
                  </span>
                  {profile.form.map((result, index) => (
                    <span
                      key={index}
                      aria-hidden
                      className="h-4 w-[3px] rounded-[1px]"
                      style={{
                        background:
                          result === "win"
                            ? "var(--viz-good)"
                            : "var(--viz-bad)",
                      }}
                    />
                  ))}
                </span>
              )
            }
          />
          <Stat
            label="First serve"
            value={
              profile.measures.find((m) => m.key === "first_serve_pct")
                ?.value !== null &&
              profile.measures.find((m) => m.key === "first_serve_pct") !==
                undefined
                ? `${profile.measures.find((m) => m.key === "first_serve_pct")!.value}%`
                : "—"
            }
          />
        </div>

        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          {/* ── Recent matches ────────────────────────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h2 className="text-[10px] font-medium tracking-[1.5px] text-[var(--ink-500)] uppercase">
              Recent matches
            </h2>
            {profile.recentMatches.length === 0 ? (
              <Empty>
                Nothing recorded yet.{" "}
                {canManage
                  ? "Upload a match and it will appear here."
                  : "Your coaching staff will add matches as the season goes."}
              </Empty>
            ) : (
              <ul className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-medium)]">
                {profile.recentMatches.map((match, index) => (
                  <li
                    key={match.id}
                    className={
                      index === 0
                        ? ""
                        : "border-t border-[var(--border-hairline)]"
                    }
                  >
                    <Link
                      href={`/dashboard/matches/${match.id}`}
                      className="flex items-center gap-3 px-[18px] py-3.5 transition-colors hover:bg-[var(--surface-muted)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                    >
                      <span
                        aria-hidden
                        className="w-4 shrink-0 text-center text-[11px] font-medium"
                        style={{
                          color:
                            match.won === null
                              ? "var(--ink-400)"
                              : match.won
                                ? "var(--viz-good)"
                                : "var(--viz-bad)",
                        }}
                      >
                        {match.won === null ? "–" : match.won ? "W" : "L"}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] text-[var(--ink-900)]">
                          {match.opponent}
                        </span>
                        {match.event && (
                          <span className="block truncate text-[11px] text-[var(--ink-500)]">
                            {match.event}
                          </span>
                        )}
                      </span>
                      <span className="text-scoreboard-sm tabular shrink-0">
                        {match.score}
                      </span>
                      <span className="text-micro tabular w-12 shrink-0 text-right">
                        {match.date}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </section>

          {/* ── Rates, and where they are going ───────────────────────────── */}
          <section className="flex flex-col gap-3">
            <h2 className="text-[10px] font-medium tracking-[1.5px] text-[var(--ink-500)] uppercase">
              Season averages
            </h2>
            {profile.matchesPlayed === 0 ? (
              <Empty>
                Averages appear once this player has a match with statistics on
                it.
              </Empty>
            ) : (
              <div className="overflow-hidden rounded-[var(--radius-card)] border border-[var(--border-medium)]">
                {profile.measures.map((measure, index) => (
                  <div
                    key={measure.key}
                    title={measure.hint}
                    className={`flex items-center gap-3 px-[18px] py-2.5 ${
                      index === 0
                        ? ""
                        : "border-t border-[var(--border-hairline)]"
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-700)]">
                      {measure.label}
                    </span>
                    {/* A bar, because ten bare percentages is ten separate acts
                        of arithmetic. Not coloured good or bad: every measure
                        here is one where more is better, so a red number would
                        be a judgement on a person rather than a fact. */}
                    <span
                      aria-hidden
                      className="hidden h-1 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--surface-subtle)] sm:block"
                    >
                      <span
                        className="block h-full rounded-full bg-[var(--blue)]"
                        style={{ width: `${measure.value ?? 0}%` }}
                      />
                    </span>
                    <span className="tabular w-12 shrink-0 text-right text-[13px] text-[var(--ink-900)]">
                      {measure.value === null ? "—" : `${measure.value}%`}
                    </span>
                    <Trend value={measure.trend} />
                  </div>
                ))}
              </div>
            )}
            <p className="text-[11px] leading-[1.6] text-[var(--ink-500)]">
              Averages cover every match this program has recorded. The arrow
              compares their last five against everything before, and is absent
              until there is enough season to compare against.
            </p>
          </section>
        </div>
      </div>
    </div>
  );
}

/** One cell of the four-number strip. */
function Stat({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-1.5 bg-[var(--surface-card)] px-[18px] py-4">
      <span className="text-[10px] font-medium tracking-[1.5px] text-[var(--ink-500)] uppercase">
        {label}
      </span>
      <span className="flex h-7 items-center text-[20px] font-light tracking-[-0.4px] text-[var(--ink-900)] tabular-nums">
        {value}
      </span>
    </div>
  );
}

/**
 * The signed change beside a rate, or an empty slot when there is no baseline.
 *
 * The slot stays either way: a column of arrows that collapses on the rows
 * without one would leave the percentages beside it ragged.
 */
function Trend({ value }: { value: number | null }) {
  if (value === null) {
    return <span className="w-10 shrink-0" aria-hidden />;
  }
  const { label, color } = formatDelta(value);
  return (
    <span
      className="tabular w-10 shrink-0 text-right text-[11px]"
      style={{ color }}
    >
      {label}
    </span>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return (
    <p className="rounded-[var(--radius-card)] border border-dashed border-[var(--border-medium)] px-[18px] py-6 text-[12px] leading-[1.6] text-[var(--ink-500)]">
      {children}
    </p>
  );
}
