import { cn } from "@/lib/utils";

/**
 * The admin console's page column — the canvas's `.page`: 28px above, 56px at
 * the sides, 72px below, no maximum width, on the shell's white ground.
 *
 * Each page owns this rather than the layout, because the Requests page puts
 * its 340px peek drawer *beside* the column, flush to the viewport's right
 * edge; padding on a shared wrapper would push the drawer inboard with the
 * content. `flex-1 min-w-0` is what lets the column give the drawer its width
 * and still truncate its own tables instead of overflowing.
 */
export const ADMIN_PAGE_CLASS =
  "flex min-w-0 flex-1 flex-col px-14 pt-7 pb-[72px]";

export function AdminPage({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return <main className={cn(ADMIN_PAGE_CLASS, className)}>{children}</main>;
}
