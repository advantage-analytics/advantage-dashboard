"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { leaveConfirmLabel, shouldAskBeforeLeaving } from "./leave-guard";

/**
 * Asks before a dashboard chrome link leaves the upload screen mid-upload.
 *
 * In-app navigation does not stop the upload — only closing the tab does — but
 * it does leave the one screen that shows live progress and can cancel it. So
 * the sidebar, the breadcrumbs and the account menu ask first while
 * `UploadMatchSuccess` is busy, naming where the click was going.
 *
 * A sibling of `UnsavedChangesProvider`, copying its mechanics rather than
 * generalising it: a promise the dialog settles, a second ask answering the
 * first with "stay", and a confirm that disarms before it resolves so the
 * moment between confirming and the route committing cannot ask again.
 *
 * Browser Back/Forward is deliberately not covered: the App Router offers no
 * supported way to intercept it, and the upload survives it anyway.
 */
interface LeaveGuardContextValue {
  /** Registers one armed screen; returns its release. */
  arm: () => () => void;
  /** Resolves true when the viewer chose to leave (at once when not armed). */
  confirmLeave: (label?: string) => Promise<boolean>;
  /** Whether a click to `href` should stop and ask. */
  shouldAsk: (href: string, event: React.MouseEvent) => boolean;
}

const LeaveGuardContext = createContext<LeaveGuardContextValue>({
  arm: () => () => {},
  confirmLeave: () => Promise.resolve(true),
  shouldAsk: () => false,
});

export function LeaveGuardProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  // A count, not a flag, so two armed screens releasing out of order cannot
  // disarm each other. Read only from event handlers.
  const armedRef = useRef(0);
  const [asking, setAsking] = useState<{ label?: string } | null>(null);
  const resolveRef = useRef<((leave: boolean) => void) | null>(null);

  const arm = useCallback(() => {
    armedRef.current += 1;
    let released = false;
    return () => {
      if (released) return;
      released = true;
      armedRef.current = Math.max(0, armedRef.current - 1);
    };
  }, []);

  const settle = useCallback((leave: boolean) => {
    resolveRef.current?.(leave);
    resolveRef.current = null;
    setAsking(null);
  }, []);

  const confirmLeave = useCallback((label?: string) => {
    if (armedRef.current === 0) return Promise.resolve(true);
    // A second ask while one is open answers the first with "stay".
    resolveRef.current?.(false);
    return new Promise<boolean>((resolve) => {
      resolveRef.current = resolve;
      setAsking({ label });
    });
  }, []);

  const shouldAsk = useCallback(
    (href: string, event: React.MouseEvent) =>
      shouldAskBeforeLeaving({
        armed: armedRef.current > 0,
        currentPath: pathname,
        href,
        event,
      }),
    [pathname],
  );

  return (
    <LeaveGuardContext.Provider value={{ arm, confirmLeave, shouldAsk }}>
      {children}

      <LeaveUploadDialog
        open={asking !== null}
        label={asking?.label}
        onStay={() => settle(false)}
        onLeave={() => {
          // Disarm first: the route has not committed yet, and nothing may
          // ask again in that gap.
          armedRef.current = 0;
          settle(true);
        }}
      />
    </LeaveGuardContext.Provider>
  );
}

/** Arms the guard for as long as `armed` holds and the caller is mounted. */
export function useLeaveGuard(armed: boolean) {
  const { arm } = useContext(LeaveGuardContext);
  useEffect(() => {
    if (!armed) return;
    return arm();
  }, [armed, arm]);
}

/**
 * The click handler for a chrome link. Returns true when it took the click
 * over — prevented the default and asked — so a caller can close its menu;
 * false when the link should navigate as it always has.
 */
export function useConfirmLeave() {
  const { confirmLeave, shouldAsk } = useContext(LeaveGuardContext);
  const router = useRouter();
  return useCallback(
    (event: React.MouseEvent, href: string, label?: string): boolean => {
      if (!shouldAsk(href, event)) return false;
      event.preventDefault();
      void confirmLeave(label).then((leave) => {
        if (leave) router.push(href);
      });
      return true;
    },
    [confirmLeave, shouldAsk, router],
  );
}

/**
 * The question itself. Blue, not red: leaving loses nothing — the upload keeps
 * going — only the screen that can follow and cancel it.
 */
export function LeaveUploadDialog({
  open,
  label,
  onStay,
  onLeave,
}: {
  open: boolean;
  /** Where the click was going — the link's own name. */
  label?: string;
  onStay: () => void;
  onLeave: () => void;
}) {
  return (
    <ConfirmDialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onStay();
      }}
      title="Leave while your video uploads?"
      description="The upload keeps going as long as this tab stays open, and you can follow it on the match page. Only this screen can cancel it."
      cancelLabel="Stay here"
      confirmLabel={leaveConfirmLabel(label)}
      onConfirm={onLeave}
    />
  );
}
