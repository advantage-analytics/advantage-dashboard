import { redirect } from "next/navigation";
import { AskPage } from "@/components/dashboard/ask/ask-page";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import {
  getAskConversation,
  getAskConversations,
  getAskQuota,
  getAskTagOptions,
} from "@/lib/data/ask-server";
import type { AskScope } from "@/lib/services/ask/scope";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";
import { canUploadForProgram } from "@/lib/workspace/types";

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

  const { c } = await searchParams;
  const conversationId = typeof c === "string" ? c : null;
  const programId = active.id;
  const scope: AskScope = {
    kind: "team",
    programId,
    programName: active.name,
  };

  const [tagOptions, quota, conversations, conversation] = await Promise.all([
    getAskTagOptions(programId),
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
      canUpload={canUploadForProgram(active)}
      tagOptions={tagOptions}
      quota={quota}
      conversations={conversations}
      conversation={conversation}
    />
  );
}
