"use client";

import { useRef } from "react";
import Image from "next/image";
import Link from "next/link";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowRight, X } from "lucide-react";
import type { BetaWelcomeTerms } from "@/components/dashboard/beta-welcome-dialog";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { formatPilotEnd } from "@/lib/services/splitstep/config";
import { PAID_PLANS_BEGIN } from "@/lib/user/plan";

/**
 * Alternative directions for the beta welcome dialog, for `/design` only.
 * Whichever is picked moves into `components/dashboard/beta-welcome-dialog.tsx`
 * and the rest are deleted; nothing in the product imports this file.
 */

type DirectionProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  terms: BetaWelcomeTerms;
};

/** Root, scrim and a top-anchored panel of the given width; focus lands on the primary. */
function Shell({
  open,
  onOpenChange,
  width,
  className,
  primaryRef,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  width: number;
  className?: string;
  primaryRef: React.RefObject<HTMLButtonElement | null>;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(13,13,13,0.4)] data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        <DialogPrimitive.Content
          onOpenAutoFocus={(event) => {
            event.preventDefault();
            primaryRef.current?.focus();
          }}
          className={cn(
            "fixed top-20 left-1/2 z-50 -translate-x-1/2 overflow-hidden outline-none data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2",
            className,
          )}
          style={{
            width: `${width}px`,
            maxWidth: "calc(100vw - 32px)",
            borderRadius: "var(--radius-card)",
            boxShadow: "var(--shadow-floating)",
          }}
        >
          {children}
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

function CloseButton({ tone }: { tone: "light" | "dark" }) {
  return (
    <DialogPrimitive.Close
      aria-label="Close"
      className={cn(
        "flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] transition-colors focus-visible:outline-none",
        tone === "dark"
          ? "text-white/70 hover:bg-white/10 hover:text-white focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.7)]"
          : "text-[var(--ink-500)] hover:bg-[var(--surface-subtle)] focus-visible:shadow-[var(--focus-ring)]",
      )}
    >
      <X className="size-3.5" strokeWidth={1.5} aria-hidden />
    </DialogPrimitive.Close>
  );
}

function Logo({ className }: { className?: string }) {
  return (
    <Image
      src="/logos/logo.svg"
      alt="Advantage"
      width={320}
      height={57}
      className={cn("h-[16px] w-auto", className)}
    />
  );
}

const caption = (terms: BetaWelcomeTerms) =>
  terms.programName ? "Shared by the program" : "About one full match";

// ── B · Night court ─────────────────────────────────────────────────────────

/**
 * A dark card with a full court drawn in Signal Blue, the allowance set inside
 * the court like a score. Moodier and more "pro training room"; the blue is
 * the only colour.
 */
export function NightCourtDialog({
  open,
  onOpenChange,
  terms,
}: DirectionProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      width={480}
      primaryRef={primaryRef}
      className="bg-[var(--surface-dark)] text-white"
    >
      <div className="flex items-center gap-2.5 px-7 pt-6">
        <Logo className="brightness-0 invert" />
        <span className="flex items-center gap-1.5 text-[10px] font-medium tracking-[0.12em] text-[var(--blue)] uppercase">
          <span className="size-1.5 rounded-full bg-[var(--blue)]" />
          Beta
        </span>
        <span className="flex-1" />
        <CloseButton tone="dark" />
      </div>

      <div className="relative mx-7 mt-6 flex aspect-[2/1] items-center justify-center">
        <svg
          aria-hidden="true"
          viewBox="0 0 400 200"
          fill="none"
          stroke="var(--blue)"
          strokeWidth="1.25"
          className="absolute inset-0 h-full w-full opacity-60"
        >
          <rect x="1" y="1" width="398" height="198" />
          <line x1="1" y1="26" x2="399" y2="26" />
          <line x1="1" y1="174" x2="399" y2="174" />
          <line x1="200" y1="1" x2="200" y2="199" strokeDasharray="3 4" />
          <line x1="94" y1="26" x2="94" y2="174" />
          <line x1="306" y1="26" x2="306" y2="174" />
          <line x1="94" y1="100" x2="306" y2="100" />
        </svg>
        <div className="relative flex flex-col items-center rounded-[var(--radius-element)] bg-[var(--surface-dark)] px-5 py-2">
          <span className="tabular text-[76px] leading-[0.9] font-light tracking-[-3px]">
            {terms.hours}
            <span className="text-[var(--blue)]">h</span>
          </span>
          <span className="mt-1 text-[11px] tracking-[0.04em] text-white/60">
            of match video, every month
          </span>
        </div>
      </div>

      <div className="px-7 pt-6 pb-6">
        <DialogPrimitive.Title className="text-[22px] leading-[1.15] font-light tracking-[-0.4px]">
          Free while we build.
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="mt-1.5 text-[12px] leading-[1.6] text-white/60">
          {caption(terms)}, reset on the 1st. SwingVision imports are unlimited,
          and it&apos;s all free through {formatPilotEnd()}. Paid plans begin in{" "}
          {PAID_PLANS_BEGIN}.
        </DialogPrimitive.Description>

        <DialogPrimitive.Close
          ref={primaryRef}
          className={cn(
            advButton("primary", "md"),
            "mt-6 w-full justify-center",
          )}
        >
          Start analyzing
          <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
        </DialogPrimitive.Close>
        <Link
          href="/dashboard/settings/usage"
          onClick={() => onOpenChange(false)}
          className="mt-3 block text-center text-[12px] text-white/60 hover:text-white"
        >
          See your usage
        </Link>
      </div>
    </Shell>
  );
}

// ── C · Split ───────────────────────────────────────────────────────────────

/**
 * The auth pages' split, shrunk into a dialog: the brand panel on the left
 * carries the number, the terms read on white at the right. Widest of the
 * four, and the calmest to read.
 */
export function SplitDialog({ open, onOpenChange, terms }: DirectionProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const rows = [
    { label: "SwingVision imports", value: "Unlimited" },
    { label: "Reports and statistics", value: "Included" },
    { label: "Free through", value: formatPilotEnd() },
  ];
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      width={680}
      primaryRef={primaryRef}
      className="bg-[var(--surface-card)]"
    >
      <div className="grid grid-cols-[240px_1fr]">
        <div className="brand-mesh-gradient flex flex-col justify-between p-6 text-white">
          <div className="flex items-center gap-2">
            <Logo className="brightness-0 invert" />
          </div>
          <div className="mt-24">
            <span className="inline-flex h-[20px] items-center rounded-full bg-white/20 px-2 text-[10px] font-medium tracking-[0.08em] uppercase">
              Beta
            </span>
            <div className="tabular mt-3 text-[96px] leading-[0.85] font-light tracking-[-4px]">
              {terms.hours}
            </div>
            <div className="mt-2 text-[13px] leading-[1.4] text-white/90">
              hours of match video
              <br />
              every month
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-[18px] p-6 pb-5">
          <div className="flex items-start gap-2.5">
            <div className="min-w-0 flex-1">
              <DialogPrimitive.Title className="text-[22px] leading-[1.15] font-light tracking-[-0.4px] text-[var(--ink-900)]">
                Welcome to the beta.
              </DialogPrimitive.Title>
              <DialogPrimitive.Description className="mt-1.5 text-[12px] leading-[1.55] text-[var(--ink-600)]">
                Everything is free while we build. {caption(terms)}, reset on
                the 1st.
              </DialogPrimitive.Description>
            </div>
            <CloseButton tone="light" />
          </div>

          <dl className="flex flex-col">
            {rows.map((row) => (
              <div
                key={row.label}
                className="flex items-baseline gap-6 border-t border-[var(--border-hairline)] py-2.5 last:border-b"
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

          <p className="text-[12px] leading-[1.6] text-[var(--ink-500)]">
            Paid plans begin in {PAID_PLANS_BEGIN}. We&apos;ll tell you well
            before anything changes.
          </p>

          <div className="mt-auto flex items-center gap-2.5">
            <Link
              href="/dashboard/settings/usage"
              onClick={() => onOpenChange(false)}
              className="text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
            >
              See your usage
            </Link>
            <span className="flex-1" />
            <DialogPrimitive.Close
              ref={primaryRef}
              className={advButton("primary", "md")}
            >
              Start analyzing
              <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
            </DialogPrimitive.Close>
          </div>
        </div>
      </div>
    </Shell>
  );
}

// ── D · Scoreboard ──────────────────────────────────────────────────────────

/**
 * All white, no gradient: the three terms as a scoreboard of large tabular
 * figures, the way the product shows a match. The boldness is typographic.
 */
export function ScoreboardDialog({
  open,
  onOpenChange,
  terms,
}: DirectionProps) {
  const primaryRef = useRef<HTMLButtonElement>(null);
  const cells = [
    { figure: `${terms.hours}`, unit: "hrs", label: "Match video / month" },
    { figure: "∞", unit: "", label: "SwingVision imports" },
    { figure: "$0", unit: "", label: `Through ${formatPilotEnd()}` },
  ];
  return (
    <Shell
      open={open}
      onOpenChange={onOpenChange}
      width={560}
      primaryRef={primaryRef}
      className="bg-[var(--surface-card)]"
    >
      <div className="flex flex-col gap-6 p-7 pb-6">
        <div className="flex items-center gap-2.5">
          <Logo />
          <span className="inline-flex h-[20px] items-center rounded-full bg-[var(--blue)] px-2 text-[10px] font-medium tracking-[0.08em] text-white uppercase">
            Beta
          </span>
          <span className="flex-1" />
          <CloseButton tone="light" />
        </div>

        <div>
          <DialogPrimitive.Title className="text-[34px] leading-[1.05] font-light tracking-[-1px] text-[var(--ink-900)]">
            You&apos;re in the beta.
          </DialogPrimitive.Title>
          <DialogPrimitive.Description className="mt-2 text-[13px] leading-[1.6] text-[var(--ink-600)]">
            Everything is free while we build.{" "}
            {terms.programName
              ? `${terms.programName} shares its hours across the program.`
              : "Your video hours are about one full match."}
          </DialogPrimitive.Description>
        </div>

        <div className="grid grid-cols-3 divide-x divide-[var(--border-hairline)] border-y border-[var(--border-hairline)]">
          {cells.map((cell, i) => (
            <div key={cell.label} className={cn("py-4", i > 0 && "pl-5")}>
              <div className="tabular flex items-baseline gap-1 text-[var(--ink-900)]">
                <span
                  className={cn(
                    "text-[48px] leading-none font-light tracking-[-1.5px]",
                    i === 0 && "text-[var(--blue)]",
                  )}
                >
                  {cell.figure}
                </span>
                {cell.unit && (
                  <span className="text-[13px] text-[var(--ink-500)]">
                    {cell.unit}
                  </span>
                )}
              </div>
              <div className="mt-2 text-[11px] text-[var(--ink-600)]">
                {cell.label}
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2.5">
          <span className="text-[12px] text-[var(--ink-500)]">
            Paid plans begin in {PAID_PLANS_BEGIN}.
          </span>
          <span className="flex-1" />
          <DialogPrimitive.Close
            ref={primaryRef}
            className={advButton("primary", "md")}
          >
            Start analyzing
            <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
          </DialogPrimitive.Close>
        </div>
      </div>
    </Shell>
  );
}
