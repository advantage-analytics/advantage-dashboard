"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Plus, UserRound, X } from "lucide-react";
import { AdminPage } from "@/components/admin/admin-page";
import { Field } from "@/components/admin/create-team-dialog";
import { TableEmptyBody } from "@/components/dashboard/shared/table-empty-body";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogProblem } from "@/components/ui/dialog-problem";
import { PersonAvatar } from "@/components/ui/person-avatar";
import type { AdminPilotRow } from "@/lib/data/admin-pilots-view";
import { formatHoursShort } from "@/lib/data/usage-format";
import {
  addIndividualPilot,
  removeIndividualPilot,
} from "@/lib/services/programs/admin-pilot-actions";
import {
  PILOT_INDIVIDUAL_MAX_PLAYERS,
  PILOT_INDIVIDUAL_MONTHLY_CAP_HOURS,
} from "@/lib/services/splitstep/config";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/**
 * Admin › Pilots.
 *
 * One list and two writes: "Add pilot" (by the email of an existing account)
 * and a row's "Remove". Rows open nothing — there is no more to a pilot than
 * the row says — so they are plain rows with one trailing text action, not
 * container rows with a drawer.
 */

const COL = {
  player: "min-w-0 flex-1",
  used: "w-[120px] shrink-0 text-right",
  action: "w-[72px] shrink-0 text-right",
} as const;

const ROW = "flex items-center gap-4";

export function PilotsPageContent({
  rows,
}: {
  rows: readonly AdminPilotRow[];
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<AdminPilotRow | null>(null);
  const [removeError, setRemoveError] = useState<string | null>(null);
  const [removePending, startRemoving] = useTransition();

  const full = rows.length >= PILOT_INDIVIDUAL_MAX_PLAYERS;
  const summary = `${rows.length} of ${PILOT_INDIVIDUAL_MAX_PLAYERS} players · ${PILOT_INDIVIDUAL_MONTHLY_CAP_HOURS} h each a month, personal workspace only`;

  return (
    <AdminPage className="gap-4">
      <div className="flex items-end gap-2.5">
        <div className="flex min-w-0 flex-1 items-baseline gap-4">
          <h1 className="text-display">Pilots</h1>
          <p className="text-body-sm truncate tabular-nums">{summary}</p>
        </div>
        <button
          type="button"
          aria-haspopup="dialog"
          aria-expanded={adding}
          className={advButton("primary", "md")}
          disabled={full}
          onClick={() => setAdding(true)}
        >
          <Plus className="size-3.5" strokeWidth={1.5} aria-hidden />
          Add pilot
        </button>
      </div>

      <div className="overflow-x-auto rounded-[var(--radius-card)] border border-[var(--border-card)] bg-[var(--surface-card)] shadow-[var(--shadow-card)]">
        <div className="min-w-[520px] px-6 pt-0.5 pb-1.5">
          <div
            className={cn(
              ROW,
              "border-b border-[var(--border-hairline)] pt-3.5 pb-2.5",
            )}
          >
            <span className={cn(COL.player, "eyebrow-sm")}>Player</span>
            <span className={cn(COL.used, "eyebrow-sm")}>This month</span>
            <span className={COL.action} aria-hidden />
          </div>

          {rows.length === 0 ? (
            <TableEmptyBody
              icon={UserRound}
              title="No pilot individuals yet"
              action={{ label: "Add pilot", onClick: () => setAdding(true) }}
            />
          ) : (
            rows.map((row) => (
              <div
                key={row.id}
                className={cn(
                  ROW,
                  "h-[52px] border-b border-[var(--border-hairline)] last:border-b-0",
                )}
              >
                <span className={cn(COL.player, "flex items-center gap-3")}>
                  <PersonAvatar
                    initials={row.initials}
                    photoUrl={row.avatarUrl}
                    className="size-[28px] text-[10px]"
                  />
                  <span className="flex min-w-0 flex-col">
                    <span className="truncate text-[13px] font-medium text-[var(--ink-900)]">
                      {row.name}
                    </span>
                    <span className="truncate text-[11px] text-[var(--ink-500)]">
                      {row.email}
                    </span>
                  </span>
                </span>
                <span
                  className={cn(
                    COL.used,
                    "text-[12px] tabular-nums",
                    row.usedSeconds === 0
                      ? "text-[var(--ink-600)]"
                      : "text-[var(--ink-700)]",
                  )}
                >
                  {formatHoursShort(row.usedSeconds)} of{" "}
                  {PILOT_INDIVIDUAL_MONTHLY_CAP_HOURS} h
                </span>
                <span className={COL.action}>
                  <button
                    type="button"
                    className="cursor-pointer rounded-[var(--radius-element)] text-[12px] text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
                    aria-label={`Remove ${row.name} from the pilot`}
                    onClick={() => {
                      setRemoveError(null);
                      setRemoving(row);
                    }}
                  >
                    Remove
                  </button>
                </span>
              </div>
            ))
          )}
        </div>
      </div>

      <AddPilotDialog open={adding} onOpenChange={setAdding} />

      <ConfirmDialog
        open={removing !== null}
        onOpenChange={(next) => {
          if (next || removePending) return;
          setRemoving(null);
          setRemoveError(null);
        }}
        title={
          removing ? `Remove ${removing.name} from the pilot?` : "Remove pilot?"
        }
        description={`Their personal workspace goes back to the standard individual allowance from now on. Video they already sent this month still counts.`}
        confirmLabel="Remove pilot"
        pendingLabel="Removing…"
        tone="danger"
        pending={removePending}
        error={removeError}
        onConfirm={() => {
          const target = removing;
          if (!target) return;
          setRemoveError(null);
          startRemoving(async () => {
            const result = await removeIndividualPilot(target.id);
            if (!result.ok) {
              setRemoveError(result.error);
              return;
            }
            setRemoving(null);
            router.refresh();
          });
        }}
      />
    </AdminPage>
  );
}

function AddPilotDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startAdding] = useTransition();

  // Everything resets on close: reopening is a new player.
  const close = (next: boolean) => {
    if (!next && pending) return;
    onOpenChange(next);
    if (!next) {
      setEmail("");
      setProblem(null);
    }
  };

  const ready = email.trim().includes("@");

  const submit = () => {
    if (!ready) return;
    setProblem(null);
    startAdding(async () => {
      const result = await addIndividualPilot(email);
      if (!result.ok) {
        setProblem(result.error);
        return;
      }
      onOpenChange(false);
      setEmail("");
      router.refresh();
    });
  };

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent
        hideCloseButton
        className="gap-0 border-0 bg-[var(--surface-card)] p-0 sm:max-w-none"
        style={{
          width: "440px",
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "var(--radius-card)",
          boxShadow: "var(--shadow-dropdown)",
        }}
      >
        <form
          className="flex flex-col gap-[18px] p-6 pb-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex items-start gap-2.5">
            <div className="flex-1">
              <DialogTitle className="text-left text-[16px] font-medium text-[var(--ink-900)]">
                Add a pilot individual
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-[12px] leading-[1.55] text-[var(--ink-600)]">
                Their personal workspace gets{" "}
                {PILOT_INDIVIDUAL_MONTHLY_CAP_HOURS} hours of video a month.
                They need an Advantage account first.
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => close(false)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          <Field label="Account email">
            <input
              type="email"
              value={email}
              placeholder="player@example.com"
              autoComplete="off"
              spellCheck={false}
              data-focus-ring="none"
              onChange={(event) => setEmail(event.target.value)}
              className={cn(advField("underline"), "w-full outline-none")}
            />
          </Field>

          <DialogProblem message={problem} />

          <div className="flex items-center gap-2.5 pt-0.5">
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("ghost", "md")}
              onClick={() => close(false)}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={advButton("primary", "md")}
              disabled={!ready || pending}
            >
              {pending ? "Adding…" : "Add pilot"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
