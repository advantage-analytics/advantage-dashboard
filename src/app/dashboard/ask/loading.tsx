import { ASK_COLUMN, AskFrame } from "@/components/dashboard/ask/ask-frame";
import {
  PendingBar,
  PendingFrame,
} from "@/components/dashboard/loading/pending";

/**
 * Ask while its loaders resolve: the page's own two columns (`AskFrame`, the
 * one the loaded page uses), with the title as real text — the route already
 * knows it — and bars only where something is arriving: the line under the
 * title, the composer, and the rail's sections.
 *
 * `pulse={false}` because the frame holds that real title: it renders still
 * and the bars pulse on their own.
 */
export default function AskLoading() {
  return (
    <PendingFrame label="Ask" pulse={false} className="flex flex-col">
      <AskFrame
        className="h-full"
        rail={
          <>
            <div className="flex flex-col gap-3">
              <PendingBar className="h-2 w-32" />
              <PendingBar className="h-2 w-full" />
              <PendingBar className="w-24" />
            </div>
            <div className="flex flex-col gap-3">
              <PendingBar className="h-2 w-28" />
              <PendingBar className="w-48" />
              <PendingBar className="w-40" />
              <PendingBar className="w-44" />
            </div>
          </>
        }
      >
        <div>
          <h1 className="text-display">Ask</h1>
          <div className="mt-[9px] flex h-[18px] items-center">
            <PendingBar className="w-56" />
          </div>
        </div>
        <div className={`${ASK_COLUMN} flex flex-col gap-2 pb-8`}>
          <PendingBar className="h-2 w-24" />
          <PendingBar className="h-[58px] w-full" />
        </div>
      </AskFrame>
    </PendingFrame>
  );
}
