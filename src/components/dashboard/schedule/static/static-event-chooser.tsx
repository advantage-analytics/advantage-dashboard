"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Swords } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { EventShell } from "@/components/dashboard/schedule/event-shell";
import { cn } from "@/lib/utils";

/**
 * 3b — "New event, choose type (cards)", rebuilt as static UI.
 *
 * A literal copy of the `3b` artboard in `Events & Lineups.dc.html`. It reads
 * nothing and writes nothing: the only state on the screen is which of the two
 * cards is selected, and the only thing selection does is change a label in the
 * footer and where Continue points. That was already true of the DB-wired
 * `new-event-chooser.tsx` this replaces — that component is left in place,
 * dormant, as the material a later re-wiring starts from.
 *
 * ── Where this differs from `new-event-chooser.tsx`, and why ────────────────
 * The dormant component was built from this same artboard but softened three
 * things. This run's rule is that the design wins, so all three are restored:
 *
 *   1. No `New event` eyebrow above the heading. The artboard has none — the
 *      words are already in the breadcrumb the dashboard header draws.
 *   2. The bracket mark is 19px, not 22px. It is drawn smaller than the 22px
 *      Lucide `swords` beside it. That asymmetry is in the design.
 *   3. `Creates 9 lines` sets the 9 in `mono tabular`, as the artboard's own
 *      class list does. The dormant component dropped `mono` on the grounds
 *      that Roboto Mono is reserved for timestamps and job ids. That is a real
 *      argument and it is recorded here rather than acted on, because
 *      re-deciding it silently is exactly what this run is not for.
 *
 * ── The selected card's inner rule ─────────────────────────────────────────
 * The artboard draws it `rgba(59,130,246,0.15)`, and `--blue-glow`
 * (`colors.css:72`) is exactly that value. An earlier pass used
 * `--blue-tint-12` (0.12) on the belief that no token carried 0.15; that was
 * wrong. Grep for the design's literal value before reaching for the nearest
 * token — reusing one that already exists is not the token work the rebuild
 * forbids.
 *
 * ── Copy ────────────────────────────────────────────────────────────────────
 * Every user-visible string lives in the two consts below, as plain string
 * literals, so a character-for-character diff against the artboard is one
 * glance rather than a hunt through JSX. Punctuation is the design's: em
 * dashes (—), middle dots (·), and STRAIGHT apostrophes — the artboard uses
 * U+0027 throughout, not curly quotes.
 */

type EventKind = "dual" | "tournament";

/**
 * The bracket mark for Tournament.
 *
 * Lucide has no draw/bracket glyph — `trophy` is the nearest, and a trophy is a
 * result rather than a structure, which is the wrong thing to promise beside
 * "Players entered into draws". So this is the design's own 15×15 path,
 * inlined at the 19px the artboard draws it at, with the artboard's stroke
 * width of 1. It inherits `currentColor`, so selection turns it blue with the
 * rest of the card.
 */
function BracketMark() {
  return (
    <svg
      width="19"
      height="19"
      viewBox="0 0 15 15"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M1.875 1.875H5V5.625H1.875M5 3.75H9.375V11.25H5M9.375 7.5H13.75M1.875 9.375H5V13.125H1.875"
        stroke="currentColor"
        strokeWidth="1"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const COPY = {
  heading: "What are you adding?",
  lede: "Both are events the team shows up to — they hold a date, a site and the matches played under them.",
  dualLabel: "Dual match",
  dualBlurb:
    "Six singles and three doubles against one opponent, shared under one event.",
  dualMetaBefore: "Creates ",
  dualMetaCount: "9",
  dualMetaAfter: " lines · one team score",
  tournamentLabel: "Tournament",
  tournamentBlurb:
    "Players entered into draws; matches get added by round as they're played.",
  tournamentMeta: "Creates entries · draws by round",
  aside:
    "One player's own match — a challenge, practice set or outside entry — isn't an event.",
  asideLink: "Add it in Matches",
  cancel: "Cancel",
  continue: "Continue",
  dualSelected: "Dual selected",
  tournamentSelected: "Tournament selected",
} as const;

const OPTIONS: {
  id: EventKind;
  label: string;
  blurb: string;
  selectedLabel: string;
  href: string;
}[] = [
  {
    id: "dual",
    label: COPY.dualLabel,
    blurb: COPY.dualBlurb,
    selectedLabel: COPY.dualSelected,
    href: "/dashboard/team/schedule/new/dual",
  },
  {
    id: "tournament",
    label: COPY.tournamentLabel,
    blurb: COPY.tournamentBlurb,
    selectedLabel: COPY.tournamentSelected,
    href: "/dashboard/team/schedule/new/tournament",
  },
];

export function StaticEventChooser() {
  const router = useRouter();
  // Dual is the pre-selection because the artboard draws it selected, with
  // "Dual selected" already in the footer.
  const [choice, setChoice] = useState<EventKind>("dual");

  const selected = OPTIONS.find((option) => option.id === choice) ?? OPTIONS[0];

  return (
    <EventShell
      footer={
        <>
          <button
            type="button"
            className={advButton("ghost", "md")}
            onClick={() => router.push("/dashboard/team/schedule")}
          >
            {COPY.cancel}
          </button>
          <div className="flex-1" />
          <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
            {selected.selectedLabel}
          </span>
          <button
            type="button"
            className={advButton("primary", "md")}
            onClick={() => router.push(selected.href)}
          >
            {COPY.continue}
          </button>
        </>
      }
    >
      {/* The artboard's body is `padding:36px 48px 0`. `EventShell` already
          contributes 48px of side padding and 26px on top, so this makes up
          the remaining 10px rather than reaching into the shared shell — three
          other screens in this run sit in the same frame.

          The bottom is deliberately NOT reconciled: the artboard says 0 and
          `EventShell` contributes `pb-8` (32px). Reaching into the shared
          shell to strip it would move the other three screens that sit in it,
          so the 32px stands. Invisible here — the content is top-aligned and
          far shorter than the viewport — but it is a real divergence from the
          artboard, recorded rather than left silent. */}
      <div className="pt-[10px]">
        <h1 className="text-[30px] font-light leading-[34px] tracking-[-0.6px] text-[var(--ink-900)]">
          {COPY.heading}
        </h1>
        <p
          className="mt-2 max-w-[560px] text-[13px]"
          style={{ color: "var(--ink-600)" }}
        >
          {COPY.lede}
        </p>

        <div
          role="radiogroup"
          aria-label={COPY.heading}
          className="mt-7 grid max-w-[820px] grid-cols-2 gap-5"
        >
          {OPTIONS.map((option) => {
            const active = choice === option.id;
            return (
              <button
                key={option.id}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => setChoice(option.id)}
                className={cn(
                  "flex cursor-pointer flex-col gap-3.5 rounded-[var(--radius-card)] border px-[26px] pb-[22px] pt-7 text-left",
                  "transition-colors duration-[var(--duration-fast)]",
                  "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                  active
                    ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                    : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]"
                )}
              >
                <span className="flex items-center justify-between">
                  <span
                    className={
                      active ? "text-[var(--blue)]" : "text-[var(--ink-700)]"
                    }
                  >
                    {option.id === "dual" ? (
                      <Swords
                        strokeWidth={1.5}
                        className="size-[22px]"
                        aria-hidden="true"
                      />
                    ) : (
                      <BracketMark />
                    )}
                  </span>
                  <span
                    className={cn(
                      "flex size-3.5 shrink-0 items-center justify-center rounded-full border",
                      active
                        ? "border-transparent bg-[var(--blue)]"
                        : "border-[var(--ink-300)]"
                    )}
                    aria-hidden="true"
                  >
                    {active ? (
                      <Check
                        strokeWidth={2.5}
                        className="size-[9px] text-white"
                      />
                    ) : null}
                  </span>
                </span>

                <span className="flex flex-col gap-1.5">
                  <span className="text-[16px] text-[var(--ink-900)]">
                    {option.label}
                  </span>
                  <span className="text-body-sm max-w-[42ch] text-pretty">
                    {option.blurb}
                  </span>
                </span>

                <span
                  className={cn(
                    "mt-auto block border-t pt-3.5",
                    active
                      ? "border-[var(--blue-glow)]"
                      : "border-[var(--border-hairline)]"
                  )}
                >
                  <span className="text-micro">
                    {option.id === "dual" ? (
                      <>
                        {COPY.dualMetaBefore}
                        <span className="mono tabular">
                          {COPY.dualMetaCount}
                        </span>
                        {COPY.dualMetaAfter}
                      </>
                    ) : (
                      COPY.tournamentMeta
                    )}
                  </span>
                </span>
              </button>
            );
          })}
        </div>

        <div className="mt-5 flex max-w-[820px] flex-wrap items-center gap-2">
          <span className="text-micro" style={{ color: "var(--ink-600)" }}>
            {COPY.aside}
          </span>
          {/* Inert, and deliberately so. The artboard's own anchor is the
              placeholder `href="#3b"`, and the destination the label names —
              `/dashboard/matches/new` — is outside the four routes this run
              rebuilds. The brief is categorical: links are inert or point
              within the rebuilt set, and wiring them to real destinations is
              later work. Same treatment `7e`'s "One-off match in Matches"
              gets in `static-schedule.tsx`.

              Flagged, not reworded: a team workspace's rail has no Matches
              entry, so this label names a place the coach cannot navigate to
              from here. The design wins; the falsehood is T12's to record. */}
          <span className="text-[11px] font-medium text-[var(--blue)]">
            {COPY.asideLink}
          </span>
        </div>
      </div>
    </EventShell>
  );
}
