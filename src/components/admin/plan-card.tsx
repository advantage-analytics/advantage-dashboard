"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { CountPills } from "@/components/admin/admin-cells";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardTitle,
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import {
  ConfirmDialog,
  ConfirmProse,
  Em,
} from "@/components/ui/confirm-dialog";
import { Kv } from "@/components/admin/pilot-usage-card";
import { DateField } from "@/components/ui/date-field";
import { MenuSelect } from "@/components/ui/menu-select";
import {
  PLAN_NOTE_MAX,
  planDraftChanged,
  planDraftFrom,
  planDraftProblem,
  planOptions,
  savedPlanLabel,
  seasonWindowLabel,
  withTerm,
  type PlanDraft,
  type SavedPlan,
} from "@/lib/billing/plan-draft";
import {
  PLAN_TERM_LABELS,
  seasonAllowance,
  usd,
  type PlanTerm,
} from "@/lib/billing/plans";
import type { AdminTeamPlan } from "@/lib/data/admin-team-server";
import { shortDate } from "@/lib/data/match-utils";
import { utcToday } from "@/lib/data/match-day";
import {
  clearProgramPlan,
  setProgramPlan,
} from "@/lib/services/programs/admin-plan-actions";
import { actionRejected } from "@/lib/ui/action-rejected";
import { advButton } from "@/lib/ui/adv-button";

const PLAN_OPTIONS = planOptions();

const TERM_OPTIONS: { value: PlanTerm; label: string }[] = [
  { value: "spring", label: PLAN_TERM_LABELS.spring },
  { value: "full_year", label: PLAN_TERM_LABELS.full_year },
];

function savedPlanOf(plan: AdminTeamPlan | null): SavedPlan | null {
  return plan
    ? {
        planId: plan.planId,
        term: plan.planTerm,
        startsOn: plan.planStartsOn,
        endsOn: plan.planEndsOn,
        note: plan.planNote,
      }
    : null;
}

/**
 * This program's season plan: which college plan it is on, for which term and
 * dates, and the invoice it was sold against.
 *
 * It sits beside the Pilot card because the two are one decision — a team
 * holds a pilot or a plan, and saving a plan ends the pilot on the plan's
 * first day (`admin_set_program_plan`). The card says so before the button is
 * pressed, not after.
 *
 * Every plan name, price and hour count here is read from
 * `lib/billing/plans.ts`; the draft's arithmetic (default dates, the dirty
 * check, what is sent) is `lib/billing/plan-draft.ts`, so a test can hold it.
 *
 * The form is keyed on the saved record: after a save or a removal the page
 * refreshes with a new record and the fields start again from it, instead of
 * a draft that has to be reconciled with props in an effect.
 */
export function PlanCard({
  programId,
  programName,
  plan,
}: {
  programId: string;
  /** Named in the Remove plan confirm, so the question has an object. */
  programName: string;
  /** Null when the team is not on a plan. */
  plan: AdminTeamPlan | null;
}) {
  const recordKey = plan
    ? [
        plan.planId,
        plan.planTerm,
        plan.planStartsOn,
        plan.planEndsOn,
        plan.planNote ?? "",
        plan.planSetAt,
      ].join("|")
    : "none";

  return (
    <PlanForm
      key={recordKey}
      programId={programId}
      programName={programName}
      plan={plan}
    />
  );
}

function PlanForm({
  programId,
  programName,
  plan,
}: {
  programId: string;
  programName: string;
  plan: AdminTeamPlan | null;
}) {
  const router = useRouter();
  // Read once: the defaults and the dirty check must agree on what "today"
  // is, across a midnight UTC rollover too.
  const [today] = useState(utcToday);
  const saved = savedPlanOf(plan);

  const [draft, setDraft] = useState<PlanDraft>(() =>
    planDraftFrom(saved, today),
  );
  // Bumped by Cancel so the date fields remount: a blank segment is state the
  // field keeps to itself, and handing it the same value again clears nothing.
  const [resets, setResets] = useState(0);
  const [startIncomplete, setStartIncomplete] = useState(false);
  const [endIncomplete, setEndIncomplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startSave] = useTransition();

  const incomplete = startIncomplete || endIncomplete;
  const changed = planDraftChanged(draft, saved, today);
  const problem = planDraftProblem(draft);
  // Until a plan is chosen there is nothing to refuse out loud; the menu's
  // placeholder already asks for it.
  const shownProblem = draft.planId === null ? null : problem;

  const allowance = draft.planId
    ? seasonAllowance(draft.planId, draft.term)
    : null;
  const seasonWindow = seasonWindowLabel(draft.startsOn, draft.endsOn);

  const edit = (next: Partial<PlanDraft>) => {
    setError(null);
    setDraft((current) => ({ ...current, ...next }));
  };

  const save = () => {
    if (pending || draft.planId === null) return;
    const planId = draft.planId;
    setError(null);
    startSave(async () => {
      const result = await setProgramPlan({
        programId,
        planId,
        term: draft.term,
        startsOn: draft.startsOn,
        endsOn: draft.endsOn,
        note: draft.note,
      }).catch(actionRejected);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  };

  const cancel = () => {
    setError(null);
    setDraft(planDraftFrom(saved, today));
    setResets((count) => count + 1);
  };

  return (
    <SettingsCard className="gap-0 bg-[var(--surface-card)] py-6">
      <SettingsCardTitle
        trailing={
          <span className="text-[11px] text-[var(--ink-500)]">
            {saved ? savedPlanLabel(saved) : "Not on a plan yet"}
          </span>
        }
      >
        Plan
      </SettingsCardTitle>

      <div className="mt-4 flex flex-col gap-4">
        <SettingsField label="Plan">
          <MenuSelect
            label="Plan"
            variant="underline"
            value={draft.planId ?? undefined}
            placeholder="Choose a plan"
            options={PLAN_OPTIONS}
            onChange={(planId) => edit({ planId })}
            disabled={pending}
          />
        </SettingsField>

        {/* `labelless`: a wrapping <label> would hand every click to the first
            button inside it — the first pill here, the calendar trigger in
            the two date fields below. */}
        <SettingsField label="Term" labelless>
          <CountPills
            label="Term"
            value={draft.term}
            options={TERM_OPTIONS}
            onChange={(term) => {
              if (pending) return;
              setError(null);
              setDraft((current) => withTerm(current, term, today));
            }}
          />
        </SettingsField>

        <div key={resets} className="grid grid-cols-2 gap-4">
          <SettingsField label="Starts" labelless>
            <DateField
              label="Starts"
              variant="underline"
              value={draft.startsOn}
              onChange={(startsOn) => edit({ startsOn })}
              onIncompleteChange={setStartIncomplete}
              disabled={pending}
            />
          </SettingsField>
          <SettingsField label="Ends" labelless>
            <DateField
              label="Ends"
              variant="underline"
              value={draft.endsOn}
              onChange={(endsOn) => edit({ endsOn })}
              onIncompleteChange={setEndIncomplete}
              min={draft.startsOn || undefined}
              disabled={pending}
            />
          </SettingsField>
        </div>

        <SettingsField
          label="Invoice or PO"
          hint="For your records. The team never sees it."
        >
          <SettingsUnderlineInput
            aria-label="Invoice or PO"
            value={draft.note}
            maxLength={PLAN_NOTE_MAX}
            onChange={(event) => edit({ note: event.target.value })}
            disabled={pending}
          />
        </SettingsField>
      </div>

      <dl className="mt-4 flex flex-col border-t border-[var(--border-hairline)] pt-2">
        <Kv
          label="Season hours"
          value={
            allowance
              ? seasonWindow
                ? `${allowance.hours} h, ${seasonWindow}`
                : `${allowance.hours} h`
              : "—"
          }
        />
        <Kv
          label="Price"
          value={
            allowance ? `${usd(allowance.price)} · billed by invoice` : "—"
          }
        />
        {plan && (
          <Kv
            label="Set"
            value={
              plan.planSetByName
                ? `${shortDate(plan.planSetAt)} by ${plan.planSetByName}`
                : shortDate(plan.planSetAt)
            }
          />
        )}
      </dl>

      {(error ?? shownProblem) && (
        <p role="alert" className="mt-3 text-[12px] text-[var(--danger)]">
          {error ?? shownProblem}
        </p>
      )}

      <div className="mt-5 flex items-center gap-2">
        <button
          type="button"
          className={advButton("primary", "sm")}
          onClick={save}
          disabled={pending || incomplete || !changed || problem !== null}
        >
          {pending ? "Saving…" : "Save plan"}
        </button>
        <button
          type="button"
          className={advButton("ghost", "sm")}
          onClick={cancel}
          disabled={pending || (!changed && !incomplete)}
        >
          Cancel
        </button>
        {saved && (
          <RemovePlan
            programId={programId}
            programName={programName}
            planLabel={savedPlanLabel(saved)}
            disabled={pending}
            onRemoved={() => router.refresh()}
          />
        )}
      </div>

      <SettingsCardFootnote>
        Hours start when you save, not when the invoice is paid. Saving ends the
        pilot on the plan&rsquo;s start date.
      </SettingsCardFootnote>
    </SettingsCard>
  );
}

/**
 * Take the team off its plan.
 *
 * A quiet word at the row's far end, not a third button: it is the rare
 * action on this card, and the confirm is where it turns red.
 * `admin_clear_program_plan` deletes the row and logs what it was. It does
 * not move the pilot's end date back, and the dialog says so, because an
 * admin removing a plan saved by mistake will expect the pilot to return.
 */
function RemovePlan({
  programId,
  programName,
  planLabel,
  disabled,
  onRemoved,
}: {
  programId: string;
  programName: string;
  /** `Program · Spring 2027` — what is being removed. */
  planLabel: string;
  disabled: boolean;
  onRemoved: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startRemove] = useTransition();

  const remove = () => {
    if (pending) return;
    setError(null);
    startRemove(async () => {
      const result = await clearProgramPlan(programId).catch(actionRejected);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      onRemoved();
    });
  };

  return (
    <>
      <button
        type="button"
        className="ml-auto cursor-pointer text-[12px] text-[var(--ink-500)] transition-colors duration-200 hover:text-[var(--danger)] disabled:pointer-events-none disabled:opacity-50"
        onClick={() => setOpen(true)}
        disabled={disabled}
      >
        Remove plan
      </button>

      <ConfirmDialog
        open={open}
        onOpenChange={(next) => {
          if (pending) return;
          setOpen(next);
          if (!next) setError(null);
        }}
        tone="danger"
        title={`Remove the plan for ${programName}?`}
        description="The team goes back to having no plan, and the change is recorded in the program's history."
        confirmLabel="Remove plan"
        pendingLabel="Removing…"
        pending={pending}
        error={error}
        onConfirm={remove}
      >
        <ConfirmProse>
          <p>
            <Em>{programName}</Em> comes off <Em>{planLabel}</Em>, along with
            its dates and the invoice or PO written here. Its matches and
            members are not touched.
          </p>
          <p>
            The pilot does not come back. Its end date stays where saving the
            plan left it, and you can change it on the Pilot card.
          </p>
        </ConfirmProse>
      </ConfirmDialog>
    </>
  );
}
