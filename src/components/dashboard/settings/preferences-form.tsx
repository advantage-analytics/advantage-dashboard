"use client";

import { useState } from "react";
import Link from "next/link";
import {
  SettingsCard,
  SettingsCardFootnote,
  SettingsCardRow,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { SettingsToggle } from "@/components/dashboard/settings/settings-toggle";
import { MenuSelect } from "@/components/ui/menu-select";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { savePreferences } from "@/components/dashboard/settings/preferences-actions";
import { capitalize } from "@/lib/utils";
import type {
  DefaultWorkspace,
  Preferences,
  ReportEntryPoint,
} from "@/lib/data/preferences-server";
import type { DistanceUnit } from "@/lib/format/distance";

const WORKSPACE_OPTIONS: readonly { value: DefaultWorkspace; label: string }[] =
  [
    { value: "last_used", label: "Last used" },
    { value: "personal", label: "Personal" },
    { value: "team", label: "Team" },
  ];

const REPORT_OPTIONS: readonly { value: ReportEntryPoint; label: string }[] = [
  { value: "story", label: "The story" },
  { value: "stats", label: "Statistics" },
  { value: "video", label: "Video" },
];

const UNIT_OPTIONS: readonly {
  value: DistanceUnit;
  label: string;
  description: string;
}[] = [
  {
    value: "ft",
    label: "Feet",
    description: "Distances read 12 ft, speeds in mph",
  },
  {
    value: "m",
    label: "Metres",
    description: "Distances read 3.5 m, speeds in km/h",
  },
];

/**
 * Settings › Preferences.
 *
 * Saves on change, with no Save button and no unsaved-changes bar. Every
 * control here is a single independent fact — there is no state in which
 * half of them are true and the person has to commit the other half — and a
 * page of toggles that silently forgets what you did because you navigated
 * away is the worse failure.
 *
 * Every switch on the Notifications card is read by a sender. That is the
 * rule for adding one: a switch for mail nothing sends (the weekly digest, whose
 * column exists but whose cron does not) stays off this page until it is wired,
 * because a page that offers to stop mail that never came teaches people not to
 * trust the switches that do work. The labels are the exact strings the
 * templates print in their `preferenceNote()` footers.
 */
export function PreferencesForm({
  initial,
  plan,
  showTeamNotifications,
}: {
  initial: Preferences;
  /** From `users.plan` — what you pay for, never what you see. */
  plan: string;
  /**
   * Owner or coach of the active team. The team switches gate mail that only
   * staff receive (join requests, the allowance), so a player would be turning
   * off nothing.
   */
  showTeamNotifications: boolean;
}) {
  const [preferences, setPreferences] = useState(initial);
  const [error, setError] = useState<string | null>(null);

  const update = async (patch: Partial<Preferences>) => {
    const previous = preferences;
    const next = { ...preferences, ...patch };
    setPreferences(next);
    setError(null);

    const result = await savePreferences(next);
    if (!result.ok) {
      // Put the control back where it was. A toggle that stayed flipped after a
      // failed write is a lie the person has no way to notice.
      setPreferences(previous);
      setError(result.error);
    }
  };

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      {error && (
        <SettingsAlert
          type="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      <SettingsCard>
        <SettingsCardTitle className="pb-2">Notifications</SettingsCardTitle>

        <NotificationGroup label="Your matches" />
        <SettingsCardRow
          label="Email me when analysis is ready"
          description="Processing has no fixed turnaround — this is how you'll know."
          control={
            <SettingsToggle
              label="Email me when analysis is ready"
              checked={preferences.notifyAnalysisReady}
              onChange={(value) => update({ notifyAnalysisReady: value })}
            />
          }
        />
        <SettingsCardRow
          label="Email me if analysis fails"
          description="Including why, and whether your video is still held for a retry."
          control={
            <SettingsToggle
              label="Email me if analysis fails"
              checked={preferences.notifyAnalysisFailed}
              onChange={(value) => update({ notifyAnalysisFailed: value })}
            />
          }
        />

        {showTeamNotifications && (
          <>
            <NotificationGroup label="Your team" />
            <SettingsCardRow
              label="Team activity"
              description="Someone asks to join, accepts an invitation, or leaves the team."
              control={
                <SettingsToggle
                  label="Team activity"
                  checked={preferences.notifyTeamActivity}
                  onChange={(value) => update({ notifyTeamActivity: value })}
                />
              }
            />
            <SettingsCardRow
              label="Analysis allowance alerts"
              description="Once at 80% of the month's video analysis time, and once when it's spent."
              control={
                <SettingsToggle
                  label="Analysis allowance alerts"
                  checked={preferences.notifyUsageAlerts}
                  onChange={(value) => update({ notifyUsageAlerts: value })}
                />
              }
            />
          </>
        )}

        {/* No top border: the last row already drew a hairline, and a second
            rule two pixels below it reads as a mistake (DS › Settings). */}
        <SettingsCardFootnote className="border-t-0 pt-0">
          Invitations, claim decisions, ownership changes and account security
          emails always send.
        </SettingsCardFootnote>
      </SettingsCard>

      <SettingsCard>
        <SettingsCardTitle className="pb-2">Defaults</SettingsCardTitle>

        <SettingsCardRow
          label="Workspace on sign-in"
          control={
            <MenuSelect
              label="Workspace on sign-in"
              value={preferences.defaultWorkspace}
              options={WORKSPACE_OPTIONS}
              onChange={(value) => update({ defaultWorkspace: value })}
            />
          }
        />
        <SettingsCardRow
          label="Match report opens at"
          control={
            <MenuSelect
              label="Match report opens at"
              value={preferences.matchReportOpensAt}
              options={REPORT_OPTIONS}
              onChange={(value) => update({ matchReportOpensAt: value })}
            />
          }
        />
        <SettingsCardRow
          label="Units"
          description="Court distances, ball speed and contact depth"
          control={
            <MenuSelect
              label="Units"
              value={preferences.unit}
              options={UNIT_OPTIONS}
              onChange={(value) => update({ unit: value })}
              note="Applies to every chart and readout in your workspaces. Scores and set counts never change."
              width={208}
            />
          }
        />
        <SettingsCardRow
          label="Stat definitions on hover"
          description="Glossary cards on every stat label, everywhere."
          control={
            <SettingsToggle
              label="Stat definitions on hover"
              checked={preferences.statDefinitionsOnHover}
              onChange={(value) => update({ statDefinitionsOnHover: value })}
            />
          }
        />
      </SettingsCard>

      {/* Plan is stated here and changed on its own page. Team roles live
          under Settings › Teams, per team. */}
      <SettingsCard className="flex-row items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-[var(--ink-900)]">
            Plan: <b className="font-medium">{capitalize(plan)}</b>
          </div>
        </div>
        <Link
          href="/dashboard/settings/plan"
          className="shrink-0 text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)]"
        >
          Manage plan
        </Link>
      </SettingsCard>
    </div>
  );
}

/**
 * The label that splits one card of switches into who they are for.
 * `SettingsSectionHeading` is a page-level `01 · Title` and too loud for a
 * divider inside a card; this is the 11px muted register of a row
 * description, one weight up, sitting above the row it introduces.
 *
 * Sentence case, not tracked caps: "YOUR MATCHES" shouted over rows whose
 * own labels are quiet 12px sentences, and read as a second card title.
 */
function NotificationGroup({ label }: { label: string }) {
  return (
    <div className="pt-3 pb-1 text-[11px] font-medium text-[var(--ink-500)] first-of-type:pt-0">
      {label}
    </div>
  );
}
