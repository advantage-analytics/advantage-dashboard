"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  BetaWelcomeDialog,
  useBetaWelcomeTerms,
} from "@/components/dashboard/beta-welcome-dialog";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { HoursRing } from "@/components/dashboard/shared/hours-ring";
import { PendingBar } from "@/components/dashboard/loading/pending";
import type { HoursLeft } from "@/lib/services/splitstep/quota";
import { PLAN_HREF } from "@/lib/services/credits/packs";
import {
  currentBillingMonth,
  freeHoursReturnOn,
} from "@/lib/services/splitstep/config";
import {
  formatHoursLong,
  formatHoursShort,
  formatResetDate,
  isUnlimitedCap,
  monthName,
  usageFraction,
} from "@/lib/data/usage-format";

/**
 * The header's video-hours pill: the welcome dialog's brand band shrunk to a
 * pill, carrying the one number people come back for — video hours left. A
 * personal workspace's pill goes to Settings › Plan, where hours and credits
 * are bought (frames C1–C4 in the Credit Packs Mockups (docs/plans/2027-player-pricing.md)); a team workspace's says
 * Pilot, as Settings › Plan does (`workspaceTier`), and reopens the dialog.
 *
 * The figure comes from `/api/splitstep/hours-left`, the same peek the upload
 * refuses on. Advisory: the reservation at submit time still decides.
 * Re-read on every navigation, because the header outlives pages and an
 * upload spends hours without remounting it.
 */
export function BetaHeaderMeter() {
  const terms = useBetaWelcomeTerms();
  const hours = useHoursLeft();
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const tier = terms.tier ?? "beta";

  return (
    <>
      <BetaMeterPill
        tier={tier}
        hours={hours}
        onClick={() =>
          tier === "pilot" ? setOpen(true) : router.push(PLAN_HREF)
        }
      />
      <BetaWelcomeDialog open={open} onOpenChange={setOpen} terms={terms} />
    </>
  );
}

type PillHours = Pick<HoursLeft, "remainingSeconds" | "capSeconds"> &
  Partial<Pick<HoursLeft, "creditSeconds">>;

/**
 * The pill itself, with no data of its own, so `/design` draws the same one.
 *
 * `hours` is `"loading"` until the first answer for this workspace lands: the
 * loaded shape with the tag as real text, the ring's bare track and one bar
 * where the figure goes, so nothing moves when it arrives. `null` is a read
 * that failed — the bare tag, never a full ring and never a skeleton that
 * waits on an answer that is not coming.
 *
 * Personal states (C1–C4): free hours left; running low (the ring stays
 * white, only the tooltip says it); free spent with credits, where the figure
 * is the credit balance; and out of everything.
 */
export function BetaMeterPill({
  tier,
  hours,
  onClick,
  resetsOn,
}: {
  tier: "beta" | "pilot";
  hours: PillHours | "loading" | null;
  onClick: () => void;
  /**
   * "Oct 1". Fixed by `/design` so its preview does not drift by month. Null
   * means a personal player's free hours end rather than reset (December).
   */
  resetsOn?: string | null;
}) {
  const name = tier === "pilot" ? "Pilot" : "Beta";
  // The hours are a team's, so an empty allowance is "your team's" —
  // always true together with `tier`, so there is one flag to read, not two.
  const teamHours = tier === "pilot";
  const ready = hours !== "loading" && hours !== null ? hours : null;
  // An admin's personal workspace — no cap, so nothing to count down.
  const unlimited = ready !== null && isUnlimitedCap(ready.capSeconds);
  const credits = teamHours ? 0 : (ready?.creditSeconds ?? 0);
  const freeOut = ready !== null && ready.remainingSeconds <= 0;
  // C3: free hours spent, credits carry it — the figure is credits.
  const onCredits = freeOut && credits > 0;
  const out = freeOut && credits <= 0;
  // C2: running low on free hours with nothing behind them. The ring stays
  // white; only the tooltip says it (never amber, never red).
  const low =
    ready !== null &&
    !freeOut &&
    credits <= 0 &&
    ready.remainingSeconds <= ready.capSeconds * 0.2;
  // Only called once it is needed, so the two renders on every page load
  // never pay for the Date and Intl work behind the default.
  // A team's allowance resets every month; a player's free hours stop after
  // Dec 31, so in December there is no date to promise them.
  const resetsOnOrDefault = () =>
    resetsOn !== undefined
      ? resetsOn
      : teamHours
        ? formatResetDate(currentBillingMonth())
        : freeHoursReturnOn();

  const freeOf = ready
    ? `${formatHoursShort(ready.remainingSeconds)} of ${formatHoursShort(ready.capSeconds)}`
    : "";

  const label = unlimited
    ? "Unlimited video hours"
    : !ready || teamHours
      ? `Free during the ${tier}`
      : out
        ? "Out of video hours"
        : onCredits
          ? "Using your credits"
          : low
            ? "Running low"
            : `Free during the ${tier}`;

  const detail =
    hours === "loading"
      ? "Checking your video hours"
      : !ready
        ? `About the ${tier}`
        : unlimited
          ? "Admin accounts have no monthly cap. Click for Plan."
          : teamHours
            ? out
              ? outOfHoursDetail(
                  ready,
                  true,
                  resetsOnOrDefault() ?? formatResetDate(currentBillingMonth()),
                )
              : `${freeOf} video hours left`
            : out
              ? resetsOnOrDefault()
                ? `Free hours come back ${resetsOnOrDefault()}. Click to add credits.`
                : "Free hours have ended. Click to add credits."
              : onCredits
                ? `Free hours are used for ${monthName(currentBillingMonth())}. ${formatHoursLong(credits)} in credits left.`
                : low
                  ? resetsOnOrDefault()
                    ? `${freeOf} free hours left. They reset ${resetsOnOrDefault()}, or add credits on Plan.`
                    : `${freeOf} free hours left, the last before they end. Add credits on Plan.`
                  : credits > 0
                    ? `${freeOf} free hours left this month, plus ${formatHoursLong(credits)} in credits. Click for Plan.`
                    : `${freeOf} free hours left this month. Click for Plan.`;

  const ariaLabel =
    hours === "loading"
      ? `${name}: checking video hours left`
      : !ready
        ? name
        : out
          ? resetsOnOrDefault()
            ? `${name}: out of video hours until ${resetsOnOrDefault()}`
            : `${name}: out of video hours`
          : `${name}: ${detail}`;

  // The ring is the free allowance; on credits it reads full (C3), out of
  // everything it reads empty (C4).
  const share = !ready
    ? 0
    : unlimited || onCredits
      ? 1
      : 1 -
        usageFraction(
          ready.capSeconds - ready.remainingSeconds,
          ready.capSeconds,
        );

  return (
    <ChromeTooltip label={label} detail={detail}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-busy={hours === "loading" || undefined}
        className={cn(
          "brand-mesh-gradient mr-1 inline-flex h-7 cursor-pointer items-center gap-2 rounded-full pr-3 pl-1 text-white shadow-[0_1px_2px_rgba(59,130,246,0.35)] transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.97] motion-reduce:active:scale-100",
          "focus-visible:shadow-[0_0_0_2px_white,0_0_0_4px_var(--blue)] focus-visible:outline-none",
          hours !== null && "max-md:pl-2",
        )}
      >
        {/* The tag gives way under 768px — the header there is 326px and
            the ring and hours are what the pill is for; the name is still
            the button's label. Kept when the read failed: then it is all
            the pill has. */}
        <span
          className={cn(
            "inline-flex h-5 items-center rounded-full bg-white/25 px-2 text-[9px] font-medium tracking-[0.08em] uppercase",
            hours !== null && "max-md:hidden",
          )}
        >
          {name}
        </span>
        {hours === "loading" && (
          <>
            <HoursRing share={null} tone="inverse" />
            {/* Sized to "1.5h left", the figure most people will see. */}
            <PendingBar tone="inverse" className="h-2 w-[46px]" />
          </>
        )}
        {ready && (
          <>
            <HoursRing tone="inverse" share={share} />
            <span className="tabular text-[12px] text-white/85">
              {unlimited ? (
                <span className="font-medium text-white">Unlimited</span>
              ) : out ? (
                <span className="font-medium text-white">Out of hours</span>
              ) : onCredits ? (
                <>
                  <span className="font-medium text-white">
                    {formatHoursShort(credits)}h
                  </span>{" "}
                  credits
                </>
              ) : (
                <>
                  <span className="font-medium text-white">
                    {formatHoursShort(ready.remainingSeconds)}h
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

/** A team's empty allowance, and when it comes back. */
function outOfHoursDetail(
  hours: PillHours,
  teamHours: boolean,
  resetsOn: string,
): string {
  const cap = formatHoursShort(hours.capSeconds);
  const unit = cap === "1" ? "video hour" : "video hours";
  return teamHours
    ? `Your team has used its ${cap} ${unit} this month. They reset on ${resetsOn}.`
    : `You've used your ${cap} ${unit} this month. They reset on ${resetsOn}.`;
}

/**
 * The active workspace's hours left: `"loading"` until the first answer for
 * this workspace lands, then the figure, or `null` when the read failed.
 *
 * Loading happens once per workspace. A navigation re-reads behind the figure
 * already showing, and a re-read that fails keeps it, so the pill neither
 * flickers on every page nor drops a good number for a bad request.
 */
function useHoursLeft(): HoursLeft | "loading" | null {
  const { active } = useWorkspace();
  const pathname = usePathname();
  const [read, setRead] = useState<{
    workspaceId: string;
    hours: HoursLeft | null;
  } | null>(null);

  useEffect(() => {
    const workspaceId = active.id;
    const controller = new AbortController();
    const fail = () =>
      setRead((prev) =>
        prev?.workspaceId === workspaceId ? prev : { workspaceId, hours: null },
      );

    fetch("/api/splitstep/hours-left", {
      signal: controller.signal,
      cache: "no-store",
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((body: HoursLeft | null) => {
        // An answer for another workspace (the server's cookie moved under
        // us) is not this one's.
        if (body?.workspaceId === workspaceId) {
          setRead({ workspaceId, hours: body });
        } else {
          fail();
        }
      })
      .catch(() => {
        // Aborted by a newer read: that one answers instead.
        if (!controller.signal.aborted) fail();
      });
    return () => controller.abort();
  }, [active.id, pathname]);

  return read?.workspaceId === active.id ? read.hours : "loading";
}
