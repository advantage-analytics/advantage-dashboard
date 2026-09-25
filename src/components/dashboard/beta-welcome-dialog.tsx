"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import Image from "next/image";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, X } from "lucide-react";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import { ConfirmAside } from "@/components/ui/confirm-dialog";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
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
 * Deliberately louder than a settings dialog: it is the one moment the
 * product introduces itself, so it opens on the brand band the auth pages use
 * (`.brand-mesh-gradient`, white logo, light display type) with the allowance
 * as its headline figure, then drops into the Dialog (v3) body — hairline
 * fact rows, the aside, and the footer grammar (quiet link left, one primary
 * right). 520px, the compare-dialog width, because the figure needs the room.
 *
 * Radix `Dialog`, not `AlertDialog`: it asks nothing, so the scrim and Esc
 * both dismiss it, and the primary takes the initial focus rather than the X.
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
  const primaryRef = useRef<HTMLAnchorElement>(null);
  const rows = [
    { label: "SwingVision imports", value: "Unlimited" },
    { label: "Match reports and stats", value: "Included" },
    { label: "Free through", value: formatPilotEnd() },
  ];

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(13,13,13,0.4)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            primaryRef.current?.focus();
          }}
          className="fixed top-20 left-1/2 z-50 -translate-x-1/2 overflow-hidden bg-[var(--surface-card)] outline-none data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 motion-reduce:data-[state=open]:slide-in-from-top-0"
          style={{
            width: "520px",
            maxWidth: "calc(100vw - 32px)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-floating)",
          }}
        >
          <div className="brand-mesh-gradient relative overflow-hidden px-7 pt-6 pb-7 text-white">
            <div className="relative flex items-center gap-2.5">
              <Image
                src="/logos/logo.svg"
                alt="Advantage"
                width={320}
                height={57}
                className="h-[18px] w-auto brightness-0 invert"
              />
              <span className="inline-flex h-[20px] items-center rounded-full bg-white/20 px-2 text-[10px] font-medium tracking-[0.08em] text-white uppercase">
                Beta
              </span>
              <span className="flex-1" />
              <DialogPrimitive.Close
                aria-label="Close"
                className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-white/75 transition-colors hover:bg-white/15 hover:text-white focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.7)] focus-visible:outline-none"
              >
                <X className="size-3.5" strokeWidth={1.5} aria-hidden />
              </DialogPrimitive.Close>
            </div>

            <DialogPrimitive.Title className="relative mt-9 text-[40px] leading-[1.02] font-light tracking-[-1px]">
              Free while
              <br />
              we build.
            </DialogPrimitive.Title>
            <DialogPrimitive.Description className="relative mt-3 max-w-[40ch] text-[13px] leading-[1.6] text-white/90">
              Welcome to the Advantage beta. Here is what{" "}
              {terms.programName ? terms.programName : "your account"} gets
              every month.
            </DialogPrimitive.Description>

            <div className="relative mt-7 flex items-end gap-3 border-t border-white/25 pt-5">
              {/* Two figures wide whatever the number, so the player's "2"
                  sits in the same block as a program's "75". */}
              <span className="tabular min-w-[1.15em] text-[64px] leading-[0.85] font-light tracking-[-2px]">
                {terms.hours}
              </span>
              <span className="pb-1 text-[13px] leading-[1.35] text-white/85">
                hours of match video
                <br />
                analysis, every month
              </span>
              <span className="flex-1" />
              <span className="pb-1 text-right text-[11px] leading-[1.45] text-white/90">
                {terms.programName
                  ? "Shared by the program"
                  : "About one full match"}
                <br />
                Resets on the 1st
              </span>
            </div>
          </div>

          <div className="flex flex-col gap-6 px-7 pt-6 pb-7">
            <dl className="flex flex-col">
              {rows.map((row, i) => (
                <div
                  key={row.label}
                  className={cn(
                    "flex items-baseline gap-6 py-3.5",
                    i > 0 && "border-t border-[var(--border-hairline)]",
                  )}
                >
                  <dt className="min-w-0 flex-1 text-[12px] text-[var(--ink-700)]">
                    {row.label}
                  </dt>
                  <dd className="tabular shrink-0 text-[13px] font-medium text-[var(--ink-900)]">
                    {row.value}
                  </dd>
                </div>
              ))}
            </dl>

            <ConfirmAside>
              Paid plans start in {PAID_PLANS_BEGIN}. We&apos;ll give you plenty
              of notice before anything changes.
            </ConfirmAside>

            <div className="flex items-center gap-2.5">
              <Link
                href="/dashboard/settings/usage"
                onClick={() => onOpenChange(false)}
                className="text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
              >
                See your usage
              </Link>
              <span className="flex-1" />
              {/* A link, not a close: the label promises an upload, so the
                  button goes there. Closing still marks the dialog seen. */}
              <Link
                ref={primaryRef}
                href="/dashboard/matches/new"
                onClick={() => onOpenChange(false)}
                className={advButton("primary", "md")}
              >
                Upload a match
                <ArrowRight
                  className="size-3.5"
                  strokeWidth={1.5}
                  aria-hidden
                />
              </Link>
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
