"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { ChevronDown, ChevronUp, Upload, Video } from "lucide-react";
import * as tus from "tus-js-client";

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
  returnContacts: Array<"Inside" | "Middle" | "Neutral">;

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

function Chip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={[
        "h-6 px-3 rounded-full text-[10px] font-medium border transition-colors",
        selected
          ? "bg-[#0D0D0D] border-[#0D0D0D] text-white"
          : "bg-white border-[#D9D9D9] text-[#666666] hover:border-[#999999]",
      ].join(" ")}
    >
      {label}
    </button>
  );
}

function SectionHeader({
  title,
  open,
  onToggle,
}: {
  title: string;
  open: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between py-3 text-left"
    >
      <span className="text-xs font-medium text-[#0D0D0D]">{title}</span>
      {open ? (
        <ChevronUp className="h-4 w-4 text-[#999999]" />
      ) : (
        <ChevronDown className="h-4 w-4 text-[#999999]" />
      )}
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

  const toggleInList = useCallback(<T,>(list: T[], value: T): T[] => {
    return list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
  }, []);

  return (
    <div className="bg-white rounded-2xl p-6 min-h-[400px]">
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
          <h3 className="text-xl font-medium text-[#0D0D0D]">Video</h3>
          {matchFile?.video_file_name && (
            <span className="text-xs text-[#999999]">
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
            className="h-8 rounded-full text-xs bg-[#0D0D0D] text-white hover:bg-[#2D2D2D]"
          >
            <Upload className="h-3.5 w-3.5 mr-2" />
            {uploading
              ? `Uploading${uploadPct !== null ? ` (${uploadPct}%)` : ""}...`
              : "Upload video"}
          </Button>
        )}
      </div>

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 rounded-lg p-3">
          <p className="text-sm text-red-700">{error}</p>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-20 text-sm text-[#888888]">
          Loading…
        </div>
      ) : videoUrl ? (
        <div className="w-full">
          <video
            ref={videoRef}
            className="w-full rounded-xl bg-black"
            controls
            preload="metadata"
            src={videoUrl}
          />
        </div>
      ) : (
        <div className="flex flex-col items-center justify-center py-20 px-8 bg-white rounded-2xl min-h-[300px]">
          <div className="w-12 h-12 rounded-full bg-[#F5F5F5] flex items-center justify-center mb-4">
            <Video className="w-6 h-6 text-[#888888]" />
          </div>
          <h2 className="text-base font-semibold text-[#0D0D0D] mb-2">
            No video uploaded yet
          </h2>
          <p className="text-sm text-[#888888] text-center max-w-sm">
            Upload match footage to enable replays and jump-to-moment playback.
          </p>
          <div className="mt-5">
            <Button
              type="button"
              size="sm"
              disabled={uploading}
              onClick={() => void load()}
              className="h-8 rounded-full text-xs bg-[#F7F7F7] text-[#666666] hover:bg-[#EEEEEE]"
            >
              Refresh
            </Button>
          </div>
        </div>
      )}

      {/* Filters (below video player) */}
      <div className="mt-8">
        <div className="flex items-center justify-between">
          <h4 className="text-sm font-medium text-[#0D0D0D]">Filters</h4>
          <Button
            type="button"
            size="sm"
            onClick={() => setFilters(DEFAULT_FILTERS)}
            className="h-7 rounded-full text-[10px] bg-white border border-[#D9D9D9] text-[#666666] hover:bg-[#FAFAFA]"
          >
            Clear All
          </Button>
        </div>

        <div className="mt-3 border-t border-[#E7E7E7]">
          {/* Score */}
          <SectionHeader
            title="Score"
            open={openSections.score}
            onToggle={() =>
              setOpenSections((p) => ({ ...p, score: !p.score }))
            }
          />
          {openSections.score && (
            <div className="pb-4">
              <div className="text-[10px] text-[#999999] mb-2">Sets</div>
              <div className="flex flex-wrap gap-2">
                <Chip
                  label="Set 1"
                  selected={filters.sets.includes(1)}
                  onClick={() =>
                    setFilters((p) => ({ ...p, sets: toggleInList(p.sets, 1) }))
                  }
                />
                <Chip
                  label="Set 2"
                  selected={filters.sets.includes(2)}
                  onClick={() =>
                    setFilters((p) => ({ ...p, sets: toggleInList(p.sets, 2) }))
                  }
                />
              </div>

              <div className="mt-4 text-[10px] text-[#999999] mb-2">Type</div>
              <div className="flex flex-wrap gap-2">
                {(["Pressure", "Breakpoint", "Set Point", "Match Point"] as const).map((t) => (
                  <Chip
                    key={t}
                    label={t}
                    selected={filters.scoreTypes.includes(t)}
                    onClick={() =>
                      setFilters((p) => ({
                        ...p,
                        scoreTypes: toggleInList(p.scoreTypes, t),
                      }))
                    }
                  />
                ))}
              </div>

              <div className="mt-4 text-[10px] text-[#999999] mb-2">Points</div>
              <div className="grid grid-cols-5 gap-2">
                {[
                  "0-0",
                  "15-0",
                  "30-0",
                  "40-0",
                  "0-15",
                  "15-15",
                  "30-15",
                  "40-15",
                  "0-30",
                  "15-30",
                  "30-30",
                  "40-30",
                  "0-40",
                  "15-40",
                  "30-40",
                  "40-40",
                  "Ad-40",
                  "40-Ad",
                ].map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    selected={filters.pointScores.includes(s)}
                    onClick={() =>
                      setFilters((p) => ({
                        ...p,
                        pointScores: toggleInList(p.pointScores, s),
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          )}

          <div className="border-t border-[#E7E7E7]" />

          {/* Serve */}
          <SectionHeader
            title="Serve"
            open={openSections.serve}
            onToggle={() => setOpenSections((p) => ({ ...p, serve: !p.serve }))}
          />
          {openSections.serve && (
            <div className="pb-4">
              <div className="flex flex-row gap-10 flex-wrap">
                <div>
                  <div className="text-[10px] text-[#999999] mb-2">Player</div>
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      label="Rudy Quan"
                      selected={filters.servePlayers.includes("player1")}
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          servePlayers: toggleInList(p.servePlayers, "player1"),
                        }))
                      }
                    />
                    <Chip
                      label="Federico Gomez"
                      selected={filters.servePlayers.includes("player2")}
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          servePlayers: toggleInList(p.servePlayers, "player2"),
                        }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-[#999999] mb-2">Side</div>
                  <div className="flex flex-wrap gap-2">
                    {(["Deuce", "Ad"] as const).map((s) => (
                      <Chip
                        key={s}
                        label={s}
                        selected={filters.serveSides.includes(s)}
                        onClick={() =>
                          setFilters((p) => ({
                            ...p,
                            serveSides: toggleInList(p.serveSides, s),
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-[#999999] mb-2">Type</div>
                  <div className="flex flex-wrap gap-2">
                    {(["First Serve", "Second Serve"] as const).map((t) => (
                      <Chip
                        key={t}
                        label={t}
                        selected={filters.serveTypes.includes(t)}
                        onClick={() =>
                          setFilters((p) => ({
                            ...p,
                            serveTypes: toggleInList(p.serveTypes, t),
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-row gap-10 flex-wrap">
                <div>
                  <div className="text-[10px] text-[#999999] mb-2">Spin</div>
                  <div className="flex flex-wrap gap-2">
                    {(["Flat", "Slice", "Kick"] as const).map((s) => (
                      <Chip
                        key={s}
                        label={s}
                        selected={filters.serveSpins.includes(s)}
                        onClick={() =>
                          setFilters((p) => ({
                            ...p,
                            serveSpins: toggleInList(p.serveSpins, s),
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-[#999999] mb-2">Zone</div>
                  <div className="flex flex-wrap gap-2">
                    {(["Wide", "Body", "T"] as const).map((z) => (
                      <Chip
                        key={z}
                        label={z}
                        selected={filters.serveZones.includes(z)}
                        onClick={() =>
                          setFilters((p) => ({
                            ...p,
                            serveZones: toggleInList(p.serveZones, z),
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-[#E7E7E7]" />

          {/* Return */}
          <SectionHeader
            title="Return"
            open={openSections.return}
            onToggle={() => setOpenSections((p) => ({ ...p, return: !p.return }))}
          />
          {openSections.return && (
            <div className="pb-4">
              <div className="flex flex-row gap-10 flex-wrap">
                <div>
                  <div className="text-[10px] text-[#999999] mb-2">Player</div>
                  <div className="flex flex-wrap gap-2">
                    <Chip
                      label="Rudy Quan"
                      selected={filters.returnPlayers.includes("player1")}
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          returnPlayers: toggleInList(p.returnPlayers, "player1"),
                        }))
                      }
                    />
                    <Chip
                      label="Federico Gomez"
                      selected={filters.returnPlayers.includes("player2")}
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          returnPlayers: toggleInList(p.returnPlayers, "player2"),
                        }))
                      }
                    />
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-[#999999] mb-2">Side</div>
                  <div className="flex flex-wrap gap-2">
                    {(["Deuce", "Ad"] as const).map((s) => (
                      <Chip
                        key={s}
                        label={s}
                        selected={filters.returnSides.includes(s)}
                        onClick={() =>
                          setFilters((p) => ({
                            ...p,
                            returnSides: toggleInList(p.returnSides, s),
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-[#999999] mb-2">Type</div>
                  <div className="flex flex-wrap gap-2">
                    {(["Forehand", "Backhand"] as const).map((t) => (
                      <Chip
                        key={t}
                        label={t}
                        selected={filters.returnTypes.includes(t)}
                        onClick={() =>
                          setFilters((p) => ({
                            ...p,
                            returnTypes: toggleInList(p.returnTypes, t),
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4 flex flex-row gap-10 flex-wrap">
                <div>
                  <div className="text-[10px] text-[#999999] mb-2">Spin</div>
                  <div className="flex flex-wrap gap-2">
                    {(["Topspin", "Slice"] as const).map((s) => (
                      <Chip
                        key={s}
                        label={s}
                        selected={filters.returnSpins.includes(s)}
                        onClick={() =>
                          setFilters((p) => ({
                            ...p,
                            returnSpins: toggleInList(p.returnSpins, s),
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>

                <div>
                  <div className="text-[10px] text-[#999999] mb-2">Zone</div>
                  <div className="flex flex-wrap gap-2">
                    {(["Down the Line", "Middle", "Crosscourt"] as const).map((z) => (
                      <Chip
                        key={z}
                        label={z}
                        selected={filters.returnZones.includes(z)}
                        onClick={() =>
                          setFilters((p) => ({
                            ...p,
                            returnZones: toggleInList(p.returnZones, z),
                          }))
                        }
                      />
                    ))}
                  </div>
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[10px] text-[#999999] mb-2">Contact</div>
                <div className="flex flex-wrap gap-2">
                  {(["Inside", "Middle", "Neutral"] as const).map((c) => (
                    <Chip
                      key={c}
                      label={c}
                      selected={filters.returnContacts.includes(c)}
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          returnContacts: toggleInList(p.returnContacts, c),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-[#E7E7E7]" />

          {/* Result */}
          <SectionHeader
            title="Result"
            open={openSections.result}
            onToggle={() => setOpenSections((p) => ({ ...p, result: !p.result }))}
          />
          {openSections.result && (
            <div className="pb-4">
              <div>
                <div className="text-[10px] text-[#999999] mb-2">Player</div>
                <div className="flex flex-wrap gap-2">
                  <Chip
                    label="Rudy Quan"
                    selected={filters.resultPlayers.includes("player1")}
                    onClick={() =>
                      setFilters((p) => ({
                        ...p,
                        resultPlayers: toggleInList(p.resultPlayers, "player1"),
                      }))
                    }
                  />
                  <Chip
                    label="Federico Gomez"
                    selected={filters.resultPlayers.includes("player2")}
                    onClick={() =>
                      setFilters((p) => ({
                        ...p,
                        resultPlayers: toggleInList(p.resultPlayers, "player2"),
                      }))
                    }
                  />
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[10px] text-[#999999] mb-2">Zone</div>
                <div className="flex flex-wrap gap-2">
                  {(["Serve", "Return", "Forehand", "Backhand", "Volley", "Overhead"] as const).map((z) => (
                    <Chip
                      key={z}
                      label={z}
                      selected={filters.resultZones.includes(z)}
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          resultZones: toggleInList(p.resultZones, z),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>

              <div className="mt-4">
                <div className="text-[10px] text-[#999999] mb-2">Outcome</div>
                <div className="flex flex-wrap gap-2">
                  {(["Won", "Lost", "Winner", "Error"] as const).map((o) => (
                    <Chip
                      key={o}
                      label={o}
                      selected={filters.resultOutcomes.includes(o)}
                      onClick={() =>
                        setFilters((p) => ({
                          ...p,
                          resultOutcomes: toggleInList(p.resultOutcomes, o),
                        }))
                      }
                    />
                  ))}
                </div>
              </div>
            </div>
          )}

          <div className="border-t border-[#E7E7E7]" />

          {/* Custom */}
          <SectionHeader
            title="Custom"
            open={openSections.custom}
            onToggle={() => setOpenSections((p) => ({ ...p, custom: !p.custom }))}
          />
          {openSections.custom && (
            <div className="pb-4">
              <div className="text-[10px] text-[#999999] mb-2">Choose Player</div>
              <div className="flex flex-wrap gap-2">
                <Chip
                  label="Rudy Quan"
                  selected={filters.customPlayers.includes("player1")}
                  onClick={() =>
                    setFilters((p) => ({
                      ...p,
                      customPlayers: toggleInList(p.customPlayers, "player1"),
                    }))
                  }
                />
                <Chip
                  label="Federico Gomez"
                  selected={filters.customPlayers.includes("player2")}
                  onClick={() =>
                    setFilters((p) => ({
                      ...p,
                      customPlayers: toggleInList(p.customPlayers, "player2"),
                    }))
                  }
                />
              </div>

              <div className="mt-4 text-[10px] text-[#999999] mb-2">Side</div>
              <div className="flex flex-wrap gap-2">
                {(["Deuce", "Ad"] as const).map((s) => (
                  <Chip
                    key={s}
                    label={s}
                    selected={filters.customSides.includes(s)}
                    onClick={() =>
                      setFilters((p) => ({
                        ...p,
                        customSides: toggleInList(p.customSides, s),
                      }))
                    }
                  />
                ))}
              </div>

              <div className="mt-4 text-[10px] text-[#999999] mb-2">Direction</div>
              <div className="flex flex-wrap gap-2">
                {(["Crosscourt", "Down the Line", "Inside Out", "Inside In"] as const).map((d) => (
                  <Chip
                    key={d}
                    label={d}
                    selected={filters.customDirections.includes(d)}
                    onClick={() =>
                      setFilters((p) => ({
                        ...p,
                        customDirections: toggleInList(p.customDirections, d),
                      }))
                    }
                  />
                ))}
              </div>

              <div className="mt-4 text-[10px] text-[#999999] mb-2">Rally Shot</div>
              <div className="flex flex-wrap gap-2">
                {Array.from({ length: 12 }, (_, i) => i + 1).map((n) => (
                  <Chip
                    key={n}
                    label={String(n)}
                    selected={filters.rallyShots.includes(n)}
                    onClick={() =>
                      setFilters((p) => ({
                        ...p,
                        rallyShots: toggleInList(p.rallyShots, n),
                      }))
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

