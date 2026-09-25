"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  BetaWelcomeDialog,
  useBetaWelcomeTerms,
} from "@/components/dashboard/beta-welcome-dialog";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import type { HoursLeft } from "@/lib/services/splitstep/quota";
import { formatHoursShort, usageFraction } from "@/lib/data/usage-format";

/**
 * The header's way back to the beta terms: the welcome dialog's brand band
 * shrunk to a pill, carrying the one number people come back for — video
 * hours left this month. Clicking it reopens the dialog.
 *
 * The figure comes from `/api/splitstep/hours-left`, the same peek the upload
 * refuses on, so an individual whose shared beta band is spent sees that
 * rather than their own untouched cap. Advisory: the reservation at submit
 * time still decides. Re-read on every navigation, because the header
 * outlives pages and an upload spends hours without remounting it.
 */
export function BetaHeaderMeter() {
  const terms = useBetaWelcomeTerms();
  const hours = useHoursLeft();
  const [open, setOpen] = useState(false);

  return (
    <>
      <BetaMeterPill hours={hours} onClick={() => setOpen(true)} />
      <BetaWelcomeDialog open={open} onOpenChange={setOpen} terms={terms} />
    </>
  );
}

/**
 * The pill itself, with no data of its own, so `/design` draws the same one.
 * `hours` null is "not read yet" (or unreadable): the bare Beta tag, never a
 * full ring.
 */
export function BetaMeterPill({
  hours,
  onClick,
}: {
  hours: Pick<HoursLeft, "remainingSeconds" | "capSeconds" | "bandFull"> | null;
  onClick: () => void;
}) {
  const detail = !hours
    ? "About the beta"
    : hours.bandFull
      ? "This month's free video analysis is fully booked"
      : `${formatHoursShort(hours.remainingSeconds)} of ${formatHoursShort(hours.capSeconds)} video hours left`;

  return (
    <ChromeTooltip label="Free during the beta" detail={detail}>
      <button
        type="button"
        onClick={onClick}
        aria-label={hours ? `Beta: ${detail} this month` : "Beta"}
        className={cn(
          "brand-mesh-gradient mr-1 inline-flex h-7 cursor-pointer items-center gap-2 rounded-full pr-3 pl-1 text-white shadow-[0_1px_2px_rgba(59,130,246,0.35)] transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.97] motion-reduce:active:scale-100",
          "focus-visible:shadow-[0_0_0_2px_white,0_0_0_4px_var(--blue)] focus-visible:outline-none",
        )}
      >
        <span className="inline-flex h-5 items-center rounded-full bg-white/25 px-2 text-[9px] font-medium tracking-[0.08em] uppercase">
          Beta
        </span>
        {hours && (
          <>
            <HoursRing
              share={
                1 -
                usageFraction(
                  hours.capSeconds - hours.remainingSeconds,
                  hours.capSeconds,
                )
              }
            />
            <span className="tabular text-[12px] text-white/85">
              {hours.bandFull ? (
                <span className="font-medium text-white">Fully booked</span>
              ) : (
                <>
                  <span className="font-medium text-white">
                    {formatHoursShort(hours.remainingSeconds)}h
                  </span>{" "}
                  left
                </>
              )}
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
        strokeDasharray={`${c * share} ${c}`}
      />
    </svg>
  );
}

/**
 * The active workspace's hours left, or null until the first answer for it
 * lands — and on a failed read, so the pill falls back to the bare Beta tag
 * rather than claiming a full allowance.
 */
function useHoursLeft(): HoursLeft | null {
  const { active } = useWorkspace();
  const pathname = usePathname();
  const [hours, setHours] = useState<HoursLeft | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/splitstep/hours-left", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: HoursLeft | null) => {
        if (body) setHours(body);
      })
      .catch(() => {
        // Aborted by a newer read, or offline: keep what we had.
      });
    return () => controller.abort();
  }, [active.id, pathname]);

  // An answer for a workspace this viewer has since switched away from is
  // not this one's.
  return hours?.workspaceId === active.id ? hours : null;
}
