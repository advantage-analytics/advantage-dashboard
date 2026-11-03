"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import posthog from "posthog-js";
import {
  loadSupportDialog,
  markPlayerThreadRead,
  sendPlayerMessage,
} from "@/app/dashboard/support-actions";
import {
  SupportThreadDialog,
  type SupportDialogState,
} from "@/components/dashboard/support/support-thread-dialog";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { hasUnreadStaff, type SupportTopic } from "@/lib/data/support-view";
import { isPostHogConfigured } from "@/lib/posthog-client";

/** The search param that IS the dialog's open state. */
export const MESSAGES_PARAM = "messages";

/**
 * The current URL with `?messages=open` set or removed, every other param
 * kept. The account menu's row, T8's tray row and closing the dialog all go
 * through this, so there is one way in and one way out.
 */
export function messagesHref(
  pathname: string,
  search: string | URLSearchParams | null | undefined,
  open: boolean,
): string {
  const params = new URLSearchParams(search?.toString() ?? "");
  if (open) params.set(MESSAGES_PARAM, "open");
  else params.delete(MESSAGES_PARAM);
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

/**
 * "Message Advantage", mounted once in `DashboardShell` so it opens over any
 * dashboard page in either workspace.
 *
 * Its open state is the URL: `?messages=open` opens it — a deep link, the
 * account menu's row, the activity tray's row — and closing removes the
 * param with `router.replace`. A local `dismissed` flag closes it at once,
 * since `useSearchParams()` keeps the old params until the replace commits.
 *
 * The data loads when it opens, through `loadSupportDialog()`, rather than on
 * every dashboard render: the dialog is closed on nearly every page view.
 * Each open reads fresh. Opening onto an existing thread stamps it read; when
 * a staff message was unread the router refreshes so the server-drawn chrome
 * (the tray's dot) catches up.
 */
export function SupportDialogMount() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { active } = useWorkspace();
  const urlOpen = searchParams.get(MESSAGES_PARAM) === "open";

  const [dismissed, setDismissed] = useState(false);
  // Bumped on every open, so a second visit reads fresh instead of showing
  // whatever the first one loaded.
  const [visit, setVisit] = useState(0);
  const [load, setLoad] = useState<{
    visit: number;
    state: SupportDialogState;
  } | null>(null);

  // Reset on the URL's own edge — the "adjust state while rendering" pattern
  // rather than an effect, so the open frame is already the fresh one.
  const [prevUrlOpen, setPrevUrlOpen] = useState(urlOpen);
  if (urlOpen !== prevUrlOpen) {
    setPrevUrlOpen(urlOpen);
    setDismissed(false);
    if (urlOpen) setVisit((v) => v + 1);
  }

  const open = urlOpen && !dismissed;

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    // A thrown action (a dropped connection) must settle the skeleton too,
    // not leave it pulsing as a false "still loading".
    void loadSupportDialog()
      .catch(() => ({
        ok: false as const,
        error: "Could not load your messages. Try again.",
      }))
      .then((result) => {
        if (cancelled) return;
        if (!result.ok) {
          setLoad({ visit, state: { status: "error", error: result.error } });
          return;
        }
        const { thread, messages, matches } = result.data;
        setLoad({
          visit,
          state: { status: "ready", thread, messages, matches },
        });
        if (thread) {
          const wasUnread = hasUnreadStaff(thread);
          void markPlayerThreadRead().then((marked) => {
            if (marked.ok && wasUnread) router.refresh();
          });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [open, visit, router]);

  const state: SupportDialogState =
    load && load.visit === visit ? load.state : { status: "loading" };

  function onOpenChange(next: boolean) {
    if (next) return;
    setDismissed(true);
    router.replace(messagesHref(pathname, searchParams, false), {
      scroll: false,
    });
  }

  async function onSend(input: {
    body: string;
    topic: SupportTopic | null;
    matchId: string | null;
  }) {
    const result = await sendPlayerMessage({
      ...input,
      origin: "account_menu",
    });
    if (!result.ok) return result;
    if (isPostHogConfigured) {
      // The topic and where it came from — never the body, the match or any
      // free text (`instrumentation-client.ts` keeps text out too).
      posthog.capture("support_message_sent", {
        topic: input.topic,
        origin: "account_menu",
      });
    }
    // Re-read so the first message turns the composer into the thread, and a
    // reply lands under the one before it.
    const reloaded = await loadSupportDialog();
    if (reloaded.ok) {
      const { thread, messages, matches } = reloaded.data;
      setLoad({
        visit,
        state: { status: "ready", thread, messages, matches },
      });
    }
    return { ok: true as const };
  }

  return (
    <SupportThreadDialog
      open={open}
      onOpenChange={onOpenChange}
      state={state}
      isTeamWorkspace={active.kind === "team"}
      onSend={onSend}
    />
  );
}
