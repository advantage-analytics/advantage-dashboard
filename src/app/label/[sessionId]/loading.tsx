import {
  PendingBar,
  PendingRegion,
} from "@/components/dashboard/loading/pending";
import {
  BLACK_VIDEO_WIDTH,
  RAIL_DEFAULT_PX,
} from "@/components/admin/labels/label-layout";

/**
 * A labeller's match reads the session, its points and shots, the signed video
 * and the marks before the console can mount — about two seconds, often more.
 * Without a skeleton of its own the "Assigned to you" row on `/label` gave no
 * sign the click had landed, so labellers clicked it again and again, and
 * went back to the board thinking it had failed.
 *
 * The console opens in its black full screen (`LabelBlackView`), so this draws
 * that: the film across the top of the stage, the court beneath, and the
 * points rail at its default width.
 */
export default function LabelSessionLoading() {
  return (
    <div
      data-label-session-loading=""
      className="fixed inset-0 z-50 flex bg-black text-white"
    >
      <PendingRegion
        label="the match"
        className="[container-type:size] flex min-h-0 min-w-0 flex-1 flex-col"
        innerClassName="flex h-full min-h-0 flex-col"
      >
        <div
          className="mx-auto aspect-video max-w-full shrink-0"
          style={{ width: BLACK_VIDEO_WIDTH }}
        >
          <PendingBar tone="dark" className="h-full w-full rounded-none" />
        </div>
        <div className="flex min-h-0 flex-1 items-center justify-center px-6 pt-3 pb-4">
          <PendingBar
            tone="dark"
            className="h-full max-h-[200px] w-[min(420px,80%)] rounded-[var(--radius-element)]"
          />
        </div>
      </PendingRegion>

      <PendingRegion
        label="the points"
        className="hidden shrink-0 bg-[var(--surface-dark)] shadow-[inset_1px_0_0_rgba(255,255,255,0.1)] md:block"
        innerClassName="flex h-full flex-col gap-4 px-6 py-5"
      >
        <div
          style={{ width: RAIL_DEFAULT_PX - 48 }}
          className="flex flex-col gap-4"
        >
          <div className="flex items-center justify-between">
            <PendingBar tone="dark" className="h-4 w-48" />
            <PendingBar
              tone="dark"
              className="h-7 w-24 rounded-[var(--radius-button)]"
            />
          </div>
          {Array.from({ length: 8 }, (_, i) => (
            <PendingBar
              key={i}
              tone="dark"
              className="h-10 w-full rounded-[var(--radius-element)]"
            />
          ))}
        </div>
      </PendingRegion>
    </div>
  );
}
