"use client";

import {
  useId,
  useOptimistic,
  useState,
  useTransition,
  type ComponentProps,
  type ComponentType,
} from "react";
import { useRouter } from "next/navigation";
import { Lock, Mail, RefreshCw, Users } from "lucide-react";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { FloatMenuDivider } from "@/components/ui/float-menu";
import { PersonAvatar } from "@/components/ui/person-avatar";
import {
  AccessOption,
  SECONDARY_BUTTON,
  UrlRow,
  moveFocusBetweenRungs,
} from "@/components/ui/share-panel";
import { SeatBoxes, SeatNote } from "@/components/dashboard/team/dialog-shell";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  createJoinLink,
  resetJoinLink,
  revokeJoinLink,
  setJoinLinkMode,
} from "@/components/dashboard/settings/team-actions";
import { advButton } from "@/lib/ui/adv-button";
import { getInitials } from "@/lib/data/match-utils";
import { cn } from "@/lib/utils";
import type { JoinLinkMode } from "@/lib/services/programs/join-links";
import type { TeamJoinLink } from "@/lib/data/team-settings-server";
import type { SeatUsage } from "@/lib/data/teams-server";
import type { ProgramRole } from "@/lib/workspace/types";

type PopoverContentProps = ComponentProps<typeof PopoverContent>;

/** What a trigger must accept: the props Radix hands it, and no children. */
export type JoinLinkTriggerProps = Omit<ComponentProps<"button">, "children">;

/** The ladder's three rungs: no link, or a live link in one of its modes. */
type Rung = "off" | JoinLinkMode;

/** The ladder's rungs, top to bottom; both layouts draw the same three. */
const RUNGS: readonly { rung: Rung; label: string; description: string }[] = [
  {
    rung: "off",
    label: "Link off",
    description: "Players join by email invite only",
  },
  {
    rung: "open",
    label: "Anyone with the link",
    description: "Joins as a player right away",
  },
  {
    rung: "approve",
    label: "Anyone, with approval",
    description: "Staff approve each person on the Roster",
  },
];

/** What the panel needs to know about the program and the viewer. */
export interface JoinLinkPanelProps {
  programId: string;
  programName: string;
  /** `TeamSettingsData.joinLink` — the live link, or null when there is none. */
  joinLink: TeamJoinLink | null;
  /** The viewer's role on THIS program. `staff` sees the ladder locked. */
  role: ProgramRole;
  /** `programs.players_can_upload` — what a player who joins can do. */
  playersCanUpload: boolean;
  /** The program's seat ledger, drawn beside the open rung. */
  seats: SeatUsage;
  /**
   * The approve-mode note's way to the Roster. The Members card passes its own
   * `Roster ↗` (which switches workspace first when it has to); a mount ON the
   * Roster passes nothing, and the note names the page in plain text.
   */
  rosterLink?: React.ReactNode;
  /**
   * Where the panel is drawn. `popover` is the 320px menu surface; `dialog`
   * is the Roster's Invite dialog, which gives the same three parts room:
   * captions in place of the menu's hairlines, the link's note beside its
   * lesser actions, and the seats as the dialog's own seat note instead of
   * squares squeezed into a rung.
   */
  variant?: "popover" | "dialog";
}

export interface JoinLinkPopoverProps extends JoinLinkPanelProps {
  /**
   * The trigger COMPONENT — not an element — for the same reason as
   * `ShareMatchButton`'s `trigger` (read that prop's note): rendered through
   * `PopoverTrigger asChild`, it must spread the props it is handed, `ref`
   * included, onto one `<button>`. A component survives the RSC boundary;
   * `children` from a Server Component can vanish inside Radix's `Slot`.
   */
  trigger: ComponentType<JoinLinkTriggerProps>;
  /** Controlled open state. Leave both out to let the popover own it. */
  open?: boolean;
  onOpenChange?: (open: boolean) => void;
  side?: PopoverContentProps["side"];
  align?: PopoverContentProps["align"];
}

/**
 * The program's join link, around whatever trigger the surface draws:
 *
 *   <JoinLinkPopover trigger={InviteLinkTrigger} open={open}
 *     onOpenChange={setOpen} programId=… joinLink=… role=… seats=… />
 *
 * Settings › Teams › Members mounts it from its "Invite link" button (and its
 * link row opens the same one, controlled); the Roster's Invite dialog can
 * mount it from its own row. The trigger owns how it looks; this owns the
 * popover and the panel.
 */
export function JoinLinkPopover({
  trigger: Trigger,
  open: openProp,
  onOpenChange,
  side = "bottom",
  align = "end",
  ...panel
}: JoinLinkPopoverProps): React.JSX.Element {
  const [openState, setOpenState] = useState(false);
  const open = openProp ?? openState;
  const setOpen = (next: boolean) => {
    if (openProp === undefined) setOpenState(next);
    onOpenChange?.(next);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Trigger />
      </PopoverTrigger>

      <PopoverContent
        side={side}
        align={align}
        sideOffset={8}
        className={cn(
          // The menu surface (Dropdown / Menu), as the match Share popover.
          "w-[320px] rounded-[var(--radius-dropdown)] border border-[var(--border-medium)] bg-[var(--surface-card)] p-1",
          "shadow-[var(--shadow-dropdown)]",
        )}
      >
        <JoinLinkPanel {...panel} />
      </PopoverContent>
    </Popover>
  );
}

/**
 * The popover's body, cloned from the match's `SharePopoverPanel`: who can
 * join with the link as a three-rung check-dot ladder, then — under a
 * hairline — the link to hand out, then one closing sentence.
 *
 *   - "Link off": no link; players join by email invite only.
 *   - "Anyone with the link": opening it joins as a player at once. The seat
 *     boxes ride the rung because seats are what an open link spends.
 *   - "Anyone, with approval": opening it files a request for the Roster.
 *
 * Choosing a live rung acts at once (optimistic, settling on the action's
 * answer): from off it mints a link, between the two it changes the mode on
 * the same URL. Stepping down to off asks first, in place of the link row —
 * a link that has been handed out dies for everyone, and turning it on again
 * mints a new one. Only "Turn off" revokes.
 *
 * Staff may hand the link out but not change it: they see the ladder
 * `aria-disabled` (never `disabled`, so it stays in the tab order and
 * announces why), Copy and Email live, no Reset, and a note naming who can.
 */
export function JoinLinkPanel({
  programId,
  programName,
  joinLink,
  role,
  playersCanUpload,
  seats,
  rosterLink,
  variant = "popover",
}: JoinLinkPanelProps) {
  const router = useRouter();
  const ladderLabelId = useId();
  const { viewer } = useWorkspace();
  const [link, setLink] = useState<string | null>(joinLink?.url ?? null);
  const [rung, setRung] = useState<Rung>(joinLink?.mode ?? "off");
  const [error, setError] = useState<string | null>(null);
  const [confirmingOff, setConfirmingOff] = useState(false);
  const [pending, startTransition] = useTransition();
  const [optimisticRung, setOptimisticRung] = useOptimistic(rung);

  // A fresh server render (the actions' `revalidatePath`, `router.refresh`)
  // hands down the current row; follow it.
  const [seeded, setSeeded] = useState(joinLink);
  if (seeded !== joinLink) {
    setSeeded(joinLink);
    setLink(joinLink?.url ?? null);
    setRung(joinLink?.mode ?? "off");
  }

  // Owner and coaches change the link; staff only hand it out. Players never
  // reach this panel (the Members card gates on staff), but are locked too.
  const locked = role !== "owner" && role !== "coach";
  const chosen: Rung = confirmingOff ? "off" : optimisticRung;
  const on = optimisticRung !== "off" && link !== null;

  // Who made the link on screen. Between an action and the refresh that
  // follows it, the server's row is the old one (or none): the link on
  // screen is then one the viewer just minted, a moment ago, with no joins.
  const meta =
    joinLink && joinLink.url === link
      ? joinLink
      : {
          createdAt: new Date().toISOString(),
          createdByMe: true,
          createdByName: null,
          uses: 0,
        };

  function choose(next: Rung) {
    if (locked || pending) return;
    setError(null);
    if (next === "off") {
      if (optimisticRung !== "off") setConfirmingOff(true);
      return;
    }
    setConfirmingOff(false);
    if (next === optimisticRung) return;
    const from = optimisticRung;
    startTransition(async () => {
      setOptimisticRung(next);
      if (from === "off" || link === null) {
        const result = await createJoinLink(programId, next);
        if (!result.ok) {
          setError(result.error);
          return;
        }
        setLink(result.url);
      } else {
        const result = await setJoinLinkMode(programId, next);
        if (!result.ok) {
          setError(result.error);
          return;
        }
      }
      setRung(next);
      router.refresh();
    });
  }

  function turnOff() {
    if (locked || pending) return;
    startTransition(async () => {
      setOptimisticRung("off");
      const result = await revokeJoinLink(programId);
      setConfirmingOff(false);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLink(null);
      setRung("off");
      router.refresh();
    });
  }

  function reset() {
    if (locked || pending) return;
    setError(null);
    startTransition(async () => {
      const result = await resetJoinLink(programId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setLink(result.url);
      router.refresh();
    });
  }

  // Email and Reset link, sized by the layout that draws them.
  const linkActions = (url: string, sizing: string) => (
    <>
      <a
        href={buildMailtoHref(programName, url)}
        className={cn(SECONDARY_BUTTON, sizing)}
      >
        <Mail
          className="size-3.5 text-[var(--nav-fg)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        Email
      </a>
      {!locked && (
        <button
          type="button"
          onClick={reset}
          disabled={pending}
          className={cn(SECONDARY_BUTTON, sizing)}
        >
          <RefreshCw
            className="size-3.5 text-[var(--nav-fg)]"
            strokeWidth={1.5}
            aria-hidden="true"
          />
          Reset link
        </button>
      )}
    </>
  );

  // The row between the two hairlines, when there is one.
  let body: React.ReactNode = null;
  // The question that row asks while stepping down to off, shared by both
  // variants; each wraps it in its own spacing.
  let confirm: React.ReactNode = null;
  if (confirmingOff) {
    const stay =
      meta.uses === 1
        ? " — the 1 who already joined stays"
        : meta.uses > 1
          ? ` — the ${meta.uses} who already joined stay`
          : "";
    confirm = (
      <>
        <p className="text-[12px] leading-[17px] text-[var(--ink-700)]">
          {`Turn off the link? It stops working for everyone who has it${stay}. Turning it back on makes a new one.`}
        </p>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            autoFocus
            onClick={() => setConfirmingOff(false)}
            className={advButton("ghost", "sm")}
          >
            Keep link
          </button>
          <button
            type="button"
            onClick={turnOff}
            disabled={pending}
            className={advButton("danger-solid", "sm")}
          >
            Turn off
          </button>
        </div>
      </>
    );
    body = (
      <div className="flex flex-col gap-2.5 px-2.5 pt-2 pb-2.5">{confirm}</div>
    );
  } else if (on && link) {
    body = (
      <div className="flex flex-col gap-2 px-2.5 pt-2 pb-2.5">
        <UrlRow url={link} />
        {/* The other ways out, one row of equal halves under the link — the
            same 32px and edges as Copy, so the link row stays the lead. */}
        <div className="flex gap-2">{linkActions(link, "flex-1")}</div>
      </div>
    );
  }

  // The closing sentence.
  let note: React.ReactNode;
  if (error) {
    note = <span className="text-[var(--danger)]">{error}</span>;
  } else if (locked) {
    note = (
      <>
        <Lock
          className="size-[11px] shrink-0 text-[var(--ink-400)]"
          strokeWidth={1.5}
          aria-hidden="true"
        />
        {on
          ? "You can share the link. Only the owner and coaches can change or reset it."
          : "Only the owner and coaches can turn on a join link."}
      </>
    );
  } else if (!on && !confirmingOff) {
    note =
      "A join link admits players only — staff and coaches are invited by email.";
  } else if (!playersCanUpload) {
    note = "Players join with no upload rights until a coach allows it";
  } else if (chosen === "approve") {
    note = (
      <span>
        Requests land on the {rosterLink ?? "Roster"} · The same link, nothing
        to re-send
      </span>
    );
  } else {
    const byName = meta.createdByMe ? "you" : meta.createdByName;
    note = (
      <>
        {byName && (
          <PersonAvatar
            initials={meta.createdByMe ? viewer.initials : getInitials(byName)}
            photoUrl={meta.createdByMe ? viewer.avatarUrl : null}
            className="size-[18px] bg-[var(--ink-200)] text-[9px]"
          />
        )}
        {`Made ${formatInviteDate(meta.createdAt)}${byName ? ` by ${byName}` : ""} · ${meta.uses} joined · Players only`}
      </>
    );
  }

  const free = Math.max(0, seats.seats - seats.used - seats.pending);

  if (variant === "dialog") {
    const showLink = on && link !== null && !confirmingOff;
    return (
      <div className="flex flex-col gap-[18px]">
        <div className="flex flex-col gap-1.5">
          <span
            id={ladderLabelId}
            className="text-[11px] text-[var(--ink-600)]"
          >
            Who can join
          </span>
          {/* Pulled back by the rung's own side padding, so the check-dots
              sit on the dialog's text edge and the hover wash runs past it. */}
          <div
            role="radiogroup"
            aria-labelledby={ladderLabelId}
            aria-disabled={locked || undefined}
            onKeyDown={moveFocusBetweenRungs}
            className="-mx-2.5 flex flex-col"
          >
            {RUNGS.map((option) => (
              <AccessOption
                key={option.rung}
                chosen={chosen === option.rung}
                locked={locked}
                onChoose={() => choose(option.rung)}
                label={option.label}
                description={option.description}
              />
            ))}
          </div>
          {/* With no link there is no link block to carry the closing
              sentence, so it closes the ladder instead. */}
          {!showLink && !confirmingOff && (
            <div
              aria-live="polite"
              className="text-micro flex items-center gap-2 leading-[15px]"
            >
              {note}
            </div>
          )}
        </div>

        {confirmingOff && (
          <div className="flex flex-col gap-2.5">{confirm}</div>
        )}

        {showLink && link && (
          <div className="flex flex-col gap-2">
            <span className="text-[11px] text-[var(--ink-600)]">Link</span>
            <UrlRow url={link} />
            {/* What is true of this link on the left, the lesser ways to act
                on it on the right — compact, so Copy stays the lead. */}
            <div className="flex items-center gap-3">
              <div
                aria-live="polite"
                className="text-micro flex min-w-0 flex-1 items-center gap-2 leading-[15px]"
              >
                {note}
              </div>
              {linkActions(link, "shrink-0")}
            </div>
          </div>
        )}

        {/* Seats are what a live link spends, so the ledger shows only while
            there is one — the same note the email half of the dialog ends on. */}
        {showLink && (
          <SeatNote
            icon={<Users className="size-3.5" strokeWidth={1.5} aria-hidden />}
            lead={
              free === 0
                ? "No seats free."
                : free === 1
                  ? "1 seat free."
                  : `${free} seats free.`
            }
            seats={seats}
          >
            {free === 0
              ? "The link reads as full until one opens."
              : chosen === "approve"
                ? "Each player you approve takes one."
                : "Each player who joins takes one."}
          </SeatNote>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col">
      <div
        role="radiogroup"
        aria-label="Who can join with this link"
        aria-disabled={locked || undefined}
        onKeyDown={moveFocusBetweenRungs}
        className="flex flex-col"
      >
        {RUNGS.map((option) => (
          <AccessOption
            key={option.rung}
            chosen={chosen === option.rung}
            locked={locked}
            onChoose={() => choose(option.rung)}
            label={option.label}
            description={option.description}
            trailing={
              option.rung === "open" ? (
                // A fixed 8-boxes-wide column, so a 25-seat program wraps into
                // three short rows instead of taking the row's width and forcing
                // the label to break one word per line (seen on ZZ Test Program).
                <span className="flex w-[85px] shrink-0 justify-end self-center">
                  <SeatBoxes seats={seats} />
                  <span className="sr-only">
                    {free === 1 ? "1 seat free" : `${free} seats free`}
                  </span>
                </span>
              ) : undefined
            }
          />
        ))}
      </div>

      {body && (
        <>
          <FloatMenuDivider className="mx-2.5 bg-[var(--border-medium)]" />
          {body}
        </>
      )}

      <FloatMenuDivider className="mx-2.5 bg-[var(--border-medium)]" />
      <div
        aria-live="polite"
        className="text-micro flex items-center gap-2 px-2.5 pt-1.5 pb-2 leading-[15px] text-[var(--ink-500)]"
      >
        {note}
      </div>
    </div>
  );
}

/** `2026-08-04T…` → `Aug 4`; dates an invitation or a join link. */
export function formatInviteDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

function buildMailtoHref(programName: string, url: string): string {
  const subject = `Join ${programName} on Advantage`;
  const body = `You're invited to join ${programName} on Advantage. Open this link to join the team:\n\n${url}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}
