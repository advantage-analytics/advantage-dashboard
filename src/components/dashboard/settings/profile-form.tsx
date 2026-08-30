"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { AlertCircle } from "lucide-react";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import {
  SettingsField,
  SettingsSectionHeading,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import { SettingsSaveBar } from "@/components/dashboard/settings/settings-save-bar";
import { saveProfile } from "@/components/dashboard/settings/actions";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { cn } from "@/lib/utils";

/**
 * Settings › Profile.
 *
 * Completeness reads as a line — "1 field left · Phone number" — not as a ring,
 * a banner and a celebration screen. The three of them said the same thing in
 * three registers, and the loudest was a full-width onboarding card that
 * appeared every visit until the last field was filled.
 *
 * Editing is a draft with one commit, which is what the save bar exists for.
 * Role lives here and pays for nothing: what you see, never what you owe.
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
  "role",
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
  role: "Role",
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

const ROLE_OPTIONS = [
  { value: "coach", label: "Coach" },
  { value: "player", label: "Player" },
  { value: "parent", label: "Parent" },
  { value: "academy", label: "Academy" },
];

export type ProfileDraft = Record<FieldName, string>;

export function ProfileForm({ initial }: { initial: ProfileDraft }) {
  const { active, viewer } = useWorkspace();

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
    [draft]
  );

  const handleSave = useCallback(() => {
    setError(null);
    startSaving(async () => {
      const result = await saveProfile(draft);
      if (result.ok) setSaved(draft);
      else setError(result.error);
    });
  }, [draft]);

  const displayName =
    `${draft.firstName} ${draft.lastName}`.trim() || viewer.name;
  const roleLabel = ROLE_OPTIONS.find(
    (option) => option.value === draft.role
  )?.label;

  return (
    <div className="flex max-w-[660px] flex-col gap-10">
      {error && (
        <SettingsAlert
          type="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {/* Identity strip */}
      <div className="flex items-center gap-[18px] border-b border-[var(--border-hairline)] pb-6">
        <span className="flex size-14 shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[19px] font-light text-[var(--ink-700)]">
          {viewer.initials}
        </span>
        <div className="min-w-0 flex-1">
          <div className="truncate text-[24px] font-light tracking-[-0.4px] text-[var(--ink-900)]">
            {displayName}
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {roleLabel && <IdentityPill>{roleLabel}</IdentityPill>}
            {active.kind === "team" && (
              <IdentityPill>{active.name}</IdentityPill>
            )}
            {viewer.memberSince && (
              <span className="mono text-[11px] text-[var(--ink-500)]">
                since {viewer.memberSince}
              </span>
            )}
          </div>
        </div>

        {/* Completeness. One line, and only while something is actually
            missing — a badge that says "0 fields left" is decoration. */}
        {missing.length > 0 && (
          <div className="flex shrink-0 items-center gap-2.5 rounded-[8px] border border-[var(--border-card)] px-3 py-2">
            <AlertCircle
              className="size-[13px] text-[var(--ink-600)]"
              strokeWidth={1.5}
              aria-hidden="true"
            />
            <div>
              <div className="text-[11px] text-[var(--ink-900)]">
                {missing.length} field{missing.length === 1 ? "" : "s"} left
              </div>
              <div className="mt-px text-[11px] text-[var(--ink-500)]">
                {FIELD_LABELS[missing[0]]}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 01 · General information */}
      <section className="flex flex-col gap-[22px]">
        <SettingsSectionHeading
          number="01"
          title="General information"
          note="Only your name is visible to teammates"
        />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-7">
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
            type="date"
            mono
            value={draft.birthdate}
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
      </section>

      {/* 02 · Tennis profile */}
      <section className="flex flex-col gap-[22px]">
        <SettingsSectionHeading number="02" title="Tennis profile" />
        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 sm:gap-x-7">
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

        <div className="flex flex-col gap-2.5">
          <span className="text-[11px] text-[var(--ink-600)]">Role</span>
          <div className="flex flex-wrap gap-2">
            {ROLE_OPTIONS.map((option) => {
              const isSelected = draft.role === option.value;
              return (
                <button
                  key={option.value}
                  type="button"
                  aria-pressed={isSelected}
                  onClick={() => set("role", option.value)}
                  className={cn(
                    "cursor-pointer rounded-full border px-3.5 py-[5px] text-[12px] transition-colors duration-150",
                    "focus-visible:outline-none",
                    isSelected
                      ? "border-[var(--blue)] bg-[var(--blue-soft)] text-[var(--ink-900)]"
                      : "border-[var(--border-field)] text-[var(--ink-700)] hover:border-[var(--ink-300)]"
                  )}
                >
                  {option.label}
                </button>
              );
            })}
          </div>
          <span className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
            Role shapes what you see — coaches get roster and team surfaces. It
            never changes what you pay for; that&apos;s{" "}
            <Link
              href="/dashboard/settings/plan"
              className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              Plan
            </Link>
            .
          </span>
        </div>
      </section>

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onDiscard={() => setDraft(saved)}
      />
    </div>
  );
}

function IdentityPill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-[3px] text-[11px] text-[var(--ink-600)]">
      {children}
    </span>
  );
}

function ProfileField({
  label,
  value,
  onChange,
  type = "text",
  placeholder,
  hint,
  mono,
  missing,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  type?: string;
  placeholder?: string;
  hint?: string;
  mono?: boolean;
  /** Empty and counted by the strip above — mark it where the typing happens. */
  missing?: boolean;
}) {
  return (
    <SettingsField
      label={label}
      hint={hint}
      marker={
        missing && (
          <span className="text-[10px] font-medium uppercase tracking-[1.2px] text-[var(--blue)]">
            Missing
          </span>
        )
      }
    >
      <SettingsUnderlineInput
        type={type}
        value={value}
        placeholder={placeholder}
        mono={mono}
        emphasis={missing}
        onChange={(event) => onChange(event.target.value)}
      />
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
      <select
        value={value}
        onChange={(event) => onChange(event.target.value)}
        data-focus-ring="none" /* the border-b above carries focus */
        className={cn(
          "h-[34px] cursor-pointer border-b border-[var(--border-field)] bg-transparent text-[13px] outline-none transition-colors focus:border-[var(--blue)]",
          value === "" ? "text-[var(--ink-400)]" : "text-[var(--ink-900)]"
        )}
      >
        <option value="">{placeholder}</option>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </SettingsField>
  );
}
