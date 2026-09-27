import { PersonAvatar } from "@/components/ui/person-avatar";
import type { SharedBy } from "@/lib/data/match-share-server";

/**
 * The foot of the shared report's rail (`/m/[token]`): who shared this, when,
 * and what the share covers.
 *
 * One block beside one mark: the sharer's avatar, then two lines —
 * "Shared from Advantage by <name>" over "<date> · Statistics only". The
 * scope sits on the date line because it is a fact about the share, like
 * the date, not a caption about the person. It was a separate lock line
 * under the block; indented and wrapping at the rail's 300px, it read as a
 * second group hanging off the sharer. (Design canvas "Shared Match Report
 * Variations", board F4.)
 *
 * With no sharer to name — account gone, or a profile with no name — the
 * product stands alone, and the scope still says what the page holds.
 */
export function SharedByFooter({ sharedBy }: { sharedBy: SharedBy | null }) {
  return (
    <div className="flex items-center gap-2.5 border-t border-[var(--border-hairline)] px-5 pt-4 pb-[18px]">
      {sharedBy ? (
        <PersonAvatar
          initials={sharedBy.initials}
          photoUrl={sharedBy.photoUrl}
          className="size-[26px] text-[9px]"
        />
      ) : (
        <span
          aria-hidden="true"
          className="size-[26px] shrink-0 rounded-full bg-[var(--surface-subtle)]"
        />
      )}
      <div className="flex min-w-0 flex-col gap-0.5 leading-[1.25]">
        <span className="text-[12px] text-[var(--ink-900)]">
          {sharedBy ? (
            <>
              Shared from Advantage by{" "}
              <span className="font-medium">{sharedBy.name}</span>
            </>
          ) : (
            "Shared from Advantage"
          )}
        </span>
        <span className="text-micro text-[var(--ink-500)]">
          {sharedBy
            ? `${sharedBy.sharedOn} · Statistics only`
            : "Statistics only"}
        </span>
      </div>
    </div>
  );
}
