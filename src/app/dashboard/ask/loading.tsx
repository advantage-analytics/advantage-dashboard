import {
  ASK_RAIL,
  ASK_RAIL_OPEN,
  AskFrame,
  AskIntro,
} from "@/components/dashboard/ask/ask-frame";
import {
  PendingBar,
  PendingFrame,
} from "@/components/dashboard/loading/pending";

/**
 * Ask while its loaders resolve: the page's own frame (`AskFrame` and
 * `AskIntro`, the ones the loaded page uses) — the rail at its open width on
 * the left, the title as real text where the page shows it, and bars only
 * where something is arriving: the rail's button, a month of earlier
 * questions, the limit at its foot, the line under the title and the
 * composer.
 *
 * `pulse={false}` because the frame holds that real title: it renders still
 * and the bars pulse on their own.
 */
export default function AskLoading() {
  return (
    <PendingFrame label="Ask" pulse={false}>
      <AskFrame
        rail={
          <div className={`${ASK_RAIL} ${ASK_RAIL_OPEN}`}>
            <div className="flex items-center gap-1.5 px-3 pt-3 pb-2">
              <PendingBar className="h-8 flex-1 rounded-[var(--radius-button)]" />
              <PendingBar className="size-8 rounded-[var(--radius-element)]" />
            </div>
            <div className="flex min-h-0 flex-1 flex-col gap-0.5 px-3 pt-2">
              <div className="px-2 pb-1.5">
                <PendingBar className="h-2 w-16" />
              </div>
              {["w-44", "w-36", "w-48", "w-40"].map((width, index) => (
                <div key={index} className="flex h-9 items-center px-2">
                  <PendingBar className={width} />
                </div>
              ))}
            </div>
            <div className="flex flex-col gap-2 border-t border-[var(--border-hairline)] px-5 pt-3.5 pb-4">
              <PendingBar className="w-28" />
              <PendingBar className="h-1 w-full" />
              <PendingBar className="h-2 w-24" />
            </div>
          </div>
        }
      >
        <AskIntro lead={<PendingBar className="w-56" />}>
          <PendingBar className="h-[92px] w-full rounded-[var(--radius-button)]" />
        </AskIntro>
      </AskFrame>
    </PendingFrame>
  );
}
