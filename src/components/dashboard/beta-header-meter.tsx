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
import { HoursRing } from "@/components/dashboard/shared/hours-ring";
import { PendingBar } from "@/components/dashboard/loading/pending";
import type { HoursLeft } from "@/lib/services/splitstep/quota";
import { currentBillingMonth } from "@/lib/services/splitstep/config";
import {
  formatHoursShort,
  formatResetDate,
  usageFraction,
} from "@/lib/data/usage-format";

/**
 * The header's way back to the beta terms: the welcome dialog's brand band
 * shrunk to a pill, carrying the one number people come back for — video
 * hours left this month. Clicking it reopens the dialog. A team workspace's
 * pill says Pilot, as Settings › Plan does (`workspaceTier`).
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
      <BetaMeterPill
        tier={terms.tier ?? "beta"}
        hours={hours}
        onClick={() => setOpen(true)}
      />
      <BetaWelcomeDialog open={open} onOpenChange={setOpen} terms={terms} />
    </>
  );
}

type PillHours = Pick<
  HoursLeft,
  "remainingSeconds" | "capSeconds" | "bandFull"
>;

/**
 * The pill itself, with no data of its own, so `/design` draws the same one.
 *
 * `hours` is `"loading"` until the first answer for this workspace lands: the
 * loaded shape with the tag as real text, the ring's bare track and one bar
 * where the figure goes, so nothing moves when it arrives. `null` is a read
 * that failed — the bare tag, never a full ring and never a skeleton that
 * waits on an answer that is not coming.
 *
 * Out of hours is one pill whichever allowance ran out; only the tooltip says
 * which, because to the person it is the same answer — no upload until the 1st.
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
  /** "Oct 1". Fixed by `/design` so its preview does not drift by month. */
  resetsOn?: string;
}) {
  const name = tier === "pilot" ? "Pilot" : "Beta";
  // The hours are a team's, so an empty allowance is "your team's" —
  // always true together with `tier`, so there is one flag to read, not two.
  const teamHours = tier === "pilot";
  const ready = hours !== "loading" && hours !== null ? hours : null;
  const out = ready !== null && ready.remainingSeconds <= 0;
  // Only called once hours are spent, so a still-loading or still-has-hours
  // pill — the two renders on every page load — never pays for the Date and
  // Intl work behind the default.
  const resetsOnOrDefault = () =>
    resetsOn ?? formatResetDate(currentBillingMonth());

  const detail =
    hours === "loading"
      ? "Checking your video hours"
      : !ready
        ? `About the ${tier}`
        : out
          ? outOfHoursDetail(ready, teamHours, resetsOnOrDefault())
          : `${formatHoursShort(ready.remainingSeconds)} of ${formatHoursShort(ready.capSeconds)} video hours left`;

  const ariaLabel =
    hours === "loading"
      ? `${name}: checking video hours left`
      : !ready
        ? name
        : out
          ? `${name}: out of video hours until ${resetsOnOrDefault()}`
          : `${name}: ${detail} this month`;

  return (
    <ChromeTooltip label={`Free during the ${tier}`} detail={detail}>
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel}
        aria-busy={hours === "loading" || undefined}
        className={cn(
          "brand-mesh-gradient mr-1 inline-flex h-7 cursor-pointer items-center gap-2 rounded-full pr-3 pl-1 text-white shadow-[0_1px_2px_rgba(59,130,246,0.35)] transition-[filter,transform] duration-150 hover:brightness-105 active:scale-[0.97] motion-reduce:active:scale-100",
          "focus-visible:shadow-[0_0_0_2px_white,0_0_0_4px_var(--blue)] focus-visible:outline-none",
        )}
      >
        <span className="inline-flex h-5 items-center rounded-full bg-white/25 px-2 text-[9px] font-medium tracking-[0.08em] uppercase">
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
            <HoursRing
              tone="inverse"
              share={
                1 -
                usageFraction(
                  ready.capSeconds - ready.remainingSeconds,
                  ready.capSeconds,
                )
              }
            />
            <span className="tabular text-[12px] text-white/85">
              {out ? (
                <span className="font-medium text-white">Out of hours</span>
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

/**
 * Why there are no hours, and when they come back. A spent shared band says
 * "for everyone", or someone who has used half an hour reads the meter as
 * wrong.
 */
function outOfHoursDetail(
  hours: PillHours,
  teamHours: boolean,
  resetsOn: string,
): string {
  if (hours.bandFull) {
    return `Free video hours are used up for everyone this month. Yours reset on ${resetsOn}.`;
  }
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
