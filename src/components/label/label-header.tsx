import Image from "next/image";
import Link from "next/link";
import { LabelSignOutButton } from "@/components/label/label-sign-out-button";

/**
 * The `/label` area's chrome: the wordmark, the 1×14 `--border-medium`
 * divider and the area's name — the admin header's grammar — then the guide
 * and the way out. Nothing else: no admin tabs, no search, no workspace
 * switcher. A labeller works the sessions assigned to them and nothing in
 * this header may point anywhere they cannot go, so it links into `/label`
 * only.
 */
export function LabelHeader() {
  return (
    <header className="sticky top-0 z-30 flex h-[var(--header-h)] shrink-0 items-center justify-between bg-[var(--surface-card)] px-6">
      <div className="flex min-w-0 items-center gap-2.5">
        <Link
          href="/label"
          aria-label="Advantage — your labelling sessions"
          className="flex items-center rounded-[var(--radius-button)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
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
          className="h-[14px] w-px shrink-0 bg-[var(--border-medium)]"
        />
        <span className="text-[12px] whitespace-nowrap text-[var(--ink-500)]">
          Labels
        </span>
      </div>

      <nav aria-label="Labels" className="flex items-center gap-1">
        <Link
          href="/label/guide"
          className="flex h-[30px] items-center rounded-[var(--radius-button)] px-2.5 text-[12px] whitespace-nowrap text-[var(--ink-600)] transition-colors duration-200 hover:bg-[var(--surface-subtle)] hover:text-[var(--ink-900)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
        >
          Guide
        </Link>
        <LabelSignOutButton />
      </nav>
    </header>
  );
}
