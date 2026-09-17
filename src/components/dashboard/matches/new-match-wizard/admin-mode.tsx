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
  if (
    context.workspace.kind !== "team" ||
    context.actorId !== context.viewer.id ||
    context.videoAllowance.accountId !== context.workspace.id ||
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
      key={`${context.workspace.id}:${mode.operationId}:${mode.itemId}:${attachment?.matchId ?? "new"}`}
      value={mode}
    >
      <WorkspaceProvider
        value={{
          active: context.workspace,
          available: [context.workspace],
          viewer: context.viewer,
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
