"use client";

import { useState } from "react";
import Link from "next/link";
import {
  SettingsCard,
  SettingsCardRow,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { SettingsToggle } from "@/components/dashboard/settings/settings-toggle";
import { SettingsInlineSelect } from "@/components/dashboard/settings/settings-inline-select";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { savePreferences } from "@/components/dashboard/settings/preferences-actions";
import { capitalize } from "@/lib/utils";
import type {
  DefaultWorkspace,
  Preferences,
  ReportEntryPoint,
} from "@/lib/data/preferences-server";

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

/**
 * Settings › Preferences.
 *
 * Saves on change, with no Save button and no unsaved-changes bar. Every
 * control here is a single independent fact — there is no state in which
 * half of them are true and the person has to commit the other half — and a
 * page of toggles that silently forgets what you did because you navigated
 * away is the worse failure.
 */
export function PreferencesForm({
  initial,
  role,
  plan,
  showTeamDigest,
}: {
  initial: Preferences;
  /** From `users.role` — what shapes the app, never what you pay for. */
  role: string | null;
  /** From `users.plan` — what you pay for, never what you see. */
  plan: string;
  /** The digest is a program artefact; outside a team there is nothing to send. */
  showTeamDigest: boolean;
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
          control={
            <SettingsToggle
              label="Email me if analysis fails"
              checked={preferences.notifyAnalysisFailed}
              onChange={(value) => update({ notifyAnalysisFailed: value })}
            />
          }
        />
        {showTeamDigest && (
          <SettingsCardRow
            label="Weekly team digest"
            description="Coaches only — Monday summary of the weekend's results."
            control={
              <SettingsToggle
                label="Weekly team digest"
                checked={preferences.weeklyTeamDigest}
                onChange={(value) => update({ weeklyTeamDigest: value })}
              />
            }
          />
        )}
      </SettingsCard>

      <SettingsCard>
        <SettingsCardTitle className="pb-2">Defaults</SettingsCardTitle>

        <SettingsCardRow
          label="Workspace on sign-in"
          control={
            <SettingsInlineSelect
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
            <SettingsInlineSelect
              label="Match report opens at"
              value={preferences.matchReportOpensAt}
              options={REPORT_OPTIONS}
              onChange={(value) => update({ matchReportOpensAt: value })}
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

      {/* Role and plan, stated side by side and edited nowhere near each other.
          They were one column once, which is how changing a role could change
          what somebody paid for. */}
      <SettingsCard className="flex-row items-center gap-4">
        <div className="min-w-0 flex-1">
          <div className="text-[12px] text-[var(--ink-900)]">
            Role: <b className="font-medium">{role ? capitalize(role) : "Not set"}</b> · Plan:{" "}
            <b className="font-medium">{capitalize(plan)}</b>
          </div>
          <div className="mt-0.5 text-[11px] text-[var(--ink-500)]">
            Separate columns — editing your profile can never touch your plan.
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

