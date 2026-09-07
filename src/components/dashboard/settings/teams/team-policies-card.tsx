"use client";

import {
  SettingsCard,
  SettingsCardRow,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { SettingsInlineSelect } from "@/components/dashboard/settings/settings-inline-select";

const UPLOAD_POLICY_OPTIONS = [
  { value: "coaches" as const, label: "Coaches only" },
  { value: "anyone" as const, label: "Anyone on the team" },
];

/**
 * The two policies. The first is a select rather than the radio stack it was:
 * one line, centre-aligned like every other one-control row, and the same
 * control the Squad and Surface fields already use. Two options today; the
 * menu has room for a third without the row growing.
 */
export function TeamPoliciesCard({
  playersCanUpload,
  onChange,
}: {
  playersCanUpload: boolean;
  onChange: (next: boolean) => void;
}) {
  return (
    <SettingsCard className="gap-3.5">
      <SettingsCardTitle>Policies</SettingsCardTitle>

      <SettingsCardRow
        label="Who can upload team matches"
        description="On-behalf uploads always show “added by”."
        control={
          <SettingsInlineSelect
            label="Who can upload team matches"
            value={playersCanUpload ? "anyone" : "coaches"}
            options={UPLOAD_POLICY_OPTIONS}
            onChange={(value) => onChange(value === "anyone")}
          />
        }
      />

      <SettingsCardRow
        label="Personal uploads stay private"
        description="Players share personal matches to the program per match — never automatically."
        control={<span className="text-[11px] text-[var(--ink-500)]">fixed</span>}
      />
    </SettingsCard>
  );
}
