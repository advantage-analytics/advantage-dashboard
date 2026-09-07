"use client";

import {
  SettingsCard,
  SettingsCardRow,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import {
  SettingsMenuSelect,
  type MenuOption,
} from "@/components/dashboard/settings/settings-menu-select";
import {
  UPLOAD_POLICIES,
  uploadPolicyLabel,
  type UploadPolicy,
} from "@/lib/workspace/types";

/** What each rung of the ladder means, in the menu's second line. */
const POLICY_NOTE: Record<UploadPolicy, string> = {
  owner: "Only the owner sends team video",
  owner_coaches: "Coaches too — staff and players don't",
  staff: "Anyone on the coaching staff",
  everyone: "Players as well, where their row allows it",
};

const UPLOAD_POLICY_OPTIONS: readonly MenuOption<UploadPolicy>[] = UPLOAD_POLICIES.map(
  (policy) => ({
    value: policy,
    label: uploadPolicyLabel(policy),
    description: POLICY_NOTE[policy],
  })
);

/**
 * The two policies. The first is the product's own menu rather than the
 * radio stack it was — four rungs now (owner · owner and coaches · all staff ·
 * everyone), one line each on what the rung means, and it sits centre-aligned
 * like every other one-control row.
 */
export function TeamPoliciesCard({
  uploadPolicy,
  onChange,
}: {
  uploadPolicy: UploadPolicy;
  onChange: (next: UploadPolicy) => void;
}) {
  return (
    <SettingsCard className="gap-3.5">
      <SettingsCardTitle>Policies</SettingsCardTitle>

      <SettingsCardRow
        label="Who can upload team matches"
        description="On-behalf uploads always show “added by”."
        control={
          <SettingsMenuSelect
            label="Who can upload team matches"
            value={uploadPolicy}
            options={UPLOAD_POLICY_OPTIONS}
            onChange={onChange}
            note="A player's own row can still switch their uploads off."
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
