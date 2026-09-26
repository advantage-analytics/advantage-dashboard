"use client";

import {
  SettingsCard,
  SettingsCardRow,
  SettingsCardTitle,
} from "@/components/dashboard/settings/settings-card";
import { MenuSelect, type MenuOption } from "@/components/ui/menu-select";
import {
  EVENTS_POLICIES,
  UPLOAD_POLICIES,
  uploadPolicyLabel,
  type EventsPolicy,
  type UploadPolicy,
} from "@/lib/workspace/types";

/** What each rung of the upload ladder means, in the menu's second line. */
const UPLOAD_POLICY_NOTE: Record<UploadPolicy, string> = {
  owner: "Only the owner sends team video",
  owner_coaches: "Coaches too — staff and players don't",
  staff: "Anyone on the coaching staff",
  everyone: "Players as well, where their row allows it",
};

/** One ladder's rungs as a MenuSelect's options — the label, then its note. */
function buildPolicyOptions<Policy extends UploadPolicy>(
  policies: readonly Policy[],
  notes: Record<Policy, string>,
): readonly MenuOption<Policy>[] {
  return policies.map((policy) => ({
    value: policy,
    label: uploadPolicyLabel(policy),
    description: notes[policy],
  }));
}

const UPLOAD_POLICY_OPTIONS = buildPolicyOptions(
  UPLOAD_POLICIES,
  UPLOAD_POLICY_NOTE,
);

/**
 * The events ladder: the same rungs and labels as uploads, minus "everyone" —
 * players are read-only on the schedule.
 */
const EVENTS_POLICY_NOTE: Record<EventsPolicy, string> = {
  owner: "Only the owner changes the schedule",
  owner_coaches: "Coaches too — staff can view only",
  staff: "Anyone on the coaching staff",
};

const EVENTS_POLICY_OPTIONS = buildPolicyOptions(
  EVENTS_POLICIES,
  EVENTS_POLICY_NOTE,
);

/** Appends the owner-only caveat unless the viewer can edit this row. */
function withOwnerNote(base: string, canEdit: boolean): string {
  return canEdit ? base : `${base} Only the owner can change this.`;
}

/**
 * Who may upload team matches, who may create events, and the one fixed rule.
 * Each ladder is the product's own menu, one line per rung, centre-aligned like
 * every other one-control row.
 *
 * Both ladders are the owner's alone to change — the RPC refuses anyone else —
 * because a coach who could edit one could lift an owner-only rule off
 * themselves. Everyone else on staff sees them, disabled, so the rules they are
 * working under are never a mystery.
 */
export function TeamPoliciesCard({
  uploadPolicy,
  onUploadPolicyChange,
  eventsPolicy,
  onEventsPolicyChange,
  canEditPolicies,
}: {
  uploadPolicy: UploadPolicy;
  onUploadPolicyChange: (next: UploadPolicy) => void;
  eventsPolicy: EventsPolicy;
  onEventsPolicyChange: (next: EventsPolicy) => void;
  /** The owner's alone — the RPC refuses anyone else for both ladders. */
  canEditPolicies: boolean;
}) {
  return (
    <SettingsCard className="gap-3.5">
      <SettingsCardTitle>Policies</SettingsCardTitle>

      <SettingsCardRow
        label="Who can upload team matches"
        description={withOwnerNote(
          "On-behalf uploads always show “added by”.",
          canEditPolicies,
        )}
        control={
          <MenuSelect
            label="Who can upload team matches"
            value={uploadPolicy}
            options={UPLOAD_POLICY_OPTIONS}
            onChange={onUploadPolicyChange}
            disabled={!canEditPolicies}
            note="A player's own row can still switch their uploads off."
          />
        }
      />

      <SettingsCardRow
        label="Who can create events"
        description={withOwnerNote(
          "Covers editing, scoring and deleting events too.",
          canEditPolicies,
        )}
        control={
          <MenuSelect
            label="Who can create events"
            value={eventsPolicy}
            options={EVENTS_POLICY_OPTIONS}
            onChange={onEventsPolicyChange}
            disabled={!canEditPolicies}
            note="Deleting an event also needs an owner or coach."
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
  );
}
