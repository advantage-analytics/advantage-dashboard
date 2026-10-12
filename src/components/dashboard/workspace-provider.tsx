"use client";

import { createContext, useContext } from "react";
import type { WorkspaceContextValue } from "@/lib/workspace/types";

/**
 * Workspace context for the dashboard shell.
 *
 * Same shape as `MatchDataProvider`: the server resolves once, the provider
 * holds it, and client components deeper in the tree read it instead of having
 * it prop-drilled through the sidebar and header both.
 */
const WorkspaceContext = createContext<WorkspaceContextValue | null>(null);

export function WorkspaceProvider({
  value,
  children,
}: {
  value: WorkspaceContextValue;
  children: React.ReactNode;
}) {
  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

/**
 * The workspace, or null outside the dashboard shell. For the few components
 * that also render on the public share page (`/m/[token]`), where there is no
 * signed-in viewer and so no workspace — they draw without it rather than
 * throw. Everything under `/dashboard` uses `useWorkspace`.
 */
export function useOptionalWorkspace(): WorkspaceContextValue | null {
  return useContext(WorkspaceContext);
}

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider.");
  }
  return context;
}
