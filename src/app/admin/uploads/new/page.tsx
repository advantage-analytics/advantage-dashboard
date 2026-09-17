import Link from "next/link";
import { AdminUploadEntry } from "@/components/admin/admin-upload-entry";
import {
  adminUploadHref,
  adminUploadSelection,
} from "@/components/admin/admin-upload-selection";
import { getAdminUploadContext } from "@/lib/data/admin-upload-server";
import { listAdminTeams } from "@/lib/data/admin-teams-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";

export const metadata = { title: "Upload for a team" };

export default async function AdminNewUploadPage({
  searchParams,
}: {
  searchParams: Promise<{
    team?: string | string[];
    kind?: string | string[];
    q?: string | string[];
  }>;
}) {
  // The layout is not an authorization dependency: the page guards before any
  // directory or context read, including malformed and repeated URL inputs.
  await requireAdminOrNotFound();
  const params = await searchParams;
  const selection = adminUploadSelection(params);
  const query =
    typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  const result =
    selection.team && !selection.invalidTeam
      ? await getAdminUploadContext(selection.team)
      : null;
  const context = result?.ok ? result.context : null;
  let error = selection.invalidTeam
    ? "Choose a valid team."
    : result && !result.ok
      ? result.message
      : null;
  if (selection.invalidKind)
    error = [error, "Choose one of the four upload kinds."]
      .filter(Boolean)
      .join(" ");
  let teams: Awaited<ReturnType<typeof listAdminTeams>> | null = null;
  if (!context && query) {
    try {
      teams = await listAdminTeams({
        view: "all",
        limit: 20,
        filters: { search: query },
      });
    } catch {
      error = "We couldn’t search teams. Try again.";
    }
  }
  const picker = (
    <section aria-label="Choose a team" className="flex flex-col gap-3">
      <form
        action="/admin/uploads/new"
        className="flex flex-wrap items-end gap-3"
      >
        {selection.kind && (
          <input type="hidden" name="kind" value={selection.kind} />
        )}
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-[12px] text-[var(--ink-600)]">
          Team
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search by school"
            className={advField("boxed")}
          />
        </label>
        <button className={advButton("ghost", "md")} type="submit">
          Search
        </button>
      </form>
      {teams && (
        <ul className="flex flex-col">
          {teams.rows.map((team) => (
            <li key={team.id}>
              <Link
                href={adminUploadHref(team.id, selection.kind)}
                className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-element)] px-3 py-3 text-[13px] hover:bg-[var(--surface-subtle)]"
              >
                <span>{team.name}</span>
                <span className="text-[12px] text-[var(--ink-600)]">
                  {[team.division, team.conference].filter(Boolean).join(" · ")}
                </span>
              </Link>
            </li>
          ))}
          {teams.rows.length === 0 && (
            <li
              role="status"
              className="py-3 text-[13px] text-[var(--ink-600)]"
            >
              No teams found. Try another school name.
            </li>
          )}
        </ul>
      )}
      {teams?.nextCursor && (
        <p className="text-[12px] text-[var(--ink-600)]">
          Showing the first 20 teams. Refine the school name to find your team.
        </p>
      )}
    </section>
  );
  return (
    <AdminUploadEntry
      context={context}
      kind={selection.kind}
      picker={picker}
      error={error}
    />
  );
}
