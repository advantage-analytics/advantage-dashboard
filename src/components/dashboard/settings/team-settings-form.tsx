"use client";

import { useState, useTransition } from "react";
import { X } from "lucide-react";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardRow,
  SettingsCardTitle,
  SettingsField,
  SettingsUnderlineInput,
} from "@/components/dashboard/settings/settings-card";
import {
  SettingsButton,
  SettingsIconButton,
} from "@/components/dashboard/settings/settings-button";
import { SettingsInlineSelect } from "@/components/dashboard/settings/settings-inline-select";
import { SettingsRadioGroup } from "@/components/dashboard/settings/settings-toggle";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { SettingsSaveBar } from "@/components/dashboard/settings/settings-save-bar";
import {
  inviteMember,
  removeMember,
  revokeInvite,
  saveTeamSettings,
} from "@/components/dashboard/settings/team-actions";
import type { TeamSettingsData } from "@/lib/data/team-settings-server";
import { getInitials } from "@/lib/data/match-utils";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { capitalize, cn } from "@/lib/utils";

const SQUAD_OPTIONS = [
  { value: "mens" as const, label: "Men's tennis" },
  { value: "womens" as const, label: "Women's tennis" },
];

const SURFACE_OPTIONS = [
  { value: "hard" as const, label: "Hard" },
  { value: "clay" as const, label: "Clay" },
  { value: "grass" as const, label: "Grass" },
  { value: "carpet" as const, label: "Carpet" },
];

type Surface = (typeof SURFACE_OPTIONS)[number]["value"];

interface IdentityDraft {
  schoolName: string;
  team: "mens" | "womens";
  conference: string;
  homeVenue: string;
  defaultSurface: Surface | "";
  season: string;
  rosterVisible: boolean;
  playersCanUpload: boolean;
}

function toDraft(data: TeamSettingsData): IdentityDraft {
  return {
    schoolName: data.program.schoolName,
    team: data.program.team,
    conference: data.program.conference ?? "",
    homeVenue: data.program.homeVenue ?? "",
    defaultSurface: (data.program.defaultSurface as Surface | null) ?? "",
    season: data.program.season ?? "",
    rosterVisible: data.program.rosterVisible,
    playersCanUpload: data.program.playersCanUpload,
  };
}

/**
 * Settings › Team.
 *
 * Identity and the two policies are one form with one save, because they are
 * one row in `programs` — a policy that saved on click while the venue beside
 * it waited for a button would be two different contracts on one card.
 *
 * The roster is not part of that form. Inviting and removing people are
 * discrete acts against other rows, so they commit immediately and say so.
 */
export function TeamSettingsForm({ data }: { data: TeamSettingsData }) {
  const [saved, setSaved] = useState<IdentityDraft>(() => toDraft(data));
  const [draft, setDraft] = useState<IdentityDraft>(() => toDraft(data));
  const [inviteEmail, setInviteEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [isRosterBusy, startRosterWork] = useTransition();

  const isDirty = (Object.keys(draft) as (keyof IdentityDraft)[]).some(
    (key) => draft[key] !== saved[key]
  );

  const set = <K extends keyof IdentityDraft>(key: K, value: IdentityDraft[K]) =>
    setDraft((previous) => ({ ...previous, [key]: value }));

  const handleSave = () => {
    setError(null);
    startSaving(async () => {
      const result = await saveTeamSettings({
        schoolName: draft.schoolName,
        team: draft.team,
        conference: draft.conference,
        homeVenue: draft.homeVenue,
        defaultSurface: draft.defaultSurface === "" ? null : draft.defaultSurface,
        season: draft.season,
        rosterVisible: draft.rosterVisible,
        playersCanUpload: draft.playersCanUpload,
      });
      if (result.ok) setSaved(draft);
      else setError(result.error);
    });
  };

  const handleInvite = () => {
    const email = inviteEmail.trim();
    if (!email) return;
    setError(null);
    startRosterWork(async () => {
      const result = await inviteMember({
        email,
        // Every invitation from this screen joins as a player. Promoting
        // someone is a role change, and roles v1 has no editor for one.
        role: "player",
      });
      if (result.ok) setInviteEmail("");
      else setError(result.error);
    });
  };

  const activeCount = data.members.length;
  const invitedCount = data.invites.length;

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      {error && (
        <SettingsAlert
          type="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      {/* ── Identity ─────────────────────────────────────────────────────── */}
      <SettingsCard className="gap-[18px]">
        <div className="flex items-center gap-4">
          <div className="flex size-[52px] shrink-0 items-center justify-center rounded-[8px] bg-[var(--surface-subtle)] text-[10px] font-medium tracking-[1px] text-[var(--ink-600)]">
            {getInitials(saved.schoolName)}
          </div>
          <div className="min-w-0 flex-1">
            <div className="text-[13px] font-medium text-[var(--ink-900)]">
              Team identity
            </div>
            <div className="mt-[3px] text-[11px] text-[var(--ink-500)]">
              Name and home courts — used on team match cards and shared
              reports.
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-5 border-t border-[var(--border-hairline)] pt-4 sm:grid-cols-2 sm:gap-x-6">
          <TextField
            label="Program name"
            value={draft.schoolName}
            onChange={(value) => set("schoolName", value)}
          />
          <SettingsField label="Squad">
            <SettingsInlineSelect
              label="Squad"
              value={draft.team}
              options={SQUAD_OPTIONS}
              onChange={(value) => set("team", value)}
              className="w-full justify-between border-0 border-b border-[var(--border-field)] px-0"
            />
          </SettingsField>
          <TextField
            label="Home venue"
            value={draft.homeVenue}
            placeholder="Whitfield Tennis Center"
            onChange={(value) => set("homeVenue", value)}
          />
          <SettingsField label="Default surface">
            <SettingsInlineSelect
              label="Default surface"
              value={draft.defaultSurface || "hard"}
              options={SURFACE_OPTIONS}
              onChange={(value) => set("defaultSurface", value)}
              className="w-full justify-between border-0 border-b border-[var(--border-field)] px-0"
            />
          </SettingsField>
          <TextField
            label="Conference"
            value={draft.conference}
            placeholder="Pacific Coast"
            onChange={(value) => set("conference", value)}
          />
          <TextField
            label="Season"
            value={draft.season}
            placeholder="2026–27"
            mono
            onChange={(value) => set("season", value)}
          />
        </div>

        <SettingsCardFootnote>
          Venue and surface prefill the upload wizard — players won&apos;t have
          to type them per match.
        </SettingsCardFootnote>
      </SettingsCard>

      {/* ── Members ──────────────────────────────────────────────────────── */}
      <SettingsCard>
        <SettingsCardTitle
          trailing={
            <>
              <input
                type="email"
                value={inviteEmail}
                onChange={(event) => setInviteEmail(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") handleInvite();
                }}
                placeholder="email@school.edu"
                aria-label="Invite by email"
                className="h-[30px] w-[190px] rounded-[6px] border border-[var(--border-field)] px-3 text-[12px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)] focus:border-[var(--blue)]"
              />
              <SettingsButton
                variant="outline"
                size="sm"
                onClick={handleInvite}
                disabled={isRosterBusy || inviteEmail.trim() === ""}
              >
                Invite
              </SettingsButton>
            </>
          }
        >
          <span className="flex items-baseline gap-2.5">
            Members
            <span className="text-[11px] font-normal text-[var(--ink-500)]">
              {activeCount} active · {invitedCount} invited
            </span>
          </span>
        </SettingsCardTitle>

        <div className="pt-3">
          {data.members.map((member) => (
            <div
              key={member.userId}
              className="flex items-center border-t border-[var(--border-hairline)] py-2.5"
            >
              <span className="mr-2.5 flex size-[26px] shrink-0 items-center justify-center rounded-full bg-[var(--surface-subtle)] text-[9px] font-medium text-[var(--ink-700)]">
                {getInitials(member.name)}
              </span>
              <span className="w-[170px] truncate text-[13px] font-medium text-[var(--ink-900)]">
                {member.name}
              </span>
              <RolePill>{capitalize(member.role)}</RolePill>
              {member.role === "owner" ? (
                <span className="ml-auto text-[11px] text-[var(--ink-400)]">
                  owner
                </span>
              ) : (
                <SettingsIconButton
                  label={`Remove ${member.name}`}
                  tone="danger"
                  className="ml-auto"
                  disabled={isRosterBusy}
                  onClick={() =>
                    startRosterWork(async () => {
                      const result = await removeMember(member.userId);
                      if (!result.ok) setError(result.error);
                    })
                  }
                >
                  <X className="size-3" strokeWidth={1.5} />
                </SettingsIconButton>
              )}
            </div>
          ))}

          {data.invites.map((invite) => (
            <div
              key={invite.id}
              className="flex items-center border-t border-[var(--border-hairline)] py-2.5"
            >
              <span
                aria-hidden="true"
                className="mr-2.5 size-[26px] shrink-0 rounded-full border border-dashed border-[var(--ink-300)]"
              />
              <span className="w-[170px] truncate text-[12px] text-[var(--ink-500)]">
                {invite.email}
              </span>
              <span className="rounded-full border border-dashed border-[var(--ink-300)] px-2.5 py-0.5 text-[11px] text-[var(--ink-500)]">
                Invited {formatInviteDate(invite.createdAt)}
              </span>
              <button
                type="button"
                disabled={isRosterBusy}
                onClick={() =>
                  startRosterWork(async () => {
                    const result = await inviteMember({
                      email: invite.email,
                      role: invite.role === "owner" ? "player" : invite.role,
                    });
                    if (!result.ok) setError(result.error);
                  })
                }
                className="ml-auto text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] disabled:opacity-50"
              >
                Resend
              </button>
              <SettingsIconButton
                label={`Withdraw the invite to ${invite.email}`}
                tone="danger"
                disabled={isRosterBusy}
                className="ml-3"
                onClick={() =>
                  startRosterWork(async () => {
                    const result = await revokeInvite(invite.id);
                    if (!result.ok) setError(result.error);
                  })
                }
              >
                <X className="size-3" strokeWidth={1.5} />
              </SettingsIconButton>
            </div>
          ))}

          {activeCount === 0 && invitedCount === 0 && (
            <p className="border-t border-[var(--border-hairline)] py-3 text-[12px] text-[var(--ink-500)]">
              Nobody on the roster yet. Invite someone by email above.
            </p>
          )}
        </div>

        <SettingsCardFootnote>
          Roles v1: coach and player only. Invitations from this screen join as
          players —{" "}
          <a
            href={`mailto:${SUPPORT_EMAIL}?subject=Promote%20a%20coach`}
            className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
          >
            ask support
          </a>{" "}
          to add another coach.
        </SettingsCardFootnote>
      </SettingsCard>

      {/* ── Policies ─────────────────────────────────────────────────────── */}
      <SettingsCard className="gap-3.5">
        <SettingsCardTitle>Policies</SettingsCardTitle>

        <SettingsCardRow
          align="start"
          label="Who can upload team matches"
          description="On-behalf uploads always show “added by”."
          control={
            <SettingsRadioGroup
              label="Who can upload team matches"
              value={draft.playersCanUpload ? "anyone" : "coaches"}
              options={[
                { value: "coaches", label: "Coaches only" },
                { value: "anyone", label: "Anyone on the team" },
              ]}
              onChange={(value) => set("playersCanUpload", value === "anyone")}
            />
          }
        />

        <SettingsCardRow
          align="start"
          label="Roster visibility"
          description="Profiles are read-only mirrors either way; players always see their own."
          control={
            <SettingsRadioGroup
              label="Roster visibility"
              value={draft.rosterVisible ? "everyone" : "coaches"}
              options={[
                { value: "everyone", label: "Everyone on the team" },
                { value: "coaches", label: "Coaches only" },
              ]}
              onChange={(value) => set("rosterVisible", value === "everyone")}
            />
          }
        />

        <SettingsCardRow
          label="Personal uploads stay private"
          description="Players share personal matches to the program per match — never automatically."
          control={
            <span className="text-[11px] text-[var(--ink-500)]">fixed</span>
          }
        />
      </SettingsCard>

      {/* The two acts this screen deliberately cannot perform. Both change who
          owns athlete data, so they go through a person. */}
      <div className="flex gap-4 text-[11px]">
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Transfer%20program%20ownership`}
          className="text-[var(--ink-600)] hover:text-[var(--ink-900)]"
        >
          Transfer ownership
        </a>
        <a
          href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20program`}
          className="text-[var(--danger)] hover:text-[var(--danger-hover)]"
        >
          Delete program
        </a>
      </div>

      <SettingsSaveBar
        isDirty={isDirty}
        isSaving={isSaving}
        onSave={handleSave}
        onDiscard={() => setDraft(saved)}
      />
    </div>
  );
}

/** Underline text field — the round-4 form vocabulary, shared with Profile. */
function TextField({
  label,
  value,
  placeholder,
  mono,
  onChange,
}: {
  label: string;
  value: string;
  placeholder?: string;
  mono?: boolean;
  onChange: (next: string) => void;
}) {
  return (
    <SettingsField label={label}>
      <SettingsUnderlineInput
        type="text"
        value={value}
        placeholder={placeholder}
        mono={mono}
        className="h-8"
        onChange={(event) => onChange(event.target.value)}
      />
    </SettingsField>
  );
}

function RolePill({ children }: { children: React.ReactNode }) {
  return (
    <span className="rounded-full bg-[var(--surface-subtle)] px-2.5 py-0.5 text-[11px] text-[var(--ink-600)]">
      {children}
    </span>
  );
}

function RosterButton({
  label,
  onClick,
  disabled,
  className,
  children,
}: {
  label: string;
  onClick: () => void;
  disabled?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      onClick={onClick}
      disabled={disabled}
      className={cn(
        "flex size-5 items-center justify-center rounded-[6px] text-[var(--ink-300)] transition-colors duration-150",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]",
        disabled
          ? "cursor-not-allowed opacity-50"
          : "cursor-pointer hover:bg-[var(--surface-subtle)] hover:text-[var(--danger)]",
        className
      )}
    >
      {children}
    </button>
  );
}

/** `2026-08-04T…` → `Aug 4`. */
function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}
