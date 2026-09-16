"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogProblem } from "@/components/ui/dialog-problem";
import { MenuSelect } from "@/components/ui/menu-select";
import { Field } from "@/components/admin/create-team-dialog";
import { createConference } from "@/lib/services/programs/admin-conference-actions";
import { DIVISION_VALUES, divisionLabel } from "@/lib/data/programs-server";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/**
 * Admin › Conferences › Add conference.
 *
 * `create-team-dialog.tsx`'s shape at one step: a conference has nothing to
 * offer after it exists that the drawer does not already hold, so success
 * closes the dialog and hands the new id to the page, which selects the row
 * once the refresh brings it in. `createConference()` carries the rules
 * (trimming, website normalisation, the duplicate-name sentence); this
 * collects the four fields and shows what it said.
 *
 * Fields are the underline vocabulary with `data-focus-ring="none"` — the
 * active rule thickening to 2px blue is the focus mark (`focus.md`).
 */

const DIVISIONS = DIVISION_VALUES.map((value) => ({
  value,
  label: divisionLabel(value) ?? value,
}));

export function AddConferenceDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * The new conference's id, before the refresh — the page mirrors it into
   * `?id=` and opens its drawer once the row arrives.
   */
  onCreated: (id: string) => void;
}) {
  const router = useRouter();

  const [name, setName] = useState("");
  const [shortName, setShortName] = useState("");
  const [division, setDivision] = useState<string | undefined>(undefined);
  const [website, setWebsite] = useState("");
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startCreating] = useTransition();

  const reset = () => {
    setName("");
    setShortName("");
    setDivision(undefined);
    setWebsite("");
    setProblem(null);
  };

  // Everything resets on close: reopening is a new conference.
  const close = (next: boolean) => {
    if (!next && pending) return;
    onOpenChange(next);
    if (!next) reset();
  };

  const ready = name.trim().length >= 2;

  const submit = () => {
    if (!ready) return;
    setProblem(null);
    startCreating(async () => {
      const result = await createConference({
        name,
        shortName: shortName.trim() || null,
        division: division ?? null,
        website: website.trim() || null,
      });
      if (!result.ok) {
        setProblem(result.error);
        return;
      }
      onOpenChange(false);
      reset();
      onCreated(result.id);
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
          borderRadius: "14px",
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
                Add a conference
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-[12px] leading-[1.55] text-[var(--ink-600)]">
                Adds a conference teams can be placed in. Only the name is
                required.
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

          <div className="grid grid-cols-2 gap-x-4 gap-y-[18px]">
            <Field label="Name" className="col-span-2">
              <input
                type="text"
                value={name}
                placeholder="Ivy League"
                autoComplete="off"
                data-focus-ring="none"
                onChange={(event) => setName(event.target.value)}
                className={cn(advField("underline"), "w-full outline-none")}
              />
            </Field>

            <Field label="Short name">
              <input
                type="text"
                value={shortName}
                placeholder="IVY"
                autoComplete="off"
                spellCheck={false}
                data-focus-ring="none"
                onChange={(event) => setShortName(event.target.value)}
                className={cn(advField("underline"), "w-full outline-none")}
              />
            </Field>

            <Field label="Division">
              <MenuSelect
                label="Division"
                variant="underline"
                value={division}
                placeholder="Not set"
                options={DIVISIONS}
                onChange={setDivision}
              />
            </Field>

            <Field label="Website" className="col-span-2">
              <input
                type="text"
                value={website}
                placeholder="ivyleague.com"
                autoComplete="off"
                spellCheck={false}
                data-focus-ring="none"
                onChange={(event) => setWebsite(event.target.value)}
                className={cn(advField("underline"), "w-full outline-none")}
              />
            </Field>
          </div>

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
              {pending ? "Adding…" : "Add conference"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
