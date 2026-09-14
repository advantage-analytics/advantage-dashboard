"use client";

import type { ReactNode } from "react";
import { Search } from "lucide-react";
import { StepIndicator } from "@/components/dashboard/matches/new-match-wizard/StepIndicator";
import { CONTENT_CLS } from "@/components/dashboard/matches/new-match-wizard/WizardShell";
import { COPY as CHOOSER_COPY } from "@/components/dashboard/schedule/static/static-event-chooser";
import { COPY as DUAL_COPY } from "@/components/dashboard/schedule/static/new-dual-flow";
import { COPY as TOURNAMENT_COPY } from "@/components/dashboard/schedule/static/new-tournament-flow";
import { cn } from "@/lib/utils";

/**
 * The create-event wizard's loading states — one per screen, not one for all.
 *
 * Carbon's loading pattern (carbondesignsystem.com/patterns/loading-pattern):
 * a skeleton for a container whose content is on its way, drawn in the SHAPE
 * of that content, and never a spinner inside the page. And show what is
 * already known: these screens' chrome — the step count, the title, the lede,
 * the cancel-and-continue footer — is fixed copy that needs no read, so it
 * renders as itself immediately and only the parts a loader fills pulse. A
 * route that swapped one generic "form" skeleton for all four screens drew
 * four underlined fields where the chooser has two cards and the dual step
 * has a search and a list, and the page jumped when it arrived.
 *
 * Every placeholder here mirrors a real component's geometry, lifted from it:
 * `WizardShell` (the 832px column, `pt-16`, the 30px light title, the sticky
 * 64px footer), `StaticEventChooser` (its two cards, which draw through
 * `WizardShell` as step one of four), `DualSchoolStep` (the 2px search rule, the two 30px
 * menus, the 32px-mark school rows) and `TournamentNameStep` (the name field).
 *
 * Nothing in here is focusable — a disabled Continue that can be tabbed to is a
 * control that lies about the page. The frame carries `role="status"` and a
 * label; the shapes are `aria-hidden`.
 */

/** One pulsing placeholder. Only these animate — known text stays still. */
function Bar({ className }: { className?: string }) {
  return (
    <span
      className={cn(
        "block max-w-full rounded-[3px] bg-[var(--surface-skeleton)] motion-safe:animate-pulse",
        className,
      )}
    />
  );
}

function Status({
  label,
  className,
  children,
}: {
  label: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="status"
      aria-label={label}
      className={cn("w-full bg-[var(--surface-card)]", className)}
    >
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}

/**
 * `WizardShell` with its content still to come: the real step indicator,
 * eyebrow, title and lede, a body slot, and the footer's controls as shapes.
 * `footerStart` is what sits left of the spacer — Cancel alone by default.
 */
function WizardChrome({
  label,
  stepIndex,
  stepCount,
  title,
  lede,
  footerStart = <Bar className="h-3 w-12" />,
  children,
}: {
  label: string;
  stepIndex: number;
  stepCount: number;
  /** Null when the screen's title is not known yet (an edit's kind). */
  title: string | null;
  lede: string | null;
  footerStart?: ReactNode;
  children: ReactNode;
}) {
  return (
    <Status label={label} className="flex min-h-[calc(100vh-44px)] flex-col">
      <div aria-hidden="true" className="flex flex-1 flex-col">
        <StepIndicator currentStep={stepIndex} totalSteps={stepCount} />

        <div className={`${CONTENT_CLS} pt-16 pb-24`}>
          <div className="flex flex-col gap-3">
            <span className="eyebrow-sm" style={{ color: "var(--ink-400)" }}>
              Step {stepIndex + 1} of {stepCount}
            </span>
            {title ? (
              <h1
                className="max-w-[560px] text-[30px] leading-[1.15] font-light tracking-[-0.3px] text-[var(--ink-900)]"
                style={{ textWrap: "pretty" }}
              >
                {title}
              </h1>
            ) : (
              <Bar className="my-[5px] h-7 w-80" />
            )}
            {lede ? (
              <p
                className="max-w-[480px] text-[13px] leading-[1.55] text-[var(--ink-600)]"
                style={{ textWrap: "pretty" }}
              >
                {lede}
              </p>
            ) : (
              <span className="flex flex-col gap-2 py-1">
                <Bar className="h-3 w-[440px]" />
                <Bar className="h-3 w-72" />
              </span>
            )}
          </div>

          <div className="mt-9">{children}</div>
        </div>

        <div className="sticky bottom-0 z-10 mt-auto border-t border-[var(--border-hairline)] bg-white">
          <div className={`${CONTENT_CLS} flex h-16 items-center gap-4`}>
            {footerStart}
            <div className="flex-1" />
            <Bar className="h-9 w-[92px] rounded-[6px]" />
          </div>
        </div>
      </div>
    </Status>
  );
}

/* ── /dashboard/team/schedule/new ─────────────────────────────────────────── */

/**
 * The chooser, step one of four: its heading and lede as themselves, the two
 * cards as outlines with their icon, label, blurb and meta as shapes, the
 * aside under them, and a footer of Back · Cancel · the selection's label.
 */
export function EventChooserPending() {
  return (
    <WizardChrome
      label="Loading new event"
      stepIndex={0}
      stepCount={4}
      title={CHOOSER_COPY.heading}
      lede={CHOOSER_COPY.lede}
      footerStart={
        <>
          <Bar className="h-3 w-8" />
          <Bar className="h-3 w-11" />
          <Bar className="h-2.5 w-20" />
        </>
      }
    >
      <div className="grid max-w-[820px] grid-cols-2 gap-5">
        {[0, 1].map((card) => (
          <div
            key={card}
            className="flex flex-col gap-3.5 rounded-[var(--radius-card)] border border-[var(--border-field)] px-[26px] pt-7 pb-[22px]"
          >
            <span className="flex items-center justify-between">
              <Bar className="size-[22px] rounded-[5px]" />
              <span className="size-3.5 rounded-full border border-[var(--ink-200)]" />
            </span>
            <span className="flex flex-col gap-2.5">
              <Bar className="h-4 w-28" />
              <Bar className="h-3 w-[88%]" />
              <Bar className="h-3 w-[62%]" />
            </span>
            <span className="mt-auto block border-t border-[var(--border-hairline)] pt-3.5">
              <Bar className="h-2.5 w-44" />
            </span>
          </div>
        ))}
      </div>

      <div className="mt-5 flex flex-wrap items-center gap-2">
        <Bar className="h-2.5 w-96" />
        <Bar className="h-2.5 w-24" />
      </div>
    </WizardChrome>
  );
}

/** Back · Cancel, the footer of every create step after the chooser. The
 *  chooser's own two widths, so the words do not jump when the page lands. */
const BACK_AND_CANCEL = (
  <>
    <Bar className="h-3 w-8" />
    <Bar className="h-3 w-11" />
  </>
);

/* ── /dashboard/team/schedule/new/dual ────────────────────────────────────── */

/**
 * Step two of four of a new dual — the chooser is step one — while the route
 * reads the directory, the ladder and the season. Footer: Back · Cancel. The
 * search field (its icon is known, the directory count is
 * not), the Division and Conference menus, the scope's eyebrow, and school
 * rows in `SchoolRow`'s grid.
 */
export function NewDualPending() {
  return (
    <WizardChrome
      label="Loading new dual"
      stepIndex={1}
      stepCount={4}
      title={DUAL_COPY[1].title}
      lede={DUAL_COPY[1].lede}
      footerStart={BACK_AND_CANCEL}
    >
      <div className="flex items-center gap-3 border-b-2 border-[var(--border-medium)] pt-3 pb-[13px]">
        <Search
          size={17}
          strokeWidth={1.5}
          className="shrink-0 text-[var(--ink-600)]"
        />
        <span className="flex-1 text-[16px] text-[var(--ink-300)]">
          Search programs, or type any opponent
        </span>
        <Bar className="h-2.5 w-16" />
      </div>

      <div className="mt-5 flex items-center gap-2">
        <Bar className="h-[30px] w-[104px] rounded-[6px]" />
        <Bar className="h-[30px] w-[196px] rounded-[6px]" />
      </div>

      <div className="pt-[22px] pb-2.5">
        <Bar className="h-2 w-24" />
      </div>
      <div className="flex flex-col">
        {["w-40", "w-32", "w-36", "w-44", "w-28", "w-36"].map((width, i) => (
          <div
            key={i}
            className="grid grid-cols-[32px_minmax(0,1fr)_96px_13px] items-center gap-4 py-2.5"
          >
            <Bar className="size-8 rounded-[6px]" />
            <span className="flex min-w-0 flex-col gap-2">
              <Bar className={cn("h-3", width)} />
              <Bar className="h-2.5 w-56" />
            </span>
            <Bar className="h-2.5 w-10 justify-self-end" />
            <span />
          </div>
        ))}
      </div>
    </WizardChrome>
  );
}

/* ── /dashboard/team/schedule/new/tournament ──────────────────────────────── */

/**
 * Step two of four of a new tournament — the chooser is step one — while the
 * route reads the ladder and the team settings. Footer: Back · Cancel. The
 * name field is fixed chrome — its label and its rule — and
 * waits only as a shape where the caret will land.
 */
export function NewTournamentPending() {
  return (
    <WizardChrome
      label="Loading new tournament"
      stepIndex={1}
      stepCount={4}
      title={TOURNAMENT_COPY[1].title}
      lede={TOURNAMENT_COPY[1].lede}
      footerStart={BACK_AND_CANCEL}
    >
      <span className="eyebrow">Tournament · name</span>
      <span className="mt-1 flex h-[46px] items-center border-b-2 border-[var(--border-medium)] pt-1.5 pb-2">
        <Bar className="h-6 w-72" />
      </span>
    </WizardChrome>
  );
}

/* ── /dashboard/team/schedule/[eventId]/edit ──────────────────────────────── */

/**
 * An edit, before the event says whether it is a dual or a tournament — so no
 * title, no lede and no step can be printed as fact. What both kinds share is
 * the shell and a row of facts (a dual opens on Date · Site · Surface over
 * Time · Singles format · Doubles format, a tournament's details are Starts ·
 * Ends · Site · Format), so one neutral four-up is what waits — drawing the
 * dual's two rows would be a guess the tournament then contradicts.
 */
export function EditEventPending() {
  return (
    <Status
      label="Loading event"
      className="flex min-h-[calc(100vh-44px)] flex-col"
    >
      <div aria-hidden="true" className="flex flex-1 flex-col">
        <div className="flex gap-[3px]">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-[2px] flex-1 bg-[var(--surface-skeleton)] motion-safe:animate-pulse"
            />
          ))}
        </div>
        {/* The pinned bar's 36px strip, as the dual edit draws it. */}
        <div className="flex h-9 items-center gap-2 border-b border-[var(--border-hairline)] bg-[var(--surface-subtle)] px-[18px]">
          <Bar className="h-3 w-40 bg-[var(--ink-200)]" />
          <Bar className="ml-4 h-2.5 w-56 bg-[var(--ink-200)]" />
        </div>

        <div className={`${CONTENT_CLS} pt-16 pb-24`}>
          <div className="flex flex-col gap-3">
            <Bar className="h-2 w-20" />
            <Bar className="my-[5px] h-7 w-80" />
            <span className="flex flex-col gap-2 py-1">
              <Bar className="h-3 w-[440px]" />
              <Bar className="h-3 w-64" />
            </span>
          </div>

          <div className="mt-9 grid grid-cols-4 gap-6">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="flex flex-col gap-2">
                <Bar className="h-2 w-14" />
                <span className="flex h-[34px] items-center border-b border-[var(--border-field)]">
                  <Bar className="h-3 w-24" />
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="sticky bottom-0 z-10 mt-auto border-t border-[var(--border-hairline)] bg-white">
          <div className={`${CONTENT_CLS} flex h-16 items-center gap-4`}>
            <Bar className="h-3 w-12" />
            <div className="flex-1" />
            <Bar className="h-9 w-[112px] rounded-[6px]" />
          </div>
        </div>
      </div>
    </Status>
  );
}
