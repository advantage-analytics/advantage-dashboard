"use client";

import {
  useState,
  useSyncExternalStore,
  useTransition,
  type ReactNode,
} from "react";
import Link from "next/link";
import { Check, ExternalLink, X } from "lucide-react";
import { advButton } from "@/lib/ui/adv-button";
import { cn } from "@/lib/utils";
import { formatEta } from "@/lib/data/match-analysis";
import { ScoreLine } from "@/components/dashboard/score-line";
import {
  useMatchStatsReady,
  type MatchStatsState,
} from "@/hooks/use-match-stats-ready";
import { AnalysisProgressTrack } from "../analysis-progress-track";
import type { EventPreset } from "./types";
import type { CreatedMatch, UploadState } from "./upload-progress";
import { formatFileSize } from "./utils";

/**
 * Where finishing lands: what is happening now, the match it is happening to,
 * and a three-step stepper — saved, the video, analysis.
 *
 * ── The one blue thing ─────────────────────────────────────────────────────
 * Blue marks the single next action, and while this tab is still working there
 * isn't one: the right move is to wait. So during the transfer and the hand-off
 * "View match" is a quiet link, not the button. Following it is safe (in-app
 * navigation does not stop the upload, only closing the tab does), but a blue
 * button mid-upload reads as "you're done, go", and leaving costs the live
 * progress and Cancel, which exist nowhere else. Once the video is sent, View
 * match becomes the button; when something failed, the fix is.
 *
 * ── One upload ─────────────────────────────────────────────────────────────
 * "Upload another" opens a NEW tab while anything here is still running, and
 * restarts in place only once nothing is. So this screen only ever describes
 * its own match's upload.
 */
export function UploadMatchSuccess({
  match,
  upload,
  removedError,
  onUploadAnother,
  onResubmitted,
  exitHref,
  preset,
}: {
  match: CreatedMatch;
  /** Null until the transfer's `"started"` event lands, and for imports. */
  upload: UploadState | null;
  /** Set when the wizard rolled the match row back after writing it. */
  removedError: string | null;
  onUploadAnother: () => void;
  /** A "Try again" resubmission was accepted. */
  onResubmitted: () => void;
  exitHref: string;
  preset: EventPreset | null;
}) {
  // Only an import waits on its stats here; a video's analysis is reported
  // by its job, on the match page, long after this screen.
  const stats = useMatchStatsReady(
    match.follows === "import" && !removedError && upload?.phase !== "failed"
      ? match.matchId
      : null,
  );
  const view = successView(match, upload, removedError, stats);
  const matchHref = `/dashboard/matches/${match.matchId}`;

  return (
    <div className="mx-auto w-full max-w-[488px] px-6 pt-[clamp(64px,18vh,176px)] pb-24">
      <div className="animate-fadeIn flex flex-col">
        <div className="flex flex-col gap-2">
          <h1
            className="text-[24px] leading-[1.2] font-light tracking-[-0.3px] text-[var(--ink-900)]"
            style={{ textWrap: "balance" }}
          >
            {view.title}
          </h1>
          <MatchLine match={match} />
        </div>

        <ol className="mt-9 flex flex-col" aria-label="Progress">
          {view.steps.map((step, index) => (
            <Step
              key={step.key}
              step={step}
              last={index === view.steps.length - 1}
            >
              {stepBody(step.key, view, match, upload, onResubmitted)}
            </Step>
          ))}
        </ol>

        <div className="mt-12 flex flex-wrap items-center gap-x-6 gap-y-2">
          {view.primary === "restart" ? (
            <button
              type="button"
              onClick={onUploadAnother}
              className={advButton("primary", "md")}
            >
              Start again
            </button>
          ) : (
            <>
              {view.primary === "view" ? (
                <Link href={matchHref} className={advButton("primary", "md")}>
                  View match
                </Link>
              ) : (
                // Only beside a failure. While this tab is still working — a
                // transfer, a hand-off, an import's stats — there is no match
                // worth opening yet: the page would show a progress card or
                // zeroes, and leaving this screen loses it for good (it lives
                // in the tab's memory; Back opens a blank wizard).
                view.failure && (
                  <Link href={matchHref} className={QUIET_LINK}>
                    View match
                  </Link>
                )
              )}
              <UploadAnotherAction
                busy={view.busy}
                onUploadAnother={onUploadAnother}
              />
            </>
          )}
          {/* A personal re-upload's preset "returns" to this same match. */}
          {preset && preset.eventHref !== matchHref && (
            <Link href={exitHref} className={QUIET_LINK}>
              Back to the event
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

// ── View model ─────────────────────────────────────────────────────────────

type StepKey = "saved" | "video" | "analysis";
type StepState = "done" | "now" | "later" | "fail";

interface StepView {
  key: StepKey;
  state: StepState;
  label: string;
  /** Right-aligned reading on the label row — a percentage, a size. */
  value?: string;
}

interface SuccessView {
  title: string;
  steps: StepView[];
  /** Something in this tab is still running; closing it would stop it. */
  busy: boolean;
  /**
   * What gets the blue button: the match, nothing, or a restart. With nothing,
   * View match shows as a quiet link only beside a failure — never while the
   * tab is still working.
   */
  primary: "view" | "none" | "restart";
  /** Which failure copy the failed step shows. */
  failure?: "transfer" | "cancelled" | "submit" | "import" | "removed";
  /** The wizard's own sentence for a rollback — written for a person. */
  removedError?: string;
  /** An import still waiting on its stats after a minute. */
  slow?: boolean;
}

/**
 * Every screen state, decided in one place from the match and its upload.
 * Kept pure so the mapping reads as a table rather than as branches in markup.
 */
function successView(
  match: CreatedMatch,
  upload: UploadState | null,
  removedError: string | null,
  stats: MatchStatsState,
): SuccessView {
  const saved: StepView = { key: "saved", state: "done", label: "Match saved" };

  if (removedError) {
    return {
      title: "The match wasn't saved",
      steps: [{ key: "saved", state: "fail", label: "Match not saved" }],
      busy: false,
      primary: "restart",
      failure: "removed",
      removedError,
    };
  }

  if (match.follows === "none") {
    return {
      title: "Match saved",
      steps: [saved],
      busy: false,
      primary: "view",
    };
  }

  if (match.follows === "import") {
    if (upload?.phase === "failed") {
      return {
        title: "Stats couldn't be added",
        steps: [saved, { key: "analysis", state: "fail", label: "Stats" }],
        busy: false,
        primary: "view",
        failure: "import",
      };
    }
    const ready = stats === "ready";
    return {
      title: ready ? "Match ready" : "Match saved",
      steps: [
        saved,
        {
          key: "analysis",
          state: ready ? "done" : "now",
          label: ready ? "Stats added" : "Adding your stats",
        },
      ],
      busy: false,
      // Until the stats land the match page would draw zeroes, so it is not
      // the next thing to do yet. A slow import hands it back: waiting here
      // any longer tells the person nothing the match page won't.
      primary: stats === "waiting" ? "none" : "view",
      slow: stats === "slow",
    };
  }

  const later: StepView = {
    key: "analysis",
    state: "later",
    label: "Analysis",
  };
  const size = upload?.progress
    ? formatFileSize(upload.progress.bytesTotal)
    : undefined;

  switch (upload?.phase ?? "starting") {
    case "starting":
    case "uploading":
      return {
        title: "Uploading your video",
        steps: [
          saved,
          {
            key: "video",
            state: "now",
            label: "Uploading video",
            value: upload?.progress
              ? `${Math.floor(upload.progress.pct)}%`
              : undefined,
          },
          later,
        ],
        busy: true,
        primary: "none",
      };
    case "done":
      return {
        title: "Sending for analysis",
        steps: [
          saved,
          { key: "video", state: "done", label: "Video uploaded", value: size },
          {
            key: "analysis",
            state: "now",
            label: "Handing off to Advantage Intelligence",
          },
        ],
        busy: true,
        primary: "none",
      };
    case "submitted":
      return {
        title: "Sent for analysis",
        steps: [
          saved,
          { key: "video", state: "done", label: "Video uploaded", value: size },
          { key: "analysis", state: "now", label: "Analysis in line" },
        ],
        busy: false,
        primary: "view",
      };
    case "submit_failed":
      return {
        title: "Couldn't send for analysis",
        steps: [
          saved,
          { key: "video", state: "done", label: "Video uploaded", value: size },
          { key: "analysis", state: "fail", label: "Analysis" },
        ],
        busy: false,
        // The fix is "Try again", inside the step.
        primary: upload?.jobId ? "none" : "view",
        failure: "submit",
      };
    case "cancelled":
      return {
        title: "Upload cancelled",
        steps: [
          saved,
          { key: "video", state: "fail", label: "Upload cancelled" },
          later,
        ],
        busy: false,
        primary: "none",
        failure: "cancelled",
      };
    case "failed":
    default:
      return {
        title: "Video didn't finish uploading",
        steps: [
          saved,
          {
            key: "video",
            state: "fail",
            label: upload?.progress
              ? `Upload stopped at ${Math.floor(upload.progress.pct)}%`
              : "Upload stopped",
          },
          later,
        ],
        busy: false,
        primary: "none",
        failure: "transfer",
      };
  }
}

// ── Pieces ─────────────────────────────────────────────────────────────────

const QUIET_LINK =
  "inline-flex h-9 items-center gap-1.5 text-[13px] text-[var(--ink-700)] transition-colors duration-200 hover:text-[var(--ink-900)] focus-visible:outline-none";

const NOTE = "text-[12px] leading-[1.55] text-[var(--ink-600)]";

function MatchLine({ match }: { match: CreatedMatch }) {
  const result = match.won === null ? null : match.won ? "Won" : "Lost";
  return (
    <p className="text-[13px] text-[var(--ink-600)]">
      {match.playerName} vs {match.opponentName}
      {match.sets.length > 0 && (
        <>
          {" · "}
          {result && `${result} `}
          <ScoreLine sets={match.sets} />
        </>
      )}
    </p>
  );
}

function stepBody(
  key: StepKey,
  view: SuccessView,
  match: CreatedMatch,
  upload: UploadState | null,
  onResubmitted: () => void,
): ReactNode {
  const step = view.steps.find((s) => s.key === key);
  if (!step) return null;

  if (step.state === "fail") {
    switch (view.failure) {
      case "removed":
        return (
          <p className={NOTE}>
            {view.removedError} Nothing was kept, so starting again won&rsquo;t
            leave a duplicate.
          </p>
        );
      case "import":
        return (
          <p className={NOTE}>
            {upload?.error ?? "The file couldn't be read."}
          </p>
        );
      case "submit":
        return (
          <>
            <p className={NOTE}>
              Your video is stored. Trying again reuses it, so nothing uploads
              twice.
            </p>
            {upload?.jobId && (
              <ResubmitButton
                jobId={upload.jobId}
                onResubmitted={onResubmitted}
              />
            )}
          </>
        );
      case "cancelled":
        return (
          <>
            <p className={NOTE}>The match is saved without video.</p>
            <ReuploadLink matchId={match.matchId} />
          </>
        );
      case "transfer":
      default:
        return (
          <>
            <p className={NOTE}>
              {upload?.error
                ? `${upload.error} The match is saved; it just has no video yet.`
                : "The match is saved; it just has no video yet."}
            </p>
            <ReuploadLink matchId={match.matchId} />
          </>
        );
    }
  }

  if (step.state !== "now") return null;

  if (key === "video") {
    const progress = upload?.progress;
    return (
      <>
        <AnalysisProgressTrack
          percent={progress?.pct ?? 0}
          live
          label="Video upload"
        />
        <div className="-mt-1 flex items-baseline justify-between gap-3 text-[11px] text-[var(--ink-400)] tabular-nums">
          <span>
            {progress
              ? `${formatFileSize(progress.bytesUploaded)} of ${formatFileSize(progress.bytesTotal)} · ${formatEta(progress.etaSeconds)}`
              : "Starting the upload…"}
          </span>
          {upload?.cancel && (
            <button
              type="button"
              onClick={upload.cancel}
              className="cursor-pointer text-[11px] text-[var(--ink-500)] transition-colors duration-200 hover:text-[var(--danger)]"
            >
              Cancel
            </button>
          )}
        </div>
        <p className={cn(NOTE, "mt-1 text-[var(--ink-700)]")}>
          Keep this tab open until the upload finishes.
        </p>
      </>
    );
  }

  if (key === "analysis" && view.busy) {
    return (
      <>
        {/* Bytes have landed; the sheen says the hand-off is still moving. */}
        <AnalysisProgressTrack percent={100} live label="Hand-off" />
        <p className={cn(NOTE, "mt-1 text-[var(--ink-700)]")}>
          Keep this tab open a few more seconds.
        </p>
      </>
    );
  }

  if (key === "analysis" && match.follows === "import") {
    return (
      <p className={NOTE}>
        {view.slow
          ? "This is taking longer than usual. You can open the match now; the stats appear on it as soon as they're ready."
          : "This usually takes a few seconds."}
      </p>
    );
  }

  if (key === "analysis") {
    return (
      <p className={NOTE}>
        We&rsquo;ll notify you when results are ready. You can close this tab.
      </p>
    );
  }

  return null;
}

function Step({
  step,
  last,
  children,
}: {
  step: StepView;
  last: boolean;
  children: ReactNode;
}) {
  const hasBody = Boolean(children);
  return (
    <li
      className="flex gap-3.5"
      aria-current={step.state === "now" ? "step" : undefined}
    >
      <div className="flex w-4 shrink-0 flex-col items-center pt-0.5">
        <StepMark state={step.state} />
        {!last && (
          <div
            aria-hidden="true"
            className={cn(
              "my-1.5 w-px flex-1",
              step.state === "done"
                ? "bg-[var(--ink-200)]"
                : "bg-[var(--border-hairline)]",
            )}
          />
        )}
      </div>
      <div
        className={cn(
          "flex min-w-0 flex-1 flex-col gap-2.5",
          last ? "" : hasBody ? "pb-7" : "pb-5",
        )}
      >
        <div className="flex items-center justify-between gap-4">
          <span
            className="text-[13px] leading-5"
            style={{ color: LABEL_INK[step.state] }}
          >
            {step.label}
          </span>
          {step.value && (
            <span className="text-[13px] text-[var(--ink-700)] tabular-nums">
              {step.value}
            </span>
          )}
        </div>
        {children}
      </div>
    </li>
  );
}

/** Inline colour: DS type classes are unlayered and beat Tailwind utilities. */
const LABEL_INK: Record<StepState, string> = {
  done: "var(--ink-600)",
  now: "var(--ink-900)",
  later: "var(--ink-400)",
  fail: "var(--ink-900)",
};

function StepMark({ state }: { state: StepState }) {
  switch (state) {
    case "done":
      return (
        <span className="flex size-4 items-center justify-center rounded-full bg-[var(--ink-100)]">
          <Check
            className="size-2.5 text-[var(--ink-600)]"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span className="sr-only">Done:</span>
        </span>
      );
    case "now":
      // Ink, not blue: blue stays on the bar and the one button.
      return (
        <span
          className="size-4 animate-spin rounded-full border-[1.5px] border-[var(--ink-200)] border-t-[var(--ink-900)] motion-reduce:animate-none"
          role="status"
        >
          <span className="sr-only">In progress:</span>
        </span>
      );
    case "fail":
      return (
        <span className="flex size-4 items-center justify-center rounded-full bg-[rgba(229,24,55,0.08)]">
          <X
            className="size-2.5 text-[var(--danger)]"
            strokeWidth={2.25}
            aria-hidden="true"
          />
          <span className="sr-only">Failed:</span>
        </span>
      );
    case "later":
      // Dashed means waiting for something real.
      return (
        <span className="size-4 rounded-full border-[1.5px] border-dashed border-[var(--ink-300)]">
          <span className="sr-only">Not started:</span>
        </span>
      );
  }
}

/**
 * "Try again" for a hand-off that failed after the bytes landed.
 *
 * The same request `RetrySubmission` makes on the match page — only the job
 * id, since the route reads the camera and scoring answers back from the row.
 * It does not reuse that component: on success it refreshes the route, and
 * this screen holds its state in the flow rather than in anything a refresh
 * re-reads, so it would sit on the failure after the retry worked.
 */
function ResubmitButton({
  jobId,
  onResubmitted,
}: {
  jobId: string;
  onResubmitted: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  return (
    <div className="mt-1 flex flex-col items-start gap-2">
      <button
        type="button"
        disabled={pending}
        onClick={() =>
          start(async () => {
            setError(null);
            try {
              const response = await fetch("/api/splitstep/jobs", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ jobId }),
              });
              if (!response.ok) {
                const payload = (await response.json().catch(() => null)) as {
                  error?: string;
                } | null;
                setError(payload?.error ?? "That didn't go through.");
                return;
              }
              onResubmitted();
            } catch {
              setError("Couldn't reach the server. Check your connection.");
            }
          })
        }
        className={advButton("primary", "sm")}
      >
        {pending ? "Sending…" : "Try again"}
      </button>
      {error && (
        <p role="alert" className="text-[12px] text-[var(--danger)]">
          {error}
        </p>
      )}
    </div>
  );
}

/**
 * The page's URL, or null while server rendering.
 *
 * `useSyncExternalStore` rather than `window.location` read in render, so the
 * server's null and the client's value never disagree during hydration; and
 * rather than `usePathname`/`useSearchParams`, which would force a Suspense
 * boundary on an otherwise static route. The URL cannot change while this
 * screen is mounted, so there is nothing to subscribe to.
 */
function useCurrentUrl(): { pathname: string; search: string } | null {
  const href = useSyncExternalStore(
    noSubscription,
    () => window.location.pathname + window.location.search,
    () => null,
  );
  if (href === null) return null;
  const at = href.indexOf("?");
  return at === -1
    ? { pathname: href, search: "" }
    : { pathname: href.slice(0, at), search: href.slice(at) };
}

function noSubscription(): () => void {
  return () => {};
}

/**
 * "Upload the video again" — the same wizard, opened on this match.
 *
 * `?match=` makes it fill the saved row rather than insert a second one: the
 * score and players are already answered, so it opens on the video. A preset
 * flow's own URL already names its match or line, so it is reused as-is.
 *
 * A plain `<a>`, a full load: this is the wizard's own route with new search
 * params, and the flow's state (the match just saved, this screen) must not
 * survive into the next run.
 */
function ReuploadLink({ matchId }: { matchId: string }) {
  const url = useCurrentUrl();
  const href = url
    ? reuploadHref(matchId, url)
    : `/dashboard/matches/new?match=${matchId}`;
  return (
    <div className="mt-1 flex">
      <a href={href} className={advButton("primary", "sm")}>
        Upload the video again
      </a>
    </div>
  );
}

function reuploadHref(
  matchId: string,
  location: { pathname: string; search: string },
): string {
  const params = new URLSearchParams(location.search);
  if (params.has("entry") || params.get("match") === matchId) {
    return location.pathname + location.search;
  }
  return `${location.pathname}?match=${matchId}`;
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
 * team upload's preset lives entirely in its own route and query string.
 */
function UploadAnotherAction({
  busy,
  onUploadAnother,
}: {
  busy: boolean;
  onUploadAnother: () => void;
}) {
  // A bare `?match=` flow cannot restart in place: the remount keeps its
  // preset, which names the match just saved. Load a clean wizard instead.
  const url = useCurrentUrl();
  const freshHref = url ? anotherHref(url) : "/dashboard/matches/new";
  const namesSavedMatch =
    url !== null && freshHref !== url.pathname + url.search;

  if (!busy && namesSavedMatch) {
    return (
      <a href={freshHref} className={QUIET_LINK}>
        Upload another
      </a>
    );
  }

  if (!busy) {
    return (
      <button
        type="button"
        onClick={onUploadAnother}
        className={cn(QUIET_LINK, "cursor-pointer")}
      >
        Upload another
      </button>
    );
  }

  const newTabHref = freshHref;

  // A real anchor, not `window.open`: it survives a popup blocker, honours
  // ⌘-click and middle-click, and announces the new tab to a screen reader.
  // Plain `<a>` rather than `<Link>` — the new tab must be a full page load.
  return (
    <a
      href={newTabHref}
      target="_blank"
      rel="noopener noreferrer"
      aria-label="Upload another match — opens in a new tab"
      className={QUIET_LINK}
    >
      Upload another
      <ExternalLink
        className="size-3.5 shrink-0 text-[var(--ink-400)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
    </a>
  );
}

/**
 * The URL a fresh wizard opens on. A line's `?entry=` is kept — the next upload
 * from that page is for the same event — but a bare `?match=` is dropped: it
 * names the match just saved, and opening the wizard on it again would try to
 * give it a second video.
 */
function anotherHref(location: { pathname: string; search: string }): string {
  const params = new URLSearchParams(location.search);
  if (!params.has("entry")) params.delete("match");
  const query = params.toString();
  return query ? `${location.pathname}?${query}` : location.pathname;
}
