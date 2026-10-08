"use client";

/**
 * VideoRequirementsDialog — the "View all requirements" link under the file
 * step's two requirement rows, and the dialog it opens.
 *
 * The rows say the two things most often got wrong; this holds the rest, plus
 * the one thing a sentence cannot show: what a frame that works looks like
 * beside one that does not. It is the only client boundary in the
 * requirements block — `VideoRequirements` itself stays server-renderable.
 *
 * `RosterDialog` is the DS Dialog (v3) shell at its compare width (520px);
 * reused as it stands rather than copied. One primary, and it only closes:
 * nothing here is a decision.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  HardDrive,
  Monitor,
  Timer,
  User,
  Video,
  X,
  type LucideIcon,
} from "lucide-react";
import { RosterDialog } from "@/components/dashboard/team/dialog-shell";
import { advButton } from "@/lib/ui/adv-button";
import { CourtFrame } from "./CourtFrame";

interface Requirement {
  icon: LucideIcon;
  lead: string;
  rest: string;
}

/**
 * Split by who can check, because that is the question the dialog answers:
 * "what do I have to get right myself?" The probe reads resolution, frame
 * rate, size and container off the file; nothing on this page can see how a
 * match was filmed or edited.
 *
 * The provider's own numbers and claims — see `VideoRequirements` for where
 * each was checked. The framing rule is not a row: the two frames that open
 * "Yours to check" say it.
 */
const YOURS_TO_CHECK: readonly Requirement[] = [
  {
    icon: Timer,
    lead: "Uncut, start to finish",
    rest: " — keep the time between points and don't use a highlights edit.",
  },
  {
    icon: Video,
    lead: "One camera that doesn't move",
    rest: " — use a tripod or fix a phone to the fence. Following the play breaks the analysis.",
  },
  {
    icon: User,
    lead: "Singles, complete games",
    rest: " — what you keep after trimming has to match the score you enter in step 4.",
  },
];

const WE_CHECK: readonly Requirement[] = [
  {
    icon: Monitor,
    lead: "1080p at 30 fps or higher",
    rest: " — 60 fps is better.",
  },
  {
    icon: HardDrive,
    lead: "Under 8 GB",
    rest: " — MP4 (H.264) works best. Most camera and phone formats are accepted.",
  },
];

function Frame({
  variant,
  lead,
  children,
}: {
  variant: "works" | "wont-work";
  lead: string;
  children: React.ReactNode;
}) {
  const Mark = variant === "works" ? Check : X;
  return (
    <div className="flex flex-col gap-3">
      <CourtFrame
        variant={variant}
        className="block w-full rounded-[var(--radius-element)]"
      />
      <div className="flex items-start gap-2">
        <Mark
          className={`mt-0.5 size-3.5 shrink-0 ${
            variant === "works" ? "text-[var(--blue)]" : "text-[var(--ink-500)]"
          }`}
          strokeWidth={1.5}
          aria-hidden="true"
        />
        <span className="text-[12px] leading-[18px] text-[var(--ink-700)]">
          <b className="font-medium text-[var(--ink-900)]">{lead}</b>
          {children}
        </span>
      </div>
    </div>
  );
}

function RequirementRows({ items }: { items: readonly Requirement[] }) {
  return (
    <>
      {items.map(({ icon: Icon, lead, rest }) => (
        <div key={lead} className="flex items-start gap-2.5">
          <Icon
            className="mt-0.5 size-3.5 shrink-0 text-[var(--ink-400)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          <span className="text-[12px] leading-[18px] text-[var(--ink-700)]">
            <b className="font-medium text-[var(--ink-900)]">{lead}</b>
            {rest}
          </span>
        </div>
      ))}
    </>
  );
}

export function VideoRequirementsDialog({
  defaultOpen = false,
}: {
  /** Start open — for `/design/file-step`, which shows the dialog itself. */
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const focusTimer = useRef<ReturnType<typeof setTimeout>>(undefined);
  // The shell is opened by state, not by a Radix trigger, so Radix has no
  // trigger to hand focus back to and leaves it on <body>. Return it here,
  // a tick later so it lands after the dialog's own focus scope lets go.
  const onOpenChange = (next: boolean) => {
    setOpen(next);
    if (!next) {
      focusTimer.current = setTimeout(() => triggerRef.current?.focus(), 0);
    }
  };
  useEffect(() => () => clearTimeout(focusTimer.current), []);
  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
        className="cursor-pointer text-[12px] leading-4 text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)]"
      >
        View all requirements
      </button>

      <RosterDialog
        open={open}
        onOpenChange={onOpenChange}
        title="Video requirements"
        description="We check quality when you add the file. The rest is yours to check."
        footer={
          <>
            <Link
              href="/dashboard/help#advantage-intelligence"
              className="mr-auto inline-flex items-center gap-1 text-[12px] text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)]"
            >
              Help center
              <ArrowUpRight
                className="size-3"
                strokeWidth={1.5}
                aria-hidden="true"
              />
            </Link>
            <button
              type="button"
              onClick={() => onOpenChange(false)}
              className={advButton("primary", "md")}
            >
              Done
            </button>
          </>
        }
      >
        <div className="flex flex-col gap-3">
          <span className="eyebrow">Yours to check</span>
          <div className="grid grid-cols-2 gap-4 pb-1.5">
            <Frame variant="works" lead="Works">
              {
                " — camera raised behind the back fence. The far service line and the space behind the near baseline are both in frame."
              }
            </Frame>
            <Frame variant="wont-work" lead="Won't work">
              {
                " — camera too low and too close. The net hides the far service line and the near baseline is cut off."
              }
            </Frame>
          </div>
          <RequirementRows items={YOURS_TO_CHECK} />
        </div>

        <div className="flex flex-col gap-3 border-t border-[var(--border-hairline)] pt-[18px]">
          <span className="eyebrow">We check when you add the file</span>
          <RequirementRows items={WE_CHECK} />
        </div>
      </RosterDialog>
    </>
  );
}
