import { Monitor } from "lucide-react";
import { cn } from "@/lib/utils";
import { NoticeText } from "./new-match-wizard/NoticeText";
import { noteIconCls, noteStripCls } from "./new-match-wizard/styles";
import { UPLOADING_COPY } from "./upload-progress-copy";

/**
 * The one instruction a running upload carries: keep the tab open and the
 * computer awake.
 *
 * The wizard's grey note strip, because that is the register for "something
 * you should know" — the yellow one is for a question the person has to
 * answer. It leads with a monitor rather than the strip's usual `Info`, in the
 * dark ink, so the note says what it is about before it is read: this was two
 * 12px grey lines, and an upload that ran for an hour was being lost to a
 * closed laptop lid.
 *
 * Drawn by every screen that shows a transfer in flight — the wizard's final
 * screen, the match page's analysis column and the add-video flow — so the
 * three cannot drift.
 *
 * `reassure` adds "You can keep using the dashboard." It is false where
 * leaving the screen cancels the upload (the add-video flow), because there
 * the reassurance would be untrue.
 */
export function UploadKeepOpenNote({
  reassure = true,
  className,
  "data-testid": testId,
}: {
  reassure?: boolean;
  className?: string;
  "data-testid"?: string;
}) {
  const { keepTabOpen, ifItStops, keepUsing } = UPLOADING_COPY.notes;
  const text = [keepTabOpen, ifItStops, reassure ? keepUsing : null]
    .filter(Boolean)
    .join(" ");

  return (
    <UploadNoteStrip className={cn("mt-1", className)} data-testid={testId}>
      {text}
    </UploadNoteStrip>
  );
}

/**
 * The strip itself: grey, a dark monitor, the first sentence in medium weight.
 *
 * Exported for the one other place that talks about the upload's tab — the
 * wizard's Details step, which says it before the upload starts — so the
 * instruction looks the same before and during.
 */
export function UploadNoteStrip({
  children,
  className,
  "data-testid": testId,
}: {
  children: string;
  className?: string;
  "data-testid"?: string;
}) {
  return (
    <div className={cn(noteStripCls, className)} data-testid={testId}>
      <Monitor
        className={cn(noteIconCls, "text-[var(--ink-900)]")}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <NoticeText>{children}</NoticeText>
    </div>
  );
}
