import Link from "next/link";

/**
 * The getting-set-up questions, each answered by something actually persisted.
 * Every field here is a fact read back out of the database on the server —
 * none is a local flag, a dismissal or a "seen it" bit, which is what lets the
 * line be right on a second device and after a sign-out.
 *
 * "Get your first match in" is deliberately not one of them. The page's one
 * primary button is that step, twice over — in the title row and in the
 * matches card — and a third ask in link type would be outranked by both.
 */
export interface SetupProgress {
  /** `users.hand` and `users.backhand` are both set. */
  playingProfile: boolean;
  /**
   * A `user_preferences` row exists — see `(home)/page.tsx` for why the row's
   * existence is the whole of the question.
   */
  notifications: boolean;
}

const STEPS: ReadonlyArray<{
  key: keyof SetupProgress;
  /** How the step reads inside the sentence, lower case and mid-clause. */
  phrase: string;
  href: string;
  link: string;
}> = [
  {
    key: "playingProfile",
    phrase: "hand and backhand",
    href: "/dashboard/settings/profile",
    link: "Open profile",
  },
  {
    key: "notifications",
    phrase: "how you hear that a report is ready",
    href: "/dashboard/settings/preferences",
    link: "Open preferences",
  },
];

/**
 * Account state, one line above the usage footer.
 *
 * It was a two-row checklist in the right column until the serve card took
 * that column.
 * That column is what the analysis will say; a list of profile fields is
 * neither analysis nor news, and it was the loudest thing on a page whose
 * subject is a match that has not happened yet. As one line it still says
 * exactly what is outstanding and still opens the page that fixes it.
 *
 * Nothing outstanding, nothing rendered — the same rule the checklist had:
 * it leaves once, whole, rather than shedding rows as they complete.
 */
export function SetupLine({ setup }: { setup: SetupProgress }) {
  const remaining = STEPS.filter((step) => !setup[step.key]);
  if (remaining.length === 0) return null;

  const done = STEPS.length - remaining.length;
  const sentence =
    remaining.length === STEPS.length
      ? "Hand and backhand, and how you hear that a report is ready."
      : `${remaining[0].phrase.charAt(0).toUpperCase()}${remaining[0].phrase.slice(1)}.`;

  return (
    <div className="flex items-baseline gap-2.5">
      <span className="eyebrow">Getting set up</span>
      <span className="mono tabular text-[11px] text-[var(--ink-500)]">
        {done} of {STEPS.length}
      </span>
      <span className="text-micro">{sentence}</span>
      <Link
        href={remaining[0].href}
        className="rounded-sm text-[11px] font-medium text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)] focus-visible:outline-none"
      >
        {remaining[0].link}
      </Link>
    </div>
  );
}
