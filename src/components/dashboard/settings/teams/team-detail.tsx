"use client";

import { useState, useTransition } from "react";
import { SettingsCard } from "@/components/dashboard/settings/settings-card";
import { SettingsAlert } from "@/components/dashboard/settings/settings-alert";
import { SettingsSaveBar } from "@/components/dashboard/settings/settings-save-bar";
import { saveTeamSettings } from "@/components/dashboard/settings/team-actions";
import { ProgramHoursSummary } from "@/components/dashboard/settings/teams/program-hours-summary";
import { TeamIdentityCard } from "@/components/dashboard/settings/teams/team-identity-card";
import { TeamMembersCard } from "@/components/dashboard/settings/teams/team-members-card";
import { TeamPoliciesCard } from "@/components/dashboard/settings/teams/team-policies-card";
import { TransferOwnershipDialog } from "@/components/dashboard/settings/teams/transfer-ownership-dialog";
import {
  toDraft,
  type IdentityDraft,
} from "@/components/dashboard/settings/teams/types";
import type {
  MemberRole,
  TeamMember,
  TeamSettingsData,
} from "@/lib/data/team-settings-server";
import type { SeatUsage } from "@/lib/data/teams-server";
import type { ProgramUsage } from "@/lib/data/usage-server";
import type { ProgramRole } from "@/lib/workspace/types";
import { SUPPORT_EMAIL } from "@/lib/constants";

/**
 * One program's page under Settings › Teams.
 *
 * Identity and the upload policy are one form with one save, because they are
 * one row in `programs` — a policy that saved on click while the venue beside
 * it waited for a button would be two contracts on one page. Membership is
 * not part of that form: it is read here and edited on the Roster. Ownership
 * starts from a member's row and commits in its own dialog, immediately.
 *
 * What renders depends on the viewer's standing on THIS program, which is not
 * necessarily their active workspace: a player gets hours, a read-only
 * identity and the member list; staff get the form; the owner also gets
 * "Make owner" and the delete row.
 */
export function TeamDetail({
  programId,
  data,
  crestUrl,
  usage,
  pendingSeconds,
  seats,
  viewerId,
  viewerName,
  viewerRole,
  isActiveWorkspace,
}: {
  programId: string;
  data: TeamSettingsData;
  crestUrl: string | null;
  usage: ProgramUsage;
  pendingSeconds: number;
  seats: SeatUsage;
  viewerId: string;
  viewerName: string;
  viewerRole: ProgramRole;
  isActiveWorkspace: boolean;
}) {
  const [saved, setSaved] = useState<IdentityDraft>(() => toDraft(data));
  const [draft, setDraft] = useState<IdentityDraft>(() => toDraft(data));
  const [error, setError] = useState<string | null>(null);
  const [isSaving, startSaving] = useTransition();
  const [transferTarget, setTransferTarget] = useState<TeamMember | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  // Bumped on every open so the dialog remounts with fresh state — see its
  // own comment on why it has no reset effect.
  const [transferSession, setTransferSession] = useState(0);

  const isOwner = viewerRole === "owner";
  const isStaff = viewerRole !== "player";

  const isDirty = (Object.keys(draft) as (keyof IdentityDraft)[]).some(
    (key) => draft[key] !== saved[key],
  );

  const set = <K extends keyof IdentityDraft>(
    key: K,
    value: IdentityDraft[K],
  ) => setDraft((previous) => ({ ...previous, [key]: value }));

  const handleSave = () => {
    setError(null);
    startSaving(async () => {
      const result = await saveTeamSettings({
        programId,
        schoolName: draft.schoolName,
        team: draft.team,
        conference: draft.conference,
        homeVenue: draft.homeVenue,
        defaultSurface:
          draft.defaultSurface === "" ? null : draft.defaultSurface,
        season: draft.season,
        uploadPolicy: draft.uploadPolicy,
      });
      if (result.ok) setSaved(draft);
      else setError(result.error);
    });
  };

  const roles = new Map<string, MemberRole>(
    data.members.map((member) => [member.userId, member.role]),
  );

  return (
    <div className="flex max-w-[640px] flex-col gap-5">
      {error && (
        <SettingsAlert
          type="error"
          message={error}
          onDismiss={() => setError(null)}
        />
      )}

      <ProgramHoursSummary
        usage={usage}
        pendingSeconds={pendingSeconds}
        roles={roles}
        viewerId={viewerId}
      />

      <TeamIdentityCard
        programId={programId}
        crestUrl={crestUrl}
        draft={draft}
        onChange={set}
        canEdit={isStaff}
        isOwner={isOwner}
        ownerName={data.ownerName}
        onCrestError={setError}
      />

      <TeamMembersCard
        programId={programId}
        isActiveWorkspace={isActiveWorkspace}
        members={data.members}
        invites={data.invites}
        seats={seats}
        viewerId={viewerId}
        viewerRole={viewerRole}
        onError={setError}
        onMakeOwner={(member) => {
          setTransferTarget(member);
          setTransferSession((session) => session + 1);
          setTransferOpen(true);
        }}
      />

      {isStaff && (
        <TeamPoliciesCard
          uploadPolicy={draft.uploadPolicy}
          onChange={(next) => set("uploadPolicy", next)}
        />
      )}

      {isOwner && (
        <SettingsCard className="gap-0 py-4">
          <div className="flex items-center gap-6">
            <div className="min-w-0 flex-1">
              <div className="text-[12px] text-[var(--danger)]">
                Delete program
              </div>
              <div className="mt-0.5 text-[11px] leading-[1.5] text-[var(--ink-500)]">
                Removes the roster, schedule and every team match. Athlete-owned
                matches stay with the athlete.
              </div>
            </div>
            <a
              href={`mailto:${SUPPORT_EMAIL}?subject=Delete%20program`}
              className="text-[11px] font-medium text-[var(--danger)] hover:text-[var(--danger-hover)]"
            >
              Ask support
            </a>
          </div>
        </SettingsCard>
      )}

      {!isStaff && (
        <p className="text-[11px] leading-[1.5] text-[var(--ink-500)]">
          You play for this team. Identity, policies and ownership are the
          coaching staff&apos;s
          {data.ownerName ? ` — ask ${data.ownerName}, the owner.` : "."}
        </p>
      )}

      <TransferOwnershipDialog
        key={transferSession}
        open={transferOpen}
        onOpenChange={setTransferOpen}
        programId={programId}
        programName={data.program.schoolName}
        target={transferTarget}
        viewerName={viewerName}
      />

      {isStaff && (
        <SettingsSaveBar
          isDirty={isDirty}
          isSaving={isSaving}
          onSave={handleSave}
          onDiscard={() => setDraft(saved)}
        />
      )}
    </div>
  );
}
