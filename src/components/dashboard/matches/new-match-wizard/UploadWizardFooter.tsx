"use client";

import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { FooterMeter } from "./FooterMeter";
import { jumpToMissingField, MissingFieldsPill } from "./MissingFieldsPill";
import { useUploadWizard } from "./UploadWizardProvider";

/**
 * The wizard footer's three slots, each reading the wizard context — composed
 * into `WizardShell` by `UploadMatchWizard`.
 */

/**
 * Only where hours are spent, and only once the allowance is known: an export
 * costs nothing, and a bar that has to explain itself is a bar that shouldn't
 * be there.
 */
export function WizardQuotaMeter() {
  const {
    wizard: {
      isProcessingProvider,
      remainingQuotaSeconds,
      quotaCapSeconds,
      uploadedFile,
    },
    view: { trimSelected },
    meta: { workspaceKind },
  } = useUploadWizard();

  if (!isProcessingProvider || remainingQuotaSeconds === undefined) return null;

  return (
    <FooterMeter
      remainingSeconds={remainingQuotaSeconds}
      capSeconds={quotaCapSeconds}
      suffix={workspaceKind === "team" ? "team hours" : "resets on the 1st"}
      /* Only once there is a video to price. A resumed draft keeps its trim
         window in localStorage but cannot keep the File, so the handles alone
         would have the meter costing a video that is no longer picked. */
      selectedSeconds={
        uploadedFile?.file && trimSelected > 0 ? trimSelected : undefined
      }
    />
  );
}

/**
 * What the last step is still waiting on. The earlier steps carry their own
 * state on the page, so it says nothing there.
 */
export function WizardFooterStatus() {
  const {
    wizard: { step },
    view: { stepBusy, gatedByMissing, missing },
    meta: { contentRef },
  } = useUploadWizard();
  const workspaces = useWorkspace();

  if (step !== "match") return null;

  if (stepBusy) {
    return (
      <span className="text-[11px] text-[var(--ink-500)]">{stepBusy}</span>
    );
  }

  if (gatedByMissing) {
    return (
      <MissingFieldsPill
        labels={missing.labels}
        onJump={() => jumpToMissingField(contentRef.current, missing.labels)}
      />
    );
  }

  // Only when there is a choice to get wrong. `program_id` on the row follows
  // this exact workspace, and the jobs route bills whichever one it names.
  if (workspaces.available.length > 1) {
    return (
      // One line, always, never a column beside the meter: "University of
      // California, Los Angeles" fits in 320px and only a longer name
      // truncates. The hairline matches the meter's, so the footer reads
      // Back | the allowance | whose allowance it is.
      <span className="flex min-w-0 items-baseline gap-1 border-l border-[var(--border-medium)] pl-4 text-[11px] whitespace-nowrap text-[var(--ink-500)]">
        <span className="shrink-0">Saves in</span>
        <span className="max-w-[320px] min-w-0 truncate font-medium text-[var(--ink-900)]">
          {workspaces.active.name}
        </span>
      </span>
    );
  }

  return null;
}

export function SaveDraftButton() {
  const {
    wizard: { draftSaving },
    actions: { saveDraft },
  } = useUploadWizard();

  return (
    <button
      type="button"
      onClick={() => void saveDraft()}
      disabled={draftSaving}
      className="shrink-0 cursor-pointer text-[11px] whitespace-nowrap text-[var(--ink-500)] transition-colors duration-150 hover:text-[var(--ink-900)] disabled:cursor-default"
    >
      {draftSaving ? "Saving…" : "Save draft"}
    </button>
  );
}
