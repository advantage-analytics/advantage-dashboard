"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";

interface UnsavedChangesContextValue {
  hasUnsavedChanges: boolean;
  setHasUnsavedChanges: (v: boolean) => void;
  /** Resolves true if navigation should proceed — at once when nothing is dirty. */
  confirmNavigation: () => Promise<boolean>;
}

const UnsavedChangesContext = createContext<UnsavedChangesContextValue>({
  hasUnsavedChanges: false,
  setHasUnsavedChanges: () => {},
  confirmNavigation: () => Promise.resolve(true),
});

export function UnsavedChangesProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Latest-value ref, read only from the beforeunload handler and
  // confirmNavigation — both of which fire outside render. Written in an effect
  // rather than during render, which is unsafe under concurrent rendering where
  // a render can be discarded or replayed (react-hooks/refs).
  const dirtyRef = useRef(false);
  useEffect(() => {
    dirtyRef.current = hasUnsavedChanges;
  }, [hasUnsavedChanges]);

  // Browser-level protection (refresh, close tab)
  useEffect(() => {
    const handler = (e: BeforeUnloadEvent) => {
      if (!dirtyRef.current) return;
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, []);

  // In-app navigation asks with the product's own confirm, not
  // `window.confirm` — the browser's grey box was the one confirmation in the
  // dashboard that did not look like ours. `beforeunload` above has to stay
  // native: a tab close cannot wait on a React dialog.
  const [isAsking, setIsAsking] = useState(false);
  const resolveRef = useRef<((proceed: boolean) => void) | null>(null);

  const settle = useCallback((proceed: boolean) => {
    resolveRef.current?.(proceed);
    resolveRef.current = null;
    setIsAsking(false);
  }, []);

  const confirmNavigation = useCallback(() => {
    if (!dirtyRef.current) return Promise.resolve(true);
    // A second ask while one is open answers the first with "stay".
    resolveRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setIsAsking(true);
    });
  }, []);

  return (
    <UnsavedChangesContext.Provider
      value={{ hasUnsavedChanges, setHasUnsavedChanges, confirmNavigation }}
    >
      {children}

      <ConfirmDialog
        open={isAsking}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
        title="Leave without saving?"
        description="Your changes on this page haven't been saved, and leaving discards them."
        tone="danger"
        cancelLabel="Keep editing"
        confirmLabel="Discard changes"
        onConfirm={() => {
          setHasUnsavedChanges(false);
          settle(true);
        }}
      />
    </UnsavedChangesContext.Provider>
  );
}

export function useUnsavedChanges() {
  return useContext(UnsavedChangesContext);
}
