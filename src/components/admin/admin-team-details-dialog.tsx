"use client";

import { useMemo, useState, useTransition } from "react";
import { X } from "lucide-react";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { DialogProblem } from "@/components/ui/dialog-problem";
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import { AdvSwitch } from "@/components/ui/adv-switch";
import { SettingsField } from "@/components/dashboard/settings/settings-card";
import { SURFACE_OPTIONS } from "@/components/dashboard/settings/teams/team-identity-card";
import { squadOptionsFor, type Squad } from "@/lib/data/squad";
import {
  adminUpdateProgramDetails,
  type AdminProgramDetailsPatch,
} from "@/lib/services/programs/admin-team-actions";
import type { AdminTeamProgram } from "@/lib/data/admin-team-server";
import {
  EVENTS_POLICIES,
  UPLOAD_POLICIES,
  uploadPolicyLabel,
  type EventsPolicy,
  type UploadPolicy,
} from "@/lib/workspace/types";
import { advButton } from "@/lib/ui/adv-button";
import { advField } from "@/lib/ui/adv-field";
import { cn } from "@/lib/utils";

/**
 * Admin › Teams › (a program) › **Edit details**.
 *
 * The one form behind the twelve columns `adminUpdateProgramDetails` writes —
 * opened from the header's outline button today and from the Details card's
 * own `Edit` once that card exists (T18). Both open THIS component with
 * `open`/`onOpenChange`, rather than each growing a dialog of its own: a
 * console with two edit forms over one RPC is a console with two places for
 * the same field to drift.
 *
 * ── The rules are the RPC's, and only the RPC's ─────────────────────────────
 * `admin_update_program_details` owns the trim, the `''` → null collapse, the
 * squad/surface/zone/policy vocabularies, "a collegiate program must have a
 * squad", the companion `players_can_upload` write and the audit diff. None of
 * it is re-checked here: a refusal comes back as `{ ok: false, error }` and is
 * printed verbatim under the form. What this file does instead is the two
 * things a form is allowed to do — mark the one required caption, and refuse
 * to promise a save when nothing on screen differs from the saved record.
 *
 * The vocabularies it *renders* come from the modules that define them —
 * `squadOptionsFor()` / `SURFACE_OPTIONS` (`team-identity-card.tsx`), and the
 * two policy ladders built from `UPLOAD_POLICIES` / `EVENTS_POLICIES` and
 * `uploadPolicyLabel()` in `workspace/types.ts`. A list retyped here would be
 * a third copy of a vocabulary the database already enforces.
 *
 * ── Only what changed is sent ───────────────────────────────────────────────
 * The patch's contract is that a PRESENT key is written and an ABSENT one is
 * left alone, so a full twelve-key patch would re-assert every field on every
 * save — including one another admin edited while this dialog sat open, which
 * is a silent clobber, and including values the audit diff would then have to
 * filter back out. `changedPatch()` below compares the draft against the
 * record it was seeded from and sends nothing else. An empty patch cannot
 * reach the action: Save is disabled until there is one.
 *
 * Nullable text goes out as the raw string — `''` is the RPC's own way of
 * spelling "clear this column", and collapsing it here first would be the
 * client owning half of a rule.
 *
 * Fields are the underline vocabulary (`advField("underline")` and
 * `MenuSelect`'s underline trigger), which is the Dialog spec's rule: the
 * active field's rule thickens to 2px blue and that is its only focus mark,
 * hence `data-focus-ring="none"` on each — see `reference/focus.md`'s
 * underline opt-out.
 */

/** One ladder's rungs as a `MenuSelect`'s options. */
function policyOptions<Policy extends UploadPolicy>(
  policies: readonly Policy[],
): readonly MenuOption<Policy>[] {
  return policies.map((policy) => ({
    value: policy,
    label: uploadPolicyLabel(policy),
  }));
}

const UPLOAD_POLICY_OPTIONS = policyOptions(UPLOAD_POLICIES);
const EVENTS_POLICY_OPTIONS = policyOptions(EVENTS_POLICIES);

/**
 * The form's own state — the twelve columns, with every nullable text column
 * held as a string so an input never has to render `null`. The mapping back
 * out is `changedPatch()`.
 */
interface DetailsDraft {
  schoolName: string;
  /** Null when the program has no squad on record. */
  team: Squad | null;
  city: string;
  state: string;
  staffPageUrl: string;
  primaryDomain: string;
  homeVenue: string;
  /** `""` is "not set" — the RPC reads it as a clear. */
  defaultSurface: string;
  timeZone: string;
  uploadPolicy: UploadPolicy;
  eventsPolicy: EventsPolicy;
  rosterPublic: boolean;
}

/** The menu row that clears the squad; never sent — it maps to null. */
const NO_SQUAD = "none";

function draftFrom(program: AdminTeamProgram): DetailsDraft {
  return {
    schoolName: program.schoolName,
    team: program.team,
    city: program.city ?? "",
    state: program.state ?? "",
    staffPageUrl: program.staffPageUrl ?? "",
    primaryDomain: program.primaryDomain ?? "",
    homeVenue: program.homeVenue ?? "",
    defaultSurface: program.defaultSurface ?? "",
    timeZone: program.timeZone,
    uploadPolicy: program.uploadPolicy,
    eventsPolicy: program.eventsPolicy,
    rosterPublic: program.rosterPublic,
  };
}

/**
 * The keys that differ from the record the draft was seeded from — the patch,
 * and nothing else.
 *
 * Exported so a test can hold the arithmetic without rendering the dialog: it
 * is the one piece of logic here that can be wrong in a way nothing on screen
 * would show.
 */
export function changedPatch(
  before: DetailsDraft,
  after: DetailsDraft,
): AdminProgramDetailsPatch {
  const patch: AdminProgramDetailsPatch = {};
  if (after.schoolName !== before.schoolName)
    patch.schoolName = after.schoolName;
  if (after.team !== before.team) patch.team = after.team;
  if (after.city !== before.city) patch.city = after.city;
  if (after.state !== before.state) patch.state = after.state;
  if (after.staffPageUrl !== before.staffPageUrl)
    patch.staffPageUrl = after.staffPageUrl;
  if (after.primaryDomain !== before.primaryDomain)
    patch.primaryDomain = after.primaryDomain;
  if (after.homeVenue !== before.homeVenue) patch.homeVenue = after.homeVenue;
  if (after.defaultSurface !== before.defaultSurface)
    patch.defaultSurface = after.defaultSurface;
  if (after.timeZone !== before.timeZone) patch.timeZone = after.timeZone;
  if (after.uploadPolicy !== before.uploadPolicy)
    patch.uploadPolicy = after.uploadPolicy;
  if (after.eventsPolicy !== before.eventsPolicy)
    patch.eventsPolicy = after.eventsPolicy;
  if (after.rosterPublic !== before.rosterPublic)
    patch.rosterPublic = after.rosterPublic;
  return patch;
}

export function AdminTeamDetailsDialog({
  program,
  open,
  onOpenChange,
}: {
  /** The saved record — both the form's seed and what a change is measured against. */
  program: AdminTeamProgram;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const [draft, setDraft] = useState<DetailsDraft>(() => draftFrom(program));
  // A college is men's or women's and must be one of them. Every other type
  // may also be co-ed, and may be set back to nothing — the way out for a
  // club that was stamped with a squad it never chose.
  const squadOptions = useMemo<MenuOption<Squad | typeof NO_SQUAD>[]>(
    () =>
      program.orgType === "college"
        ? squadOptionsFor(program.orgType)
        : [
            ...squadOptionsFor(program.orgType),
            { value: NO_SQUAD, label: "Not set" },
          ],
    [program.orgType],
  );
  const [problem, setProblem] = useState<string | null>(null);
  const [pending, startSaving] = useTransition();

  const saved = draftFrom(program);

  // Re-seed on the closed→open edge, adjusting state during render rather
  // than from an effect: the effect form is a cascading render (the lint rule
  // names it) and paints one frame of the stale draft first. A dialog
  // cancelled halfway would otherwise reopen holding the abandoned edit and
  // measure the next change against it.
  //
  // Keyed on `open` alone, not on the program row. The action revalidates
  // this page's layout, so a new `program` prop arrives after any admin write
  // anywhere on the page — re-seeding on that would wipe an edit in progress
  // because somebody toggled a member's uploads. `saved` above is read fresh
  // every render regardless, so `changed` is always measured against the
  // current row.
  const [seededOpen, setSeededOpen] = useState(open);
  if (seededOpen !== open) {
    setSeededOpen(open);
    if (open) {
      setDraft(saved);
      setProblem(null);
    }
  }

  const set = <K extends keyof DetailsDraft>(key: K, value: DetailsDraft[K]) =>
    setDraft((current) => ({ ...current, [key]: value }));

  const patch = changedPatch(saved, draft);
  const changed = Object.keys(patch).length > 0;

  const submit = () => {
    if (!changed || pending) return;
    setProblem(null);
    startSaving(async () => {
      const result = await adminUpdateProgramDetails({
        programId: program.id,
        patch,
      });
      if (!result.ok) {
        setProblem(result.error);
        return;
      }
      onOpenChange(false);
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideCloseButton
        className="gap-0 border-0 bg-[var(--surface-card)] p-0 sm:max-w-none"
        style={{
          width: "480px",
          maxWidth: "calc(100vw - 32px)",
          borderRadius: "14px",
          boxShadow: "var(--shadow-dropdown)",
        }}
      >
        <div className="flex max-h-[calc(100vh-96px)] flex-col gap-[18px] overflow-y-auto p-6 pb-5">
          <div className="flex items-start gap-2.5">
            <div className="flex-1">
              <DialogTitle className="text-left text-[16px] font-medium text-[var(--ink-900)]">
                Edit details
              </DialogTitle>
              <DialogDescription className="mt-1 text-left text-[12px] leading-[1.55] text-[var(--ink-600)]">
                The program&rsquo;s directory record and the rules its staff
                work under. Every save is logged against your account.
              </DialogDescription>
            </div>
            <button
              type="button"
              aria-label="Close"
              onClick={() => onOpenChange(false)}
              className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <X className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-x-4 gap-y-[18px]">
            <div className="col-span-2">
              <SettingsField label="School name" required>
                <TextInput
                  value={draft.schoolName}
                  placeholder="Meridian State University"
                  onChange={(value) => set("schoolName", value)}
                />
              </SettingsField>
            </div>

            <SettingsField label="Team">
              <MenuSelect
                label="Team"
                variant="underline"
                value={draft.team ?? undefined}
                placeholder="Not set"
                options={squadOptions}
                onChange={(value) =>
                  set("team", value === NO_SQUAD ? null : value)
                }
              />
            </SettingsField>

            <SettingsField label="Default surface">
              <MenuSelect
                label="Default surface"
                variant="underline"
                value={draft.defaultSurface || undefined}
                placeholder="Not set"
                options={SURFACE_OPTIONS}
                onChange={(value) => set("defaultSurface", value)}
              />
            </SettingsField>

            <SettingsField label="City">
              <TextInput
                value={draft.city}
                placeholder="Ann Arbor"
                onChange={(value) => set("city", value)}
              />
            </SettingsField>

            <SettingsField label="State">
              <TextInput
                value={draft.state}
                placeholder="MI"
                onChange={(value) => set("state", value)}
              />
            </SettingsField>

            <div className="col-span-2">
              <SettingsField
                label="Staff page URL"
                hint="The athletics directory a claim reviewer checks a name against."
              >
                <TextInput
                  value={draft.staffPageUrl}
                  placeholder="https://meridianathletics.com/sports/wten/coaches"
                  spellCheck={false}
                  onChange={(value) => set("staffPageUrl", value)}
                />
              </SettingsField>
            </div>

            <SettingsField
              label="Primary domain"
              hint="What the claim flow matches a coach's address against."
            >
              <TextInput
                value={draft.primaryDomain}
                placeholder="meridian.edu"
                spellCheck={false}
                onChange={(value) => set("primaryDomain", value)}
              />
            </SettingsField>

            <SettingsField label="Home venue">
              <TextInput
                value={draft.homeVenue}
                placeholder="Whitfield Tennis Center"
                onChange={(value) => set("homeVenue", value)}
              />
            </SettingsField>

            <div className="col-span-2">
              <SettingsField
                label="Time zone"
                hint="An IANA zone name — America/New_York, Europe/London, UTC."
              >
                <TextInput
                  value={draft.timeZone}
                  placeholder="UTC"
                  spellCheck={false}
                  onChange={(value) => set("timeZone", value)}
                />
              </SettingsField>
            </div>

            <SettingsField label="Who can upload">
              <MenuSelect
                label="Who can upload"
                variant="underline"
                value={draft.uploadPolicy}
                options={UPLOAD_POLICY_OPTIONS}
                onChange={(value) => set("uploadPolicy", value)}
              />
            </SettingsField>

            <SettingsField label="Who edits the schedule">
              <MenuSelect
                label="Who edits the schedule"
                variant="underline"
                value={draft.eventsPolicy}
                options={EVENTS_POLICY_OPTIONS}
                onChange={(value) => set("eventsPolicy", value)}
              />
            </SettingsField>
          </div>

          <div className="flex items-start gap-3 border-t border-[var(--border-hairline)] pt-[18px]">
            <div className="min-w-0 flex-1">
              <div className="text-[13px] font-medium text-[var(--ink-900)]">
                Public roster
              </div>
              <div className="mt-[3px] text-[11px] leading-[1.5] text-[var(--ink-500)]">
                Off, the roster is visible only to the program&rsquo;s own
                members.
              </div>
            </div>
            <AdvSwitch
              label="Public roster"
              checked={draft.rosterPublic}
              onCheckedChange={(next) => set("rosterPublic", next)}
            />
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
              type="button"
              className={advButton("primary", "md")}
              onClick={submit}
              disabled={!changed || pending}
            >
              {pending ? "Saving…" : "Save details"}
            </button>
          </div>
        </div>
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
