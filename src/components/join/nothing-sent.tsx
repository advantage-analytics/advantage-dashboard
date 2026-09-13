import Link from "next/link";
import { CLAIM_LINK } from "@/components/claim/claim-shell";
import { JoinPane } from "@/components/join/join-pane";
import type { InviterName } from "@/lib/services/programs/invite-acceptance";

/**
 * 8.3a — declined, and kept open.
 *
 * Reached by a link, so there is nothing to undo: no row was written, the token
 * is unspent, and the coach who sent it has not been told. That last one is the
 * promise the screen makes out loud, and it is only worth making because the
 * route that renders it cannot write anything — which is the one rule this file
 * has: whatever renders `NothingSent` must not have accepted, declined or
 * spent anything on the way here.
 *
 * `reviewHref` rather than a token, for the same reason `NotNowLink` takes an
 * href: the way back to the offer is `/join/<token>` from the link flow and
 * something else entirely from the signed-in one, and only the caller knows
 * which it came from.
 */
export function NothingSent({
  reviewHref,
  programName,
  inviterName,
}: {
  reviewHref: string;
  programName: string;
  inviterName: InviterName;
}) {
  return (
    <JoinPane
      width={440}
      eyebrow={programName}
      title="Nothing was sent"
      body={
        <>
          {inviterName ? `${inviterName} wasn't` : "Nobody was"} notified. The
          invitation stays open until you use it or it expires.
        </>
      }
    >
      <div className="flex items-center gap-3 border-t border-[var(--border-hairline)] pt-4">
        <span
          aria-hidden="true"
          className="flex size-8 shrink-0 items-center justify-center rounded-[var(--radius-element)] bg-[var(--surface-subtle)] text-[12px] font-medium text-[var(--ink-700)]"
        >
          {programName.trim().charAt(0).toUpperCase()}
        </span>
        <span className="text-body-sm min-w-0 flex-1 truncate">
          Join {programName}
        </span>
        <Link href={reviewHref} className={CLAIM_LINK}>
          Review
        </Link>
      </div>
    </JoinPane>
  );
}
