/**
 * The frame every create screen and event page shares — 25b, 25c, 25e, 25f.
 *
 * A scrolling body and a footer that only exists when there is something to
 * commit. Used to draw its own 44px crumb bar too, but breadcrumbs for this
 * subtree now live in the dashboard shell header (`src/app/dashboard/header.tsx`'s
 * `getStaticBreadcrumbs`, T1) — a second bar here just repeated the header's,
 * one row lower. Written once because the three create forms differ in their
 * middle and nowhere else, and three hand-built bodies is three chances for
 * one of them to drift from the other two.
 */
export function EventShell({
  footer,
  flush = false,
  children,
}: {
  footer?: React.ReactNode;
  /**
   * The body owns its own panes and scrolling — 2b's master–detail, where a
   * fixed rail and a scrolling pane split the space edge to edge. The default
   * body is one padded, scrolling column.
   */
  flush?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[var(--surface-card)]">
      <div
        className={
          flush
            ? "flex min-h-0 flex-1 overflow-hidden"
            : "min-h-0 flex-1 overflow-y-auto px-12 pb-8 pt-[26px]"
        }
      >
        {children}
      </div>

      {footer ? (
        <div className="flex shrink-0 items-center gap-3 border-t border-[var(--border-hairline)] px-12 pb-[22px] pt-4">
          {footer}
        </div>
      ) : null}
    </div>
  );
}
