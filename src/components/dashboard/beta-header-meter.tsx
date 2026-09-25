"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  BetaWelcomeDialog,
  useBetaWelcomeTerms,
} from "@/components/dashboard/beta-welcome-dialog";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import {
  accountTypeFor,
  monthlyCapSecondsFor,
  sumUsedSeconds,
} from "@/lib/services/splitstep/quota";
import {
  formatHoursShort,
  secondsLeft,
  usageFraction,
} from "@/lib/data/usage-format";

/**
 * The header's way back to the beta terms: the welcome dialog's brand band
 * shrunk to a pill, carrying the one number people come back for — video
 * hours left this month. Clicking it reopens the dialog.
 *
 * The reading is advisory, like the wizard's footer meter: the reserve RPC is
 * the authority at submit time. It is re-read on every navigation, because the
 * header outlives pages and an upload spends hours without remounting it.
 */
export function BetaHeaderMeter() {
  const { active } = useWorkspace();
  const terms = useBetaWelcomeTerms();
  const usedSeconds = useMonthlyUsedSeconds();
  const [open, setOpen] = useState(false);

  return (
    <>
      <BetaMeterPill
        usedSeconds={usedSeconds}
        capSeconds={monthlyCapSecondsFor(active)}
        onClick={() => setOpen(true)}
      />
      <BetaWelcomeDialog open={open} onOpenChange={setOpen} terms={terms} />
    </>
  );
}

/**
 * The pill itself, with no data of its own, so `/design` draws the same one.
 * `usedSeconds` null is "not read yet": the bare Beta tag, never a full ring.
 */
export function BetaMeterPill({
  usedSeconds,
  capSeconds,
  onClick,
}: {
  usedSeconds: number | null;
  capSeconds: number;
  onClick: () => void;
}) {
  const left =
    usedSeconds === null ? null : secondsLeft(usedSeconds, capSeconds);
  const share =
    usedSeconds === null ? 1 : 1 - usageFraction(usedSeconds, capSeconds);
  const hoursLeft =
    left === null
      ? null
      : `${formatHoursShort(left)} of ${formatHoursShort(capSeconds)} video hours left`;

  return (
    <ChromeTooltip
      label="Free during the beta"
      detail={hoursLeft ?? "About the beta"}
    >
      <button
        type="button"
        onClick={onClick}
        aria-label={hoursLeft ? `Beta: ${hoursLeft} this month` : "Beta"}
        className={cn(
          "brand-mesh-gradient mr-1 inline-flex h-7 cursor-pointer items-center gap-2 rounded-full pr-3 pl-1 text-white shadow-[0_1px_2px_rgba(59,130,246,0.35)] transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.97] motion-reduce:active:scale-100",
          "focus-visible:shadow-[0_0_0_2px_white,0_0_0_4px_var(--blue)] focus-visible:outline-none",
        )}
      >
        <span className="inline-flex h-5 items-center rounded-full bg-white/25 px-2 text-[9px] font-medium tracking-[0.08em] uppercase">
          Beta
        </span>
        {left !== null && (
          <>
            <HoursRing share={share} />
            <span className="tabular text-[12px] text-white/85">
              <span className="font-medium text-white">
                {formatHoursShort(left)}h
              </span>{" "}
              left
            </span>
          </>
        )}
      </button>
    </ChromeTooltip>
  );
}

/** A 14px ring: the share of the month's hours still left, in white. */
function HoursRing({ share }: { share: number }) {
  const r = 6;
  const c = 2 * Math.PI * r;
  return (
    <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90" aria-hidden>
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="rgba(255,255,255,0.3)"
        strokeWidth="2"
      />
      <circle
        cx="8"
        cy="8"
        r={r}
        fill="none"
        stroke="white"
        strokeWidth="2"
        strokeLinecap="round"
        strokeDasharray={`${c * Math.max(0, Math.min(1, share))} ${c}`}
      />
    </svg>
  );
}

/**
 * Seconds of video spent this month against the active workspace's cap, or
 * null until the first read lands (or when it fails, so the pill falls back to
 * the bare Beta tag rather than claiming a full allowance).
 *
 * The same two reads the upload wizard makes: a team reads the program pool
 * through `program_usage_total`, because `processing_usage` RLS only returns
 * the caller's own rows; a personal workspace reads its ledger directly.
 */
function useMonthlyUsedSeconds(): number | null {
  const { active } = useWorkspace();
  const pathname = usePathname();
  const supabase = useMemo(() => createClient(), []);
  const [reading, setReading] = useState<{
    key: string;
    used: number;
  } | null>(null);
  const key = `${active.kind}:${active.id}`;
  const accountType = accountTypeFor(active);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let used: number;
      if (active.kind === "team") {
        const { data, error } = await supabase.rpc("program_usage_total", {
          p_program_id: active.id,
          p_billing_month: currentBillingMonth(),
        });
        if (error || cancelled) return;
        used = Number(data ?? 0);
      } else {
        const { data, error } = await supabase
          .from("processing_usage")
          .select("reserved_seconds, actual_seconds")
          .eq("account_id", active.id)
          .eq("account_type", accountType)
          .eq("billing_month", currentBillingMonth())
          .eq("released", false);
        if (error || cancelled) return;
        used = sumUsedSeconds(data ?? []);
      }
      setReading({ key, used });
    })();

    return () => {
      cancelled = true;
    };
  }, [supabase, active.kind, active.id, accountType, key, pathname]);

  // A reading taken for another workspace is not this one's.
  return reading?.key === key ? reading.used : null;
}
