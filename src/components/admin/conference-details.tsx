"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { X } from "lucide-react";

import { SettingsField } from "@/components/dashboard/settings/settings-card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogProblem } from "@/components/ui/dialog-problem";
import { MenuSelect } from "@/components/ui/menu-select";
import type { AdminConferenceRow } from "@/lib/data/admin-conferences-view";
import {
  DIVISION_VALUES,
  divisionLongLabel,
  divisionLabel,
  type Division,
} from "@/lib/data/programs-server";
import { saveConference } from "@/lib/services/programs/admin-conference-actions";
import {
  conferenceChanged,
  normalizeWebsite,
  storedConferenceFields,
  websiteHref,
  type ConferenceDraft,
} from "@/lib/services/programs/conference-format";
import { actionRejected } from "@/lib/ui/action-rejected";
import { InertButton } from "@/components/admin/inert-button";
import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/** The facts every conference prints, in order; Website follows when set. */
const ALWAYS_FACTS = ["Division", "Teams", "On Advantage"] as const;

/**
 * The Admin › Conferences detail page's Details section, in
 * `AdminDetailsCard`'s shape: a heading with one `Edit` button, then one row
 * of facts — Division, Teams, On Advantage, and the website as a link when one
 * is set. Not a card: a plain section under a heading, so the page stays
 * quiet.
 *
 * **One editor.** `Edit` opens `ConferenceDetailsDialog`, the one form behind
 * the conference's record (Name, Short name, Division, Website) — renaming is
 * its Name field, so the header's `⋯` menu carries no rename of its own.
 */
export function ConferenceDetails({
  conference,
}: {
  conference: AdminConferenceRow;
}) {
  const [editing, setEditing] = useState(false);

  const [division, teams, onAdvantage] = ALWAYS_FACTS;
  const facts: { label: string; value: React.ReactNode }[] = [
    {
      label: division,
      value: divisionLongLabel(conference.division) ?? "Not set",
    },
    { label: teams, value: count(conference.teams) },
    { label: onAdvantage, value: count(conference.onAdvantage) },
  ];
  if (conference.website) {
    facts.push({
      label: "Website",
      value: (
        <a
          href={websiteHref(conference.website)}
          target="_blank"
          rel="noopener noreferrer"
          className="text-[var(--ink-900)] underline-offset-2 hover:underline"
        >
          {conference.website}
        </a>
      ),
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
          Details
        </h2>
        <button
          type="button"
          className={advButton("outline", "sm")}
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      </div>

      <dl className="grid grid-cols-[repeat(auto-fill,minmax(160px,240px))] gap-x-8 gap-y-4">
        {facts.map((fact) => (
          <div key={fact.label} className="min-w-0">
            <dt className="text-[12px] text-[var(--ink-600)]">{fact.label}</dt>
            <dd className="mt-0.5 truncate text-[13px] text-[var(--ink-900)] tabular-nums">
              {fact.value}
            </dd>
          </div>
        ))}
      </dl>

      <ConferenceDetailsDialog
        conference={conference}
        open={editing}
        onOpenChange={setEditing}
      />
    </div>
  );
}

function count(value: number): string {
  return value.toLocaleString("en-US");
}

const DIVISIONS = DIVISION_VALUES.map((value) => ({
  value,
  label: divisionLabel(value) ?? value,
}));

function draftFrom(row: AdminConferenceRow): ConferenceDraft {
  return {
    name: row.name,
    shortName: row.shortName,
    division: row.division,
    website: row.website,
  };
}

/**
 * Edit the conference — Name, Short name, Division, Website — with one Save
 * that calls `saveConference`.
 *
 * ── The rules are the action's, and only the action's ───────────────────────
 * `saveConference` trims, collapses empties to null, normalises the website and
 * refuses a short name or a website it cannot read, each with its own
 * sentence. None of it is re-checked here: a refusal is printed verbatim in
 * `DialogProblem`. What this form does is refuse to promise a save when
 * nothing would change, measured against the saved row in the form the action
 * stores (`storedConferenceFields`), so a website retyped as
 * "https://IvyLeague.com/" over a saved "ivyleague.com" is not a change. A
 * website the action cannot read stays a change, so Save is pressable and the
 * action's sentence is what the admin reads.
 *
 * Fields are the underline vocabulary (`advField("underline")` and
 * `MenuSelect`'s underline trigger); the active rule going 2px blue is the
 * focus mark, hence `data-focus-ring="none"` on each input.
 */
function ConferenceDetailsDialog({
  conference,
  open,
  onOpenChange,
}: {
  conference: AdminConferenceRow;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<ConferenceDraft>(() =>
    draftFrom(conference),
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startSaving] = useTransition();

  // Re-seed on the closed→open edge, adjusting state during render rather
  // than from an effect (`AdminTeamDetailsDialog`'s pattern): a dialog
  // cancelled halfway reopens on the saved row, not on the abandoned edit.
  const [seededOpen, setSeededOpen] = useState(open);
  if (seededOpen !== open) {
    setSeededOpen(open);
    if (open) {
      setDraft(draftFrom(conference));
      setProblem(null);
    }
  }

  const set = (patch: Partial<ConferenceDraft>) =>
    setDraft((current) => ({ ...current, ...patch }));

  const stored = storedConferenceFields(draft);
  const changed = conferenceChanged(conference, {
    ...stored,
    website: stored.website ?? draft.website,
  });
  const savedWebsite = normalizeWebsite(draft.website);

  const submit = () => {
    if (!changed || pending) return;
    setProblem(null);
    const sent = draft;
    startSaving(async () => {
      const result = await saveConference(conference.id, {
        name: sent.name ?? "",
        shortName: sent.shortName,
        division: sent.division,
        website: sent.website,
      }).catch(actionRejected);
      if (!result.ok) {
        setProblem(result.error);
        return;
      }
      onOpenChange(false);
      router.refresh();
    });
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next && pending) return;
        onOpenChange(next);
      }}
    >
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
          className="flex max-h-[calc(100vh-96px)] flex-col gap-[18px] overflow-y-auto p-6 pb-5"
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <div className="flex items-start gap-2.5">
            <div className="flex-1">
              <DialogTitle className="text-left text-[16px] font-medium text-[var(--ink-900)]">
                Edit conference
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-[12px] leading-[1.55] text-[var(--ink-600)]">
                A new name reaches every team in the conference.
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              disabled={pending}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-[18px]">
            <div className="col-span-2">
              <SettingsField label="Name">
                <TextInput
                  value={draft.name ?? ""}
                  placeholder="Ivy League"
                  onChange={(name) => set({ name })}
                />
              </SettingsField>
            </div>

            <SettingsField label="Short name">
              <TextInput
                value={draft.shortName ?? ""}
                placeholder="IVY"
                spellCheck={false}
                onChange={(shortName) => set({ shortName })}
              />
            </SettingsField>

            <SettingsField label="Division" labelless>
              <MenuSelect<Division>
                label="Division"
                variant="underline"
                value={
                  DIVISION_VALUES.find((value) => value === draft.division) ??
                  undefined
                }
                placeholder="Not set"
                options={DIVISIONS}
                note="A conference sits inside one division."
                onChange={(division) => set({ division })}
              />
            </SettingsField>

            <div className="col-span-2">
              <SettingsField
                label="Website"
                hint={
                  savedWebsite ? (
                    <a
                      href={websiteHref(savedWebsite)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
                    >
                      Open {savedWebsite}
                    </a>
                  ) : undefined
                }
              >
                <TextInput
                  value={draft.website ?? ""}
                  placeholder="ivyleague.com"
                  spellCheck={false}
                  onChange={(website) => set({ website })}
                />
              </SettingsField>
            </div>
          </div>

          <DialogProblem message={problem} />

          <div className="flex items-center gap-2.5 pt-0.5">
            <div className="flex-1" />
            <button
              type="button"
              className={advButton("ghost", "md")}
              onClick={() => onOpenChange(false)}
              disabled={pending}
            >
              Cancel
            </button>
            <button
              type="submit"
              className={advButton("primary", "md")}
              disabled={!changed || pending}
            >
              {pending ? "Saving…" : "Save"}
            </button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/** The underline text field, as every field in this dialog draws it. */
function TextInput({
  value,
  placeholder,
  spellCheck,
  onChange,
}: {
  value: string;
  placeholder?: string;
  spellCheck?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <input
      type="text"
      value={value}
      placeholder={placeholder}
      autoComplete="off"
      spellCheck={spellCheck}
      data-focus-ring="none"
      onChange={(event) => onChange(event.target.value)}
      className={cn(advField("underline"), "w-full outline-none")}
    />
  );
}

/**
 * The Details section while the conference page loads: the real heading,
 * Edit (inert until the page lands) and the fact labels every conference
 * prints, with bars for their values.
 */
export function ConferenceDetailsSkeleton() {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-[14px] font-medium text-[var(--ink-900)]">
          Details
        </h2>
        <InertButton>Edit</InertButton>
      </div>
      <PendingRegion
        label="details"
        innerClassName="grid grid-cols-[repeat(auto-fill,minmax(160px,240px))] gap-x-8 gap-y-4"
      >
        {ALWAYS_FACTS.map((label) => (
          <div key={label} className="min-w-0">
            <div className="text-[12px] text-[var(--ink-600)]">{label}</div>
            <div className="mt-0.5 flex h-[19.5px] items-center">
              <PendingBar className="h-3 w-20" />
            </div>
          </div>
        ))}
      </PendingRegion>
    </div>
  );
}
