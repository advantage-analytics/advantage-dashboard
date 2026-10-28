import { AdminTournamentResultForm } from "@/components/admin/admin-tournament-result-form";
import {
  loadAdminTournamentAction,
  submitAdminTournamentAction,
} from "./tournament-actions";
import Link from "next/link";
import { AdminDualResultForm } from "@/components/admin/admin-dual-result-form";
import { loadAdminDualAction, submitAdminDualAction } from "./dual-actions";
import { createAdminClient } from "@/lib/supabase/admin";
import type { AdminDualOption } from "@/lib/admin/results/dual-form";
import { AdminUploadEntry } from "@/components/admin/admin-upload-entry";
import {
  adminUploadHref,
  adminUploadSelection,
} from "@/components/admin/admin-upload-selection";
import {
  getAdminPersonalUploadContext,
  getAdminUploadContext,
} from "@/lib/data/admin-upload-server";
import { adminSearch } from "@/lib/data/admin-search-server";
import { listAdminTeams } from "@/lib/data/admin-teams-server";
import { requireAdminOrNotFound } from "@/lib/services/programs/admin-guard";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";

export const metadata = { title: "Upload a match" };

export default async function AdminNewUploadPage({
  searchParams,
}: {
  searchParams: Promise<{
    team?: string | string[];
    player?: string | string[];
    billing?: string | string[];
    kind?: string | string[];
    q?: string | string[];
    event?: string | string[];
    entry?: string | string[];
    round?: string | string[];
  }>;
}) {
  // The layout is not an authorization dependency: the page guards before any
  // directory or context read, including malformed and repeated URL inputs.
  await requireAdminOrNotFound();
  const params = await searchParams;
  const selection = adminUploadSelection(params);
  const query =
    typeof params.q === "string" ? params.q.trim().slice(0, 120) : "";
  // A team, or a player's personal workspace (video only), never both.
  const result =
    selection.player && !selection.invalidPlayer && !selection.invalidBilling
      ? await getAdminPersonalUploadContext(selection.player, selection.billing)
      : selection.team && !selection.invalidTeam && !selection.player
        ? await getAdminUploadContext(selection.team)
        : null;
  const context = result?.ok ? result.context : null;
  let error = selection.invalidPlayer
    ? "Choose a valid player."
    : selection.invalidBilling
      ? "Choose Free or the player’s allowance."
      : selection.invalidTeam
        ? "Choose a valid team."
        : result && !result.ok
          ? result.message
          : null;
  if (selection.invalidKind)
    error = [error, "Choose one of the four upload kinds."]
      .filter(Boolean)
      .join(" ");
  // A personal workspace has no duals, tournaments or console file path.
  const kind =
    context?.owner && selection.kind && selection.kind !== "video"
      ? null
      : selection.kind;
  if (context?.owner && selection.kind && selection.kind !== "video")
    error = [error, "A player’s personal workspace takes match video only."]
      .filter(Boolean)
      .join(" ");
  let teams: Awaited<ReturnType<typeof listAdminTeams>> | null = null;
  let players: Awaited<ReturnType<typeof adminSearch>> | null = null;
  if (!context && query) {
    const [teamRead, playerRead] = await Promise.allSettled([
      listAdminTeams({
        view: "all",
        limit: 20,
        filters: { search: query },
      }),
      adminSearch(query),
    ]);
    if (teamRead.status === "fulfilled") teams = teamRead.value;
    if (playerRead.status === "fulfilled")
      players = playerRead.value.filter((hit) => hit.kind === "person");
    if (teamRead.status === "rejected" || playerRead.status === "rejected")
      error = "We couldn’t search teams and players. Try again.";
  }
  // Both reads below depend only on the resolved context, not on each other,
  // so they run together rather than one round trip after the other.
  const loadEvents = async (): Promise<{
    events: AdminDualOption[];
    error: string | null;
  }> => {
    if (
      !context ||
      context.owner ||
      (selection.kind !== "dual" && selection.kind !== "tournament")
    )
      return { events: [], error: null };
    try {
      const result = await createAdminClient()
        .from("program_events")
        .select("id,name,starts_on")
        .eq("program_id", context.workspace.id)
        .eq("kind", selection.kind)
        .order("starts_on", { ascending: false })
        .order("id")
        .limit(100);
      if (result.error) throw result.error;
      return {
        events: (result.data ?? []).map((event) => ({
          id: event.id,
          label: `${event.name} · ${event.starts_on}`,
        })),
        error: null,
      };
    } catch {
      return {
        events: [],
        error: `We couldn’t load existing ${selection.kind === "dual" ? "duals" : "tournaments"}. Refresh to try again.`,
      };
    }
  };
  const [{ events: dualEvents, error: dualEventsError }, initialTournament] =
    await Promise.all([
      loadEvents(),
      context &&
      !context.owner &&
      selection.kind === "tournament" &&
      typeof params.event === "string"
        ? loadAdminTournamentAction(context.workspace.id, params.event)
        : null,
    ]);
  const picker = (
    <section
      aria-label="Choose a team or player"
      className="flex flex-col gap-3"
    >
      <form
        action="/admin/uploads/new"
        className="flex flex-wrap items-end gap-3"
      >
        {selection.kind && (
          <input type="hidden" name="kind" value={selection.kind} />
        )}
        <label className="flex min-w-0 flex-1 flex-col gap-2 text-[12px] text-[var(--ink-600)]">
          Upload for
          <input
            type="search"
            name="q"
            defaultValue={query}
            placeholder="Search a school or a player"
            className={advField("boxed")}
          />
        </label>
        <button className={advButton("ghost", "md")} type="submit">
          Search
        </button>
      </form>
      {players && players.length > 0 && (
        <div className="flex flex-col gap-1">
          <span className="text-[11px] text-[var(--ink-500)]">
            Players · personal workspace, match video
          </span>
          <ul className="flex flex-col">
            {players.map((player) => (
              <li key={player.id}>
                <Link
                  href={adminUploadHref({ player: player.id }, "video")}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-[var(--radius-element)] px-3 py-3 text-[13px] hover:bg-[var(--surface-subtle)]"
                >
                  <span>{player.title}</span>
                  {player.subtitle && (
                    <span className="text-[12px] text-[var(--ink-600)]">
                      {player.subtitle}
                    </span>
                  )}
                </Link>
              </li>
            ))}
          </ul>
        </div>
      )}
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
          {teams.rows.length === 0 && !players?.length && (
            <li
              role="status"
              className="py-3 text-[13px] text-[var(--ink-600)]"
            >
              No teams or players found. Try another name.
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
      kind={kind}
      picker={picker}
      error={error}
      tournamentResult={
        context && !context.owner && selection.kind === "tournament" ? (
          <AdminTournamentResultForm
            key={`${context.workspace.id}:${typeof params.event === "string" ? params.event : "new"}`}
            context={context}
            events={dualEvents}
            eventsError={
              initialTournament && !initialTournament.ok
                ? initialTournament.message
                : dualEventsError
            }
            initialContext={
              initialTournament?.ok ? initialTournament.context : null
            }
            initialEntry={typeof params.entry === "string" ? params.entry : ""}
            initialRound={
              typeof params.round === "string" ? params.round : "R16"
            }
            loadAction={loadAdminTournamentAction}
            submitAction={submitAdminTournamentAction}
          />
        ) : undefined
      }
      dualResult={
        context && !context.owner && selection.kind === "dual" ? (
          <AdminDualResultForm
            key={context.workspace.id}
            context={context}
            events={dualEvents}
            eventsError={dualEventsError}
            loadAction={loadAdminDualAction}
            submitAction={submitAdminDualAction}
          />
        ) : undefined
      }
    />
  );
}
