"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AlertCircle, Check, Info, X } from "lucide-react";

/**
 * The dashboard's one way of saying something happened.
 *
 * There was none before this. `useUploadMatchWizard` dispatches
 * `match-upload-failed` from three places and nothing listened, so a background
 * upload that died was invisible until the reaper turned it into a "Failed" row
 * on the matches list up to fifteen minutes later. The user's own tab knew
 * immediately and had nowhere to put it.
 *
 * Hand-rolled rather than a toast library. What is needed is a list, a timer
 * and a region — and a dependency would still need this file to teach it the
 * design system's tokens, the failure semantics below, and the event bridge.
 *
 * ── Errors do not auto-dismiss ──────────────────────────────────────────────
 * A success toast is a receipt: it can vanish, because the thing it describes
 * is visible elsewhere. A failure is the ONLY notice a person gets that an
 * upload they walked away from is gone, and a notice that removes itself after
 * five seconds is one they will miss precisely when they were not looking.
 */

export type ToastTone = "success" | "error" | "info";

export interface Toast {
  id: string;
  tone: ToastTone;
  title: string;
  body?: string;
  /** Optional single action — "View match", "Try again". */
  action?: { label: string; href: string };
}

interface ToastContextValue {
  push: (toast: Omit<Toast, "id">) => void;
  dismiss: (id: string) => void;
}

const ToastContext = createContext<ToastContextValue | null>(null);

/** Only success and info clear themselves. See the header. */
const AUTO_DISMISS_MS: Record<ToastTone, number | null> = {
  success: 5000,
  info: 7000,
  error: null,
};

/** More than this on screen and the newest is below the fold on a laptop. */
const MAX_VISIBLE = 3;

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) {
    // A hook that silently no-ops when unmounted is how a failure notice
    // disappears without anyone noticing the provider was missing.
    throw new Error("useToast must be used inside <ToastProvider>");
  }
  return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  // Timers are cleared on unmount so a navigation mid-countdown cannot fire
  // setState against a gone component.
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());

  const dismiss = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
    setToasts((current) => current.filter((toast) => toast.id !== id));
  }, []);

  const push = useCallback(
    (toast: Omit<Toast, "id">) => {
      // `crypto.randomUUID` rather than a counter: two providers would restart
      // a counter at the same number and React would reconcile one toast onto
      // another's node.
      const id = crypto.randomUUID();
      setToasts((current) => [...current, { ...toast, id }].slice(-MAX_VISIBLE));

      const ms = AUTO_DISMISS_MS[toast.tone];
      if (ms !== null) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), ms)
        );
      }
    },
    [dismiss]
  );

  useEffect(() => {
    const pending = timers.current;
    return () => {
      for (const timer of pending.values()) clearTimeout(timer);
      pending.clear();
    };
  }, []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <ToastViewport toasts={toasts} onDismiss={dismiss} />
    </ToastContext.Provider>
  );
}

const ICON: Record<ToastTone, typeof Check> = {
  success: Check,
  error: AlertCircle,
  info: Info,
};

const ICON_COLOR: Record<ToastTone, string> = {
  success: "var(--viz-good)",
  error: "var(--danger)",
  info: "var(--blue)",
};

function ToastViewport({
  toasts,
  onDismiss,
}: {
  toasts: Toast[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;

  return (
    <div
      // `polite`, not `assertive`. These interrupt nothing the person is doing,
      // and an assertive live region cuts off a screen reader mid-sentence.
      role="region"
      aria-live="polite"
      aria-label="Notifications"
      className="pointer-events-none fixed right-4 bottom-4 z-50 flex w-[min(360px,calc(100vw-2rem))] flex-col gap-2"
    >
      {toasts.map((toast) => {
        const Icon = ICON[toast.tone];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex items-start gap-3 rounded-[var(--radius-card)] border border-[var(--border-medium)] bg-[var(--surface-card)] p-3.5 toast-enter shadow-[0px_4px_16px_0px_rgba(0,0,0,0.08)]"
          >
            <Icon
              className="mt-px size-4 shrink-0"
              strokeWidth={1.5}
              style={{ color: ICON_COLOR[toast.tone] }}
              aria-hidden
            />

            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <p className="text-[13px] leading-[18px] text-[var(--ink-900)]">
                {toast.title}
              </p>
              {toast.body && (
                <p className="text-[12px] leading-[17px] text-[var(--ink-700)]">
                  {toast.body}
                </p>
              )}
              {toast.action && (
                <a
                  href={toast.action.href}
                  className="mt-0.5 w-fit text-[12px] text-[var(--blue)] transition-colors hover:text-[var(--blue-hover)]"
                >
                  {toast.action.label}
                </a>
              )}
            </div>

            <button
              type="button"
              onClick={() => onDismiss(toast.id)}
              aria-label="Dismiss"
              className="-m-1 shrink-0 cursor-pointer rounded-[var(--radius-element)] p-1 text-[var(--ink-400)] transition-colors hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
            >
              <X className="size-3.5" strokeWidth={1.5} />
            </button>
          </div>
        );
      })}
    </div>
  );
}
