import { Info } from "lucide-react";
import { SUPPORT_EMAIL } from "@/lib/constants";
import { noteIconCls, noteStripCls } from "./styles";

/**
 * "Still being confirmed" — the grey note a team sees when it picks Advantage
 * Intelligence before its claim is approved.
 *
 * Grey, not the yellow warning: nothing is wrong and nothing here is the
 * coach's to fix — it is a wait. Continue is off while it shows, and the note
 * sits under the source it is about, so the reason is where the eye already
 * is. SwingVision is unaffected (`uploadEligibility({ recordsVideo })`).
 *
 * It renders the sentence it is handed — `pendingReviewRefusal()` or
 * `PENDING_APPROVAL_NOTICE`, the spellings the server seams use — with the
 * first sentence set as the lead, and adds the one thing only a page can: a
 * way to write to us.
 */
export function PendingTeamNote({ message }: { message: string }) {
  const split = message.indexOf(". ");
  const lead = split === -1 ? message : message.slice(0, split + 1);
  const rest = split === -1 ? "" : message.slice(split + 2);
  return (
    <div className={noteStripCls}>
      <Info
        className={`${noteIconCls} text-[var(--ink-400)]`}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <span>
        <b className="font-medium text-[var(--ink-900)]">{lead}</b>
        {rest && ` ${rest}`} Questions?{" "}
        <a
          href={`mailto:${SUPPORT_EMAIL}`}
          className="font-medium text-[var(--blue)] transition-colors duration-150 hover:text-[var(--blue-hover)]"
        >
          {SUPPORT_EMAIL}
        </a>
      </span>
    </div>
  );
}
