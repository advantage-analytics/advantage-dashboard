"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import dynamic from "next/dynamic";
import * as DialogPrimitive from "@radix-ui/react-dialog";
import { ArrowLeft, ArrowRight, Check, X } from "lucide-react";
import { ConfirmAside } from "@/components/ui/confirm-dialog";
import { LiveDots } from "@/components/ui/live-dots";
import { StatePill } from "@/components/ui/state-pill";
import {
  afterUpgradeRefusal,
  buildCheckoutView,
  initialSelection,
  needsUpgradePreview,
  planPricing,
  type CheckoutAccount,
  type CheckoutAction,
  type CheckoutMode,
  type CheckoutResult,
  type CheckoutRowView,
  type CheckoutSelection,
  type PreviewState,
  type UpgradePreviewView,
} from "@/lib/billing/checkout-view";
import {
  coachPlan,
  formatUsdCents,
  type PlanPeriod,
} from "@/lib/billing/plans";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";

/** Stripe's checkout, fetched only once Pay is pressed. */
const EmbeddedCheckout = dynamic(
  () => import("@/components/dashboard/credits/embedded-credits-checkout"),
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

/** The hour counts offered as one-click picks when buying extra hours. */
const HOUR_PICKS = [1, 2, 5, 10] as const;

type Refusal = { error?: string; code?: string } | null;

async function postJson(
  url: string,
  body?: unknown,
): Promise<{
  ok: boolean;
  status: number;
  body: Record<string, unknown> | null;
}> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  const parsed = (await response.json().catch(() => null)) as Record<
    string,
    unknown
  > | null;
  return { ok: response.ok, status: response.status, body: parsed };
}

const OFFLINE =
  "We couldn't reach the server. Check your connection and try again.";

/**
 * The one checkout — Choose a plan, extra hours, the upload wizard's paywall
 * and the Coach → Coach Pro upgrade, differing only by `mode` and the
 * account. Every line it draws comes from `buildCheckoutView()`
 * (`lib/billing/checkout-view.ts`); this file owns the shell and the money
 * movement, not the copy.
 *
 * A new plan and extra hours pay through Stripe Embedded Checkout IN the
 * dialog (`/api/billing/checkout`, then `/api/billing/confirm`). It never
 * redirects: in the wizard the picked video is an in-memory `File`, and
 * leaving the page would lose it and the trim. An upgrade has no checkout —
 * `/api/billing/upgrade` charges the card on file and answers directly.
 *
 * The shell is `AddHoursDialog`'s (the brand band, radio rows, an aside, a
 * quiet link left and one primary right), which stays for the months before
 * plans are on sale.
 */
export function PlanCheckoutDialog({
  open,
  onOpenChange,
  mode,
  account,
  onDone,
  onShortenTrim,
  sendsAfterPay = false,
  paymentPending = false,
  onPaymentPending,
  preview,
  refusal,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: CheckoutMode;
  account: CheckoutAccount;
  onDone: (result: CheckoutResult) => void;
  /** Shown as "Shorten the trim instead" when the wizard has a trim to shorten. */
  onShortenTrim?: () => void;
  /** The primary says "and send": the wizard carries on once it is paid. */
  sendsAfterPay?: boolean;
  /**
   * A payment went through but has not shown up yet. The dialog opens on the
   * "on its way" line with no Pay button, so nobody pays twice.
   */
  paymentPending?: boolean;
  /** Paid, but `/api/billing/confirm` never confirmed it. */
  onPaymentPending?: () => void;
  /**
   * The upgrade's figures, when the caller already holds them (the design
   * preview's fixtures). Left out, the dialog asks
   * `/api/billing/upgrade/preview` itself.
   */
  preview?: PreviewState;
  /** A refusal already on screen (the design preview's fixtures). */
  refusal?: string;
}) {
  const needed = mode.kind === "paywall" ? mode.neededSeconds : "none";
  const picked = mode.kind === "choose" ? `${mode.plan}:${mode.period}` : "";
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 z-50 bg-[rgba(13,13,13,0.4)] data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:animate-in data-[state=open]:fade-in-0" />
        {open && (
          <PlanCheckoutContent
            // A fresh body per opening. Not keyed on the balance: a
            // background re-read must not throw away a checkout in progress.
            key={`${mode.kind}:${needed}:${picked}:${account.plan}:${paymentPending}`}
            mode={mode}
            account={account}
            onDone={onDone}
            onOpenChange={onOpenChange}
            onShortenTrim={onShortenTrim}
            sendsAfterPay={sendsAfterPay}
            startPending={paymentPending}
            onPaymentPending={onPaymentPending}
            previewOverride={preview}
            initialProblem={refusal}
          />
        )}
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

type Phase =
  | { kind: "choose" }
  | {
      kind: "checkout";
      action: Exclude<CheckoutAction, { kind: "upgrade" }>;
    }
  /** The upgrade is charging the card on file. */
  | { kind: "working" }
  | { kind: "recording"; what: string }
  /** Paid, but it has not shown up yet. Never offers Pay again. */
  | { kind: "pending" };

function actionKey(action: Exclude<CheckoutAction, { kind: "upgrade" }>) {
  return action.kind === "plan"
    ? `plan:${action.plan}:${action.period}`
    : `hours:${action.hours}`;
}

/** "Coach, monthly" / "2 extra hours" — what is being paid for. */
function actionName(action: Exclude<CheckoutAction, { kind: "upgrade" }>) {
  return action.kind === "plan"
    ? `${coachPlan(action.plan).name}, ${action.period}`
    : `${action.hours} extra ${action.hours === 1 ? "hour" : "hours"}`;
}

function PlanCheckoutContent({
  mode,
  account,
  onDone,
  onOpenChange,
  onShortenTrim,
  sendsAfterPay,
  startPending,
  onPaymentPending,
  previewOverride,
  initialProblem,
}: {
  mode: CheckoutMode;
  account: CheckoutAccount;
  onDone: (result: CheckoutResult) => void;
  onOpenChange: (open: boolean) => void;
  onShortenTrim?: () => void;
  sendsAfterPay: boolean;
  startPending: boolean;
  onPaymentPending?: () => void;
  previewOverride?: PreviewState;
  initialProblem?: string;
}) {
  const wantsPreview = needsUpgradePreview(mode, account);
  const [selection, setSelection] = useState<CheckoutSelection>(() =>
    initialSelection(mode, account),
  );
  const [phase, setPhase] = useState<Phase>(
    startPending ? { kind: "pending" } : { kind: "choose" },
  );
  const [problem, setProblem] = useState<string | null>(initialProblem ?? null);
  const [fetched, setFetched] = useState<PreviewState>(
    wantsPreview && !previewOverride
      ? { status: "loading" }
      : { status: "idle" },
  );
  // Bumped to ask for the upgrade's figures again (`quote_changed`).
  const [previewNonce, setPreviewNonce] = useState(0);
  /** The server's word on the first-month discount, once checkout opens. */
  const [discounted, setDiscounted] = useState<boolean | null>(null);
  const primaryRef = useRef<HTMLButtonElement>(null);
  const sessionIdRef = useRef<string | null>(null);

  const preview = previewOverride ?? fetched;

  useEffect(() => {
    if (!wantsPreview || previewOverride) return;
    let cancelled = false;
    postJson("/api/billing/upgrade/preview")
      .then(({ ok, body }) => {
        if (cancelled) return;
        setFetched(
          ok && body
            ? {
                status: "ready",
                preview: body as unknown as UpgradePreviewView,
              }
            : {
                status: "failed",
                message:
                  (body as Refusal)?.error ??
                  "The upgrade couldn't be priced. Try again in a moment.",
              },
        );
      })
      .catch(() => {
        if (!cancelled) setFetched({ status: "failed", message: OFFLINE });
      });
    return () => {
      cancelled = true;
    };
  }, [wantsPreview, previewOverride, previewNonce]);

  const view = useMemo(
    () =>
      buildCheckoutView({
        mode,
        account,
        selection,
        preview,
        sendsAfterPay,
        canShortenTrim: Boolean(onShortenTrim),
      }),
    [mode, account, selection, preview, sendsAfterPay, onShortenTrim],
  );

  const checkoutAction = phase.kind === "checkout" ? phase.action : null;

  const fetchClientSecret = useCallback(async () => {
    if (!checkoutAction) throw new Error("No checkout to open");
    const request =
      checkoutAction.kind === "plan"
        ? {
            kind: "plan",
            plan: checkoutAction.plan,
            period: checkoutAction.period,
          }
        : { kind: "hours", hours: checkoutAction.hours };
    const answer = await postJson("/api/billing/checkout", request).catch(
      () => null,
    );
    const body = answer?.body as {
      clientSecret?: string;
      sessionId?: string;
      firstMonthDiscount?: boolean;
      error?: string;
    } | null;
    if (!answer?.ok || !body?.clientSecret || !body.sessionId) {
      const message = answer
        ? (body?.error ?? "Checkout couldn't open. Try again in a moment.")
        : OFFLINE;
      setProblem(message);
      setPhase({ kind: "choose" });
      throw new Error(message);
    }
    sessionIdRef.current = body.sessionId;
    setDiscounted(body.firstMonthDiscount === true);
    return body.clientSecret;
  }, [checkoutAction]);

  const onComplete = useCallback(async () => {
    const what = checkoutAction ? actionName(checkoutAction) : "your purchase";
    setPhase({ kind: "recording", what });
    const sessionId = sessionIdRef.current;
    // Up to a few tries: the payment can settle a moment after Checkout says
    // it is complete, and the webhook may also land first (a no-op here).
    for (let attempt = 0; attempt < 6 && sessionId; attempt++) {
      const answer = await postJson("/api/billing/confirm", {
        sessionId,
      }).catch(() => null);
      if (answer?.ok && answer.body) {
        const body = answer.body as {
          kind?: string;
          hours?: number;
          seconds?: number;
          expiresAt?: string;
          plan?: string | null;
          period?: string | null;
        };
        if (body.kind === "hours") {
          onDone({
            kind: "hours",
            hours: body.hours ?? 0,
            seconds: body.seconds ?? 0,
            expiresAt: body.expiresAt ?? "",
          });
          return;
        }
        if (
          body.kind === "plan" &&
          (body.plan === "coach" || body.plan === "coach-pro")
        ) {
          onDone({
            kind: "plan",
            plan: body.plan,
            period: body.period === "yearly" ? "yearly" : "monthly",
          });
          return;
        }
        break;
      }
      if (answer && answer.status !== 409 && answer.status !== 503) break;
      await new Promise((resolve) => setTimeout(resolve, 1500));
    }
    setPhase({ kind: "pending" });
    onPaymentPending?.();
  }, [checkoutAction, onDone, onPaymentPending]);

  const runUpgrade = useCallback(
    async (payTodayCents: number) => {
      setProblem(null);
      setPhase({ kind: "working" });
      const answer = await postJson("/api/billing/upgrade", {
        payTodayCents,
      }).catch(() => null);
      if (answer?.ok && answer.body) {
        const body = answer.body as { plan?: string; period?: string };
        onDone({
          kind: "upgrade",
          plan: body.plan === "coach" ? "coach" : "coach-pro",
          period: body.period === "yearly" ? "yearly" : "monthly",
        });
        return;
      }
      const refusal = answer?.body as Refusal;
      // The figure moved since it was shown: fetch the new one, charge nothing.
      // Any other refusal leaves the quote on screen, row and amount.
      const next = afterUpgradeRefusal(preview, refusal?.code);
      if (next.refetch && !previewOverride) {
        setFetched(next.preview);
        setPreviewNonce((n) => n + 1);
      }
      setProblem(
        answer
          ? (refusal?.error ??
              "The upgrade couldn't be made. Try again in a moment.")
          : OFFLINE,
      );
      setPhase({ kind: "choose" });
    },
    [onDone, preview, previewOverride],
  );

  const onPrimary = () => {
    const action = view.action;
    if (!action) return;
    setProblem(null);
    if (action.kind === "upgrade") {
      void runUpgrade(action.payTodayCents);
      return;
    }
    setDiscounted(null);
    setPhase({ kind: "checkout", action });
  };

  const busy =
    phase.kind === "checkout" ||
    phase.kind === "working" ||
    phase.kind === "recording";
  const primaryDisabled =
    view.action === null ||
    (view.action.kind !== "upgrade" && !CHECKOUT_CONFIGURED);

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
        if (phase.kind !== "choose") event.preventDefault();
      }}
      onEscapeKeyDown={(event) => {
        if (busy) event.preventDefault();
      }}
      className="fixed top-10 left-1/2 z-[51] max-h-[calc(100dvh-80px)] -translate-x-1/2 overflow-y-auto bg-[var(--surface-card)] outline-none data-[state=open]:animate-in data-[state=open]:duration-300 data-[state=open]:fade-in-0 data-[state=open]:slide-in-from-top-2 motion-reduce:data-[state=open]:slide-in-from-top-0"
      style={{
        width: "540px",
        maxWidth: "calc(100vw - 32px)",
        borderRadius: "var(--radius-card)",
        boxShadow: "var(--shadow-floating)",
      }}
    >
      <Band
        band={view.band}
        // Not while money is moving: the purchase is being made or recorded.
        closeHidden={phase.kind === "working" || phase.kind === "recording"}
      />

      {phase.kind === "choose" ? (
        <div className="flex flex-col gap-5 px-7 pt-6 pb-7">
          {view.periodPills && (
            <ChoicePills
              label="Billing"
              value={selection.period}
              onChange={(period) =>
                setSelection((current) => ({ ...current, period }))
              }
              options={[
                { value: "monthly", label: "Monthly" },
                { value: "yearly", label: "Yearly · 1 month free" },
              ]}
            />
          )}
          {view.scene === "hours" && (
            <ChoicePills
              label="Hours"
              value={String(selection.hours)}
              onChange={(hours) =>
                setSelection((current) => ({
                  ...current,
                  hours: Number(hours),
                }))
              }
              options={HOUR_PICKS.map((hours) => ({
                value: String(hours),
                label: `${hours}h`,
              }))}
            />
          )}

          <div
            role={view.scene === "hours" ? undefined : "radiogroup"}
            aria-label={view.scene === "hours" ? undefined : view.radioLabel}
            className="flex flex-col gap-2"
          >
            {view.rows.map((row) => (
              <CheckoutRow
                key={row.id}
                row={row}
                radio={view.scene !== "hours"}
                onChoose={() => {
                  if (row.id === "current") return;
                  const choice = row.id;
                  setProblem(null);
                  setSelection((current) => ({ ...current, choice }));
                }}
              />
            ))}
          </div>

          {(problem ?? view.problem) ? (
            <p
              role="alert"
              className="text-[12px] leading-[1.6] text-[var(--error)]"
            >
              {problem ?? view.problem}
            </p>
          ) : (
            view.aside && (
              <ConfirmAside>
                {view.aside}
                {view.sampleLink && (
                  <>
                    {" "}
                    <a
                      href="/dashboard/matches/sample"
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--blue)] hover:text-[var(--blue-hover)]"
                    >
                      See a sample report
                    </a>
                    .
                  </>
                )}
              </ConfirmAside>
            )
          )}

          <div className="flex items-center gap-2.5">
            {view.secondary === "Shorten the trim instead" && onShortenTrim ? (
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
              disabled={primaryDisabled}
              onClick={onPrimary}
              className={advButton("primary", "md")}
            >
              {view.primary}
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
                {actionName(phase.action)}
                {/* The amount once the server has said whether the discount
                    applies; Stripe's own form shows the same total. */}
                {phase.action.kind === "hours"
                  ? ` · ${formatUsdCents(phase.action.amountCents)}`
                  : discounted === null
                    ? ""
                    : ` · ${formatUsdCents(
                        planPricing(
                          phase.action.plan,
                          phase.action.period,
                          discounted,
                        ).dueCents,
                      )}`}{" "}
                — change
              </button>
              {/* Stripe's own frame. The key forces a new session when the choice changes. */}
              <EmbeddedCheckout
                key={actionKey(phase.action)}
                fetchClientSecret={fetchClientSecret}
                onComplete={onComplete}
              />
              <ConfirmAside>
                {phase.action.kind === "hours"
                  ? "All sales final, except where required by law."
                  : "Cancel any time in Settings › Plan."}
                {mode.kind === "paywall"
                  ? " Your trim and video stay put while you pay."
                  : ""}
              </ConfirmAside>
            </>
          ) : phase.kind === "working" ? (
            <p role="status" className="py-6 text-[13px] text-[var(--ink-600)]">
              Moving you up to {coachPlan("coach-pro").name}…
            </p>
          ) : phase.kind === "recording" ? (
            <p role="status" className="py-6 text-[13px] text-[var(--ink-600)]">
              Adding {phase.what} to your account…
            </p>
          ) : (
            <>
              <p
                role="status"
                className="pt-2 text-[13px] leading-[1.6] text-[var(--ink-700)]"
              >
                Your payment went through. It will show on your account within a
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

/**
 * The mesh band: a 30px/36px light display line whose figure carries full
 * white and whose words step back to 80% (tone, not weight, separates lead
 * from trail), a 13px body, then a hairline row for the offer or the balance.
 */
function Band({
  band,
  closeHidden,
}: {
  band: {
    lead: string;
    figure: string;
    trail: string;
    body: string;
    offer: string;
    offerDetail: string;
  };
  closeHidden: boolean;
}) {
  return (
    <div className="brand-mesh-gradient relative overflow-hidden px-7 pt-6 pb-6 text-white">
      <LiveDots />
      <div className="relative flex items-center gap-2.5">
        <Image
          src="/logos/logo.svg"
          alt="Advantage"
          width={320}
          height={57}
          className="h-[18px] w-auto brightness-0 invert"
        />
        <span className="flex-1" />
        <DialogPrimitive.Close
          aria-label="Close"
          hidden={closeHidden}
          className="flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-white/75 transition-colors hover:bg-white/15 hover:text-white focus-visible:shadow-[0_0_0_2px_rgba(255,255,255,0.7)] focus-visible:outline-none touch:hit-area"
        >
          <X className="size-3.5" strokeWidth={1.5} aria-hidden />
        </DialogPrimitive.Close>
      </div>
      <DialogPrimitive.Title className="relative mt-8 text-[30px] leading-[36px] font-light tracking-[-0.6px] text-balance text-white/80">
        {band.lead}{" "}
        <span className="whitespace-nowrap text-white tabular-nums">
          {band.figure}
        </span>
        {band.trail}
      </DialogPrimitive.Title>
      <DialogPrimitive.Description className="relative mt-3 max-w-[42ch] text-[13px] leading-[21px] tracking-[0.1px] text-pretty text-white/90">
        {band.body}
      </DialogPrimitive.Description>
      <div className="relative mt-6 flex items-baseline gap-3 border-t border-white/25 pt-4">
        <span className="text-[13px] font-medium text-white">{band.offer}</span>
        <span className="flex-1" />
        <span className="text-[12px] text-white/85 tabular-nums">
          {band.offerDetail}
        </span>
      </div>
    </div>
  );
}

const rowCls = (on: boolean) =>
  cn(
    "flex w-full items-center gap-3.5 rounded-[10px] border px-4 py-3 text-left transition-colors duration-200",
    on
      ? "border-[var(--blue)] bg-[var(--blue-pressed)] shadow-[0_0_0_1px_var(--blue)]"
      : "border-[var(--border-field)]",
  );

function RadioMark({ on }: { on: boolean }) {
  return (
    <span
      className={cn(
        "flex size-4 shrink-0 items-center justify-center rounded-full",
        on ? "bg-[var(--blue)]" : "border border-[var(--ink-300)]",
      )}
      aria-hidden
    >
      {on && <Check className="size-2.5 text-white" strokeWidth={3} />}
    </span>
  );
}

const barCls =
  "inline-block rounded-[3px] bg-[var(--surface-skeleton)] motion-safe:animate-pulse";

function CheckoutRow({
  row,
  radio,
  onChoose,
}: {
  row: CheckoutRowView;
  /** One of several ways to pay; false for the single extra-hours row. */
  radio: boolean;
  onChoose: () => void;
}) {
  const body = (
    <>
      {radio &&
        (row.selectable ? (
          <RadioMark on={row.selected} />
        ) : (
          <span className="size-4 shrink-0" aria-hidden />
        ))}
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="inline-flex items-center gap-2 text-[13px] font-medium text-[var(--ink-900)]">
          {row.name}
          {row.pill && <StatePill>{row.pill}</StatePill>}
        </span>
        {row.pending ? (
          <span className={cn(barCls, "mt-1 h-2.5 w-44")} aria-hidden />
        ) : (
          <span className="text-[11px] text-[var(--ink-500)]">{row.line}</span>
        )}
      </span>
      <span className="flex w-[112px] shrink-0 flex-col items-end leading-tight">
        {row.pending ? (
          <span className={cn(barCls, "my-1.5 h-3 w-14")} aria-hidden />
        ) : (
          <span className="flex items-baseline gap-1.5">
            {row.was && (
              <s className="text-[12px] text-[var(--ink-400)]">{row.was}</s>
            )}
            <span
              className={cn(
                "text-[16px] leading-6 tabular-nums",
                row.id === "current"
                  ? "text-[var(--ink-500)]"
                  : "text-[var(--ink-900)]",
              )}
            >
              {row.price}
            </span>
          </span>
        )}
        {row.then && (
          <span className="text-[11px] whitespace-nowrap text-[var(--ink-500)]">
            {row.then}
          </span>
        )}
      </span>
    </>
  );

  return (
    <>
      {row.caption && (
        <span className="mt-2 mb-0.5 text-[11px] text-[var(--ink-500)]">
          {row.caption}
        </span>
      )}
      {radio && row.selectable ? (
        <button
          type="button"
          role="radio"
          aria-checked={row.selected}
          onClick={onChoose}
          className={cn(
            rowCls(row.selected),
            "cursor-pointer focus-visible:shadow-[0_0_0_2px_var(--blue)] focus-visible:outline-none",
            !row.selected && "hover:bg-[var(--surface-subtle)]",
          )}
        >
          {body}
        </button>
      ) : (
        <div
          className={rowCls(!radio)}
          {...(row.pending
            ? { role: "status", "aria-label": `${row.line}…` }
            : {})}
        >
          {body}
        </div>
      )}
    </>
  );
}

/**
 * The 28px view pills (`CountPills` in the admin console, same classes):
 * mutually exclusive, so `radio` roles.
 */
function ChoicePills<T extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  label: string;
}) {
  return (
    <div
      role="radiogroup"
      aria-label={label}
      className="flex flex-wrap items-center gap-1.5"
    >
      {options.map((option) => {
        const on = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(option.value)}
            className={cn(
              "h-7 cursor-pointer rounded-full border px-3 text-[12px] whitespace-nowrap tabular-nums transition-colors duration-200 focus-visible:shadow-[0_0_0_2px_var(--blue)] focus-visible:outline-none",
              on
                ? "border-[var(--border-medium)] bg-[var(--surface-subtle)] font-medium text-[var(--ink-900)]"
                : "border-[var(--border-hairline)] bg-[var(--surface-card)] text-[var(--ink-600)] hover:text-[var(--ink-900)]",
            )}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
