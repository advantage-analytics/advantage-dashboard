"use client";

import { useState, useSyncExternalStore } from "react";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { ConfirmAside } from "@/components/ui/confirm-dialog";
import { advButton } from "@/lib/ui/adv-button";
import { formatPilotEnd } from "@/lib/services/splitstep/config";
import { monthlyCapSecondsFor } from "@/lib/services/splitstep/quota";
import { PAID_PLANS_BEGIN } from "@/lib/user/plan";

const SEEN_KEY = "adv:beta-welcome-seen";

/**
 * What the dialog says, decided by the caller so `/design` can show every
 * variant without a workspace.
 */
export interface BetaWelcomeTerms {
  /** Monthly video hours the active workspace is capped at. */
  hours: number;
  /** A verified college program's name, when the allowance is the program's. */
  programName?: string | null;
}

/**
 * "Welcome to the Advantage beta" — the account's terms, once, on the first
 * dashboard visit.
 *
 * The Dialog (v3) geometry `ConfirmDialog` draws — 440px, `--radius-card`,
 * `--shadow-dropdown`, 24/24/20 padding, 18px gaps, a 16/500 title over a
 * 12px `--ink-600` contract sentence, the 28px chrome close — on Radix
 * `Dialog` rather than `AlertDialog`: it asks nothing, so the scrim and Esc
 * both dismiss it. One primary, no Cancel, because there is nothing to cancel;
 * "See your usage" is the footer's quiet left link.
 *
 * The terms are three facts a person reads across, so they are label/value
 * rows on hairlines (the Settings › Plan card's shape), not prose.
 */
export function BetaWelcomeDialog({
  open,
  onOpenChange,
  terms,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terms: BetaWelcomeTerms;
}) {
  const rows = [
    {
      label: "Video analysis",
      value: `${terms.hours} hours a month`,
      note: terms.programName
        ? `Shared across ${terms.programName}. Resets on the 1st.`
        : "About one full match. Resets on the 1st.",
    },
    { label: "SwingVision imports", value: "Unlimited" },
    { label: "Free through", value: formatPilotEnd() },
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(13,13,13,0.4)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          className="fixed top-24 left-1/2 z-50 -translate-x-1/2 bg-[var(--surface-card)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0"
          style={{
            width: "440px",
            maxWidth: "calc(100vw - 32px)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-dropdown)",
          }}
        >
          <div className="flex flex-col gap-[18px] p-6 pb-5">
            <div className="flex items-start gap-2.5">
              <div className="min-w-0 flex-1">
                <DialogPrimitive.Title className="text-[16px] font-medium text-[var(--ink-900)]">
                  Welcome to the Advantage beta
                </DialogPrimitive.Title>
                <DialogPrimitive.Description className="mt-1 text-[12px] leading-[1.55] text-pretty text-[var(--ink-600)]">
                  Everything is free while we build. Here is what{" "}
                  {terms.programName ? "your program" : "your account"}{" "}
                  includes.
                </DialogPrimitive.Description>
              </div>
              <DialogPrimitive.Close
                aria-label="Close"
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--ink-500)] transition-colors hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden />
              </DialogPrimitive.Close>
            </div>

            <dl className="flex flex-col">
              {rows.map((row) => (
                <div
                  key={row.label}
                  className="flex items-start gap-6 border-t border-[var(--border-hairline)] py-3 last:border-b"
                >
                  <dt className="min-w-0 flex-1">
                    <span className="block text-[12px] text-[var(--ink-900)]">
                      {row.label}
                    </span>
                    {row.note && (
                      <span className="mt-0.5 block text-[11px] leading-[1.5] text-[var(--ink-500)]">
                        {row.note}
                      </span>
                    )}
                  </dt>
                  <dd className="tabular shrink-0 text-[13px] text-[var(--ink-900)]">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <ConfirmAside>
              Paid plans begin in {PAID_PLANS_BEGIN}, and we&apos;ll tell you
              before anything changes.
            </ConfirmAside>

            <div className="flex items-center gap-2.5 pt-0.5">
              <Link
                href="/dashboard/settings/usage"
                onClick={() => onOpenChange(false)}
                className="text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
              >
                See your usage
              </Link>
              <span className="flex-1" />
              <DialogPrimitive.Close className={advButton("primary", "sm")}>
                Got it
              </DialogPrimitive.Close>
            </div>
          </div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

/** The terms the active workspace is on. */
export function useBetaWelcomeTerms(): BetaWelcomeTerms {
  const { active } = useWorkspace();
  return {
    hours: monthlyCapSecondsFor(active) / 3600,
    programName:
      active.kind === "team" && active.orgType === "college"
        ? active.name
        : null,
  };
}

function subscribe(onChange: () => void) {
  window.addEventListener("storage", onChange);
  return () => window.removeEventListener("storage", onChange);
}

function readSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    // Storage unavailable: show it; closing it lasts the visit.
    return false;
  }
}

/**
 * The dialog, opened once per browser on the first dashboard visit. The server
 * snapshot says "seen", so it never renders before storage has been read.
 */
export function BetaWelcome() {
  const terms = useBetaWelcomeTerms();
  const seen = useSyncExternalStore(subscribe, readSeen, () => true);
  const [closed, setClosed] = useState(false);

  return (
    <BetaWelcomeDialog
      open={!seen && !closed}
      onOpenChange={(open) => {
        if (open) return;
        setClosed(true);
        try {
          localStorage.setItem(SEEN_KEY, "1");
        } catch {
          // Lasts the visit only.
        }
      }}
      terms={terms}
    />
  );
}
