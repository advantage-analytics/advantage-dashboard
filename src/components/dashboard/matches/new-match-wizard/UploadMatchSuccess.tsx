import Link from "next/link";
import { Check, CircleX, ExternalLink, TriangleAlert } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import type { EventPreset } from "./types";
import { CONTENT_CLS } from "./WizardShell";
import { noteIconCls, warningStripCls } from "./styles";
import { summarizeUploads, type UploadState } from "./upload-progress";
import { UploadProgressRow } from "./UploadProgressRow";

/**
 * Where finishing lands: "Match saved.", then whatever video transfers are
 * still in flight, then the two ways on.
 *
 * The match row is committed either way. Only the video transfer is in doubt,
 * so the headline never changes and the line under it carries the state.
 */
export function UploadMatchSuccess({
  uploads,
  onUploadAnother,
  exitHref,
  preset,
}: {
  uploads: UploadState[];
  onUploadAnother: () => void;
  exitHref: string;
  preset: EventPreset | null;
}) {
  const { uploading, problems, busy } = summarizeUploads(uploads);
  const failed = problems.length > 0 && !busy;

  return (
    <div className={`${CONTENT_CLS} pt-10 pb-16`}>
      <div className="animate-fadeIn flex flex-col items-center gap-3 rounded-[14px] border border-[#F3F3F3] bg-white px-10 py-12 shadow-[0_2px_8px_rgba(0,0,0,0.06)]">
        <OutcomeBadge failed={failed} />

        <h1 className="text-[24px] leading-[1.2] font-light tracking-[-0.4px] text-[var(--ink-900)]">
          Match saved.
        </h1>

        <p className="max-w-[440px] text-center text-[12px] leading-[1.5] text-[#525252]">
          {busy
            ? uploading.length > 1
              ? `Keep this tab open until all ${uploading.length} videos finish. The matches themselves are already safe.`
              : "Keep this tab open until the video finishes. The match itself is already safe."
            : problems.length > 0
              ? (problems[0].error ??
                (problems[0].phase === "submit_failed"
                  ? "Your video is stored, but it could not be sent for analysis."
                  : "The video upload did not finish."))
              : "Sent for analysis. Results are added as soon as they're ready."}
        </p>

        {/* Only while at least one upload is actively transferring bytes. The
            footnote at the bottom covers the navigation nuance. */}
        {uploading.length > 0 && (
          <KeepTabOpenWarning plural={uploading.length > 1} />
        )}

        {uploads.length > 0 && (
          <ul className="mt-4 flex w-full max-w-[440px] flex-col gap-4">
            {uploads.map((u) => (
              <UploadProgressRow key={u.matchId} upload={u} />
            ))}
          </ul>
        )}

        <div className="mt-2 flex gap-2">
          <UploadAnotherAction busy={busy} onUploadAnother={onUploadAnother} />
          <Link href={exitHref} className={advButton("primary", "md")}>
            {preset ? "Back to the event" : "Back to matches"}
          </Link>
        </div>

        {busy && <StillRunningFootnotes uploadingCount={uploading.length} />}
      </div>
    </div>
  );
}

function OutcomeBadge({ failed }: { failed: boolean }) {
  return (
    <div
      className="flex size-11 items-center justify-center rounded-full"
      style={{
        background: failed ? "rgba(229,24,55,0.08)" : "rgba(59,130,246,0.08)",
      }}
    >
      {failed ? (
        <CircleX className="size-4.5 text-[#E51837]" strokeWidth={1.5} />
      ) : (
        <Check className="size-4.5 text-[#3B82F6]" strokeWidth={1.5} />
      )}
    </div>
  );
}

/**
 * The standard yellow strip — the wizard's register for what must not be
 * missed.
 */
function KeepTabOpenWarning({ plural }: { plural: boolean }) {
  return (
    <div className={`${warningStripCls} w-full max-w-[440px]`}>
      <TriangleAlert
        className={noteIconCls}
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <p>
        Keep this tab open —{" "}
        {plural ? "your videos are uploading" : "your video is uploading"}. You
        can navigate within the app, but closing this tab will stop the upload.
      </p>
    </div>
  );
}

/**
 * "Upload another" — a same-tab restart when nothing is moving, a new tab
 * while something is.
 *
 * The same-tab remount cannot be used while a transfer is live: this screen is
 * the only thing holding the upload's progress and its cancel handle, so
 * replacing it with the wizard would leave bytes moving with nothing to watch
 * or stop them. A new tab keeps this one intact and starts a genuinely fresh
 * wizard beside it.
 *
 * The current URL rather than a hardcoded `/dashboard/matches/new`, because a
 * team upload's preset lives entirely in its own route and query string
 * (`/dashboard/team/upload?entry=…`, `/dashboard/team/upload?match=…`).
 * Hardcoding the personal route would silently drop the pinned line.
 *
 * Read during render rather than through `usePathname`/`useSearchParams`: the
 * latter would force a Suspense boundary on an otherwise static route, and this
 * screen cannot hydrate-mismatch — `createdMatchId` starts null, so it is only
 * ever reached after a click, never on the server.
 *
 * No localStorage collision to resolve: `handleCreateMatch` calls
 * `clearStorageData()` before this screen ever renders, and this screen has no
 * wizard mounted to write the keys back — so the new tab loads a blank draft,
 * and `DashboardShell`'s "leaving the flow" clear is a no-op in a tab that is
 * arriving at the flow rather than leaving it.
 */
function UploadAnotherAction({
  busy,
  onUploadAnother,
}: {
  busy: boolean;
  onUploadAnother: () => void;
}) {
  if (!busy) {
    return (
      <button
        type="button"
        onClick={onUploadAnother}
        className={advButton("ghost", "md")}
      >
        Upload another
      </button>
    );
  }

  const newTabHref =
    typeof window === "undefined"
      ? "/dashboard/matches/new"
      : window.location.pathname + window.location.search;

  // A real anchor, not `window.open`: it survives a popup blocker, honours
  // ⌘-click and middle-click, and announces the new tab to a screen reader.
  // Plain `<a>` rather than `<Link>` on purpose — the new tab must be a full
  // page load, which is what gives its wizard a hook with no memory of this one.
  return (
    <a
      href={newTabHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Upload another match — opens in a new tab"
      className={advButton("ghost", "md")}
    >
      Upload another
      <ExternalLink
        className="size-3.5 shrink-0"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </a>
  );
}

function StillRunningFootnotes({ uploadingCount }: { uploadingCount: number }) {
  return (
    <>
      {/* Beside the button that causes it. The amber banner above says to keep
          the tab open; this says why the button just handed them a second one,
          so the two tabs don't read as an accident. The stop/leave nuance is
          the footnote below — repeating it here would be the third telling. */}
      <p className="max-w-[440px] text-center text-[11px] leading-[1.5] text-[#888888]">
        &ldquo;Upload another&rdquo; opens a new tab. Don&rsquo;t close this one
        —{" "}
        {uploadingCount === 0
          ? // Bytes have landed; the vendor hand-off is still in flight, and
            // it runs from this tab too.
            "this upload is still finishing here"
          : uploadingCount > 1
            ? "your videos are still uploading here"
            : "your video is still uploading here"}
        .
      </p>

      {/* Leaving is allowed but not free, and the browser's own dialog fires
          too late to read as a warning. Precise on purpose: beforeunload only
          fires on a real unload, so closing the tab stops the transfer but the
          "Back to matches" link above does not — it keeps running, just without
          this screen or its cancel button. */}
      <p className="mt-1 text-center text-[10px] tracking-[2px] text-[#CCCCCC] uppercase">
        Closing this tab stops {uploadingCount > 1 ? "them" : "it"} · leaving
        this page does not
      </p>
    </>
  );
}
