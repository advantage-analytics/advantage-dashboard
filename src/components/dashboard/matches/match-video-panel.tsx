"use client";

import { useEffect, useRef } from "react";
import { Button } from "@/components/ui/button";
import { AlertTriangle, Upload, Video, X } from "lucide-react";
import { motion } from "framer-motion";
import { useVideoUpload } from "./use-video-upload";

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ── Formatting ──────────────────────────────────────────────── */

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDuration(s: number): string {
  if (s < 60) return `${Math.ceil(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.ceil((s % 3600) / 60)}m`;
}

function fmtSpeed(bps: number): string {
  return bps < 1024 * 1024 ? `${(bps / 1024).toFixed(0)} KB/s` : `${(bps / (1024 * 1024)).toFixed(1)} MB/s`;
}

/* ── Component ───────────────────────────────────────────────── */

interface MatchVideoPanelProps {
  matchId: string;
}

export function MatchVideoPanel({ matchId }: MatchVideoPanelProps) {
  const [state, actions] = useVideoUpload(matchId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

  const { loading, phase, compressionPct, compressionInfo, uploadProgress, error, largeFileWarning, matchFile, videoUrl } = state;
  const busy = phase !== "idle";
  const progressPct = phase === "compressing" ? compressionPct : (uploadProgress?.pct ?? 0);

  // Load on mount
  useEffect(() => { void actions.load(); }, [actions.load]);

  // Sidebar seek listener
  useEffect(() => {
    const handler = (e: Event) => {
      const time = (e as CustomEvent<{ time: number }>)?.detail?.time;
      if (typeof time !== "number") return;
      const el = videoRef.current;
      if (!el) return;

      const seek = () => { el.currentTime = Math.max(0, time); void el.play().catch(() => {}); };
      if (el.readyState < 1) {
        el.addEventListener("loadedmetadata", seek, { once: true });
      } else {
        seek();
      }
    };
    window.addEventListener("match:video-seek", handler as EventListener);
    return () => window.removeEventListener("match:video-seek", handler as EventListener);
  }, []);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        disabled={busy}
        onChange={(e) => { actions.pickFile(e.target.files?.[0] ?? null); e.currentTarget.value = ""; }}
      />

      {/* Header */}
      <div className="flex items-center justify-between h-[47px] px-6">
        <div className="flex items-center gap-3">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">Match Video</p>
          {matchFile?.video_file_name && !busy && (
            <span className="text-[10px] text-[#AAAAAA]">{matchFile.video_file_name}</span>
          )}
        </div>
        {videoUrl && !busy && (
          <button type="button" onClick={() => fileInputRef.current?.click()} className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[2px] hover:text-[#2563EB] transition-colors duration-200">
            Replace
          </button>
        )}
      </div>

      {/* Progress bar + phase info */}
      {busy && (
        <div>
          <div className="h-[3px] bg-[#F3F3F3]">
            <motion.div className="h-full bg-[#3B82F6]" animate={{ width: `${progressPct}%` }} transition={{ duration: 0.5, ease: EASE }} />
          </div>

          <div className="flex items-center justify-between px-6 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium text-[#0D0D0D]">
                {phase === "compressing" ? "Compressing…" : "Uploading…"}
              </span>
              <span className="text-[11px] font-medium text-[#0D0D0D] tabular-nums">
                {phase === "compressing" ? `${compressionPct}%` : `${uploadProgress?.pct.toFixed(1)}%`}
              </span>
              {phase === "compressing" && compressionInfo && (
                <span className="text-[10px] text-[#AAAAAA] tabular-nums">
                  {fmtSize(compressionInfo.originalSize)}{compressionInfo.compressedSize ? ` → ${fmtSize(compressionInfo.compressedSize)}` : " → 720p"}
                </span>
              )}
              {phase === "uploading" && uploadProgress && (
                <span className="text-[10px] text-[#AAAAAA] tabular-nums">
                  {fmtSize(uploadProgress.bytesUploaded)} / {fmtSize(uploadProgress.bytesTotal)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {phase === "uploading" && uploadProgress && uploadProgress.speed > 0 && (
                <span className="text-[10px] text-[#AAAAAA] tabular-nums">{fmtSpeed(uploadProgress.speed)}</span>
              )}
              {phase === "uploading" && uploadProgress && uploadProgress.etaSeconds > 0 && (
                <span className="text-[10px] font-medium text-[#525252] tabular-nums">~{fmtDuration(uploadProgress.etaSeconds)} left</span>
              )}
              <button onClick={() => void actions.cancel()} className="flex items-center gap-1 text-[10px] font-medium text-[#AAAAAA] hover:text-[#EF4444] transition-colors duration-200">
                <X className="w-3 h-3" />Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Large file warning */}
      {largeFileWarning && !busy && (
        <div className="mx-6 mb-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-[#92400E] mb-1">Too large to auto-compress — {fmtSize(largeFileWarning.size)}</p>
              <p className="text-[11px] text-[#A16207] leading-[16px]">
                Files over 2 GB exceed browser memory limits for compression. Compress to 720p with HandBrake or VLC first, or upload the original.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button onClick={() => void actions.startUpload(largeFileWarning)} className="text-[11px] font-medium text-[#0D0D0D] bg-[#FDE68A] hover:bg-[#FCD34D] rounded-full px-4 py-1.5 transition-colors duration-200">
                  Upload without compressing
                </button>
                <button onClick={actions.dismissLargeFileWarning} className="text-[11px] font-medium text-[#A16207] hover:text-[#92400E] transition-colors duration-200">
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {error && (
        <div className="mx-6 mb-4 bg-[#FEF2F2] border border-[#FECACA] rounded-[10px] p-3">
          <p className="text-[12px] text-[#DC2626]">{error}</p>
        </div>
      )}

      {/* Content area */}
      {loading ? (
        <div className="flex items-center justify-center aspect-video text-[12px] text-[#AAAAAA]">Loading…</div>
      ) : videoUrl ? (
        <video ref={videoRef} className="w-full aspect-video bg-black" controls preload="metadata" src={videoUrl} />
      ) : !busy && !largeFileWarning ? (
        <div className="flex flex-col items-center justify-center aspect-video px-8">
          <div className="w-12 h-12 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-4">
            <Video className="w-5 h-5 text-[#AAAAAA]" />
          </div>
          <p className="text-[13px] font-medium text-[#0D0D0D] mb-1">No video uploaded</p>
          <p className="text-[11px] text-[#AAAAAA] text-center max-w-[300px] leading-[17px] mb-5">
            Upload your SwingVision match recording to review individual points, jump to key moments, and build a library of saved clips.
          </p>
          <Button type="button" size="sm" onClick={() => fileInputRef.current?.click()} className="h-9 rounded-full text-[11px] font-medium bg-[#0D0D0D] text-white hover:bg-[#2D2D2D] px-5">
            <Upload className="h-3.5 w-3.5 mr-2" />Upload video
          </Button>
          <p className="mt-3 text-[10px] text-[#AAAAAA]">Videos under 2 GB are auto-compressed to 720p for faster uploads</p>
        </div>
      ) : null}
    </div>
  );
}
