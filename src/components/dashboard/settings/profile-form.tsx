"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { AlertCircle } from "lucide-react";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { AvatarControl } from "@/components/dashboard/settings/avatar-control";
import {
  SettingsCard,
  SettingsCardTitle,
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { SettingsSaveBar } from "@/components/dashboard/settings/settings-save-bar";
import { saveProfile } from "@/components/dashboard/settings/actions";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { MenuSelect } from "@/components/ui/menu-select";
import { DateField } from "@/components/ui/date-field";
import { todayISO } from "@/lib/schedule/format";
import posthog from "posthog-js";

const isPostHogConfigured = Boolean(
  process.env.NEXT_PUBLIC_POSTHOG_PROJECT_TOKEN &&
  process.env.NEXT_PUBLIC_POSTHOG_HOST,
);

/**
 * Settings › Profile.
 *
 * Completeness reads as a line — "1 field left · Phone number" — not as a ring,
 * a banner and a celebration screen. The three of them said the same thing in
 * three registers, and the loudest was a full-width onboarding card that
 * appeared every visit until the last field was filled.
 *
 * Editing is a draft with one commit, which is what the save bar exists for.
 *
 * There is no Role here. `users.role` is the persona onboarding records
 * (player/coach/parent/academy) and gates nothing; the roles that do — owner,
 * coach, staff, player — are per team, in `program_members`, and shown under
 * Settings › Teams. A single self-described role beside them could only
 * disagree with one of them, and editing it would let a parent account (with
 * guardian consent on file) relabel itself.
 *
 * Nor is there a team. The identity card belongs to the account, so it reads
 * the same in every workspace; a pill naming only the *active* team changed on
 * every switch, vanished in Personal, and could not tell two squads at one
 * school apart. Memberships, with their roles, are listed under Settings › Teams.
 *
 * The row arrives as a prop. Fetching it in an effect meant the page rendered
 * an empty form and a "7 fields left" badge for one paint on every visit, and
 * needed a `loaded` flag to suppress it — for data the server had already
 * authenticated its way to.
 */

// In the order they are rendered, which is also the order `missing[0]` names
// the next gap in.
const FIELDS = [
  "firstName",
  "lastName",
  "birthdate",
  "phone",
  "country",
  "state",
  "hand",
  "backhand",
] as const;

type FieldName = (typeof FIELDS)[number];

const FIELD_LABELS: Record<FieldName, string> = {
  firstName: "First name",
  lastName: "Last name",
  birthdate: "Date of birth",
  phone: "Phone number",
  country: "Country",
  state: "State / region",
  hand: "Playing hand",
  backhand: "Backhand",
};

const COUNTRY_OPTIONS = [
  { value: "US", label: "United States" },
  { value: "CA", label: "Canada" },
  { value: "GB", label: "United Kingdom" },
  { value: "AU", label: "Australia" },
  { value: "ES", label: "Spain" },
  { value: "FR", label: "France" },
  { value: "DE", label: "Germany" },
  { value: "IT", label: "Italy" },
  { value: "AR", label: "Argentina" },
  { value: "BR", label: "Brazil" },
  { value: "JP", label: "Japan" },
  { value: "KR", label: "South Korea" },
  { value: "IN", label: "India" },
  { value: "MX", label: "Mexico" },
  { value: "CH", label: "Switzerland" },
  { value: "NL", label: "Netherlands" },
  { value: "SE", label: "Sweden" },
  { value: "CZ", label: "Czech Republic" },
  { value: "OTHER", label: "Other" },
];

/**
 * Stored values, not labels. `users.hand` / `users.backhand` are raw
 * (`"right"`, `"two-handed"`); `formatPlayerStyle()` renders them and the
 * match filters compare against them, so these are the two vocabularies the
 * rest of the app already reads.
 */
const HAND_OPTIONS = [
  { value: "right", label: "Right-handed" },
  { value: "left", label: "Left-handed" },
];

const BACKHAND_OPTIONS = [
  { value: "one-handed", label: "One-handed" },
  { value: "two-handed", label: "Two-handed" },
];

export type ProfileDraft = Record<FieldName, string>;

export function ProfileForm({ initial }: { initial: ProfileDraft }) {
  const { viewer } = useWorkspace();

  const [saved, setSaved] = useState<ProfileDraft>(initial);
  const [draft, setDraft] = useState<ProfileDraft>(initial);
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();

  const set = useCallback((field: FieldName, value: string) => {
    setDraft((previous) => ({ ...previous, [field]: value }));
  }, []);

  const isDirty = FIELDS.some((field) => draft[field] !== saved[field]);

  const missing = useMemo(
    () => FIELDS.filter((field) => draft[field].trim() === ""),
    [draft],
  );

  const handleSave = useCallback(() => {
    setError(null);
    startSaving(async () => {
      const result = await saveProfile(draft);
      if (result.ok) {
        if (isPostHogConfigured) {
          posthog.capture("profile_updated", {
            changed_fields: FIELDS.filter(
              (field) => draft[field] !== saved[field],
            ),
          });
        }
        setSaved(draft);
      } else setError(result.error);
    });
  }, [draft, saved]);

  const displayName =
    `${draft.firstName} ${draft.lastName}`.trim() || viewer.name;

  return (
    <div className="flex max-w-[660px] flex-col gap-5">
      {error && (
        <SettingsAlert
          type="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Identity */}
      <SettingsCard className="flex-row items-start gap-6 py-7">
        <AvatarControl
          initials={viewer.initials}
          avatarUrl={viewer.avatarUrl}
          onError={setError}
        >
          <div className="text-title-lg truncate">{displayName}</div>
          {viewer.memberSince && (
            <div className="mono mt-1 text-[11px] text-[var(--ink-500)]">
              since {viewer.memberSince}
            </div>
          )}
        </AvatarControl>

        {/* Completeness. One line, and only while something is actually
            missing — a badge that says "0 fields left" is decoration. */}
        {missing.length > 0 && (
          <div className="mt-1.5 flex shrink-0 items-center gap-2 text-[11px]">
            <AlertCircle
              className="size-[13px] text-[var(--ink-600)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <span className="text-[var(--ink-900)]">
              {missing.length} field{missing.length === 1 ? "" : "s"} left
            </span>
            <span className="text-[var(--ink-500)]">
              · {FIELD_LABELS[missing[0]]}
            </span>
          </div>
        )}
      </SettingsCard>

      {/* General information */}
      <SettingsCard className="gap-[18px]">
        <SettingsCardTitle
          trailing={<Note>Only your name is visible to teammates</Note>}
        >
          General information
        </SettingsCardTitle>
        <div className="grid grid-cols-1 gap-5 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-2 sm:gap-x-6">
          <ProfileField
            label={FIELD_LABELS.firstName}
            value={draft.firstName}
            onChange={(value) => set("firstName", value)}
          />
          <ProfileField
            label={FIELD_LABELS.lastName}
            value={draft.lastName}
            onChange={(value) => set("lastName", value)}
          />
          <ProfileField
            label={FIELD_LABELS.birthdate}
            isDate
            value={draft.birthdate}
            missing={draft.birthdate.trim() === ""}
            onChange={(value) => set("birthdate", value)}
          />
          <ProfileField
            label={FIELD_LABELS.phone}
            type="tel"
            value={draft.phone}
            placeholder="+1 555 000 0000"
            hint="Used only for account recovery."
            missing={draft.phone.trim() === ""}
            onChange={(value) => set("phone", value)}
          />
        </div>
      </SettingsCard>

      {/* Tennis profile */}
      <SettingsCard className="gap-[18px]">
        <SettingsCardTitle>Tennis profile</SettingsCardTitle>
        <div className="grid grid-cols-1 gap-5 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-2 sm:gap-x-6">
          <ProfileSelect
            label={FIELD_LABELS.country}
            value={draft.country}
            options={COUNTRY_OPTIONS}
            placeholder="Select country"
            onChange={(value) => set("country", value)}
          />
          <ProfileField
            label={FIELD_LABELS.state}
            value={draft.state}
            placeholder="California"
            onChange={(value) => set("state", value)}
          />
          {/* The two fields the home page's checklist asks for, in the section
              that was already called "Tennis profile" without them. Analysis
              orients forehand and backhand around these, and until now nothing
              in the product could set them. */}
          <ProfileSelect
            label={FIELD_LABELS.hand}
            value={draft.hand}
            options={HAND_OPTIONS}
            placeholder="Select hand"
            onChange={(value) => set("hand", value)}
          />
          <ProfileSelect
            label={FIELD_LABELS.backhand}
            value={draft.backhand}
            options={BACKHAND_OPTIONS}
            placeholder="Select backhand"
            onChange={(value) => set("backhand", value)}
          />
        </div>
      </SettingsCard>

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onDiscard={() => setDraft(saved)}
      />
    </div>
  );
}

function Note({ children }: { children: React.ReactNode }) {
  return <span className="text-[11px] text-[var(--ink-500)]">{children}</span>;
}

function ProfileField({
  label,
  value,
  onChange,
  type = "text",
  isDate = false,
  placeholder,
  hint,
  mono,
  missing,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: string;
  /** Renders `DateField` instead of `SettingsUnderlineInput`. `type` is ignored. */
  isDate?: boolean;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  /** Empty and counted by the strip above — mark it where the typing happens. */
  missing?: boolean;
}) {
  // Today, computed once per mount rather than per render — the calendar's
  // disabled-future-dates state has no reason to shift while the form is
  // open, and a value recomputed inline on every render would do exactly
  // that across a midnight boundary.
  const maxDate = useMemo(() => todayISO(), []);

  return (
    <SettingsField
      label={label}
      hint={hint}
      // `DateField`'s segments are not labelable elements — a wrapping
      // `<label>` forwards every click on them to the first labelable
      // descendant, the calendar `<button>`, so a segment can only be
      // reached by Tab. `DateField` takes its own `label` prop and sets it
      // as `aria-label`, so the accessible name survives dropping the
      // `<label>` wrapper here.
      labelless={isDate}
      required={missing}
    >
      {isDate ? (
        // A missing field is marked by the caption's asterisk, not by the
        // rule: blue belongs to the field that has focus.
        <DateField
          label={label}
          variant="underline"
          value={value}
          onChange={onChange}
          max={maxDate}
        />
      ) : (
        <SettingsUnderlineInput
          type={type}
          value={value}
          placeholder={placeholder}
          mono={mono}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </SettingsField>
  );
}

function ProfileSelect({
  label,
  value,
  options,
  placeholder,
  onChange,
}: {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  placeholder: string;
  onChange: (next: string) => void;
}) {
  return (
    <SettingsField label={label}>
      {/* `MenuSelect` — every settings select is this one, per the round-4
          ruling: it carries the underline rule itself, so a plain `<select>`
          never appears in these forms. */}
      <MenuSelect
        label={label}
        variant="underline"
        value={value || undefined}
        options={options}
        placeholder={placeholder}
        onChange={onChange}
      />
    </SettingsField>
  );
}
