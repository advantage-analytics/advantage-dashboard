"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MAX_COMPRESS_SIZE } from "@/lib/video/compress";

/* ── Types ───────────────────────────────────────────────────── */

type MatchFileRow = {
  id: string;
  provider_id: string;
  storage_path: string | null;
  uploaded_at: string | null;
  video_file_name: string | null;
  video_path: string | null;
};

export type Phase = "idle" | "compressing" | "uploading";

export interface UploadProgress {
  pct: number;
  bytesUploaded: number;
  bytesTotal: number;
  speed: number;
  etaSeconds: number;
}

export interface CompressionInfo {
  originalSize: number;
  compressedSize?: number;
}

export interface VideoUploadState {
  loading: boolean;
  phase: Phase;
  compressionPct: number;
  compressionInfo: CompressionInfo | null;
  uploadProgress: UploadProgress | null;
  error: string | null;
  largeFileWarning: File | null;
  matchFile: MatchFileRow | null;
  videoUrl: string | null;
}

export interface VideoUploadActions {
  load: () => Promise<void>;
  pickFile: (file: File | null) => void;
  startUpload: (file: File) => Promise<void>;
  cancel: () => Promise<void>;
  dismissLargeFileWarning: () => void;
}

/* ── Helpers ──────────────────────────────────────────────────── */

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

function getChunkSize(fileSize: number): number {
  const MB = 1024 * 1024;
  if (fileSize < 100 * MB) return 6 * MB;
  if (fileSize < 500 * MB) return 20 * MB;
  if (fileSize < 2000 * MB) return 50 * MB;
  return 80 * MB;
}

const PROGRESS_THROTTLE_MS = 500;

/* ── Hook ────────────────────────────────────────────────────── */

export function useVideoUpload(matchId: string): [VideoUploadState, VideoUploadActions] {
  const supabase = useMemo(() => createClient(), []);

  const [loading, setLoading] = useState(true);
  const [phase, setPhase] = useState<Phase>("idle");
  const [compressionPct, setCompressionPct] = useState(0);
  const [compressionInfo, setCompressionInfo] = useState<CompressionInfo | null>(null);
  const [uploadProgress, setUploadProgress] = useState<UploadProgress | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [largeFileWarning, setLargeFileWarning] = useState<File | null>(null);
  const [matchFile, setMatchFile] = useState<MatchFileRow | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);

  const lastProgressUpdate = useRef(0);
  const uploadStartTime = useRef(0);
  const abortControllerRef = useRef<AbortController | null>(null);
  const tusUploadRef = useRef<{ abort: (shouldTerminate: boolean) => Promise<void> } | null>(null);

  /* ── Load existing video ───────────────────────────────────── */

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

  /* ── TUS upload ────────────────────────────────────────────── */

  const uploadToStorage = useCallback(
    async (file: File, videoPath: string, session: { access_token: string }) => {
      uploadStartTime.current = Date.now();

      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
      const url = new URL(supabaseUrl);
      const projectId = url.host.split(".")[0];
      const tusEndpoint = `https://${projectId}.storage.supabase.co/storage/v1/upload/resumable`;

      const tus = await import("tus-js-client");

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
          chunkSize: getChunkSize(file.size),
          metadata: {
            bucketName: "match-data",
            objectName: videoPath,
            contentType: file.type || "video/mp4",
            cacheControl: "3600",
          },
          onError: (err) => reject(err),
          onProgress: (bytesUploaded, bytesTotal) => {
            if (!bytesTotal) return;
            const now = Date.now();
            if (now - lastProgressUpdate.current < PROGRESS_THROTTLE_MS) return;
            lastProgressUpdate.current = now;

            const elapsed = (now - uploadStartTime.current) / 1000;
            const speed = elapsed > 0 ? bytesUploaded / elapsed : 0;
            const remaining = bytesTotal - bytesUploaded;

            setUploadProgress({
              pct: Number(((bytesUploaded / bytesTotal) * 100).toFixed(1)),
              bytesUploaded,
              bytesTotal,
              speed,
              etaSeconds: speed > 0 ? remaining / speed : 0,
            });
          },
          onSuccess: () => {
            tusUploadRef.current = null;
            setUploadProgress((prev) =>
              prev ? { ...prev, pct: 100, bytesUploaded: prev.bytesTotal, etaSeconds: 0 } : prev
            );
            resolve();
          },
        });

        tusUploadRef.current = upload;

        upload
          .findPreviousUploads()
          .then((prev) => {
            if (prev.length) upload.resumeFromPreviousUpload(prev[0]);
            upload.start();
          })
          .catch(reject);
      });
    },
    []
  );

  /* ── Full flow: compress → upload → finalize ───────────────── */

  const startUpload = useCallback(
    async (file: File) => {
      setError(null);
      setLargeFileWarning(null);

      const ac = new AbortController();
      abortControllerRef.current = ac;

      let fileToUpload = file;

      try {
        if (!matchFile) {
          throw new Error("No match file record found. Upload match data first.");
        }

        // Phase 1: Compress (if within WASM memory limit)
        if (file.size <= MAX_COMPRESS_SIZE) {
          setPhase("compressing");
          setCompressionPct(0);
          setCompressionInfo({ originalSize: file.size });

          const { compressVideo } = await import("@/lib/video/compress");
          const result = await compressVideo({ file, onProgress: setCompressionPct, signal: ac.signal });

          fileToUpload = result.file;
          setCompressionInfo({ originalSize: result.originalSize, compressedSize: result.compressedSize });
        }

        // Phase 2: Upload
        setPhase("uploading");
        setUploadProgress({ pct: 0, bytesUploaded: 0, bytesTotal: fileToUpload.size, speed: 0, etaSeconds: 0 });

        let folder = getFolderFromStoragePath(matchFile.storage_path);
        if (!folder) {
          const { data: { user } } = await supabase.auth.getUser();
          folder = `${user?.id ?? ""}/${matchFile.provider_id}/${matchId}/`;
        }
        if (!folder || folder.startsWith("/")) throw new Error("Could not determine upload folder.");

        const safeExt = extFromName(fileToUpload.name);
        const videoPath = `${folder}${safeExt ? `match-video.${safeExt}` : "match-video"}`;

        const { data: { session }, error: sessionErr } = await supabase.auth.getSession();
        if (sessionErr || !session?.access_token) throw new Error("You must be signed in.");

        await uploadToStorage(fileToUpload, videoPath, session);

        // Finalize: DB update + signed URL in parallel
        const [updateResult, signedResult] = await Promise.all([
          supabase.from("match_files").update({ video_file_name: file.name, video_path: videoPath }).eq("id", matchFile.id),
          supabase.storage.from("match-data").createSignedUrl(videoPath, 60 * 60),
        ]);

        if (updateResult.error) throw updateResult.error;
        if (signedResult.error) throw signedResult.error;

        setVideoUrl(signedResult.data.signedUrl);
        setMatchFile((prev) => prev ? { ...prev, video_file_name: file.name, video_path: videoPath } : prev);
      } catch (e) {
        const isAbort =
          (e instanceof DOMException && e.name === "AbortError") ||
          (e instanceof Error && e.message === "tus: upload has been aborted");
        if (!isAbort) setError(e instanceof Error ? e.message : "Upload failed");
      } finally {
        setPhase("idle");
        setCompressionPct(0);
        setCompressionInfo(null);
        setUploadProgress(null);
        abortControllerRef.current = null;
        tusUploadRef.current = null;
      }
    },
    [supabase, matchFile, matchId, uploadToStorage]
  );

  /* ── Cancel ────────────────────────────────────────────────── */

  const cancel = useCallback(async () => {
    abortControllerRef.current?.abort();
    if (tusUploadRef.current) {
      try { await tusUploadRef.current.abort(true); } catch { /* ignore */ }
      tusUploadRef.current = null;
    }
  }, []);

  /* ── File picker gate (large-file warning) ─────────────────── */

  const pickFile = useCallback(
    (file: File | null) => {
      if (!file) return;
      if (file.size > MAX_COMPRESS_SIZE) {
        setLargeFileWarning(file);
        return;
      }
      void startUpload(file);
    },
    [startUpload]
  );

  const dismissLargeFileWarning = useCallback(() => setLargeFileWarning(null), []);

  return [
    { loading, phase, compressionPct, compressionInfo, uploadProgress, error, largeFileWarning, matchFile, videoUrl },
    { load, pickFile, startUpload, cancel, dismissLargeFileWarning },
  ];
}
