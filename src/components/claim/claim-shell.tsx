import Link from "next/link";
import { ArrowLeft, Check, X } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The chrome every claim screen shares, transcribed from Stage E.
 *
 * Each frame is a `.pane`: a full 1280 × 640–720 page on `--surface-card`, its
 * content optically centred, with the escape chrome floating over it rather
 * than sitting in a band above it — back (top left, one step up) and ✕ (top
 * right, leaves setup with the account intact). Both are the design system's
 * 32px `IconButton`, glyph only.
 *
 * F2 has no back because the account already exists behind it, and F5.1 keeps
 * only ✕: the claim is submitted, so dismissing moves forward into the program.
 */

/**
 * The five widths in the flow, and what earns each one.
 *
 * `440` is the one screen with nothing to do on it (F5, check your email).
 * `720` is a single column of prose or fields. `840` and `1000` are the two
 * shapes carrying an aside, sized so the main column stays readable once the
 * panel and its 48px gutter are taken out.
 */
export type ClaimWidth = 440 | 720 | 840 | 1000;

/**
 * The gap between the blocks of the centre column, in px. Named by the frame
 * that uses it: 16 on the two-column screens, 20 on the single-column status
 * screens, 24 on the unlisted-program form, 28 on the role question.
 */
export type ClaimGap = 16 | 20 | 24 | 28;

export function ClaimShell({
  width = 720,
  gap = 20,
  back,
  exitHref = "/claim/exit",
  exitLabel = "Leave setup",
  children,
  heading,
  aside,
  asideWidth = 300,
}: {
  width?: ClaimWidth;
  gap?: ClaimGap;
  /**
   * The step behind this one, as a bare href. Absent only where the design
   * leaves the top-left corner empty — F2, where the account already exists
   * behind it, and F5.1, where the claim has already been submitted.
   */
  back?: string;
  /**
   * Where the door leads.
   *
   * Defaults to `/claim/exit`, a route that resolves the destination against
   * the session: `/dashboard` when there is one, `/` when there is not. It was
   * a bare `/`, which dropped a signed-in coach who entered from the sidebar
   * onto the marketing home with no way back. This component cannot await a
   * session, so the decision moves to a route the link can point at
   * unconditionally rather than to nine pages that each have to remember.
   *
   * The endings (`ready`, `review`) still pass their own, because they exit
   * into the product on purpose rather than by session accident.
   */
  exitHref?: string;
  exitLabel?: string;
  children: React.ReactNode;
  /**
   * A `ClaimHeading` (or equivalent) hoisted above the aside grid instead of
   * inside `children`. The grid narrows the body column to leave room for the
   * aside, and an eyebrow line is the one piece of copy in this flow long
   * enough to wrap inside that narrowed width — the longest program name
   * alone renders wider than the 492px column F4 leaves it. Rendering it here
   * gives it the shell's full `width` instead.
   */
  heading?: React.ReactNode;
  /**
   * The right-hand panel on F3.2, F4 and F4.1. It carries what a narrow card
   * had to leave out — what ownership actually involves, what waits and what
   * doesn't.
   */
  aside?: React.ReactNode;
  /** 300 on F3.2, 340 on the setup form. Both leave a 48px gutter. */
  asideWidth?: 300 | 340;
}) {
  return (
    <div className="relative flex min-h-screen items-center bg-[var(--surface-card)] px-6 py-24 sm:px-10">
      {/* The escape chrome, floating over the page. Absolute rather than a
          band, so the content below is centred on the page and not on what is
          left of it — which is the whole reason these frames read as a screen
          rather than as a dialog that lost its window. */}
      <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between p-5">
        {back ? (
          <Link href={back} title="Back" aria-label="Back" className={ICON_BUTTON}>
            <ArrowLeft className="size-[15px]" strokeWidth={1.5} aria-hidden="true" />
          </Link>
        ) : (
          <span className="w-8" />
        )}
        <Link
          href={exitHref}
          title={exitLabel}
          aria-label={exitLabel}
          className={ICON_BUTTON}
        >
          <X className="size-[15px]" strokeWidth={1.5} aria-hidden="true" />
        </Link>
      </div>

      <div className="mx-auto w-full" style={{ maxWidth: width }}>
        <div className="flex flex-col" style={{ gap }}>
          {heading}
          {aside ? (
            <div
              className="grid items-start gap-10 lg:grid-cols-[minmax(0,1fr)_var(--claim-aside)] lg:gap-12"
              style={{ "--claim-aside": `${asideWidth}px` } as React.CSSProperties}
            >
              <ClaimColumn gap={gap}>{children}</ClaimColumn>
              <aside className="min-w-0">{aside}</aside>
            </div>
          ) : (
            <ClaimColumn gap={gap}>{children}</ClaimColumn>
          )}
        </div>
      </div>
    </div>
  );
}

/** The centre column: one stack, one gap, exactly as each frame sets it. */
export function ClaimColumn({
  gap,
  children,
}: {
  gap: ClaimGap;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col" style={{ gap }}>
      {children}
    </div>
  );
}

/** The design system's `IconButton`, size md, as classes a `<Link>` can wear. */
const ICON_BUTTON =
  "inline-flex size-8 cursor-pointer items-center justify-center rounded-[var(--radius-element)] text-[var(--nav-fg)] outline-none transition-[color,background-color] duration-[var(--duration-fast)] hover:bg-[var(--surface-subtle)] hover:text-[var(--nav-fg-hover)] focus-visible:shadow-[var(--focus-ring)]";

/**
 * The title block. Two shapes in the flow, and the difference is which line
 * comes first:
 *
 *   step pages     "Step 2 of 2" over the title, 8px apart, body inline
 *   status pages   the program's own name over the title, 2px apart, the title
 *                  carrying its own top padding so the pair reads as one unit
 */
export function ClaimHeading({
  gap,
  step,
  eyebrow,
  title,
  titlePadTop,
  body,
  bodyMax,
}: {
  gap: 2 | 6 | 8;
  /** "Step 1 of 2" — on the two numbered steps only. */
  step?: string;
  /** "Meridian State · Men's · D-I · Big Twelve" — the program being acted on. */
  eyebrow?: string;
  title: string;
  /** 8px on the status screens, 6px on the setup form, 4px on F5.1. */
  titlePadTop?: 4 | 6 | 8;
  /** Inline with the title where the frame keeps it in the same block. */
  body?: React.ReactNode;
  /** 44ch on F5, 56ch on F3.2, 58ch on the status screens, 60–62ch on the steps. */
  bodyMax?: string;
}) {
  const label = step ?? eyebrow;
  return (
    <div className="flex flex-col" style={{ gap }}>
      {label && <span className="eyebrow">{label}</span>}
      <h1 className="text-title-lg" style={titlePadTop ? { paddingTop: titlePadTop } : undefined}>
        {title}
      </h1>
      {body && (
        <p className="text-body" style={bodyMax ? { maxWidth: bodyMax } : undefined}>
          {body}
        </p>
      )}
    </div>
  );
}

/**
 * The aside's own heading + list. Used by F3.2, F4 and F4.1.
 *
 * Rows are separated by rules rather than bullets or ticks — the same `.row`
 * the design uses everywhere a short list of facts has to read as a list of
 * facts and not as marketing. The first row drops its rule and its top padding
 * so the list starts flush against the eyebrow.
 *
 * The rule is `--border-medium`, not the `--border-hairline` the frame names.
 * A hairline is `--ink-100` (#F3F3F3) and this panel's fill is
 * `--surface-subtle` (#F5F5F5): two shades apart, which renders as no rule at
 * all, so copying the token faithfully loses the thing the token was for. The
 * hairline is correct everywhere it sits on the page background — F5.1's
 * checklist keeps it — and wrong only here, on a filled panel.
 */
export function AsidePanel({
  title,
  items,
  footnote,
}: {
  title: string;
  items: string[];
  /** F4.1's one line: no red field, because plenty of programs have no
      institutional address. */
  footnote?: string;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-[var(--radius-card)] border border-[var(--border-hairline)] bg-[var(--surface-subtle)] p-5">
      <span className="eyebrow">{title}</span>
      <ul className="flex flex-col">
        {items.map((item, index) => (
          <li
            key={item}
            className={`text-body-sm py-[11px] ${
              index === 0 ? "border-t-0 pt-0" : "border-t border-[var(--border-medium)]"
            }`}
          >
            {item}
          </li>
        ))}
      </ul>
      {footnote && <span className="text-micro">{footnote}</span>}
    </div>
  );
}

/**
 * The action row: one filled button and, usually, one quiet link beside it.
 *
 * Side by side rather than stacked, because at page scale a full-width button
 * over a centred link is a mobile dialog wearing a desktop page. 14px apart,
 * except on F2 where the line beside the button is longer and takes 16.
 */
export function ClaimActions({
  gap = 14,
  children,
}: {
  gap?: 14 | 16;
  children: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-center" style={{ gap }}>
      {children}
    </div>
  );
}

/**
 * The one button style this flow uses: the design system's primary, in Signal
 * Blue, at the same 36px the rest of the product's blue button uses.
 *
 * Sized by its label rather than by its column — at page scale a full-width
 * button is a mobile control that wandered onto a desktop page.
 */
export const CLAIM_BUTTON = advButton("primary");

/**
 * The form chrome. Here rather than in each form because three files had
 * byte-identical copies of both, and this file is already where the flow's
 * shared styling lives.
 *
 * No focus treatment of its own — focus.css covers every tag this lands on.
 */
export const CLAIM_FIELD =
  "h-[38px] w-full rounded-[var(--radius-element)] border border-[var(--border-field)] bg-[var(--surface-card)] px-3 text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)]";

export const CLAIM_LABEL = "mb-2 block text-[11px] text-[var(--ink-700)]";

/**
 * The quieter second action — "Someone else should own it", "This isn't right".
 *
 * Blue and unadorned, which is the anchor style the whole document runs on: the
 * flow's one accent carries the link, and 11px of underline beside a 13px
 * button was the heavier of the two marks on a screen that already has a
 * primary.
 */
export const CLAIM_LINK =
  "rounded-sm text-[11px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:outline-none focus-visible:shadow-[var(--focus-ring)]";

/** The line that sits beside a button rather than under it. */
export const CLAIM_MICRO = "text-micro";

/**
 * The mark before a row in a short list of facts read before a commitment —
 * the join flow's sharing terms and the guardian consent acknowledgments.
 *
 * Shared for the reason `RadioDot` is: two flows draw the same mark, and a
 * second copy is how one of them ends up a pixel and a shade off the other.
 * Here rather than in `join-terms.tsx` because onboarding needs it too, and
 * importing that module for one glyph would drag the sharing copy, the quota
 * note and `NotNowLink` into onboarding's bundle with it.
 *
 * The glyph is fixed; the colour is the decision. `blue` marks a row where
 * something is gained or granted, `ink` a row where nothing moves — the pairing
 * is what lets the sharing terms' two columns read as "they gain this" versus
 * "you keep this" without a sentence of policy explaining it.
 *
 * **Never `blue` in a list above a checkbox.** `AuthCheckbox` fills Signal Blue
 * with a white check when set, so blue marks above it stack four blue
 * checkmarks in one column with only the last one meaning anything. The
 * guardian acknowledgments pass `ink` for exactly that reason.
 *
 * Not `CircleCheck`, which is `ResultMark`'s glyph and means a match outcome;
 * not the claim flow's `ArrowRight` (`claim/sharing-rows.tsx`), which marks
 * consequences that follow from an action rather than facts being read. It
 * replaced a 2 × 12px bar that read as a rendering artefact at `--ink-300`.
 */
export function TermMark({ tone }: { tone: "blue" | "ink" }) {
  return (
    <Check
      className="mt-[3px] size-3.5 shrink-0"
      style={{ color: tone === "blue" ? "var(--blue)" : "var(--ink-500)" }}
      strokeWidth={1.5}
      aria-hidden="true"
    />
  );
}

/**
 * The design system's check-dot `Radio`: solid Signal Blue with a white check
 * when chosen, a 1px ink-300 ring otherwise. The dot marks the selected item —
 * it never appears on hover. Shared because the persona cards, the team-kind
 * cards and the org-type rows all draw the same mark.
 *
 * `align` carries the one difference between callers: rows aligned to a line of
 * text nudge down 1px (`mt-[1px]`, the default); a card header that centres the
 * dot in a `justify-between` row passes `align=""`.
 */
export function RadioDot({
  selected,
  align = "mt-[1px]",
}: {
  selected: boolean;
  align?: string;
}) {
  return selected ? (
    <span
      className={`${align} flex size-3.5 shrink-0 items-center justify-center rounded-full bg-[var(--blue)]`}
      aria-hidden="true"
    >
      <Check className="size-[9px] text-white" strokeWidth={2.5} />
    </span>
  ) : (
    <span
      className={`${align} size-3.5 shrink-0 rounded-full border border-[var(--ink-300)]`}
      aria-hidden="true"
    />
  );
}
