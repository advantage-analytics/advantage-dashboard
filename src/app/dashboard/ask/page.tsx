import { AskPage } from "@/components/dashboard/ask/ask-page";
import { WidgetBoundary } from "@/components/dashboard/loading/widget-boundary";
import {
  getAskConversation,
  getAskConversations,
  getAskQuota,
  getAskTagOptions,
} from "@/lib/data/ask-server";

export const metadata = { title: "Ask" };

/**
 * The personal Ask page. A Server Component: everything the client shell
 * needs before it can render — what can be tagged, the question count, the
 * saved conversations and the one `?c=` names — is read here, through
 * `ask-server.ts` and the viewer's own session.
 *
 * `?c=` is whatever the address bar says. `getAskConversation()` answers null
 * for an id that is malformed, unknown or someone else's — all three the
 * same — and null is simply "no conversation open": the page renders with an
 * empty thread, never an error and never a hint that the id exists.
 *
 * The `key` is what makes opening another conversation a fresh thread: the
 * shell holds the thread in client state, and without it a navigation from
 * one `?c=` to another would keep showing the first.
 *
 * The reads happen in `AskContent`, inside a `WidgetBoundary`: when the
 * viewer's matches cannot be read `getAskTagOptions()` throws, and the page
 * shows the boundary's retry rather than falling through to the app-wide
 * error screen. `loading.tsx` is the Suspense fallback while they resolve.
 */
type AskRouteProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

export default function AskRoute(props: AskRouteProps) {
  return (
    <WidgetBoundary label="Ask">
      <AskContent {...props} />
    </WidgetBoundary>
  );
}

async function AskContent({ searchParams }: AskRouteProps) {
  const { c } = await searchParams;
  const conversationId = typeof c === "string" ? c : null;

  const [tagOptions, quota, conversations, conversation] = await Promise.all([
    getAskTagOptions(),
    getAskQuota(),
    getAskConversations(),
    conversationId ? getAskConversation(conversationId) : null,
  ]);

  return (
    <AskPage
      key={conversation?.id ?? "new"}
      tagOptions={tagOptions}
      quota={quota}
      conversations={conversations}
      conversation={conversation}
    />
  );
}
