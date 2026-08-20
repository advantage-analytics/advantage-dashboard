"use client";

import { useRef, useState } from "react";
import { ArrowRight, FileSpreadsheet, Trash2, Upload } from "lucide-react";
import { probeVideo } from "@/lib/video/probe";
import { TrimRail } from "@/components/dashboard/schedule/upload/trim-rail";
import {
  billableSeconds,
  formatBytes,
  formatSpan,
  type AttachedFile,
  type SelectedEntry,
} from "@/components/dashboard/schedule/upload/types";

const VIDEO_EXTENSIONS = [".mp4", ".mov"];
const IMPORT_EXTENSIONS = [".xlsx", ".xls"];

/**
 * 22c — one file per line, each addressed to the match it belongs to.
 *
 * The address is the point. Order does not matter, so a coach can drop a
 * folder's worth of clips and fix a mixed-up pairing with one select rather
 * than restarting.
 *
 * A card takes either a video or a SwingVision export. 22b says imports happen
 * from the match row instead of here, but the two are the same sentence for a
 * coach — "get this match's data in" — and splitting them across two surfaces
 * would mean explaining a distinction that only matters to us.
 */
export function FilesStep({
  selected,
  files,
  onAttach,
  onDetach,
  poolRemainingSeconds,
}: {
  selected: SelectedEntry[];
  files: Record<string, AttachedFile>;
  onAttach: (entryId: string, attached: AttachedFile) => void;
  onDetach: (entryId: string) => void;
  poolRemainingSeconds: number;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const total = Object.values(files).reduce(
    (sum, attached) => sum + billableSeconds(attached),
    0
  );

  return (
    <div className="flex flex-col gap-4">
      <div>
        <div className="text-title-lg">Add the videos</div>
        <div className="text-body-sm mt-1.5">
          {selected.length} {selected.length === 1 ? "match" : "matches"} ticked.
          Drop a file for each — order doesn&rsquo;t matter, the address does.
        </div>
      </div>

      {selected.map(({ entry }) => (
        <FileCard
          key={entry.id}
          label={`${entry.slot ?? entry.matches[0]?.round ?? "—"} · ${entry.playerLabels.join(" / ")} vs ${
            (entry.matches[0]?.opponentLabels ?? entry.opponentLabels).join(" / ") ||
            "—"
          }`}
          attached={files[entry.id] ?? null}
          expanded={expanded === entry.id}
          onExpand={() => setExpanded(expanded === entry.id ? null : entry.id)}
          onAttach={(attached) => onAttach(entry.id, attached)}
          onDetach={() => onDetach(entry.id)}
          onTrim={(startSeconds, endSeconds) => {
            const current = files[entry.id];
            if (current?.kind !== "video") return;
            onAttach(entry.id, { ...current, startSeconds, endSeconds });
          }}
        />
      ))}

      <PoolReadout total={total} remaining={poolRemainingSeconds} count={Object.keys(files).length} />
    </div>
  );
}

function FileCard({
  label,
  attached,
  expanded,
  onExpand,
  onAttach,
  onDetach,
  onTrim,
}: {
  label: string;
  attached: AttachedFile | null;
  expanded: boolean;
  onExpand: () => void;
  onAttach: (attached: AttachedFile) => void;
  onDetach: () => void;
  onTrim: (startSeconds: number, endSeconds: number) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [probing, setProbing] = useState(false);

  async function take(file: File) {
    const lower = file.name.toLowerCase();

    if (IMPORT_EXTENSIONS.some((extension) => lower.endsWith(extension))) {
      // A SwingVision export carries numbers the provider already computed.
      // No trim, no camera answers — a different job with a different pipeline.
      onAttach({ kind: "import", file });
      return;
    }

    if (!VIDEO_EXTENSIONS.some((extension) => lower.endsWith(extension))) return;

    setProbing(true);
    try {
      const probe = await probeVideo(file);
      onAttach({
        kind: "video",
        file,
        probe,
        startSeconds: 0,
        // Untrimmed until somebody moves a handle. It counts in FULL against the
        // pool meanwhile, which is why the readout is live rather than a
        // surprise at Create.
        endSeconds: probe.durationSeconds,
      });
    } catch {
      onAttach({ kind: "video", file, probe: null, startSeconds: 0, endSeconds: 0 });
    } finally {
      setProbing(false);
    }
  }

  return (
    <div className="rounded-[10px] border border-[var(--border-hairline)] bg-[var(--surface-card)] px-4 py-3.5">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          {attached ? (
            <>
              <div className="truncate text-[13px] font-medium text-[#0D0D0D]">
                {attached.file.name}
              </div>
              <div
                className="tabular mt-1 flex items-center gap-3 text-[11px]"
                style={{ color: "#888888" }}
              >
                {attached.kind === "video" && attached.probe ? (
                  <>
                    <span>
                      {attached.probe.width}×{attached.probe.height}
                    </span>
                    <span style={{ color: "#CCCCCC" }}>·</span>
                    <span>{attached.probe.fps ?? "—"} fps</span>
                    <span style={{ color: "#CCCCCC" }}>·</span>
                    <span>{formatSpan(attached.probe.durationSeconds)}</span>
                    <span style={{ color: "#CCCCCC" }}>·</span>
                  </>
                ) : (
                  <>
                    <span>SwingVision export</span>
                    <span style={{ color: "#CCCCCC" }}>·</span>
                  </>
                )}
                <span>{formatBytes(attached.file.size)}</span>
              </div>
            </>
          ) : (
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              onDragOver={(event) => event.preventDefault()}
              onDrop={(event) => {
                event.preventDefault();
                const file = event.dataTransfer.files[0];
                if (file) void take(file);
              }}
              className="flex w-full cursor-pointer items-center gap-2.5 rounded-[var(--radius-element)] border border-dashed border-[var(--ink-200)] px-4 py-5"
            >
              <Upload strokeWidth={1.5} className="size-4 text-[var(--ink-300)]" />
              <span className="text-[13px] font-medium text-[var(--ink-900)]">
                {probing ? "Reading the file…" : "Drop the match video or a SwingVision export"}
              </span>
            </button>
          )}
        </div>

        <div className="flex min-w-[230px] items-center gap-2 border-b border-[var(--border-hairline)] pb-[3px]">
          <ArrowRight strokeWidth={1.5} className="size-3 text-[var(--ink-400)]" />
          <span className="min-w-0 flex-1 truncate text-[12px] text-[var(--ink-900)]">
            {label}
          </span>
        </div>

        {attached ? (
          <div className="flex shrink-0 items-center gap-2">
            {attached.kind === "video" ? (
              <button
                type="button"
                onClick={onExpand}
                className="cursor-pointer text-[11px] font-medium text-[var(--blue)]"
              >
                {expanded ? "Done" : "Trim"}
              </button>
            ) : (
              <FileSpreadsheet
                strokeWidth={1.5}
                className="size-3.5 text-[var(--ink-400)]"
              />
            )}
            <button
              type="button"
              aria-label="Remove this file"
              onClick={onDetach}
              className="inline-flex size-7 cursor-pointer items-center justify-center rounded-[8px] text-[#888888] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--danger-tint-15)] hover:text-[var(--danger)]"
            >
              <Trash2 strokeWidth={1.5} className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>

      {expanded && attached?.kind === "video" ? (
        <TrimRail
          file={attached.file}
          durationSeconds={attached.probe?.durationSeconds ?? 0}
          startSeconds={attached.startSeconds}
          endSeconds={attached.endSeconds}
          onChange={onTrim}
        />
      ) : null}

      <input
        ref={inputRef}
        type="file"
        accept={[...VIDEO_EXTENSIONS, ...IMPORT_EXTENSIONS].join(",")}
        className="hidden"
        onChange={(event) => {
          const file = event.target.files?.[0];
          if (file) void take(file);
        }}
      />
    </div>
  );
}

function PoolReadout({
  total,
  remaining,
  count,
}: {
  total: number;
  remaining: number;
  count: number;
}) {
  const after = Math.max(0, remaining - total);
  const fraction = remaining > 0 ? Math.min(1, total / remaining) : 0;

  return (
    <div className="flex items-center gap-2 border-t border-[var(--border-hairline)] pt-3">
      <svg viewBox="0 0 16 16" className="size-3.5 -rotate-90">
        <circle cx="8" cy="8" r="6" fill="none" stroke="var(--ink-100)" strokeWidth="3" />
        <circle
          cx="8"
          cy="8"
          r="6"
          fill="none"
          stroke="var(--blue)"
          strokeWidth="3"
          strokeDasharray={`${fraction * 37.7} 37.7`}
        />
      </svg>
      <span className="mono tabular text-[11px]" style={{ color: "var(--ink-700)" }}>
        {formatSpan(total)}
      </span>
      <span className="text-[11px]" style={{ color: "var(--ink-500)" }}>
        across {count} {count === 1 ? "video" : "videos"} ·{" "}
        <span className="mono tabular">{formatSpan(after)}</span> of the team
        pool left after
      </span>
    </div>
  );
}
