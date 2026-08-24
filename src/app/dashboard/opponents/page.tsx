import Link from "next/link";
import { redirect } from "next/navigation";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { getConferenceTable, getOpponentsPlayed } from "@/lib/data/opponents-server";
import type { ConferenceProgram } from "@/lib/data/opponents-server";

export const metadata = { title: "Opponents" };

/**
 * Who this program plays, and who it is about to.
 *
 * Two lists, and the order is the point. "Played" answers a question about our
 * own season and is empty for a program that has recorded nothing. The
 * conference is never empty — `programs` is a seeded directory of 1,940 rows
 * with `conference` populated on every one — so a program opening this page in
 * its first week lands on its own conference rather than on an empty state
 * apologising for itself.
 */
export default async function OpponentsPage() {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");

  const { active } = workspace;
  if (active.kind !== "team") redirect("/dashboard");

  const [{ conference, programs }, played] = await Promise.all([
    getConferenceTable(active.id),
    getOpponentsPlayed(active.id),
  ]);

  const rivals = programs.filter((p) => !p.isSelf);

  return (
    <div className="w-full flex-1 bg-[var(--surface-card)]">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-8 px-6 py-8 sm:px-10">
        <div>
          <h1 className="text-[30px] leading-9 font-light tracking-[-0.6px] text-[var(--ink-900)]">
            Opponents
          </h1>
          <p className="mt-1 max-w-[64ch] text-[12px] leading-[1.5] text-[var(--ink-700)]">
            Lineups and results are shared across programs, so an opponent&rsquo;s season
            is visible before you play them. Statistics stay yours — what a player
            did against your team is on their profile, and nowhere else.
          </p>
        </div>

        <Section
          title="Played"
          caption={
            played.length > 0
              ? `${played.length} ${played.length === 1 ? "program" : "programs"} on the schedule so far`
              : "Nothing recorded yet. A dual with its opponent picked from the directory shows up here."
          }
          programs={played}
        />

        <Section
          title={conference ?? "Conference"}
          caption={
            conference
              ? `${rivals.length} other ${rivals.length === 1 ? "program" : "programs"}`
              : "This program has no conference on file."
          }
          programs={rivals}
        />
      </div>
    </div>
  );
}

function Section({
  title,
  caption,
  programs,
}: {
  title: string;
  caption: string;
  programs: ConferenceProgram[];
}) {
  return (
    <section className="flex flex-col gap-3">
      <div>
        <h2 className="text-[15px] font-medium text-[var(--ink-900)]">{title}</h2>
        <p className="mt-0.5 text-[11px] leading-[1.6] text-[var(--ink-500)]">{caption}</p>
      </div>

      {programs.length > 0 && (
        <ul className="border-t border-[var(--border-hairline)]">
          {programs.map((program) => (
            <li
              key={program.id}
              className="relative border-b border-[var(--border-hairline)] transition-colors hover:bg-[var(--surface-muted)]"
            >
              <div className="flex items-center gap-3 py-[13px]">
                <span className="min-w-0 flex-1">
                  <Link
                    href={`/dashboard/opponents/${program.id}`}
                    className="block truncate text-[13px] font-medium text-[var(--ink-900)] rounded-[var(--radius-cell)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none after:absolute after:inset-0 after:content-['']"
                  >
                    {program.schoolName}
                  </Link>
                  <span className="block truncate text-[11px] text-[var(--ink-500)]">
                    {[program.team, program.division, program.state]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
