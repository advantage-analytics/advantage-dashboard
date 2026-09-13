import { formatEta } from "@/lib/data/match-analysis";
import { AnalysisProgressTrack } from "../analysis-progress-track";
import { formatFileSize, formatTransferSpeed } from "./utils";
import { PHASE_INK, PHASE_LABEL, type UploadState } from "./upload-progress";

/**
 * One transfer on the success screen: file name and phase, the track, and —
 * while bytes are moving — size, speed, ETA and Cancel.
 *
 * Everything here comes from the browser's own XHR progress, so it moves
 * continuously rather than at the once-a-minute cadence of the database
 * heartbeat.
 */
export function UploadProgressRow({ upload: u }: { upload: UploadState }) {
  const uploading = u.phase === "uploading";
  return (
    <li className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-[11px]">
        <span className="min-w-0 truncate text-[#525252]">{u.fileName}</span>
        <span
          className="shrink-0 tabular-nums"
          style={{ color: PHASE_INK[u.phase] }}
        >
          {u.phase === "uploading"
            ? `${(u.progress?.pct ?? 0).toFixed(1)}%`
            : PHASE_LABEL[u.phase]}
        </span>
      </div>

      <AnalysisProgressTrack
        percent={uploading ? (u.progress?.pct ?? 0) : 100}
        // `done` keeps the sheen: bytes have landed but the job is still being
        // handed over, and a still bar would read as finished.
        live={uploading || u.phase === "done"}
        tone={PHASE_INK[u.phase]}
        label={`${u.fileName} ${u.phase}`}
      />

      {uploading && u.progress && (
        <div className="flex items-baseline justify-between text-[11px] text-[#AAAAAA] tabular-nums">
          <span>
            {formatFileSize(u.progress.bytesUploaded)} /{" "}
            {formatFileSize(u.progress.bytesTotal)}
          </span>
          <span>
            {formatTransferSpeed(u.progress.speed)} ·{" "}
            {formatEta(u.progress.etaSeconds)}
          </span>
        </div>
      )}

      {uploading && u.cancel && (
        <button
          type="button"
          onClick={u.cancel}
          className="self-start text-[11px] text-[#888888] underline-offset-2 transition-colors duration-200 hover:text-[#E51837] hover:underline"
        >
          Cancel this upload
        </button>
      )}
    </li>
  );
}
