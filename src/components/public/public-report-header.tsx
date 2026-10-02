import Link from "next/link";
import Image from "next/image";
import { ArrowRight, ChevronRight } from "lucide-react";

/**
 * The chrome over a shared match report (`/m/[token]`): the wordmark, what
 * this page is, and a stranger's two doors into the product. It stands in
 * for the dashboard shell's sidebar and top bar, which an anonymous reader
 * has no session for — same `--header-h` so the report's fixed-height box
 * below (`h-[calc(100dvh-var(--header-h))]`) measures the same on both
 * pages.
 *
 * Left reads like a breadcrumb: Match report › "Moore def. Baek · Aug 27,
 * 2026", so the reader knows what they opened before the scoreboard has
 * drawn. Right is two doors for two readers: "Sign in" as quiet text for
 * someone who already has an account (`/login`), and one blue text link,
 * "Advantage for your matches →", for someone who doesn't (`/sign-up`).
 * A plain → rather than ↗: it stays in the app. No button in the bar, so the report is
 * the only object on the page. (Design canvas "Shared Match Report
 * Variations", board A7.)
 *
 * A server component: nothing here changes after render. `crumb` is null on
 * the not-found pane, where there is no match to name.
 */
export function PublicReportHeader({ crumb }: { crumb: string | null }) {
  return (
    <header className="flex h-[var(--header-h)] shrink-0 items-center gap-3 border-b border-[var(--border-hairline)] bg-[var(--surface-card)] px-5">
      <Link href="/login" aria-label="Advantage" className="flex items-center">
        <Image
          src="/logos/logo4.svg"
          alt="Advantage"
          width={105}
          height={18}
          style={{ width: 105, height: 18 }}
          priority
        />
      </Link>
      <span
        aria-hidden="true"
        className="h-3.5 w-px bg-[var(--border-medium)]"
      />
      <nav
        aria-label="Where you are"
        className="flex min-w-0 items-center gap-3"
      >
        <span className="text-micro whitespace-nowrap text-[var(--ink-500)]">
          Match report
        </span>
        {crumb && (
          <>
            <ChevronRight
              className="size-3 shrink-0 text-[var(--ink-300)]"
              strokeWidth={1.7}
              aria-hidden="true"
            />
            <span className="text-micro truncate text-[var(--ink-900)]">
              {crumb}
            </span>
          </>
        )}
      </nav>
      <div className="flex-1" />
      <Link
        href="/login"
        className="mr-1.5 text-[12px] whitespace-nowrap text-[var(--ink-600)] transition-colors duration-200 hover:text-[var(--ink-900)]"
      >
        Sign in
      </Link>
      <Link
        href="/sign-up"
        className="inline-flex items-center gap-1 text-[12px] font-medium whitespace-nowrap text-[var(--blue)] transition-colors duration-200 hover:text-[var(--blue-hover)]"
      >
        Advantage for your matches
        <ArrowRight className="size-3" strokeWidth={1.7} aria-hidden="true" />
      </Link>
    </header>
  );
}
