"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Check, GraduationCap } from "lucide-react";
import { WizardShell } from "@/components/dashboard/matches/new-match-wizard/WizardShell";
import { useWizardKeys } from "@/components/dashboard/matches/new-match-wizard/useWizardKeys";
import { cn } from "@/lib/utils";

const SCHEDULE_HREF = "/dashboard/team/schedule";

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
 *      Lucide icon beside it. That asymmetry is in the design.
 *   3. `Creates 9 lines` sets the 9 in `mono tabular`, as the artboard's own
 *      class list does. The dormant component dropped `mono` on the grounds
 *      that Roboto Mono is reserved for timestamps and job ids. That is a real
 *      argument and it is recorded here rather than acted on, because
 *      re-deciding it silently is exactly what this run is not for.
 *
 * ── Two departures from the artboard, made deliberately ────────────────────
 * Both were raised against the shipped screen, and both override "the design
 * wins" above, so they are recorded here rather than left to be re-litigated:
 *
 *   1. Dual match carries Lucide `graduation-cap`, not the artboard's `swords`.
 *      Crossed swords read as combat, and the two cards are not opponent vs.
 *      opponent — they are two shapes of *collegiate* event. The cap says the
 *      thing the pair actually divides on, and it sits beside `BracketMark`
 *      without either glyph promising a fight. Size and stroke are the
 *      artboard's still: 22px at `strokeWidth={1.5}`.
 *
 *   2. The body is a centred column, not a left-flushed one. The artboard
 *      flushes it to the top left because it was drawn at the artboard's own
 *      width; in the live pane the 820px grid stranded a wide gutter on the
 *      right. That column is now `WizardShell`'s (below), so the centring is
 *      the shell's and this file no longer carries a wrapper of its own.
 *
 * ── Step one of the wizard, not a screen before it ─────────────────────────
 * The chooser draws through `WizardShell` (`matches/new-match-wizard/`), the
 * same chrome as the dual and tournament flows it opens, rather than
 * `EventShell`. Picking a kind is the first decision of making an event, so
 * it counts as step one of four — the chooser, then the three steps of either
 * flow — and the step indicator does not jump from nothing to a third when
 * Continue lands on the dual. The `Step 1 of 4` eyebrow is the shell's, and
 * is not the `New event` eyebrow point 1 of the list above keeps out.
 *
 * Its keyboard is the shell's too (`useWizardKeys`). Two things it adapts:
 *
 *   • The ⌘/Ctrl+Enter walk is rooted on the radiogroup, not the whole
 *     content column, so the chord steps card → card → Continue as it does on
 *     `/dashboard/matches/new`. Rooted on the column it detoured through the
 *     aside's link first.
 *   • The hook takes a plain Enter on a card as Continue and prevents the
 *     card's own click, so Enter on a card opens THAT card's flow (the click
 *     it swallowed would have selected it). Links — the aside's, Cancel — and
 *     the footer's Back keep their own Enter in the hook itself
 *     (`isWizardExit`). Continue's own click is a plain push: a mouse click in
 *     Safari does not move focus, so reading the focused element there would
 *     follow whatever card was focused last.
 *
 * The 820px grid now sits in the shell's 720px column and shrinks with it;
 * the shell is not widened for one screen.
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

/** Exported for the route's skeleton, which prints the heading and lede. */
export const COPY = {
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
  asideLink: "Add a one-off match",
  // No `cancel`: `WizardShell` draws Back and Cancel itself.
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
  /** The cards — the ⌘/Ctrl+Enter walk's root. The header says why not the column. */
  const cardsRef = useRef<HTMLDivElement>(null);

  // What plain Enter does, as distinct from Continue's click — the header's
  // keyboard section says why the two differ.
  const onEnter = () => {
    const focused = document.activeElement as HTMLElement | null;
    const card = OPTIONS.find(
      (option) => option.id === focused?.dataset.eventKind,
    );
    if (card) {
      setChoice(card.id);
      router.push(card.href);
      return;
    }
    router.push(selected.href);
  };

  // Step one: Esc has nowhere to go back to, and a kind is always selected,
  // so Continue never sleeps.
  useWizardKeys({
    contentRef: cardsRef,
    canGoBack: false,
    onBack: () => {},
    continueDisabled: false,
    onContinue: onEnter,
  });

  return (
    <WizardShell
      stepIndex={0}
      stepCount={4}
      title={COPY.heading}
      description={COPY.lede}
      contentClassName="mt-9"
      // Back and Cancel both land on the schedule: it is the screen before
      // this one, so the two exits agree.
      back={() => router.push(SCHEDULE_HREF)}
      cancelHref={SCHEDULE_HREF}
      status={
        <span className="text-[11px]" style={{ color: "var(--ink-600)" }}>
          {selected.selectedLabel}
        </span>
      }
      continueLabel={COPY.continue}
      onContinue={() => router.push(selected.href)}
      continueDisabled={false}
    >
      <div
        ref={cardsRef}
        role="radiogroup"
        aria-label={COPY.heading}
        className="grid max-w-[820px] grid-cols-2 gap-5"
      >
        {OPTIONS.map((option) => {
          const active = choice === option.id;
          return (
            <button
              key={option.id}
              type="button"
              role="radio"
              aria-checked={active}
              data-event-kind={option.id}
              onClick={() => setChoice(option.id)}
              className={cn(
                "flex cursor-pointer flex-col gap-3.5 rounded-[var(--radius-card)] border px-[26px] pt-7 pb-[22px] text-left",
                "transition-colors duration-[var(--duration-fast)]",
                "focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none",
                active
                  ? "border-[var(--blue)] bg-[var(--blue-tint-08)]"
                  : "border-[var(--border-field)] bg-[var(--surface-card)] hover:bg-[var(--surface-subtle)]",
              )}
            >
              <span className="flex items-center justify-between">
                <span
                  className={
                    active ? "text-[var(--blue)]" : "text-[var(--ink-700)]"
                  }
                >
                  {option.id === "dual" ? (
                    <GraduationCap
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
                      : "border-[var(--ink-300)]",
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
                    : "border-[var(--border-hairline)]",
                )}
              >
                <span className="text-micro">
                  {option.id === "dual" ? (
                    <>
                      {COPY.dualMetaBefore}
                      <span className="mono tabular">{COPY.dualMetaCount}</span>
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
        {/* The artboard's own anchor is the placeholder `href="#3b"`. This
              run wires it to the wizard's single-match step under the
              schedule — `/new/single`, one of the four routes this run
              rebuilds — rather than the label the artboard used to carry,
              which named `/dashboard/matches/new`: a team workspace's rail
              has no Matches entry to arrive at, so that destination was
              never one a coach could reach from here. `schedule-day-zero.tsx`
              already uses the same label for the same destination. */}
        <Link
          href="/dashboard/team/schedule/new/single"
          className="text-[11px] font-medium text-[var(--blue)]"
        >
          {COPY.asideLink}
        </Link>
      </div>
    </WizardShell>
  );
}
