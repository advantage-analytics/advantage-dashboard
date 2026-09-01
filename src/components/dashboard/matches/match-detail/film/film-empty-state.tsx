"use client";

import Link from "next/link";
import { Film } from "lucide-react";

import { useMatchData } from "@/components/dashboard/matches/match-data-provider";
import { MAX_VIDEO_SIZE_BYTES } from "@/lib/services/splitstep/config";
import { advButton } from "@/lib/ui/adv-button";

/**
 * The Film room with no film (artboard 46d, lines 1199–1211).
 *
 * ── The size cap is read, not typed ─────────────────────────────────────────
 * The artboard says "MP4 up to 4 GB". That number is invented — the real cap
 * is `MAX_VIDEO_SIZE_BYTES`, the vendor's documented, enforced bound of "less
 * than 8,000,000,000 bytes". Importing the constant means this line cannot
 * drift from the file picker that actually rejects uploads.
 *
 * `Math.round`, not `Math.floor`: the constant is 8e9 − 1, so flooring would
 * print "7 GB" and understate the cap by a gigabyte — the same class of
 * copy-vs-reality mistake as the artboard's 4.
 *
 * ── The SwingVision claim is gated ──────────────────────────────────────────
 * The artboard's body copy says the statistics came from a SwingVision export.
 * That is only true when they did. `sourceProvider` is also null for a match
 * typed in by hand, and `splitstep` for a video-analysed match whose trimmed
 * copy was reclaimed — neither of those imported anything from SwingVision, so
 * they get copy that is true for them. Same allowlist as the rail's no-video
 * strip (`match-rail.tsx`).
 *
 * ── Both CTAs go to the wizard ──────────────────────────────────────────────
 * There is no add-video-to-an-existing-match flow in the codebase and no
 * import-only route, so "Add video" and "Import from SwingVision" both land on
 * `/dashboard/matches/new`. Recorded as a semantic gap for the flags doc.
 */

const MAX_VIDEO_GB = Math.round(MAX_VIDEO_SIZE_BYTES / 1_000_000_000);

export function FilmEmptyState() {
  const { match } = useMatchData();
  const fromSwingVision = match.sourceProvider === "swing-vision";

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-4 py-16 pb-[72px] text-center">
      <Film
        className="h-7 w-7 text-[var(--ink-300)]"
        strokeWidth={1.5}
        aria-hidden="true"
      />
      <div className="h-px w-6 bg-[var(--border-medium)]" aria-hidden="true" />

      <div className="flex max-w-[420px] flex-col items-center gap-2">
        <h2 className="text-title" style={{ fontSize: "16px" }}>
          No video for this match
        </h2>
        <p className="text-body-sm [text-wrap:pretty]" style={{ color: "var(--ink-600)" }}>
          {fromSwingVision
            ? "The statistics came from a SwingVision export. Add the film and every point below becomes a clip you can jump to."
            : "There is no film on file for this match. Add it and every point becomes a clip you can jump to."}
        </p>
      </div>

      <div className="flex items-center gap-3.5 pt-1">
        <Link href="/dashboard/matches/new" className={advButton("primary", "md")}>
          Add video
        </Link>
        <Link
          href="/dashboard/matches/new"
          className="text-[11px] font-medium text-[var(--blue)]"
        >
          Import from SwingVision
        </Link>
      </div>

      <span className="text-micro pt-0.5" style={{ color: "var(--ink-400)" }}>
        MP4 up to {MAX_VIDEO_GB} GB · we index the points, you keep the file
      </span>
    </div>
  );
}
