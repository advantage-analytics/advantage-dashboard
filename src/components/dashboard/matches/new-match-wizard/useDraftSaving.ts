"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { usePublishHeaderStatus } from "@/components/dashboard/header-status";
import type { UseUploadMatchWizardReturn } from "./useUploadMatchWizard";
import { saveFormDataToStorage, STORAGE_KEYS } from "./utils";

/**
 * The draft, as the page shows it: the header's status line, and the footer's
 * "Save draft" that leaves with the draft intact.
 */
export function useDraftSaving(
  wizard: Pick<
    UseUploadMatchWizardReturn,
    | "formData"
    | "selectedProvider"
    | "saveDraft"
    | "draftSaving"
    | "draftSaveError"
    | "lastChangedAt"
  >,
  exitHref: string,
): () => Promise<void> {
  const {
    formData,
    selectedProvider,
    saveDraft,
    draftSaving,
    draftSaveError,
    lastChangedAt,
  } = wizard;
  const router = useRouter();

  // Saving a draft is a fact, not an event: the wizard autosaves as you answer
  // and says so in the header's status slot — the same slot that later carries
  // the upload. The timestamp appears once you have been idle a minute;
  // "Saving…" only while a draft row is genuinely in flight (design 11c).
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const idleMinutes = lastChangedAt
    ? Math.floor((now - lastChangedAt) / 60_000)
    : 0;
  usePublishHeaderStatus(
    draftSaving
      ? "Saving…"
      : draftSaveError
        ? "Draft not saved"
        : idleMinutes >= 1
          ? `Draft saved · ${idleMinutes} min ago`
          : "Draft saved",
  );

  /**
   * Leave with the draft intact.
   *
   * The wizard was already saving; this writes the draft row the Matches
   * table lists with Resume, pins the chosen source so the next visit resumes
   * past step 1, and sets the flag that stops `DashboardShell` clearing
   * storage on the way out. Then it goes where Cancel would.
   */
  const handleSaveDraft = useCallback(async () => {
    saveFormDataToStorage(formData);
    if (selectedProvider) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_PROVIDER, selectedProvider);
    }
    localStorage.setItem(STORAGE_KEYS.DRAFT_KEPT, "1");
    // Leaving is the REWARD for a saved draft, not the action itself. A
    // refused write used to navigate anyway, which told the person their work
    // was safe and then offered them no Resume row for it. On failure we stay
    // exactly where we are — same step, same answers — and `draftSaveError`
    // says so beside the button. `DRAFT_KEPT` stays set on purpose: it only
    // stops `DashboardShell` wiping the local copy, which is now the only
    // copy there is.
    const saved = await saveDraft();
    if (!saved) return;
    router.push(exitHref);
  }, [formData, selectedProvider, saveDraft, router, exitHref]);

  return handleSaveDraft;
}
