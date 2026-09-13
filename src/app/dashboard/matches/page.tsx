import { redirect } from "next/navigation";
import { enrichMatches } from "@/lib/data/matches-page-server";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canUploadForProgram } from "@/lib/workspace/types";
import {
  type DbMatch,
  type DisplayMatch,
  transformDbMatch,
} from "@/lib/data/matches-list-types";
import { MatchesPageContent } from "@/components/dashboard/matches/matches-page-content";
import { MatchesTitleRow } from "@/components/dashboard/matches/matches-title-row";
import { MatchesDayZero } from "@/components/dashboard/matches/matches-day-zero";
import { MatchesSkeleton } from "@/components/dashboard/matches/matches-skeleton";
import { listMatchDrafts } from "@/lib/wizard/actions";

/**
 * The matches list, scoped to whichever workspace is active.
 *
 * It used to filter on `created_by = auth.uid()` and nothing else — a personal
 * predicate written into the page. That is why `TEAM_NAV` carried no Matches
 * entry: pointing a team menu at a personal list would have shown a coach their
 * own uploads presented as the program's, which is the wrong-attribution
 * failure `docs/ui-revamp-guardrails.md` warns about. The cost was that inside
 * a program NOBODY had a route to any match list, players included.
 *
 * ── The two scopes ──────────────────────────────────────────────────────────
 * Personal — `created_by = me AND program_id IS NULL`. The second half is new
 * and load-bearing: a coach's program upload belongs to the program, and
 * listing it here too would put one match in two workspaces with different
 * meanings. `matches.program_id` is nullable precisely so "no program" is the
 * personal workspace.
 *
 * Team — `program_id = <active program>`, and nothing else. Who may see which
 * of those rows is already decided by `visible_match_ids()`: every member of
 * the program reads that program's matches, staff and player alike. Repeating
 * that rule here would be a second answer that can drift from the one actually
 * enforcing it.
 *
 * ── A known limit, not an oversight ─────────────────────────────────────────
 * The realtime subscription filters `created_by=eq.<viewer>`, because
 * `processing_jobs` has no program column to filter on and Realtime takes only
 * simple column predicates. So in a team workspace a coach sees live progress
 * for their own uploads and needs a refresh for a player's. `players_can_upload`
 * defaults to false, which makes the coach the uploader in the ordinary case;
 * closing the gap properly means a program column on `processing_jobs`, not a
 * fan-out of per-match channels.
 */
export default async function MatchesPage(): Promise<React.JSX.Element> {
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  const user = workspace.viewer;
  const supabase = await createClient();
  const isTeam = workspace.active.kind === "team";
  const query = supabase
    .from("matches")
    .select(
      "id, created_by, player1_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, source_provider, player2_id",
    )
    .order("date", { ascending: false });
  const [drafts, { data, error }] = await Promise.all([
    listMatchDrafts({ programId: isTeam ? workspace.active.id : null }),
    isTeam
      ? query.eq("program_id", workspace.active.id)
      : query.eq("created_by", user.id).is("program_id", null),
  ]);
  if (error) throw new Error("Could not load matches", { cause: error });
  const rows = (data ?? []) as (DbMatch & {
    player2_id: string | null;
    created_by: string | null;
  })[];
  const matches = rows
    .map((row) => transformDbMatch(row, user.id))
    .filter((m): m is DisplayMatch => m !== null);
  // Day zero, both scopes: the offer over the list's shape, no title row —
  // the same composition Home draws, so a player meets one offer wherever
  // they land. A draft counts as a match in flight, so it keeps the list.
  //
  // The team scope used to fall through to `EmptyMatches` here, because its
  // day zero had not been designed. It has now, and it is the same one: only
  // the sentence and the action pair differ (`MatchesDayZero`'s header). What
  // changes on the team side is who gets a pair at all — `canUploadForProgram`
  // is the same predicate the wizard itself enforces, so the offer never opens
  // a door the next page closes.
  if (matches.length === 0 && drafts.length === 0) {
    return (
      <div className="flex w-full flex-1 flex-col bg-white">
        <div className="mx-auto flex w-full max-w-screen-2xl flex-1 flex-col px-14 pt-5 pb-8">
          <MatchesDayZero
            scope={isTeam ? "team" : "personal"}
            canUpload={isTeam ? canUploadForProgram(workspace.active) : true}
          />
        </div>
      </div>
    );
  }

  // Start the slower reads once. Title counts and the list share their result;
  // the frame no longer waits for opponent profiles and analysis reconciliation.
  const enriched = enrichMatches(supabase, rows, user);
  const scope = isTeam ? "team" : "personal";
  const canUpload = !isTeam || canUploadForProgram(workspace.active);
  const scopeKey = `${user.id}:${workspace.active.id}`;
  return (
    <div className="w-full flex-1 bg-white">
      <div className="mx-auto flex max-w-screen-2xl flex-col gap-6 px-6 pt-5 pb-6 lg:px-14">
        <WidgetBoundary key={`title:${scopeKey}`} label="Match summary">
          <Suspense
            fallback={<MatchesTitleRow scope={scope} canUpload={canUpload} />}
          >
            <MatchesResolvedTitle
              enriched={enriched}
              scope={scope}
              canUpload={canUpload}
            />
          </Suspense>
        </WidgetBoundary>
        <WidgetBoundary key={scopeKey} label="Matches">
          <Suspense fallback={<MatchesSkeleton />}>
            <MatchesResolvedContent
              enriched={enriched}
              drafts={drafts}
              userId={user.id}
              scope={scope}
              scopeKey={scopeKey}
            />
          </Suspense>
        </WidgetBoundary>
      </div>
    </div>
  );
}

async function MatchesResolvedTitle({
  enriched,
  scope,
  canUpload,
}: {
  enriched: Promise<DisplayMatch[]>;
  scope: "team" | "personal";
  canUpload: boolean;
}) {
  const readyMatches = (await enriched).map((m) => ({
    id: m.id,
    status: m.analysis?.status,
  }));
  return (
    <MatchesTitleRow
      scope={scope}
      canUpload={canUpload}
      readyMatches={readyMatches}
    />
  );
}
async function MatchesResolvedContent({
  enriched,
  drafts,
  userId,
  scope,
  scopeKey,
}: {
  enriched: Promise<DisplayMatch[]>;
  drafts: Awaited<ReturnType<typeof listMatchDrafts>>;
  userId: string;
  scope: "team" | "personal";
  scopeKey: string;
}) {
  return (
    <MatchesPageContent
      key={scopeKey}
      matches={await enriched}
      drafts={drafts}
      userId={userId}
      scope={scope}
    />
  );
}
