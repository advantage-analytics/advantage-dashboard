import Link from "next/link";
import { Check } from "lucide-react";
import { advButton, type AdvButtonVariant } from "@/lib/ui/adv-button";

/**
 * Day zero — the recommended next step is always exactly one card. Sending a
 * match (video) is first because it's how most personal matches arrive;
 * SwingVision import is the secondary path to the same report.
 *
 * Layout follows artboard 20a ("Home — day zero, full viewport") from the
 * Personal Home & Matches canvas: cards at 28px padding with a 12px internal
 * stack, body copy capped at 34ch, action pinned to the bottom of the card.
 *
 * Surface follows artboard 20a exactly: the primary card gets `--border-medium`
 * + `--shadow-card` (elevated), the secondary card gets `--border-hairline`
 * and no shadow (recessed). Both signals — the elevated frame and the blue
 * button — point at the same action, derived from `variant === "primary"`.
 *
 * The artboard's third card ("Set hand and backhand → Open profile") is now the
 * checklist's first row. Two surfaces asking for the same two fields, one
 * scroll apart, is one ask too many — and the door cards are doors, ways into
 * the product, while setting a hand is a task with a done state. Tasks with a
 * done state belong in the thing that tracks done states.
 */
const CARDS: ReadonlyArray<{
  eyebrow: string;
  title: string;
  body: string;
  href: string;
  label: string;
  variant: AdvButtonVariant;
}> = [
  {
    eyebrow: "First report",
    title: "Send your first match",
    body: "Singles, 1080p or better.",
    href: "/dashboard/matches/new",
    label: "Send a match",
    variant: "primary",
  },
  {
    eyebrow: "SwingVision",
    title: "Import a session",
    body: "Stats and video land already synced — no re-typing the score.",
    href: "/dashboard/matches/new",
    label: "Import",
    variant: "outline",
  },
];

const BASE_CLASS = "flex flex-col gap-3 p-7 rounded-[var(--radius-card)] border";

/**
 * The three getting-set-up questions, each answered by something actually
 * persisted. Every field here is a fact read back out of the database on the
 * server — none of them is a local flag, a dismissal, or a "seen it" bit, which
 * is what lets the checklist be right on a second device and after a sign-out.
 */
export interface SetupProgress {
  /** `users.hand` and `users.backhand` are both set. */
  playingProfile: boolean;
  /**
   * A match exists on the account.
   *
   * Always false wherever this component actually renders — the empty home IS
   * the zero-match home — but it is passed rather than assumed, because it is
   * the row's real answer and the checklist's exit rule below is written
   * against real answers. Hard-coding `false` would make the exit rule a lie
   * that happens to be true here.
   */
  firstMatch: boolean;
  /**
   * A `user_preferences` row exists — see `(home)/page.tsx` for why the row's
   * existence is the whole of the question.
   */
  notifications: boolean;
}

const STEPS: ReadonlyArray<{
  key: keyof SetupProgress;
  title: string;
  body: string;
  href: string;
  link: string;
}> = [
  {
    key: "playingProfile",
    title: "Account and playing profile",
    body: "Hand and backhand — analysis orients every stat around how you play.",
    href: "/dashboard/settings/profile",
    link: "Open profile",
  },
  {
    key: "firstMatch",
    title: "Get your first match in",
    body: "Video or a SwingVision export — both arrive as the same report.",
    href: "/dashboard/matches/new",
    link: "Send a match",
  },
  {
    key: "notifications",
    title: "Choose how you're notified when analysis lands",
    body: "Email is on by default. This is where you change it.",
    href: "/dashboard/settings/preferences",
    link: "Open preferences",
  },
];

/**
 * What is left to do, and what is already done, in one place that does not move.
 *
 * **Rows flip in place.** A row's geometry is identical in both states — the
 * same 16px indicator box, the same two lines of copy — so ticking one changes
 * ink and nothing else. The copy does not change either: a row that rewrote
 * itself into a receipt would be a second sentence to read for no new fact,
 * and the header's count already says how far along this is.
 *
 * **It leaves once, whole.** Three done and the block unmounts together rather
 * than shedding rows as they complete, which is the team first-steps rule for
 * the same reason: one layout change instead of three, and nothing left behind
 * explaining a gap. Every answer it reads is persisted and one-way in ordinary
 * use, so the block does not come back the next morning.
 *
 * **No green tick.** The two circled marks in this product mean won and lost
 * and belong to matches. A done row gets a plain check in the ink of its own
 * title — a record, not a result.
 */
function GettingSetUp({ setup }: { setup: SetupProgress }) {
  const done = STEPS.filter((step) => setup[step.key]).length;

  // Once, and only once there is nothing left to ask for.
  if (done === STEPS.length) return null;

  return (
    <section
      className="rounded-[var(--radius-card)] border px-7 py-6"
      style={{ borderColor: "var(--border-hairline)" }}
    >
      {/* Hairline and no shadow, deliberately: the elevated card above is the
          one recommendation on this page, and a second lifted surface under it
          would be a second one. */}
      <div className="flex items-baseline gap-2">
        <span className="eyebrow">Getting set up</span>
        <span className="eyebrow" aria-hidden="true">
          ·
        </span>
        <span className="mono tabular text-[11px] text-[var(--ink-500)]">
          {done} of {STEPS.length}
        </span>
      </div>

      <ul className="mt-4 flex flex-col">
        {STEPS.map((step) => (
          <li
            key={step.key}
            className="flex items-center gap-3.5 border-t py-3.5 first:border-t-0"
            style={{ borderColor: "var(--border-hairline)" }}
          >
            <span className="flex size-4 shrink-0 items-center justify-center">
              {setup[step.key] ? (
                <Check
                  className="size-[15px]"
                  strokeWidth={1.5}
                  style={{ color: "var(--ink-500)" }}
                  aria-hidden="true"
                />
              ) : (
                /* The open state's mark is a ring the check fits inside, so
                   the box is the same 16px either way and the rows below it
                   never move. */
                <span
                  className="size-[13px] rounded-full border"
                  style={{ borderColor: "var(--border-field)" }}
                />
              )}
            </span>

            <span className="min-w-0 flex-1">
              <span
                className="block text-[13px] leading-[1.4]"
                style={{
                  color: setup[step.key] ? "var(--ink-500)" : "var(--ink-900)",
                }}
              >
                {/* The tick is the sighted cue; this is the same fact for a
                    reader that never sees it. */}
                {setup[step.key] && <span className="sr-only">Done · </span>}
                {step.title}
              </span>
              <span className="mt-0.5 block text-[12px] leading-[1.5] text-[var(--ink-500)]">
                {step.body}
              </span>
            </span>

            {/* A text link in both states, never a button: the primary action
                on this page belongs to the card above, and a done row that
                still carried a button would be asking rather than reporting. */}
            <Link
              href={step.href}
              className="shrink-0 text-[11px] text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
            >
              {step.link}
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}

export default function EmptyDashboard({ setup }: { setup: SetupProgress }) {
  return (
    <div className="flex flex-col gap-5">
      <div className="grid grid-cols-1 items-stretch gap-5 sm:grid-cols-2">
        {CARDS.map((card) => (
          <div
            key={card.title}
            className={BASE_CLASS}
            style={
              card.variant === "primary"
                ? {
                    borderColor: "var(--border-medium)",
                    boxShadow: "var(--shadow-card)",
                  }
                : {
                    borderColor: "var(--border-hairline)",
                  }
            }
          >
            <span className="eyebrow">{card.eyebrow}</span>
            <span className="text-title">{card.title}</span>
            <span className="text-body-sm flex-1" style={{ maxWidth: "34ch" }}>
              {card.body}
            </span>
            <Link href={card.href} className={advButton(card.variant, "md")}>
              {card.label}
            </Link>
          </div>
        ))}
      </div>

      {/* Under the doors, not over them. The doors are the recommendation; the
          checklist is the state of the account, and state that outranked the
          recommendation would turn day zero into an admin screen. */}
      <GettingSetUp setup={setup} />
    </div>
  );
}
