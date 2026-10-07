import Link from "next/link";

/**
 * The strip the sample match wears so nobody mistakes it for their own data.
 * Sticky under the header, one line, separated from the page by a hairline —
 * the dashboard is white, so there is no tint, badge or icon here.
 */
export function SampleBanner() {
  return (
    <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-[var(--border-card)] bg-[var(--surface-card)] px-4 py-2 text-[13px] text-[var(--ink-600)]">
      <span>Sample match · Not your data</span>
      <Link
        href="/dashboard/matches/new"
        className="text-[var(--blue)] transition-colors duration-[var(--duration-hover)] hover:text-[var(--blue-hover)]"
      >
        Send your own match
      </Link>
    </div>
  );
}
