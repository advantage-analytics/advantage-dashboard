import { cn } from "@/lib/utils";

/**
 * The admin console's page column — the canvas's `.page`: 28px above, 56px at
 * the sides, 72px below, no maximum width, on the shell's white ground.
 *
 * Every admin page renders one of these rather than the layout supplying the
 * padding, because a page with a rail needs the rail OUTSIDE the padded
 * column, flush to the viewport's right edge. `rail` is that slot: this
 * component owns the `<main>` and its sibling, so a page never hand-assembles
 * the pair and can never drift from the column's metrics.
 *
 * `flex-1 min-w-0` is what lets the column yield the rail's width and still
 * truncate its own tables instead of overflowing.
 */
export function AdminPage({
  children,
  className,
  rail,
}: {
  children: React.ReactNode;
  className?: string;
  /** A full-height right rail — a peek drawer — seated on the screen edge. */
  rail?: React.ReactNode;
}) {
  return (
    <>
      <main
        className={cn(
          "flex min-w-0 flex-1 flex-col px-14 pt-7 pb-[72px]",
          className,
        )}
      >
        {children}
      </main>
      {rail}
    </>
  );
}
