"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import {
  AlertTriangle,
  ChevronRight,
  Expand,
  Play,
  RefreshCw,
  Video,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useVideoUpload } from "../use-video-upload";

const EASE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

/* ── Formatting ─────────────────────────────────────────── */

function fmtSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  if (bytes < 1024 * 1024 * 1024)
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function fmtDuration(s: number): string {
  if (s < 60) return `${Math.ceil(s)}s`;
  if (s < 3600) return `${Math.floor(s / 60)}m ${Math.ceil(s % 60)}s`;
  return `${Math.floor(s / 3600)}h ${Math.ceil((s % 3600) / 60)}m`;
}

/* ── Component ──────────────────────────────────────────── */

interface VideoSectionProps {
  matchId: string;
}

export function VideoSection({ matchId }: VideoSectionProps) {
  const [state, actions] = useVideoUpload(matchId);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const prefersReduced = useReducedMotion();
  const [videoError, setVideoError] = useState(false);

  const {
    loading,
    phase,
    compressionPct,
    compressionInfo,
    uploadProgress,
    error,
    largeFileWarning,
    videoUrl,
  } = state;
  const busy = phase !== "idle";
  const progressPct =
    phase === "compressing" ? compressionPct : (uploadProgress?.pct ?? 0);

  useEffect(() => {
    void actions.load();
  }, [actions.load]);

  // Reset video error when URL changes
  useEffect(() => {
    setVideoError(false);
  }, [videoUrl]);

  /* ── Loading ────────────────────────────────────────────── */

  if (loading) {
    return (
      <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden">
        <div className="flex items-center h-12 px-5">
          <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
            Match Video
          </p>
        </div>
        <Skeleton className="w-full aspect-video" />
      </div>
    );
  }

  /* ── Main render ────────────────────────────────────────── */

  return (
    <motion.div
      initial={prefersReduced ? { opacity: 1 } : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: EASE }}
      className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)] overflow-hidden flex flex-col"
      aria-label="Match video"
    >
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        disabled={busy}
        onChange={(e) => {
          actions.pickFile(e.target.files?.[0] ?? null);
          e.currentTarget.value = "";
        }}
      />

      {/* Header */}
      <div className="flex items-center justify-between h-12 px-5">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Match Video
        </p>
        <div className="flex items-center gap-3">
          {videoUrl && !busy && (
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[1.5px] hover:text-[#525252] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
            >
              Replace
            </button>
          )}
          {videoUrl && !busy && (
            <Link
              href={`/dashboard/matches/${matchId}/video`}
              className="text-[10px] font-medium text-[#3B82F6] uppercase tracking-[1.5px] hover:text-[#2563EB] transition-colors duration-200 inline-flex items-center gap-1"
            >
              <Expand className="w-3 h-3" />
              Expand
            </Link>
          )}
        </div>
      </div>

      {/* Upload progress bar */}
      {busy && (
        <div>
          <div className="h-[3px] bg-[#F3F3F3]">
            <motion.div
              className="h-full bg-[#3B82F6]"
              animate={{ width: `${progressPct}%` }}
              transition={{ duration: 0.5, ease: EASE }}
            />
          </div>
          <div className="flex items-center justify-between px-5 py-2.5">
            <div className="flex items-center gap-3">
              <span className="text-[11px] font-medium text-[#0D0D0D]">
                {phase === "compressing" ? "Compressing…" : "Uploading…"}
              </span>
              <span className="text-[11px] font-medium text-[#0D0D0D] tabular-nums">
                {phase === "compressing"
                  ? `${compressionPct}%`
                  : `${uploadProgress?.pct.toFixed(1)}%`}
              </span>
              {phase === "compressing" && compressionInfo && (
                <span className="text-[10px] text-[#AAAAAA] tabular-nums">
                  {fmtSize(compressionInfo.originalSize)}
                  {compressionInfo.compressedSize
                    ? ` → ${fmtSize(compressionInfo.compressedSize)}`
                    : " → 720p"}
                </span>
              )}
              {phase === "uploading" && uploadProgress && (
                <span className="text-[10px] text-[#AAAAAA] tabular-nums">
                  {fmtSize(uploadProgress.bytesUploaded)} /{" "}
                  {fmtSize(uploadProgress.bytesTotal)}
                </span>
              )}
            </div>
            <div className="flex items-center gap-3">
              {phase === "uploading" &&
                uploadProgress &&
                uploadProgress.etaSeconds > 0 && (
                  <span className="text-[10px] font-medium text-[#525252] tabular-nums">
                    ~{fmtDuration(uploadProgress.etaSeconds)} left
                  </span>
                )}
              <button
                onClick={() => void actions.cancel()}
                className="flex items-center gap-1 text-[10px] font-medium text-[#AAAAAA] hover:text-[#EF4444] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Large file warning */}
      {largeFileWarning && !busy && (
        <div className="mx-5 mb-4 bg-[#FFFBEB] border border-[#FDE68A] rounded-[10px] p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="w-4 h-4 text-[#D97706] shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-[12px] font-medium text-[#92400E] mb-1">
                Too large to auto-compress — {fmtSize(largeFileWarning.size)}
              </p>
              <p className="text-[11px] text-[#A16207] leading-[16px]">
                Files over 2 GB exceed browser memory limits for compression.
                Compress to 720p first, or upload the original.
              </p>
              <div className="flex items-center gap-3 mt-3">
                <button
                  onClick={() => void actions.startUpload(largeFileWarning)}
                  className="text-[11px] font-medium text-[#0D0D0D] bg-[#FDE68A] hover:bg-[#FCD34D] rounded-full px-4 py-1.5 transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40"
                >
                  Upload without compressing
                </button>
                <button
                  onClick={actions.dismissLargeFileWarning}
                  className="text-[11px] font-medium text-[#A16207] hover:text-[#92400E] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 rounded-sm"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Error banner */}
      {error && (
        <div className="mx-5 mb-4 bg-[#FEF2F2] border border-[#FECACA] rounded-[10px] p-3">
          <p className="text-[12px] text-[#DC2626]">{error}</p>
        </div>
      )}

      {/* Content area */}
      {videoUrl && !videoError ? (
        <div className="relative group flex-1 min-h-0">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full h-full object-cover bg-black"
            preload="metadata"
            playsInline
            muted
            onError={() => setVideoError(true)}
          />
          <button
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) {
                v.muted = false;
                void v.play();
              } else {
                v.pause();
              }
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-80 group-hover:opacity-100 transition-opacity duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/60"
            aria-label="Play video"
          >
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-5 h-5 text-[#0D0D0D] ml-0.5" />
            </div>
          </button>
        </div>
      ) : videoUrl && videoError ? (
        /* Video failed to load (e.g. expired signed URL) */
        <div className="flex flex-col items-center justify-center flex-1 min-h-0 px-8 py-14 bg-[#FAFAFA]">
          <div className="w-12 h-12 rounded-full bg-[#FEF2F2] flex items-center justify-center mb-4">
            <AlertTriangle className="w-5 h-5 text-[#DC2626]" />
          </div>
          <p className="text-[13px] font-medium text-[#0D0D0D] mb-1">
            Video failed to load
          </p>
          <p className="text-[11px] text-[#AAAAAA] text-center max-w-[300px] leading-[17px] mb-5">
            The video link may have expired. Reload to get a fresh link.
          </p>
          <Button
            type="button"
            size="sm"
            onClick={() => {
              setVideoError(false);
              void actions.load();
            }}
            className="h-9 rounded-full text-[11px] font-medium bg-[#0D0D0D] text-white hover:bg-[#2D2D2D] px-5"
          >
            <RefreshCw className="h-3.5 w-3.5 mr-2" />
            Reload video
          </Button>
        </div>
      ) : !busy && !largeFileWarning ? (
        /* Empty state — distilled link-row pointing to the full video page */
        <Link
          href={`/dashboard/matches/${matchId}/video`}
          className="group flex-1 flex items-center gap-3 px-5 py-5 hover:bg-[#FAFAFA] transition-colors duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6]/40 focus-visible:ring-inset"
        >
          <div className="size-8 rounded-[10px] bg-[#F5F5F5] flex items-center justify-center shrink-0">
            <Video className="size-4 text-[#525252]" strokeWidth={1.5} aria-hidden />
          </div>
          <div className="flex-1 min-w-0 flex flex-col">
            <p className="text-[13px] font-medium text-[#0D0D0D] leading-[19.5px]">
              Video Review
            </p>
            <p className="text-[11px] font-normal text-[#888888] leading-[16.5px]">
              Match footage &amp; point replay
            </p>
          </div>
          <ChevronRight
            className="size-3.5 text-[#AAAAAA] shrink-0 transition-transform duration-200 group-hover:translate-x-0.5"
            aria-hidden
          />
        </Link>
      ) : null}
    </motion.div>
  );
}
