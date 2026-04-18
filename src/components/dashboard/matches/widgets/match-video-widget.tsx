"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { Play, Upload } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { createClient } from "@/lib/supabase/client";

interface MatchVideoWidgetProps {
  matchId: string;
}

export function MatchVideoWidget({ matchId }: MatchVideoWidgetProps) {
  const supabase = useMemo(() => createClient(), []);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data: rows } = await supabase
        .from("match_files")
        .select("video_path")
        .eq("match_id", matchId)
        .order("uploaded_at", { ascending: false })
        .limit(1);

      const row = rows?.[0] ?? null;
      if (row?.video_path) {
        const { data: signed } = await supabase.storage
          .from("match-data")
          .createSignedUrl(row.video_path, 60 * 60);
        setVideoUrl(signed?.signedUrl ?? null);
      }
    } catch {
      // Silently fail
    } finally {
      setLoading(false);
    }
  }, [supabase, matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between h-[47px] px-6">
        <p className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px]">
          Match Video
        </p>
        <Link
          href={`/dashboard/matches/${matchId}/video`}
          className="text-[9px] font-medium text-[#3B82F6] uppercase tracking-[1.5px] hover:text-[#2563EB] transition-colors duration-200"
        >
          VIEW MORE
        </Link>
      </div>

      {/* Video */}
      {loading ? (
        <Skeleton className="w-full aspect-video" />
      ) : videoUrl ? (
        <div className="relative group">
          <video
            ref={videoRef}
            src={videoUrl}
            className="w-full aspect-video object-cover bg-black"
            preload="metadata"
            playsInline
            muted
          />
          <button
            onClick={() => {
              const v = videoRef.current;
              if (!v) return;
              if (v.paused) { v.muted = false; void v.play(); }
              else v.pause();
            }}
            className="absolute inset-0 flex items-center justify-center bg-black/20 opacity-0 group-hover:opacity-100 transition-opacity duration-200"
            aria-label="Play video"
          >
            <div className="w-12 h-12 rounded-full bg-white/90 flex items-center justify-center">
              <Play className="w-5 h-5 text-[#0D0D0D] ml-0.5" />
            </div>
          </button>
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-center">
          <Upload className="w-6 h-6 text-[#AAAAAA]" aria-hidden="true" />
          <p className="text-[12px] text-[#888888]">No video uploaded yet</p>
        </div>
      )}
    </div>
  );
}
