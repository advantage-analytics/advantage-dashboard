"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from "react";
import {
  isDayZero,
  type PresenceSurface,
  type WorkspacePresence,
} from "@/lib/workspace/presence";

type Patch = Partial<Omit<WorkspacePresence, "workspaceId">>;

interface PresenceContextValue {
  presence: WorkspacePresence;
  report: (workspaceId: string, patch: Patch) => void;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

/**
 * Holds `WorkspacePresence` for the loading fallbacks — see `presence.ts`.
 *
 * The layout's read is the seed. It survives client navigation (the layout
 * does not re-render), so pages report what they actually found and those
 * reports override it until the next server read — a full load,
 * `router.refresh()` or a workspace switch — replaces the seed and drops them.
 */
export function PresenceProvider({
  value,
  children,
}: {
  value: WorkspacePresence;
  children: React.ReactNode;
}) {
  const [state, setState] = useState({ seed: value, overrides: {} as Patch });
  // A fresh server read wins over anything reported against the old one.
  // Adjusting state during render, React's pattern for props-derived state.
  if (state.seed !== value) setState({ seed: value, overrides: {} });

  const report = useCallback((workspaceId: string, patch: Patch) => {
    setState((current) => {
      if (current.seed.workspaceId !== workspaceId) return current;
      const merged = { ...current.seed, ...current.overrides };
      const changed = (Object.keys(patch) as (keyof Patch)[]).some(
        (key) => merged[key] !== patch[key],
      );
      return changed
        ? { ...current, overrides: { ...current.overrides, ...patch } }
        : current;
    });
  }, []);

  return (
    <PresenceContext.Provider
      value={{ presence: { ...state.seed, ...state.overrides }, report }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

/**
 * True when the active workspace has nothing for this page yet, so its loading
 * fallback should draw the page's day zero rather than a skeleton.
 *
 * Outside a provider it answers false, which keeps the skeleton.
 */
export function useIsDayZero(surface: PresenceSurface): boolean {
  const context = useContext(PresenceContext);
  return context ? isDayZero(surface, context.presence) : false;
}

/** Rendered by a page with what it found, so the next fallback is right. */
export function PresenceReport({
  workspaceId,
  ...patch
}: Patch & { workspaceId: string }) {
  const report = useContext(PresenceContext)?.report;
  const key = JSON.stringify(patch);
  useEffect(() => {
    report?.(workspaceId, JSON.parse(key) as Patch);
  }, [report, workspaceId, key]);
  return null;
}
