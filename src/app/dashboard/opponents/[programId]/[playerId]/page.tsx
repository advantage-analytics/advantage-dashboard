import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getOpponentPlayerProfile } from "@/lib/data/opponents-server";
import { formatPlayerStyle } from "@/lib/data/match-utils";

export const metadata = { title: "Opponent player" };

/**
 * One opposing player, on the evidence this program actually has.
 *
 * ── The denominator is not decoration ───────────────────────────────────────
 * It is usually 1. A program plays a conference opponent's #3 singles once a
 * season, and a first-serve percentage over one match is a legitimate thing to
 * show and an illegitimate thing to show bare — it reads as a settled trait
 * rather than as one afternoon. So the match count sits in the subtitle, and
 * every measure is suppressed entirely when nothing measured it.
 *
 * ── An em dash is an answer ─────────────────────────────────────────────────
 * `docs/splitstep-derivation.md` §4 puts aces and the whole return family in
 * the Unknowable tier for video-derived matches. `meanOfPresent` returns null
 * for those rather than zero, and null renders here as "—". A zero would be a
 * specific false claim about a named student, on a page somebody plans around.
 */
export default async function OpponentPlayerPage({
  params,
}: {
  params: Promise<{ programId: string; playerId: string }>;
}) {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  const { programId, playerId } = await params;
  const profile = await getOpponentPlayerProfile(active.id, playerId);
  if (!profile) notFound();

  const style = formatPlayerStyle(profile.hand ?? undefined, profile.backhand ?? undefined);
  const measured = profile.measures.filter((m) => m.value !== null).length;

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-8 px-6 py-8 sm:px-10">
        <div>
          <Link
            href={`/dashboard/opponents/${programId}`}
            className="text-[11px] text-[var(--ink-500)] transition-colors hover:text-[var(--ink-900)]"
          >
            ← {profile.programName || "Opponent"}
          </Link>
          <h1 className="mt-2 text-[30px] leading-9 font-light tracking-[-0.6px] text-[var(--ink-900)]">
            {profile.name}
          </h1>
          <p className="mt-1 text-[12px] leading-[1.5] tabular-nums text-[var(--ink-700)]">
            {[
              profile.lineupSpot ? `#${profile.lineupSpot}` : null,
              profile.classYear,
              ...style,
              profile.matchesAgainst > 0
                ? `${profile.matchesAgainst} ${profile.matchesAgainst === 1 ? "match" : "matches"} against your program`
                : "You have not played them",
            ]
              .filter(Boolean)
              .join(" · ")}
          </p>
        </div>

        <section className="flex flex-col gap-3">
          <div>
            <h2 className="text-[15px] font-medium text-[var(--ink-900)]">
              Against your program
            </h2>
            <p className="mt-0.5 max-w-[64ch] text-[11px] leading-[1.6] text-[var(--ink-500)]">
              {profile.matchesAgainst === 0
                ? "Nothing to show until you play them. These numbers only ever come from your own matches — no other program's statistics are shared with you, and yours are not shared with them."
                : profile.matchesAgainst === 1
                  ? "From a single match. Read it as one afternoon rather than as a settled trait."
                  : `Averaged across ${profile.matchesAgainst} matches. Your own data only — never pooled.`}
            </p>
          </div>

          {profile.matchesAgainst > 0 && (
            <>
              <ul className="border-t border-[var(--border-hairline)]">
                {profile.measures.map((measure) => (
                  <li
                    key={measure.key}
                    className="flex items-center gap-3 border-b border-[var(--border-hairline)] py-[13px]"
                    title={measure.hint}
                  >
                    <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--ink-900)]">
                      {measure.label}
                    </span>
                    <span className="shrink-0 text-[13px] font-medium tabular-nums text-[var(--ink-900)]">
                      {measure.value === null ? (
                        <span className="text-[var(--ink-400)]">—</span>
                      ) : (
                        `${measure.value}%`
                      )}
                    </span>
                  </li>
                ))}
              </ul>

              {measured < profile.measures.length && (
                <p className="text-[11px] leading-[1.6] text-[var(--ink-500)]">
                  A dash means the match never measured it — not that it was zero.
                  Video-derived matches withhold the return family and anything
                  depending on how a point ended.
                </p>
              )}
            </>
          )}
        </section>
      </div>
    </div>
  );
}
