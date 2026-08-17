import Link from "next/link";
import Image from "next/image";

/**
 * The chrome every claim screen shares.
 *
 * One column, centred, with the step counter above the heading. Deliberately
 * sparse: the design's own note on F2 is that one question per page "looks
 * empty in a screenshot and reads correctly in use", because the answer changes
 * everything downstream. Resisting the urge to fill the width is the design.
 *
 * The flow runs before an account exists, so this does not use the dashboard
 * shell — no sidebar, no header, no workspace.
 */
export function ClaimShell({
  step,
  eyebrow,
  heading,
  sub,
  children,
  aside,
  footer,
}: {
  /** "Step 1 of 2". Absent on the branch and outcome screens, which are not steps. */
  step?: string;
  /** "Meridian State · Men's · D-I · Big Twelve" — the program being acted on. */
  eyebrow?: string;
  heading: string;
  sub?: string;
  children: React.ReactNode;
  /**
   * The right-hand panel on F3.2 and F4. It carries what a narrow card had to
   * leave out — what ownership actually involves, what the announcement does.
   */
  aside?: React.ReactNode;
  footer?: React.ReactNode;
}) {
  return (
    <div className="min-h-screen bg-[var(--surface-page)]">
      <header className="px-6 py-6 sm:px-10">
        <Link href="/" aria-label="Advantage">
          <Image
            src="/logos/logo4.svg"
            alt="Advantage"
            width={118}
            height={20}
            style={{ width: 118, height: 20 }}
            priority
          />
        </Link>
      </header>

      <main className="mx-auto w-full max-w-[1000px] px-6 pb-24 pt-4 sm:px-10">
        <div
          className={
            aside
              ? "grid gap-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:gap-16"
              : "mx-auto max-w-[440px]"
          }
        >
          <div className="min-w-0">
            {step && (
              <p className="mb-6 text-[10px] font-medium uppercase tracking-[2.5px] text-[var(--ink-400)]">
                {step}
              </p>
            )}
            {eyebrow && (
              <p className="mb-3 text-[11px] text-[var(--ink-500)]">{eyebrow}</p>
            )}

            <h1 className="text-[28px] font-light leading-[34px] tracking-[-0.5px] text-[var(--ink-900)] [text-wrap:balance]">
              {heading}
            </h1>
            {sub && (
              <p className="mt-3 max-w-[52ch] text-[13px] leading-[1.6] text-[var(--ink-600)]">
                {sub}
              </p>
            )}

            <div className="mt-8">{children}</div>

            {footer && (
              <div className="mt-6 text-[12px] leading-[1.6] text-[var(--ink-500)]">
                {footer}
              </div>
            )}
          </div>

          {aside && (
            <aside className="lg:pt-[46px]">
              <div className="rounded-[14px] border border-[var(--border-hairline)] bg-[var(--surface-card)] p-5">
                {aside}
              </div>
            </aside>
          )}
        </div>
      </main>
    </div>
  );
}

/** The aside's own heading + list. Used by F3.2, F4, F4.1 and F5.1. */
export function AsidePanel({
  title,
  items,
}: {
  title: string;
  items: { text: string; muted?: boolean }[];
}) {
  return (
    <>
      <p className="mb-3 text-[12px] font-medium text-[var(--ink-900)]">{title}</p>
      <ul className="flex flex-col gap-2.5">
        {items.map((item) => (
          <li
            key={item.text}
            className={`text-[12px] leading-[1.55] ${
              item.muted ? "text-[var(--ink-400)]" : "text-[var(--ink-600)]"
            }`}
          >
            {item.text}
          </li>
        ))}
      </ul>
    </>
  );
}

/** The one button style this flow uses. Full-width on the form screens. */
export const CLAIM_BUTTON =
  "inline-flex h-10 w-full items-center justify-center rounded-[6px] bg-[var(--ink-900)] px-5 text-[13px] font-medium text-white transition-opacity duration-150 hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)]";

/**
 * The form chrome. Here rather than in each form because three files had
 * byte-identical copies of both, and this file is already where the flow's
 * shared styling lives.
 */
export const CLAIM_FIELD =
  "h-10 w-full rounded-[8px] border border-[var(--border-medium)] bg-[var(--surface-card)] px-3.5 text-[13px] text-[var(--ink-900)] outline-none placeholder:text-[var(--ink-400)] focus:border-[var(--ink-900)]";

export const CLAIM_LABEL = "mb-1.5 block text-[12px] text-[var(--ink-600)]";

/** The quieter second action — "Someone else should own it", "This isn't right". */
export const CLAIM_LINK =
  "text-[12px] text-[var(--ink-500)] underline decoration-[var(--ink-300)] underline-offset-2 transition-colors hover:text-[var(--ink-900)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--blue-ring-40)] rounded-sm";
