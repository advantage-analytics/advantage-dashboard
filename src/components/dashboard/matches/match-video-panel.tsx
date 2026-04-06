"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronDown, Upload, Video } from "lucide-react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import * as tus from "tus-js-client";
import { FilterPills } from "./visuals/filter-pills";
import { useMatchData } from "./match-data-provider";

type MatchFileRow = {
  id: string;
  provider_id: string;
  storage_path: string | null;
  uploaded_at: string | null;
  video_file_name: string | null;
  video_path: string | null;
};

function getFolderFromStoragePath(path: string | null): string | null {
  if (!path) return null;
  const idx = path.lastIndexOf("/");
  if (idx === -1) return null;
  return path.slice(0, idx + 1);
}

function extFromName(name: string): string {
  const idx = name.lastIndexOf(".");
  return idx === -1 ? "" : name.slice(idx + 1).toLowerCase();
}

interface MatchVideoPanelProps {
  matchId: string;
}

type FilterKey =
  | "score"
  | "serve"
  | "return"
  | "result"
  | "custom";

type VideoFilters = {
  // Score
  sets: number[]; // set numbers
  scoreTypes: Array<"Pressure" | "Breakpoint" | "Set Point" | "Match Point">;
  pointScores: string[]; // e.g. "15-30"

  // Serve
  servePlayers: Array<"player1" | "player2">;
  serveSides: Array<"Deuce" | "Ad">;
  serveTypes: Array<"First Serve" | "Second Serve">;
  serveSpins: Array<"Flat" | "Slice" | "Kick">;
  serveZones: Array<"Wide" | "Body" | "T">;

  // Return
  returnPlayers: Array<"player1" | "player2">;
  returnSides: Array<"Deuce" | "Ad">;
  returnTypes: Array<"Forehand" | "Backhand">;
  returnSpins: Array<"Topspin" | "Slice">;
  returnZones: Array<"Down the Line" | "Middle" | "Crosscourt">;
  returnContacts: Array<"Inside" | "Neutral" | "Deep">;

  // Result
  resultPlayers: Array<"player1" | "player2">;
  resultZones: Array<"Serve" | "Return" | "Forehand" | "Backhand" | "Volley" | "Overhead">;
  resultOutcomes: Array<"Won" | "Lost" | "Winner" | "Error">;

  // Custom
  customPlayers: Array<"player1" | "player2">;
  customSides: Array<"Deuce" | "Ad">;
  customDirections: Array<"Crosscourt" | "Down the Line" | "Inside Out" | "Inside In">;
  rallyShots: number[]; // 1..12
};

const FILTER_EVENT = "match:video-filters";

const DEFAULT_FILTERS: VideoFilters = {
  sets: [],
  scoreTypes: [],
  pointScores: [],

  servePlayers: [],
  serveSides: [],
  serveTypes: [],
  serveSpins: [],
  serveZones: [],

  returnPlayers: [],
  returnSides: [],
  returnTypes: [],
  returnSpins: [],
  returnZones: [],
  returnContacts: [],

  resultPlayers: [],
  resultZones: [],
  resultOutcomes: [],

  customPlayers: [],
  customSides: [],
  customDirections: [],
  rallyShots: [],
};

const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: { staggerChildren: 0.05, delayChildren: 0.1 },
  },
};

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const itemVariants = {
  hidden: { opacity: 0, y: 8 },
  visible: {
    opacity: 1,
    y: 0,
    transition: { duration: 0.3, ease: EASE_CURVE },
  },
};

const sectionBodyVariants = {
  hidden: { opacity: 0, height: 0 },
  visible: { opacity: 1, height: "auto", transition: { duration: 0.25, ease: EASE_CURVE } },
  exit: { opacity: 0, height: 0, transition: { duration: 0.2, ease: EASE_CURVE } },
};

function SectionHeader({
  title,
  open,
  onToggle,
  activeCount,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
  activeCount?: number;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between py-3 text-left"
    >
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
          {title}
        </span>
        {activeCount != null && activeCount > 0 && (
          <span className="bg-[#EBF2FD] text-[#3B82F6] rounded-full px-2 py-0.5 text-[10px] font-medium">
            {activeCount}
          </span>
        )}
      </div>
      <motion.div
        animate={{ rotate: open ? 180 : 0 }}
        transition={{ duration: 0.2, ease: EASE_CURVE }}
      >
        <ChevronDown className="h-4 w-4 text-[#888888]" />
      </motion.div>
    </button>
  );
}

export function MatchVideoPanel({ matchId }: MatchVideoPanelProps) {
  const supabase = useMemo(() => createClient(), []);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [matchFile, setMatchFile] = useState<MatchFileRow | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const [filters, setFilters] = useState<VideoFilters>(DEFAULT_FILTERS);
  const [openSections, setOpenSections] = useState<Record<FilterKey, boolean>>({
    score: true,
    serve: false,
    return: false,
    result: false,
    custom: false,
  });

  const { statsResult } = useMatchData();
  const player1Name = statsResult?.player1Name ?? "Player 1";
  const player2Name = statsResult?.player2Name ?? "Player 2";

  const prefersReducedMotion = useReducedMotion();

  const hasActiveFilters = Object.values(filters).some((arr) => arr.length > 0);

  const scoreActiveCount =
    filters.sets.length + filters.scoreTypes.length + filters.pointScores.length;
  const serveActiveCount =
    filters.servePlayers.length +
    filters.serveSides.length +
    filters.serveTypes.length +
    filters.serveSpins.length +
    filters.serveZones.length;
  const returnActiveCount =
    filters.returnPlayers.length +
    filters.returnSides.length +
    filters.returnTypes.length +
    filters.returnSpins.length +
    filters.returnZones.length +
    filters.returnContacts.length;
  const resultActiveCount =
    filters.resultPlayers.length +
    filters.resultZones.length +
    filters.resultOutcomes.length;
  const customActiveCount =
    filters.customPlayers.length +
    filters.customSides.length +
    filters.customDirections.length +
    filters.rallyShots.length;

  const playerOptions = [
    { value: "player1", label: player1Name },
    { value: "player2", label: player2Name },
  ];

  // Broadcast filters to the video sidebar
  useEffect(() => {
    window.dispatchEvent(new CustomEvent(FILTER_EVENT, { detail: filters }));
  }, [filters]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: rows, error: dbErr } = await supabase
        .from("match_files")
        .select("id, provider_id, storage_path, uploaded_at, video_file_name, video_path")
        .eq("match_id", matchId)
        .order("uploaded_at", { ascending: false })
        .limit(1);

      if (dbErr) throw dbErr;
      const row = (rows?.[0] ?? null) as MatchFileRow | null;
      setMatchFile(row);

      if (row?.video_path) {
        const { data: signed, error: signErr } = await supabase.storage
          .from("match-data")
          .createSignedUrl(row.video_path, 60 * 60);
        if (signErr) throw signErr;
        setVideoUrl(signed.signedUrl);
      } else {
        setVideoUrl(null);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load video");
      setMatchFile(null);
      setVideoUrl(null);
    } finally {
      setLoading(false);
    }
  }, [supabase, matchId]);

  useEffect(() => {
    void load();
  }, [load]);

  // Listen for sidebar seek events
  useEffect(() => {
    const handler = (e: Event) => {
      const ce = e as CustomEvent<{ time: number }>;
      const time = ce?.detail?.time;
      if (typeof time !== "number") return;

      const el = videoRef.current;
      if (!el) return;

      const seek = () => {
        el.currentTime = Math.max(0, time);
        // Autoplay on seek to feel like a "jump to moment"
        void el.play().catch(() => {});
      };

      // If metadata isn't loaded yet, wait for it
      if (el.readyState < 1) {
        const onLoaded = () => {
          el.removeEventListener("loadedmetadata", onLoaded);
          seek();
        };
        el.addEventListener("loadedmetadata", onLoaded);
        return;
      }

      seek();
    };

    window.addEventListener("match:video-seek", handler as EventListener);
    return () => window.removeEventListener("match:video-seek", handler as EventListener);
  }, []);

  const onPickFile = useCallback(
    async (file: File | null) => {
      if (!file) return;
      setError(null);
      setUploading(true);
      setUploadPct(0);

      try {
        // We store videos in the same bucket/folder as match data.
        // Use the latest match_files record to derive the folder.
        if (!matchFile) {
          throw new Error(
            "No match file record found. Upload match data first before adding a video."
          );
        }

        const folder =
          getFolderFromStoragePath(matchFile.storage_path) ??
          `${(await supabase.auth.getUser()).data.user?.id ?? ""}/${matchFile.provider_id}/${matchId}/`;

        if (!folder || folder.startsWith("/")) {
          throw new Error("Could not determine upload folder for this match.");
        }

        const safeExt = extFromName(file.name);
        const storedName = safeExt ? `match-video.${safeExt}` : "match-video";
        const videoPath = `${folder}${storedName}`;

        // Use resumable uploads (TUS) for large video files.
        // https://supabase.com/docs/guides/storage/uploads/resumable-uploads
        const {
          data: { session },
          error: sessionErr,
        } = await supabase.auth.getSession();
        if (sessionErr || !session?.access_token) {
          throw new Error("You must be signed in to upload videos.");
        }

        const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
        const url = new URL(supabaseUrl);
        const projectId = url.host.split(".")[0];
        const tusEndpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;

        await new Promise<void>((resolve, reject) => {
          const upload = new tus.Upload(file, {
            endpoint: tusEndpoint,
            retryDelays: [0, 3000, 5000, 10000, 20000],
            headers: {
              authorization: `Bearer ${session.access_token}`,
              apikey: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
              "x-upsert": "true",
            },
            uploadDataDuringCreation: true,
            removeFingerprintOnSuccess: true,
            // NOTE: Supabase currently requires 6MB chunks for TUS.
            chunkSize: 6 * 1024 * 1024,
            metadata: {
              bucketName: "match-data",
              objectName: videoPath,
              contentType: file.type || "video/mp4",
              cacheControl: "3600",
            },
            onError: (err) => reject(err),
            onProgress: (bytesUploaded, bytesTotal) => {
              if (!bytesTotal) return;
              const pct = (bytesUploaded / bytesTotal) * 100;
              setUploadPct(Number(pct.toFixed(2)));
            },
            onSuccess: () => resolve(),
          });

          upload
            .findPreviousUploads()
            .then((previous) => {
              if (previous.length) {
                upload.resumeFromPreviousUpload(previous[0]);
              }
              upload.start();
            })
            .catch(reject);
        });

        const { error: updateErr } = await supabase
          .from("match_files")
          .update({
            video_file_name: file.name,
            video_path: videoPath,
          })
          .eq("id", matchFile.id);
        if (updateErr) throw updateErr;

        // Refresh signed URL
        const { data: signed, error: signErr } = await supabase.storage
          .from("match-data")
          .createSignedUrl(videoPath, 60 * 60);
        if (signErr) throw signErr;

        setVideoUrl(signed.signedUrl);
        setMatchFile((prev) =>
          prev ? { ...prev, video_file_name: file.name, video_path: videoPath } : prev
        );
      } catch (e) {
        setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setUploading(false);
        setUploadPct(null);
      }
    },
    [supabase, matchFile, matchId]
  );

  const showUpload = !loading && !videoUrl;

  return (
    <div className="bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_4px_16px_0px_rgba(0,0,0,0.1)] p-5 min-h-[400px]">
      <input
        ref={fileInputRef}
        type="file"
        accept="video/*"
        className="hidden"
        disabled={uploading}
        onChange={(e) => {
          const file = e.target.files?.[0] ?? null;
          e.currentTarget.value = "";
          void onPickFile(file);
        }}
      />

      <div className="flex items-center justify-between gap-4 mb-4">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
            Video
          </span>
          {matchFile?.video_file_name && (
            <span className="text-[10px] text-[#888888]">
              {matchFile.video_file_name}
            </span>
          )}
        </div>

        {showUpload && (
          <Button
            type="button"
            size="sm"
            disabled={uploading}
            onClick={() => fileInputRef.current?.click()}
            className="bg-[#3B82F6] hover:bg-[#2563EB] text-white rounded-full px-4 py-2 text-[11px] font-medium uppercase tracking-[1.5px] transition-colors duration-200"
          >
            <Upload className="h-3.5 w-3.5 mr-2" />
            {uploading
              ? `Uploading${uploadPct !== null ? ` (${uploadPct}%)` : ""}...`
              : "Upload video"}
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-[rgba(229,24,55,0.1)] border border-[#E51837]/20 rounded-lg p-3">
          <p className="text-[12px] text-[#E51837]">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-[12px] text-[#888888]">
          Loading…
        </div>
      ) : videoUrl ? (
        <div className="w-full rounded-xl overflow-hidden">
          <video
            ref={videoRef}
            className="w-full bg-black"
            controls
            preload="metadata"
            src={videoUrl}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-8 bg-[#FAFAFA] rounded-xl min-h-[300px]">
          <div className="w-12 h-12 rounded-full bg-[#F2F2F2] flex items-center justify-center mb-4">
            <Video className="w-6 h-6 text-[#888888]" />
          </div>
          <h2 className="text-[14px] font-medium text-[#0D0D0D] mb-2">
            No video uploaded yet
          </h2>
          <p className="text-[12px] text-[#525252] text-center max-w-sm">
            Upload match footage to enable replays and jump-to-moment playback.
          </p>
          {uploading && uploadPct !== null && (
            <div className="mt-4 w-full max-w-xs">
              <div className="bg-[#F3F3F3] rounded-full h-2 overflow-hidden">
                <div
                  className="bg-[#3B82F6] rounded-full h-2 transition-[width] duration-300"
                  style={{ width: `${uploadPct}%` }}
                />
              </div>
              <p className="text-[10px] text-[#888888] mt-1 text-center tabular-nums">
                {uploadPct.toFixed(0)}%
              </p>
            </div>
          )}
          <div className="mt-5">
            <button
              type="button"
              disabled={uploading}
              onClick={() => void load()}
              className="text-[9px] font-medium uppercase tracking-[1.5px] text-[#3B82F6] hover:text-[#2563EB] transition-colors duration-200 active:scale-[0.97]"
            >
              Refresh
            </button>
          </div>
        </div>
      )}

      {/* Filters (below video player) */}
      <motion.div
        className="mt-8"
        variants={containerVariants}
        initial="hidden"
        animate="visible"
      >
        <motion.div className="flex items-center justify-between mb-5" variants={itemVariants}>
          <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
            Filters
          </span>
          <motion.button
            onClick={() => setFilters(DEFAULT_FILTERS)}
            disabled={!hasActiveFilters}
            className={`text-[9px] font-medium uppercase tracking-[1.5px] transition-colors duration-200 ${
              hasActiveFilters
                ? "text-[#3B82F6] hover:text-[#2563EB]"
                : "text-[#CCCCCC] cursor-not-allowed"
            }`}
            whileTap={hasActiveFilters ? { scale: 0.97 } : undefined}
          >
            Clear all
          </motion.button>
        </motion.div>

        <div className="border-t border-[#F0F0F0]">
          {/* Score */}
          <motion.div variants={itemVariants}>
            <SectionHeader
              title="Score"
              open={openSections.score}
              onToggle={() =>
                setOpenSections((p) => ({ ...p, score: !p.score }))
              }
              activeCount={scoreActiveCount}
            />
            <AnimatePresence initial={false}>
              {openSections.score && (
                <motion.div
                  key="score-body"
                  variants={sectionBodyVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="overflow-hidden"
                >
                  <div className="bg-[#FAFAFA] rounded-xl p-4 mb-4 flex gap-6">
                    <FilterPills
                      label="Sets"
                      className="shrink-0"
                      options={[
                        { value: "1", label: "Set 1" },
                        { value: "2", label: "Set 2" },
                      ]}
                      selected={filters.sets.map(String)}
                      onChange={(sel) => setFilters((prev) => ({ ...prev, sets: sel.map(Number) }))}
                    />
                    <FilterPills
                      label="Type"
                      className="shrink-0"
                      options={[
                        { value: "Pressure", label: "Pressure" },
                        { value: "Breakpoint", label: "Breakpoint" },
                        { value: "Set Point", label: "Set Point" },
                        { value: "Match Point", label: "Match Point" },
                      ]}
                      selected={filters.scoreTypes}
                      onChange={(sel) => setFilters((prev) => ({ ...prev, scoreTypes: sel as typeof prev.scoreTypes }))}
                    />
                    <FilterPills
                      label="Points"
                      options={[
                        "0-0", "15-0", "30-0", "40-0",
                        "0-15", "15-15", "30-15", "40-15",
                        "0-30", "15-30", "30-30", "40-30",
                        "0-40", "15-40", "30-40", "40-40",
                        "Ad-40", "40-Ad",
                      ].map((s) => ({ value: s, label: s }))}
                      selected={filters.pointScores}
                      onChange={(sel) => setFilters((prev) => ({ ...prev, pointScores: sel }))}
                      pillClassName="w-[54px] text-center !px-0 truncate"
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="h-px bg-[#F0F0F0]" />

          {/* Serve */}
          <motion.div variants={itemVariants}>
            <SectionHeader
              title="Serve"
              open={openSections.serve}
              onToggle={() => setOpenSections((p) => ({ ...p, serve: !p.serve }))}
              activeCount={serveActiveCount}
            />
            <AnimatePresence initial={false}>
              {openSections.serve && (
                <motion.div
                  key="serve-body"
                  variants={sectionBodyVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="overflow-hidden"
                >
                  <div className="bg-[#FAFAFA] rounded-xl p-4 mb-4">
                    <div className="flex flex-row gap-10 flex-wrap">
                      <FilterPills
                        label="Player"
                        options={playerOptions}
                        selected={filters.servePlayers}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, servePlayers: sel as typeof prev.servePlayers }))}
                      />
                      <FilterPills
                        label="Side"
                        options={[
                          { value: "Deuce", label: "Deuce" },
                          { value: "Ad", label: "Ad" },
                        ]}
                        selected={filters.serveSides}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, serveSides: sel as typeof prev.serveSides }))}
                      />
                      <FilterPills
                        label="Type"
                        options={[
                          { value: "First Serve", label: "First Serve" },
                          { value: "Second Serve", label: "Second Serve" },
                        ]}
                        selected={filters.serveTypes}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, serveTypes: sel as typeof prev.serveTypes }))}
                      />
                    </div>
                    <div className="mt-4 flex flex-row gap-10 flex-wrap">
                      <FilterPills
                        label="Spin"
                        options={[
                          { value: "Flat", label: "Flat" },
                          { value: "Slice", label: "Slice" },
                          { value: "Kick", label: "Kick" },
                        ]}
                        selected={filters.serveSpins}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, serveSpins: sel as typeof prev.serveSpins }))}
                      />
                      <FilterPills
                        label="Zone"
                        options={[
                          { value: "Wide", label: "Wide" },
                          { value: "Body", label: "Body" },
                          { value: "T", label: "T" },
                        ]}
                        selected={filters.serveZones}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, serveZones: sel as typeof prev.serveZones }))}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="h-px bg-[#F0F0F0]" />

          {/* Return */}
          <motion.div variants={itemVariants}>
            <SectionHeader
              title="Return"
              open={openSections.return}
              onToggle={() => setOpenSections((p) => ({ ...p, return: !p.return }))}
              activeCount={returnActiveCount}
            />
            <AnimatePresence initial={false}>
              {openSections.return && (
                <motion.div
                  key="return-body"
                  variants={sectionBodyVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="overflow-hidden"
                >
                  <div className="bg-[#FAFAFA] rounded-xl p-4 mb-4">
                    <div className="flex flex-row gap-10 flex-wrap">
                      <FilterPills
                        label="Player"
                        options={playerOptions}
                        selected={filters.returnPlayers}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, returnPlayers: sel as typeof prev.returnPlayers }))}
                      />
                      <FilterPills
                        label="Side"
                        options={[
                          { value: "Deuce", label: "Deuce" },
                          { value: "Ad", label: "Ad" },
                        ]}
                        selected={filters.returnSides}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, returnSides: sel as typeof prev.returnSides }))}
                      />
                      <FilterPills
                        label="Type"
                        options={[
                          { value: "Forehand", label: "Forehand" },
                          { value: "Backhand", label: "Backhand" },
                        ]}
                        selected={filters.returnTypes}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, returnTypes: sel as typeof prev.returnTypes }))}
                      />
                    </div>
                    <div className="mt-4 flex flex-row gap-10 flex-wrap">
                      <FilterPills
                        label="Spin"
                        options={[
                          { value: "Topspin", label: "Topspin" },
                          { value: "Slice", label: "Slice" },
                        ]}
                        selected={filters.returnSpins}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, returnSpins: sel as typeof prev.returnSpins }))}
                      />
                      <FilterPills
                        label="Zone"
                        options={[
                          { value: "Down the Line", label: "Down the Line" },
                          { value: "Middle", label: "Middle" },
                          { value: "Crosscourt", label: "Crosscourt" },
                        ]}
                        selected={filters.returnZones}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, returnZones: sel as typeof prev.returnZones }))}
                      />
                    </div>
                    <div className="mt-4">
                      <FilterPills
                        label="Contact"
                        options={[
                          { value: "Inside", label: "Inside" },
                          { value: "Neutral", label: "Neutral" },
                          { value: "Deep", label: "Deep" },
                        ]}
                        selected={filters.returnContacts}
                        onChange={(sel) => setFilters((prev) => ({ ...prev, returnContacts: sel as typeof prev.returnContacts }))}
                      />
                    </div>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="h-px bg-[#F0F0F0]" />

          {/* Result */}
          <motion.div variants={itemVariants}>
            <SectionHeader
              title="Result"
              open={openSections.result}
              onToggle={() => setOpenSections((p) => ({ ...p, result: !p.result }))}
              activeCount={resultActiveCount}
            />
            <AnimatePresence initial={false}>
              {openSections.result && (
                <motion.div
                  key="result-body"
                  variants={sectionBodyVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="overflow-hidden"
                >
                  <div className="bg-[#FAFAFA] rounded-xl p-4 mb-4 flex flex-col gap-4">
                    <FilterPills
                      label="Player"
                      options={playerOptions}
                      selected={filters.resultPlayers}
                      onChange={(sel) => setFilters((prev) => ({ ...prev, resultPlayers: sel as typeof prev.resultPlayers }))}
                    />
                    <FilterPills
                      label="Zone"
                      options={[
                        { value: "Serve", label: "Serve" },
                        { value: "Return", label: "Return" },
                        { value: "Forehand", label: "Forehand" },
                        { value: "Backhand", label: "Backhand" },
                        { value: "Volley", label: "Volley" },
                        { value: "Overhead", label: "Overhead" },
                      ]}
                      selected={filters.resultZones}
                      onChange={(sel) => setFilters((prev) => ({ ...prev, resultZones: sel as typeof prev.resultZones }))}
                    />
                    <FilterPills
                      label="Outcome"
                      options={[
                        { value: "Won", label: "Won" },
                        { value: "Lost", label: "Lost" },
                        { value: "Winner", label: "Winner" },
                        { value: "Error", label: "Error" },
                      ]}
                      selected={filters.resultOutcomes}
                      onChange={(sel) => setFilters((prev) => ({ ...prev, resultOutcomes: sel as typeof prev.resultOutcomes }))}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>

          <div className="h-px bg-[#F0F0F0]" />

          {/* Custom */}
          <motion.div variants={itemVariants}>
            <SectionHeader
              title="Custom"
              open={openSections.custom}
              onToggle={() => setOpenSections((p) => ({ ...p, custom: !p.custom }))}
              activeCount={customActiveCount}
            />
            <AnimatePresence initial={false}>
              {openSections.custom && (
                <motion.div
                  key="custom-body"
                  variants={sectionBodyVariants}
                  initial="hidden"
                  animate="visible"
                  exit="exit"
                  className="overflow-hidden"
                >
                  <div className="bg-[#FAFAFA] rounded-xl p-4 mb-4 flex flex-col gap-4">
                    <FilterPills
                      label="Choose Player"
                      options={playerOptions}
                      selected={filters.customPlayers}
                      onChange={(sel) => setFilters((prev) => ({ ...prev, customPlayers: sel as typeof prev.customPlayers }))}
                    />
                    <FilterPills
                      label="Side"
                      options={[
                        { value: "Deuce", label: "Deuce" },
                        { value: "Ad", label: "Ad" },
                      ]}
                      selected={filters.customSides}
                      onChange={(sel) => setFilters((prev) => ({ ...prev, customSides: sel as typeof prev.customSides }))}
                    />
                    <FilterPills
                      label="Direction"
                      options={[
                        { value: "Crosscourt", label: "Crosscourt" },
                        { value: "Down the Line", label: "Down the Line" },
                        { value: "Inside Out", label: "Inside Out" },
                        { value: "Inside In", label: "Inside In" },
                      ]}
                      selected={filters.customDirections}
                      onChange={(sel) => setFilters((prev) => ({ ...prev, customDirections: sel as typeof prev.customDirections }))}
                    />
                    <FilterPills
                      label="Rally Shot"
                      options={Array.from({ length: 12 }, (_, i) => ({
                        value: String(i + 1),
                        label: String(i + 1),
                      }))}
                      selected={filters.rallyShots.map(String)}
                      onChange={(sel) => setFilters((prev) => ({ ...prev, rallyShots: sel.map(Number) }))}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </motion.div>
        </div>
      </motion.div>
    </div>
  );
}
