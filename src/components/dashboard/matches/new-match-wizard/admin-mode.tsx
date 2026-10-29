"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { AdminUploadContext } from "@/lib/data/admin-upload-server";
import { WorkspaceProvider } from "@/components/dashboard/workspace-provider";
import { UploadMatchFlow } from "./UploadMatchFlow";
import type { EventPreset } from "./types";
import type { ProviderId } from "@/lib/services/upload";

export interface AdminWizardMode {
  context: AdminUploadContext;
  /** Allocated by the console; retained for every retry, including lost responses. */
  operationId: string;
  itemId: string;
  exitHref: string;
  successHref: string;
  /**
   * The console's upload kind, so step 1's Workspace field and billing toggle
   * can link to the same kind for another target — a team, or a player's
   * personal workspace with its billing. The page resolves the new target
   * from scratch, fresh operation ids included. Absent: no retargeting.
   */
  uploadKind?: "file" | "video";
  attachment?: {
    programId: string;
    matchId: string;
    fingerprint: string;
    operationId: string;
    itemId: string;
    status: "prepared";
    preset: EventPreset;
  };
}
const AdminMode = createContext<AdminWizardMode | null>(null);
export const useAdminWizardMode = () => useContext(AdminMode);

/** Presentation projection only. All writes reauthorize the admin on the server. */
export function AdminUploadMatchFlow({
  mode,
  initialProvider,
}: {
  mode: AdminWizardMode;
  initialProvider?: ProviderId;
}) {
  const { context, attachment } = mode;
  const owner = context.owner ?? null;
  // A team is billed to its own program; a player's personal workspace to
  // the player (their allowance) or, free, to the administrator.
  const consistent =
    context.workspace.kind === "team"
      ? owner === null &&
        context.videoAllowance.accountId === context.workspace.id
      : owner !== null &&
        owner.viewer.id === context.workspace.id &&
        !attachment &&
        context.videoAllowance.accountId ===
          (owner.billing === "free" ? context.actorId : context.workspace.id);
  if (
    !consistent ||
    context.actorId !== context.viewer.id ||
    (attachment &&
      (attachment.programId !== context.workspace.id ||
        attachment.operationId !== mode.operationId ||
        attachment.itemId !== mode.itemId ||
        attachment.matchId !== attachment.preset.matchId ||
        attachment.status !== "prepared"))
  ) {
    return (
      <p role="alert">
        This upload context does not match the prepared target. Reload it before
        continuing.
      </p>
    );
  }
  return (
    <AdminMode
      key={`${context.workspace.id}:${owner?.billing ?? ""}:${mode.operationId}:${mode.itemId}:${attachment?.matchId ?? "new"}`}
      value={mode}
    >
      {/* A personal workspace's viewer is the person it belongs to, so the
          wizard reads the player as "who played" exactly as it reads a
          player uploading for themselves. The session stays the
          administrator's: every write goes through the console's routes,
          which re-check it. */}
      <WorkspaceProvider
        value={{
          active: context.workspace,
          available: [context.workspace],
          viewer: owner?.viewer ?? context.viewer,
        }}
      >
        <UploadMatchFlow
          preset={attachment?.preset}
          initialProvider={initialProvider}
        />
      </WorkspaceProvider>
    </AdminMode>
  );
}

export function AdminResultLock({ children }: { children: ReactNode }) {
  return (
    <fieldset
      disabled
      className="contents"
      aria-label="Preserved recorded result"
    >
      {children}
    </fieldset>
  );
}
