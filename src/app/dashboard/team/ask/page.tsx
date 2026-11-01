import { redirect } from "next/navigation";
import { AskPage } from "@/components/dashboard/ask/ask-page";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import {
  getAskConversation,
  getAskConversations,
  getAskQuota,
  getAskStarterOptions,
  getAskTagOptions,
} from "@/lib/data/ask-server";
import { askTagsFromQuery } from "@/lib/services/ask/entry";
import type { AskScope } from "@/lib/services/ask/scope";
import { askStarters } from "@/lib/services/ask/starters";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { explainVideoRefusal } from "@/lib/workspace/types";

export const metadata = { title: "Ask" };

/**
 * The team Ask page: the personal page's shell (`AskPage`) with a team scope.
 * Any member of the active program — owner, coach, staff or player — asks
 * about the program's matches; every member can already read all of them, so
 * there is no role gate here beyond `team/layout.tsx`'s, which turns away
 * anyone not in a team workspace.
 *
 * The program is the active workspace's and nothing from the address bar: for
 * a team, `workspace.active.id` is the program id. It goes to the loaders,
 * which read that program's matches and the viewer's own conversations in it,
 * and into the scope, which is how the page's requests name it. The route
 * re-checks membership on every question.
 *
 * What stays the asker's own: the question limit (`getAskQuota()` takes no
 * program — a team question spends the same monthly count a personal one
 * does) and the conversations, which are private to whoever asked.
 *
 * `?c=`, the `key` and the `WidgetBoundary` are the personal route's, for the
 * same reasons (`dashboard/ask/page.tsx`): an id that names none of the
 * viewer's conversations in this program is simply no conversation open, and
 * a failed read shows the boundary's retry. `loading.tsx` is the Suspense
 * fallback while the reads resolve.
 */
type TeamAskRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function TeamAskRoute(props: TeamAskRouteProps) {
  return (
    <WidgetBoundary label="Ask">
      <TeamAskContent {...props} />
    </WidgetBoundary>
  );
}

async function TeamAskContent({ searchParams }: TeamAskRouteProps) {
  // `cache()`d: the same read the dashboard and team layouts already made.
  const workspace = await getWorkspaceContext();
  if (!workspace) redirect("/login");
  const { active } = workspace;
  // The team layout redirects first; this narrows the type and holds the
  // line if this page is ever rendered without it.
  if (active.kind !== "team") redirect("/dashboard/ask");

  const params = await searchParams;
  const { c } = params;
  const conversationId = typeof c === "string" ? c : null;
  const programId = active.id;
  const scope: AskScope = {
    kind: "team",
    programId,
    programName: active.name,
  };

  const [tagOptions, starterOptions, quota, conversations, conversation] =
    await Promise.all([
      getAskTagOptions(programId),
      getAskStarterOptions(programId),
      getAskQuota(),
      getAskConversations(programId),
      conversationId ? getAskConversation(conversationId, programId) : null,
    ]);

  return (
    <AskPage
      // The program is in the key so a workspace switch that lands back on
      // this URL starts a fresh thread rather than keep another team's.
      key={`${programId}:${conversation?.id ?? "new"}`}
      scope={scope}
      // "Send match video" is offered only where sending would go through:
      // `explainVideoRefusal()` is the rule the upload route itself asks —
      // the role and policy half (`canUploadForProgram()`) AND a program that
      // is approved to send video. The role half alone offered the button to
      // a program still in review, which the next page then refused.
      canUpload={explainVideoRefusal(active) === null}
      timeZone={active.timeZone}
      tagOptions={tagOptions}
      starters={askStarters(starterOptions, scope)}
      quota={quota}
      conversations={conversations}
      conversation={conversation}
      // `?match=` / `?opponent=` / `?player=`: "Ask about …" from a match
      // page, a profile or an opponent's drawer, checked against the menu's
      // own options.
      initialTags={askTagsFromQuery(params, tagOptions, scope)}
    />
  );
}
