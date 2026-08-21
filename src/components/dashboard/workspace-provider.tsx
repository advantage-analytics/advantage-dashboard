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

export function useWorkspace(): WorkspaceContextValue {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error("useWorkspace must be used within a WorkspaceProvider.");
  }
  return context;
}
