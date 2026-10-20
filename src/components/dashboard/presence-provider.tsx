"use client";

import {
  createContext,
  Suspense,
  use,
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

/** Page reports, tagged with the workspace they were made in. */
interface Overrides {
  workspaceId: string | null;
  patch: Patch;
}

interface PresenceContextValue {
  seed: Promise<WorkspacePresence>;
  overrides: Overrides;
  report: (workspaceId: string, patch: Patch) => void;
}

const PresenceContext = createContext<PresenceContextValue | null>(null);

const NO_OVERRIDES: Overrides = { workspaceId: null, patch: {} };

/**
 * Holds `WorkspacePresence` for the loading fallbacks — see `presence.ts`.
 *
 * The layout's read is the seed, handed over as a promise rather than awaited:
 * the shell and the page start streaming without it, and only the fallbacks
 * that ask (`PresenceGate`) wait — behind their own Suspense, drawing the
 * skeleton meanwhile. It survives client navigation (the layout does not
 * re-render), so pages report what they actually found and those reports
 * override it until the next server read — a full load, `router.refresh()` or
 * a workspace switch — replaces the seed and drops them.
 */
export function PresenceProvider({
  value,
  children,
}: {
  value: Promise<WorkspacePresence>;
  children: React.ReactNode;
}) {
  const [state, setState] = useState({
    seed: value,
    overrides: NO_OVERRIDES,
  });
  // A fresh server read wins over anything reported against the old one.
  // Adjusting state during render, React's pattern for props-derived state.
  if (state.seed !== value) setState({ seed: value, overrides: NO_OVERRIDES });

  // The seed may not have resolved yet, so a report is kept with its
  // workspace and only applied when the seed turns out to describe the same
  // one — the check the synchronous seed used to make here.
  const report = useCallback((workspaceId: string, patch: Patch) => {
    setState((current) => {
      const prior =
        current.overrides.workspaceId === workspaceId
          ? current.overrides.patch
          : {};
      const changed =
        current.overrides.workspaceId !== workspaceId ||
        (Object.keys(patch) as (keyof Patch)[]).some(
          (key) => prior[key] !== patch[key],
        );
      return changed
        ? {
            ...current,
            overrides: { workspaceId, patch: { ...prior, ...patch } },
          }
        : current;
    });
  }, []);

  return (
    <PresenceContext.Provider
      value={{ seed: state.seed, overrides: state.overrides, report }}
    >
      {children}
    </PresenceContext.Provider>
  );
}

/**
 * True when the active workspace has nothing for this page yet. Suspends
 * until the layout's read lands, so call it only beneath a Suspense boundary
 * — `PresenceGate` is that boundary.
 *
 * Outside a provider it answers false, which keeps the skeleton.
 */
function useIsDayZero(surface: PresenceSurface): boolean {
  const context = useContext(PresenceContext);
  if (!context) return false;
  const seed = use(context.seed);
  const { overrides } = context;
  const presence =
    overrides.workspaceId === seed.workspaceId
      ? { ...seed, ...overrides.patch }
      : seed;
  return isDayZero(surface, presence);
}

function PresencePick({
  surface,
  dayZero,
  skeleton,
}: {
  surface: PresenceSurface;
  dayZero: React.ReactNode;
  skeleton: React.ReactNode;
}) {
  return useIsDayZero(surface) ? dayZero : skeleton;
}

/**
 * A route fallback's choice between the page's day zero and its skeleton.
 *
 * Draws the skeleton until the layout's presence read lands, then whichever
 * the read says. Its own Suspense boundary is the point: without it, waiting
 * on presence would suspend up to the dashboard shell, which is the wait the
 * layout no longer makes. Pass `dayZero={null}` where a workspace kind has no
 * day zero for this page; the skeleton is drawn instead.
 */
export function PresenceGate({
  surface,
  dayZero,
  skeleton,
}: {
  surface: PresenceSurface;
  dayZero: React.ReactNode;
  skeleton: React.ReactNode;
}) {
  if (dayZero === null) return skeleton;
  return (
    <Suspense fallback={skeleton}>
      <PresencePick surface={surface} dayZero={dayZero} skeleton={skeleton} />
    </Suspense>
  );
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
