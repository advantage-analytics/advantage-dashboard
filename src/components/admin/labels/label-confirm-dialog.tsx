"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { cn } from "@/lib/utils";
import {
  LABEL_DELETE_REASONS,
  type LabelDeleteReason,
} from "@/lib/services/labels/operations";
import {
  labelConfirmCopy,
  unmarkedErrorsWarning,
  type LabelConfirm,
} from "./label-confirm";
import { DELETE_REASON_LABEL, type SideNames } from "./label-format";

/**
 * The console's one confirm, drawn by the product's `ConfirmDialog`: delete a
 * stroke (with the reason `label_shots` requires), delete a point, move a point
 * into a game someone else serves, reset an edited stroke or point to its
 * seed, give a serve to the other player (with "Only this shot" as its second
 * answer), or mark the session complete (listing what is still open). The dialog closes on its action without waiting on the server
 * (`runOperation`'s contract); nothing is written on Cancel.
 *
 * A Mark complete with errors still unmarked (`blockers`) cannot publish:
 * its Publish is disabled — no click or Enter reaches `onConfirm` — Cancel
 * reads Close, and the footer's left goes to the first of them
 * (`onGoToPoint`).
 */
export function LabelConfirmDialog({
  confirm,
  names,
  onCancel,
  onConfirm,
  onAlternative,
  onGoToPoint,
  initialReason = null,
}: {
  confirm: LabelConfirm | null;
  names: SideNames;
  onCancel: () => void;
  /** The dialog's action. A stroke delete passes the chosen reason. */
  onConfirm: (confirm: LabelConfirm, reason: LabelDeleteReason | null) => void;
  /** The second answer, on the one confirm that has it (`alternativeLabel`). */
  onAlternative?: (confirm: LabelConfirm) => void;
  /**
   * A blocked Mark complete's "Go to point n": the console closes the
   * confirm and opens that point (as the rail numbers it).
   */
  onGoToPoint?: (pointNumber: number) => void;
  /** A reason already chosen on first render — for specs. None by default. */
  initialReason?: LabelDeleteReason | null;
}) {
  // Keyed by the question, so a second delete never inherits the first's
  // reason.
  const key = confirm
    ? `${confirm.kind}:${
        "shotId" in confirm
          ? confirm.shotId
          : "pointId" in confirm
            ? confirm.pointId
            : ""
      }`
    : "closed";
  return (
    <LabelConfirmBody
      key={key}
      confirm={confirm}
      names={names}
      onCancel={onCancel}
      onConfirm={onConfirm}
      onAlternative={onAlternative}
      onGoToPoint={onGoToPoint}
      initialReason={initialReason}
    />
  );
}

function LabelConfirmBody({
  confirm,
  names,
  onCancel,
  onConfirm,
  onAlternative,
  onGoToPoint,
  initialReason,
}: {
  confirm: LabelConfirm | null;
  names: SideNames;
  onCancel: () => void;
  onConfirm: (confirm: LabelConfirm, reason: LabelDeleteReason | null) => void;
  onAlternative?: (confirm: LabelConfirm) => void;
  onGoToPoint?: (pointNumber: number) => void;
  initialReason: LabelDeleteReason | null;
}) {
  const [reason, setReason] = useState<LabelDeleteReason | null>(initialReason);
  const [problem, setProblem] = useState<string | null>(null);
  if (!confirm) return null;
  const copy = labelConfirmCopy(confirm, names);
  const needsReason = confirm.kind === "delete-shot";
  const blocked = copy.blocked ?? null;
  const completeList =
    confirm.kind === "complete-session"
      ? [
          ...(confirm.blockers.length > 0
            ? [unmarkedErrorsWarning(confirm.blockers.length)]
            : []),
          ...confirm.warnings,
        ]
      : [];

  return (
    <ConfirmDialog
      open
      onOpenChange={(open) => {
        if (!open) onCancel();
      }}
      title={copy.title}
      description={copy.description}
      confirmLabel={copy.confirmLabel}
      pendingLabel={copy.pendingLabel}
      tone={copy.tone}
      cancelLabel={blocked ? "Close" : undefined}
      confirmDisabled={blocked !== null}
      error={problem}
      footerLeft={
        blocked ? (
          <button
            type="button"
            data-go-to-point={blocked.pointNumber}
            onClick={() => {
              onCancel();
              onGoToPoint?.(blocked.pointNumber);
            }}
            className={TEXT_ACTION}
          >
            {blocked.goToLabel}
          </button>
        ) : copy.alternativeLabel && onAlternative ? (
          <button
            type="button"
            data-confirm-alternative=""
            onClick={() => onAlternative(confirm)}
            className={TEXT_ACTION}
          >
            {copy.alternativeLabel}
          </button>
        ) : undefined
      }
      onConfirm={() => {
        // Held as well as disabled: nothing publishes past an unmarked error.
        if (blocked) return;
        if (needsReason && reason === null) {
          setProblem("Pick a reason to delete this shot.");
          return;
        }
        onConfirm(confirm, needsReason ? reason : null);
      }}
    >
      {needsReason ? (
        <DeleteReasonChoice
          value={reason}
          onChange={(next) => {
            setReason(next);
            setProblem(null);
          }}
        />
      ) : completeList.length > 0 ? (
        <ul
          data-complete-warnings=""
          className="flex list-disc flex-col gap-1 pl-4 text-[13px] text-[var(--ink-700)]"
        >
          {completeList.map((warning) => (
            <li key={warning}>{warning}</li>
          ))}
        </ul>
      ) : null}
    </ConfirmDialog>
  );
}

/** The footer's quiet blue text action (DS footer grammar): no icon. */
const TEXT_ACTION =
  "cursor-pointer rounded-[var(--radius-cell)] text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none";

/** Why the stroke goes: required by `label_shots` for a deleted stroke. */
export function DeleteReasonChoice({
  value,
  onChange,
}: {
  value: LabelDeleteReason | null;
  onChange: (reason: LabelDeleteReason) => void;
}) {
  return (
    <div className="flex flex-col gap-2">
      <span className="text-[11px] text-[var(--ink-600)]">
        Why are you deleting it?
      </span>
      <div
        role="radiogroup"
        aria-label="Why this shot is being deleted"
        className="flex flex-col"
      >
        {LABEL_DELETE_REASONS.map((option) => {
          const chosen = option === value;
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={chosen}
              data-reason={option}
              onClick={() => onChange(option)}
              className="-mx-2 flex h-8 cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] px-2 text-left text-[13px] text-[var(--ink-900)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <span
                aria-hidden="true"
                className={cn(
                  "flex size-3.5 shrink-0 items-center justify-center rounded-full",
                  chosen
                    ? "bg-[var(--blue)]"
                    : "border border-[var(--ink-300)]",
                )}
              >
                {chosen ? (
                  <Check className="size-[9px] text-white" strokeWidth={2.5} />
                ) : null}
              </span>
              {DELETE_REASON_LABEL[option]}
            </button>
          );
        })}
      </div>
    </div>
  );
}
