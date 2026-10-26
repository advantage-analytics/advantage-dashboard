"use client";

import { useCallback, useRef, useState } from "react";
import Image from "next/image";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import dynamic from "next/dynamic";
import { ConfirmAside } from "@/components/ui/confirm-dialog";
import { LiveDots } from "@/components/ui/live-dots";
import { formatHoursLong } from "@/lib/data/usage-format";
import {
  CREDIT_PACKS,
  creditPack,
  formatPackPrice,
  packName,
  packPerHour,
  packSeconds,
  smallestPackCovering,
  type CreditPackId,
} from "@/lib/services/credits/packs";
import { formatPilotEnd } from "@/lib/services/splitstep/config";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/** Stripe's checkout, fetched only once Pay is pressed. */
const EmbeddedCreditsCheckout = dynamic(
  () => import("./embedded-credits-checkout"),
  {
    ssr: false,
    loading: () => (
      <p role="status" className="py-6 text-[13px] text-[var(--ink-600)]">
        Opening checkout…
      </p>
    ),
  },
);

/** Checkout cannot open without the publishable key. */
const CHECKOUT_CONFIGURED = Boolean(
  process.env.NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY,
);

export interface CreditsAdded {
  pack: CreditPackId;
  seconds: number;
  expiresAt: string;
}

const NUMBER_WORDS = ["Zero", "One", "Two", "Three", "Four", "Five"];

/**
 * "Add video hours" — the paywall (frame B3b.5 in the Credit Packs Mockups (docs/plans/2027-player-pricing.md)).
 *
 * In the beta welcome dialog's style (`beta-welcome-dialog.tsx`): 520px, the
 * brand band with the live dot grid, white logo and Beta tag, a 40px light
 * display line and the shortfall as its 56px headline figure; then the two
 * packs as boxed selection tiles (the smallest that covers the video chosen
 * first), the all-sales-final aside, a quiet link left and one primary right.
 *
 * Paying swaps the tiles for Stripe Embedded Checkout IN the dialog. It never
 * redirects: the wizard's picked video is an in-memory `File`, and leaving
 * the page would lose it and the trim. On completion the purchase is recorded
 * through `/api/credits/confirm` (the webhook records it too; whichever is
 * second is a no-op) and `onCreditsAdded` hands the new hours back.
 */
export function AddHoursDialog({
  open,
  onOpenChange,
  neededSeconds,
  freeRemainingSeconds,
  creditSeconds,
  resetsOn,
  onShortenTrim,
  onCreditsAdded,
  sendsAfterPay = false,
  initialPack,
  paymentPending = false,
  onPaymentPending,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The trimmed video's cost. Omitted when there is no video yet (B4). */
  neededSeconds?: number;
  freeRemainingSeconds: number;
  creditSeconds: number;
  /** When free hours come back — "Nov 1" — or null once they end Dec 31. */
  resetsOn: string | null;
  /** Shown as "Shorten the trim instead" when the wizard has a trim to shorten. */
  onShortenTrim?: () => void;
  onCreditsAdded: (added: CreditsAdded) => void;
  /** The primary says "and send": the wizard carries on once hours land. */
  sendsAfterPay?: boolean;
  /** Pre-select this pack (Settings › Plan's per-pack Buy). */
  initialPack?: CreditPackId;
  /**
   * A payment went through but its hours have not shown up yet. The dialog
   * opens on the "on its way" line with no Pay button, so nobody pays twice
   * for hours the webhook is about to add.
   */
  paymentPending?: boolean;
  /** Paid, but `/api/credits/confirm` never confirmed it — see above. */
  onPaymentPending?: () => void;
}) {
  const leftSeconds = freeRemainingSeconds + creditSeconds;
  const shortBySeconds =
    neededSeconds !== undefined ? Math.max(0, neededSeconds - leftSeconds) : 0;
  const firstPack = initialPack ?? smallestPackCovering(shortBySeconds).id;

  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(13,13,13,0.4)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        {open && (
          <AddHoursContent
            // A fresh body per opening, so a reopened dialog starts on the
            // tiles with the right pack chosen rather than mid-checkout.
            // Not keyed on the balance: a background re-read must not throw
            // away a checkout in progress.
            key={`${neededSeconds ?? "none"}:${firstPack}:${paymentPending}`}
            initialPack={firstPack}
            startPending={paymentPending}
            onPaymentPending={onPaymentPending}
            neededSeconds={neededSeconds}
            freeRemainingSeconds={freeRemainingSeconds}
            shortBySeconds={shortBySeconds}
            resetsOn={resetsOn}
            onShortenTrim={onShortenTrim}
            onCreditsAdded={onCreditsAdded}
            onOpenChange={onOpenChange}
            sendsAfterPay={sendsAfterPay}
          />
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type Phase =
  | { kind: "choose" }
  | { kind: "checkout"; pack: CreditPackId }
  | { kind: "recording" }
  /** Paid, but the hours have not shown up yet. Never offers Pay again. */
  | { kind: "pending" }
  | { kind: "error"; message: string };

function AddHoursContent({
  initialPack,
  neededSeconds,
  freeRemainingSeconds,
  shortBySeconds,
  resetsOn,
  onShortenTrim,
  onCreditsAdded,
  onOpenChange,
  sendsAfterPay,
  startPending,
  onPaymentPending,
}: {
  initialPack: CreditPackId;
  neededSeconds?: number;
  freeRemainingSeconds: number;
  shortBySeconds: number;
  resetsOn: string | null;
  onShortenTrim?: () => void;
  onCreditsAdded: (added: CreditsAdded) => void;
  onOpenChange: (open: boolean) => void;
  sendsAfterPay: boolean;
  startPending: boolean;
  onPaymentPending?: () => void;
}) {
  const [chosen, setChosen] = useState<CreditPackId>(initialPack);
  const [phase, setPhase] = useState<Phase>(
    startPending ? { kind: "pending" } : { kind: "choose" },
  );
  const primaryRef = useRef<HTMLButtonElement>(null);
  const sessionIdRef = useRef<string | null>(null);
  const pack = creditPack(chosen);

  const coveringHours = creditPack(initialPack).hours;
  const hasVideo = neededSeconds !== undefined;
  // `smallestPackCovering()` falls back to the biggest pack when none covers
  // the gap on its own; the headline must not promise that one pack does.
  const onePackCovers = packSeconds(creditPack(initialPack)) >= shortBySeconds;

  const fetchClientSecret = useCallback(async () => {
    const response = await fetch("/api/create-checkout-session", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind: "credits", pack: chosen }),
    });
    const body = (await response.json().catch(() => null)) as {
      clientSecret?: string;
      sessionId?: string;
      error?: string;
    } | null;
    if (!response.ok || !body?.clientSecret || !body.sessionId) {
      const message =
        body?.error ?? "Checkout couldn't open. Try again in a moment.";
      setPhase({ kind: "error", message });
      throw new Error(message);
    }
    sessionIdRef.current = body.sessionId;
    return body.clientSecret;
  }, [chosen]);

  const onComplete = useCallback(async () => {
    setPhase({ kind: "recording" });
    const sessionId = sessionIdRef.current;
    // Up to a few tries: the payment can settle a moment after Checkout says
    // it is complete, and the webhook may also land first (a no-op here).
    for (let attempt = 0; attempt < 6 && sessionId; attempt++) {
      const response = await fetch("/api/credits/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sessionId }),
      }).catch(() => null);
      if (response?.ok) {
        const added = (await response.json()) as CreditsAdded;
        onCreditsAdded(added);
        return;
      }
      if (response && response.status !== 409 && response.status !== 503) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    setPhase({ kind: "pending" });
    onPaymentPending?.();
  }, [onCreditsAdded, onPaymentPending]);

  const headline =
    hasVideo && !onePackCovers ? (
      <>
        Add hours
        <br />
        to send this match.
      </>
    ) : hasVideo ? (
      <>
        {NUMBER_WORDS[coveringHours] ?? coveringHours} more{" "}
        {coveringHours === 1 ? "hour" : "hours"}
        <br />
        and it&rsquo;s in.
      </>
    ) : (
      <>
        Add video hours
        <br />
        and keep going.
      </>
    );

  const description = hasVideo
    ? freeRemainingSeconds > 0
      ? `This match needs ${formatHoursLong(neededSeconds)}. Your free hours cover ${formatHoursLong(freeRemainingSeconds)} of it.`
      : `This match needs ${formatHoursLong(neededSeconds)}.`
    : "Credits are used after your free hours and last 12 months.";

  const spare = packSeconds(pack) - shortBySeconds;

  return (
    <DialogPrimitive.Content
      onOpenAutoFocus={(event) => {
        event.preventDefault();
        primaryRef.current?.focus();
      }}
      // z-[51]: Radix portals the content and the overlay separately, and
      // the content can land first in the DOM — at an equal z-index the
      // overlay would paint over the dialog and take its clicks.
      // Checkout is a form a stray click must not throw away.
      onInteractOutside={(event) => {
        if (phase.kind !== "choose" && phase.kind !== "error")
          event.preventDefault();
      }}
      onEscapeKeyDown={(event) => {
        if (phase.kind === "checkout" || phase.kind === "recording")
          event.preventDefault();
      }}
      className="fixed top-10 left-1/2 z-[51] max-h-[calc(100dvh-80px)] -translate-x-1/2 overflow-y-auto bg-[var(--surface-card)] outline-none data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 motion-reduce:data-[state=open]:slide-in-from-top-0"
      style={{
        width: "520px",
        maxWidth: "calc(100vw - 32px)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-floating)",
      }}
    >
      <div className="brand-mesh-gradient relative overflow-hidden px-7 pt-6 pb-7 text-white">
        <LiveDots />
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
            // Not while the purchase is being recorded: the hours are paid for.
            hidden={phase.kind === "recording"}
            className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-white/75 transition-colors hover:bg-white/15 hover:text-white focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.7)] focus-visible:outline-none touch:hit-area"
          >
            <X className="size-3.5" strokeWidth={1.5} aria-hidden />
          </DialogPrimitive.Close>
        </div>

        <DialogPrimitive.Title className="relative mt-9 text-[40px] leading-[1.02] font-light tracking-[-1px]">
          {headline}
        </DialogPrimitive.Title>
        <DialogPrimitive.Description className="relative mt-3 max-w-[40ch] text-[13px] leading-[1.6] text-white/90">
          {description}
        </DialogPrimitive.Description>

        <div className="relative mt-7 flex items-end gap-3 border-t border-white/25 pt-5">
          <span className="tabular text-[56px] leading-[0.85] font-light tracking-[-2px]">
            {formatHoursLong(hasVideo ? shortBySeconds : freeRemainingSeconds)}
          </span>
          <span className="pb-1 text-[13px] leading-[1.35] text-white/85">
            {hasVideo ? (
              <>
                short of what
                <br />
                this match needs
              </>
            ) : (
              <>
                of free hours
                <br />
                left this month
              </>
            )}
          </span>
          <span className="flex-1" />
          <span className="pb-1 text-right text-[11px] leading-[1.45] text-white/90">
            {resetsOn
              ? `Free hours return ${resetsOn}`
              : `Free hours end ${formatPilotEnd()}`}
            <br />
            Credits last 12 months
          </span>
        </div>
      </div>

      {phase.kind === "choose" || phase.kind === "error" ? (
        <div className="flex flex-col gap-6 px-7 pt-6 pb-7">
          <div
            role="radiogroup"
            aria-label="Pack"
            className="grid grid-cols-2 gap-2.5"
          >
            {CREDIT_PACKS.map((p) => {
              const isChosen = p.id === chosen;
              const covers = hasVideo && packSeconds(p) >= shortBySeconds;
              return (
                <button
                  key={p.id}
                  type="button"
                  role="radio"
                  aria-checked={isChosen}
                  onClick={() => setChosen(p.id)}
                  className={cn(
                    "relative flex cursor-pointer flex-col items-start gap-1 rounded-[10px] border px-4 pt-3.5 pb-3 text-left transition-colors duration-200 focus-visible:shadow-[0_0_0_2px_var(--blue)] focus-visible:outline-none",
                    isChosen
                      ? "border-[var(--blue)] bg-[var(--blue-pressed)] shadow-[0_0_0_1px_var(--blue)]"
                      : "border-[var(--border-field)] hover:bg-[var(--surface-subtle)]",
                  )}
                >
                  <span
                    className={cn(
                      "absolute top-3 right-3 flex size-4 items-center justify-center rounded-full",
                      isChosen
                        ? "bg-[var(--blue)]"
                        : "border border-[var(--ink-300)]",
                    )}
                    aria-hidden
                  >
                    {isChosen && (
                      <Check className="size-2.5 text-white" strokeWidth={3} />
                    )}
                  </span>
                  <span className="text-[12px] text-[var(--ink-700)]">
                    {packName(p)}
                  </span>
                  <span
                    className="text-title-lg tabular"
                    style={{ color: "var(--ink-900)" }}
                  >
                    {formatPackPrice(p)}
                  </span>
                  <span className="text-[11px] text-[var(--ink-500)]">
                    {isChosen && covers
                      ? `Covers it, ${formatHoursLong(spare)} to spare`
                      : packPerHour(p)}
                  </span>
                </button>
              );
            })}
          </div>

          {phase.kind === "error" ? (
            <p
              role="alert"
              className="text-[12px] leading-[1.6] text-[var(--error)]"
            >
              {phase.message}
            </p>
          ) : (
            <ConfirmAside>
              All sales final, except where required by law. Credits are used
              after your free hours, oldest first.
            </ConfirmAside>
          )}

          <div className="flex items-center gap-2.5">
            {onShortenTrim ? (
              <button
                type="button"
                onClick={() => {
                  onOpenChange(false);
                  onShortenTrim();
                }}
                className="cursor-pointer text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
              >
                Shorten the trim instead
              </button>
            ) : (
              <DialogPrimitive.Close className="cursor-pointer text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]">
                Not now
              </DialogPrimitive.Close>
            )}
            <span className="flex-1" />
            <button
              ref={primaryRef}
              type="button"
              disabled={!CHECKOUT_CONFIGURED}
              onClick={() => setPhase({ kind: "checkout", pack: chosen })}
              className={advButton("primary", "md")}
            >
              Pay {formatPackPrice(pack)}
              {sendsAfterPay ? " and send" : ""}
              <ArrowRight className="size-3.5" strokeWidth={1.5} aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-col gap-4 px-7 pt-5 pb-7">
          {phase.kind === "checkout" ? (
            <>
              <button
                type="button"
                onClick={() => setPhase({ kind: "choose" })}
                className="inline-flex cursor-pointer items-center gap-1.5 self-start text-[12px] text-[var(--blue)] hover:text-[var(--blue-hover)]"
              >
                <ArrowLeft className="size-3.5" strokeWidth={1.5} aria-hidden />
                {packName(pack)} · {formatPackPrice(pack)} — change
              </button>
              {/* Stripe's own frame. The key forces a new session when the pack changes. */}
              <EmbeddedCreditsCheckout
                key={phase.pack}
                fetchClientSecret={fetchClientSecret}
                onComplete={onComplete}
              />
              <ConfirmAside>
                All sales final, except where required by law. Your trim and
                video stay put while you pay.
              </ConfirmAside>
            </>
          ) : phase.kind === "recording" ? (
            <p role="status" className="py-6 text-[13px] text-[var(--ink-600)]">
              Adding {packName(pack)} to your account…
            </p>
          ) : (
            <>
              <p
                role="status"
                className="pt-2 text-[13px] leading-[1.6] text-[var(--ink-700)]"
              >
                Your payment went through. Your hours will appear within a
                minute, and a receipt is on its way to your email.
              </p>
              <div className="flex justify-end">
                <DialogPrimitive.Close className={advButton("outline", "md")}>
                  Close
                </DialogPrimitive.Close>
              </div>
            </>
          )}
        </div>
      )}
    </DialogPrimitive.Content>
  );
}
