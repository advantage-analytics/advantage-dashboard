"use client";

import { useEffect, useState } from "react";
import posthog from "posthog-js";
import { markTourDone } from "@/app/dashboard/onboarding-actions";
import { FirstMatchFeedbackDialog } from "@/components/dashboard/feedback/first-match-feedback-dialog";

import {
  rememberSeen,
  seenThisSession,
  watchDocument,
} from "@/components/dashboard/onboarding/seen-this-session";
import { useToast } from "@/components/dashboard/toast/toast-provider";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  FIRST_MATCH_FEEDBACK_COPY as COPY,
  firstMatchFeedbackDue,
  type FirstMatchFeedback as FirstMatchFeedbackAnswer,
} from "@/lib/feedback/first-match-feedback";
import { isPostHogConfigured } from "@/lib/posthog-client";

const PROMPT = "first-match-feedback" as const;
const OPEN_DIALOG = '[role="dialog"]';

/**
 * Asks the first-match feedback question once: on the first dashboard visit
 * after the player has read their first report and come back
 * (`firstMatchFeedbackDue`, from the three facts the workspace context
 * already carries). Mounted in the shell beside `BetaWelcome`, under the same
 * exclusions, so it can land on whichever page the player opens.
 *
 * It waits for a quiet moment the way the shell's hints do: re-checked on
 * every change to the document until nothing carries `role="dialog"` —
 * BetaWelcome on a first visit, an open menu — so it never lands on top of
 * something else. Once open it is a dialog itself, and does not close over
 * that.
 *
 * Send and Not now both settle it for good. Send goes through
 * `POST /api/feedback/first-match`, which stamps the done column in the same
 * transaction as the answer; Not now stamps it through `markTourDone`. The
 * this-session guard is set first in both cases, so a stamp that fails does
 * not reopen the question this visit. PostHog gets the rating or the
 * dismissal and never the note (`instrumentation-client.ts` keeps text out).
 */
export function FirstMatchFeedback() {
  const { viewer, active } = useWorkspace();
  const { push } = useToast();
  // idle → open (the quiet moment came) → closed (answered or dismissed).
  const [stage, setStage] = useState<"idle" | "open" | "closed">("idle");

  const { id: viewerId, firstReportSeenAt, lastSignInAt } = viewer;
  const doneAt = viewer.firstMatchFeedbackDoneAt;
  const workspaceKind = active.kind;

  useEffect(() => {
    if (stage !== "idle" || seenThisSession(PROMPT, viewerId)) return;
    const due = firstMatchFeedbackDue({
      workspaceKind,
      firstReportSeenAt,
      lastSignInAt,
      doneAt,
      now: Date.now(),
    });
    if (!due) return;
    return watchDocument(() => {
      if (document.querySelector(OPEN_DIALOG)) return false;
      setStage("open");
      return true;
    });
  }, [stage, viewerId, workspaceKind, firstReportSeenAt, lastSignInAt, doneAt]);

  function settle() {
    rememberSeen(PROMPT, viewerId);
    setStage("closed");
  }

  async function submit(answer: FirstMatchFeedbackAnswer): Promise<boolean> {
    try {
      const response = await fetch("/api/feedback/first-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify(answer),
      });
      if (!response.ok) return false;
    } catch {
      return false;
    }
    settle();
    if (isPostHogConfigured) {
      posthog.capture("first_match_feedback_submitted", {
        rating: answer.rating,
      });
    }
    push({ tone: "success", title: COPY.thanks });
    return true;
  }

  function dismiss() {
    settle();
    if (isPostHogConfigured) posthog.capture("first_match_feedback_dismissed");
    // Never throws by contract; a failed stamp means it is offered next visit.
    void markTourDone(PROMPT).catch(() => undefined);
  }

  if (stage === "idle") return null;

  return (
    <FirstMatchFeedbackDialog
      open={stage === "open"}
      onOpenChange={(next) => {
        if (!next) dismiss();
      }}
      onSubmit={submit}
    />
  );
}
