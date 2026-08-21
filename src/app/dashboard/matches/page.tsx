import { Suspense } from "react";
import { createClient } from "@/lib/supabase/server";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { analysisFor, loadMatchAnalysis } from "@/lib/data/match-analysis-server";
import {
  type DbMatch,
  type DisplayMatch,
  transformDbMatch,
} from "@/lib/data/matches-list-types";
import { MatchesPageContent } from "@/components/dashboard/matches/matches-page-content";
import { CreateMatchButton } from "@/components/dashboard/matches/create-match-button";
import { MatchesSkeleton } from "@/components/dashboard/matches/matches-skeleton";

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
 * of those rows is already decided by `visible_match_ids()`: staff get every
 * match, a player gets their own plus the program's only when
 * `programs.roster_visible` is on. Repeating that rule here would be a second
 * answer that can drift from the one actually enforcing it.
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
  const supabase = await createClient();
  const workspace = await getWorkspaceContext();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const isTeam = workspace?.active.kind === "team";
  let matches: DisplayMatch[] = [];

  if (user) {
    const query = supabase
      .from("matches")
      .select(
        "id, player1_id, player1_name, player2_name, tournament_name, round, date, score, result, match_type, court_type, verified, duration, source_provider, player2_id"
      )
      .order("date", { ascending: false });

    const { data } = await (isTeam
      ? query.eq("program_id", workspace.active.id)
      : query.eq("created_by", user.id).is("program_id", null));

    if (data) {
      // Collect unique opponent user IDs to fetch hand/backhand
      const opponentIds = [...new Set(
        data.map((r) => r.player2_id).filter((id): id is string => id != null)
      )];

      // Both follow-ups key off the ids in `data` and neither reads the other's
      // output, so they overlap rather than stack. Analysis state is keyed by
      // match id, so feeding it every row — including any that transformDbMatch
      // later drops — costs nothing but an unread map entry.
      const [{ data: opponents }, jobs] = await Promise.all([
        opponentIds.length > 0
          ? supabase.from("users").select("id, hand, backhand").in("id", opponentIds)
          : Promise.resolve({ data: null }),
        loadMatchAnalysis(supabase, data.map((r) => r.id), { reap: true }),
      ]);

      const opponentMap = new Map<string, { hand: string | null; backhand: string | null }>();
      for (const o of opponents ?? []) {
        opponentMap.set(o.id, { hand: o.hand, backhand: o.backhand });
      }

      matches = (data as (DbMatch & { player2_id: string | null })[])
        .map((row) => {
          // `transformDbMatch` ignores the viewer — it decides the winner from
          // the score, player1 against player2, not relative to whoever is
          // looking. That is what makes one row safe to show a coach and the
          // player alike, and why a team scope needs no second transform.
          const display = transformDbMatch(row, user.id);
          if (!display) return null;
          const opp = row.player2_id ? opponentMap.get(row.player2_id) : undefined;
          if (opp) {
            display.player2Hand = opp.hand ?? undefined;
            display.player2Backhand = opp.backhand ?? undefined;
          }
          // Matches with no job row resolve to `imported` or `manual` here.
          display.analysis = analysisFor(jobs, display);
          return display;
        })
        .filter((m): m is DisplayMatch => m !== null);
    }
  }

  return (
    <div className="flex-1 w-full bg-white">
      <div className="mx-auto max-w-screen-2xl px-6 sm:px-8 py-8 sm:py-10">
        {/* Header */}
        <div className="flex items-end justify-between">
          <div className="flex flex-col gap-3">
            {matches.length > 0 && (
              <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
                {matches.length} {matches.length === 1 ? "MATCH" : "MATCHES"}{" "}
                {isTeam ? "ON THE PROGRAM" : "RECORDED"}
              </p>
            )}
            <h1 className="font-light text-[30px] text-[#0D0D0D] tracking-[-0.6px] leading-[36px]">
              Matches
            </h1>
          </div>
          {matches.length > 0 && <CreateMatchButton variant="blue" />}
        </div>

        <div className="mt-10">
          <Suspense fallback={<MatchesSkeleton />}>
            {/* userId drives the realtime subscription's server-side filter, so
                a busy account never receives other people's job rows. See the
                header for what that means inside a team workspace. */}
            <MatchesPageContent
              matches={matches}
              userId={user?.id}
              scope={isTeam ? "team" : "personal"}
            />
          </Suspense>
        </div>
      </div>
    </div>
  );
}
