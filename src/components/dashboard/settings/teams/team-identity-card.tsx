"use client";

import { useMemo } from "react";
import { Lock } from "lucide-react";
import {
  SettingsCard,
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { MenuSelect } from "@/components/ui/menu-select";
import { CrestControl } from "@/components/dashboard/settings/teams/crest-control";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import { ConferenceSelect } from "@/components/dashboard/settings/teams/conference-select";
import type { IdentityDraft } from "@/components/dashboard/settings/teams/types";
import { academicSeason, todayISO } from "@/lib/schedule/format";

export const SQUAD_OPTIONS = [
  { value: "mens" as const, label: "Men's tennis" },
  { value: "womens" as const, label: "Women's tennis" },
];

export const SURFACE_OPTIONS = [
  { value: "hard" as const, label: "Hard" },
  { value: "clay" as const, label: "Clay" },
  { value: "grass" as const, label: "Grass" },
  { value: "carpet" as const, label: "Carpet" },
];

/**
 * The identity card: crest, name and home courts.
 *
 * Two kinds of field on one grid. Venue and surface are logistics — any staff
 * may change them, and a coach setting up a season should not have to find
 * the owner. Name, squad and conference are the program's directory
 * record: other schools match against them, and the two squads of one school
 * are two programs with two budgets. Those three are the owner's, and to
 * everyone else they render as a fact with a reason, not as a disabled input
 * (which still looks like an input, and so reads as broken rather than as
 * not-yours). The RPC enforces the same split; this is the presentation of
 * its rule, not the rule.
 *
 * A player never edits here at all — they get the four facts that matter to
 * them, read-only, and none of the identity fields.
 *
 * Season is shown, never edited: it is the academic year today falls in
 * (`academicSeason`). A typed "2026–27" went stale every August, and nothing
 * in the product read it.
 */
export function TeamIdentityCard({
  programId,
  crestUrl,
  draft,
  onChange,
  canEdit,
  isOwner,
  ownerName,
  division,
  conferenceOptions,
  onCrestError,
}: {
  programId: string;
  crestUrl: string | null;
  draft: IdentityDraft;
  onChange: <K extends keyof IdentityDraft>(
    key: K,
    value: IdentityDraft[K],
  ) => void;
  /** Staff of any standing. A player sees the read-only variant. */
  canEdit: boolean;
  isOwner: boolean;
  ownerName: string | null;
  /** The program's division — names the picker's list. */
  division: string | null;
  /**
   * The directory's conferences — the division's, or every division's for a
   * college with none on file. Non-empty turns Conference into a picker;
   * empty (a club or high school, with no directory) keeps the text field.
   */
  conferenceOptions: readonly string[];
  onCrestError: (message: string | null) => void;
}) {
  // Once per mount — the season has no reason to turn over while the page is open.
  const season = useMemo(() => academicSeason(todayISO()), []);

  if (!canEdit) {
    return (
      <SettingsCard className="gap-3.5">
        <div className="flex items-center gap-4">
          <ProgramCrest name={draft.schoolName} crestUrl={crestUrl} size={52} />
          <span className="text-[13px] font-medium text-[var(--ink-900)]">
            Team identity
          </span>
        </div>
        <div className="grid grid-cols-1 gap-3.5 border-t border-[var(--border-hairline)] pt-3.5 sm:grid-cols-2 sm:gap-x-6">
          <Fact label="Home venue" value={draft.homeVenue || "—"} />
          <Fact
            label="Default surface"
            value={surfaceLabel(draft.defaultSurface)}
          />
          <Fact label="Conference" value={draft.conference || "—"} />
          <Fact label="Season" value={season} />
        </div>
      </SettingsCard>
    );
  }

  const lockedHint = `Ask ${ownerName ?? "the owner"}, the owner, to change it.`;

  return (
    <SettingsCard className="gap-[18px]">
      <CrestControl
        programId={programId}
        name={draft.schoolName}
        crestUrl={crestUrl}
        onError={onCrestError}
      />

      <div className="grid grid-cols-1 gap-5 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-2 sm:gap-x-6">
        {isOwner ? (
          <TextField
            label="Program name"
            value={draft.schoolName}
            onChange={(value) => onChange("schoolName", value)}
          />
        ) : (
          <LockedField
            label="Program name"
            value={draft.schoolName}
            hint={lockedHint}
          />
        )}

        {isOwner ? (
          <SettingsField label="Squad">
            <MenuSelect
              label="Squad"
              variant="underline"
              value={draft.team}
              options={SQUAD_OPTIONS}
              onChange={(value) => onChange("team", value)}
            />
          </SettingsField>
        ) : (
          <LockedField
            label="Squad"
            value={
              SQUAD_OPTIONS.find((option) => option.value === draft.team)
                ?.label ?? ""
            }
            hint={lockedHint}
          />
        )}

        <TextField
          label="Home venue"
          value={draft.homeVenue}
          placeholder="Whitfield Tennis Center"
          onChange={(value) => onChange("homeVenue", value)}
        />

        <SettingsField label="Default surface">
          <MenuSelect
            label="Default surface"
            variant="underline"
            value={draft.defaultSurface || "hard"}
            options={SURFACE_OPTIONS}
            onChange={(value) => onChange("defaultSurface", value)}
          />
        </SettingsField>

        {isOwner && conferenceOptions.length > 0 ? (
          <SettingsField label="Conference">
            <ConferenceSelect
              value={draft.conference}
              options={conferenceOptions}
              division={division}
              onChange={(value) => onChange("conference", value)}
            />
          </SettingsField>
        ) : isOwner ? (
          <TextField
            label="Conference"
            value={draft.conference}
            placeholder="Pacific Coast"
            onChange={(value) => onChange("conference", value)}
          />
        ) : (
          <LockedField
            label="Conference"
            value={draft.conference || "—"}
            hint={lockedHint}
          />
        )}

        <LockedField
          label="Season"
          value={season}
          hint="Follows the academic year — turns over Aug 1."
        />
      </div>

      {/* No rule above this note: the grid's last row already ends the block,
          and a second line two pixels under it read as a double border. */}
      <span className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
        Default surface prefills new duals and tournaments on the schedule.
        {isOwner &&
          " Name, squad and conference are the program's directory record — changing them changes what other schools see."}
      </span>
    </SettingsCard>
  );
}

/** Underline text field — the round-4 form vocabulary, shared with Profile. */
function TextField({
  label,
  value,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  onChange: (next: string) => void;
}) {
  return (
    <SettingsField label={label}>
      <SettingsUnderlineInput
        type="text"
        value={value}
        placeholder={placeholder}
        className="h-8"
        onChange={(event) => onChange(event.target.value)}
      />
    </SettingsField>
  );
}

/**
 * A field the viewer may not change: the value on a faint rule with a lock,
 * and the reason — naming who can — in the caption slot beneath. Never a
 * `disabled` input.
 */
function LockedField({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <SettingsField label={label} hint={hint}>
      <span className="flex h-8 items-center gap-1.5 border-b border-[var(--ink-100)] text-[13px] text-[var(--ink-600)]">
        <Lock
          className="size-[11px] shrink-0 text-[var(--ink-400)]"
          strokeWidth={1.75}
          aria-hidden="true"
        />
        <span className="truncate">{value}</span>
      </span>
    </SettingsField>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-1">
      <span className="text-[11px] text-[var(--ink-600)]">{label}</span>
      <span className="text-[13px] text-[var(--ink-900)]">{value}</span>
    </div>
  );
}

function surfaceLabel(value: string): string {
  return SURFACE_OPTIONS.find((option) => option.value === value)?.label ?? "—";
}
