"use client";

/**
 * Custom hook for managing Upload Match wizard state and logic
 *
 * Orchestrates the multi-step upload wizard, including:
 * - Step navigation
 * - File upload via the upload service
 * - Form data persistence
 * - Match creation
 */

import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  getProviderStrategy,
  getProviderKind,
  isProviderSupported,
  IProcessingProviderStrategy,
  ProviderId,
  ProviderKind,
  ValidationResult,
} from "@/lib/services/upload";
import { getParser, hasParser } from "@/lib/services/upload/parsers";
import {
  UploadAbortedError,
  uploadFileInBlocks,
} from "@/lib/services/upload/azure-block-upload";
import {
  Step,
  FormData as MatchFormData,
  UploadedFile,
  ParsingState,
  DetailField,
  VideoProbeSummary,
  DEFAULT_FORM_DATA,
  STEP_ORDER_BY_KIND
} from "./types";
import {
  determineWinner,
  buildMatchData,
  getAdjustedScores,
  formatFileSize,
  clearStorageData,
  loadFormDataFromStorage,
  loadUploadedFileFromStorage,
  saveFormDataToStorage,
  STORAGE_KEYS,
  MatchMetadata
} from "./utils";

export interface UseUploadMatchWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /**
   * Fired once the match row is committed, before the wizard is dismissed.
   *
   * `onOpenChange(false)` alone cannot tell "the user backed out" from "the
   * match was created" — the modal doesn't care, but the full-page flow has to
   * show a success state for one and navigate away for the other.
   */
  onCreated?: (matchId: string) => void;
  /**
   * Video transfer lifecycle, for whoever is still on screen to render.
   *
   * The wizard unmounts the moment a match is created, but the upload keeps
   * running in a background closure for up to a couple of hours. So progress
   * cannot live in this hook's state — it has to be handed to an owner that
   * outlives the wizard, which is what this is for.
   */
  onVideoUpload?: (event: VideoUploadEvent) => void;
}

/** Bytes moved so far, and what that implies. */
export interface VideoUploadProgress {
  pct: number;
  bytesUploaded: number;
  bytesTotal: number;
  /** Cumulative average, not instantaneous — smooth, and slow to react. */
  speed: number;
  etaSeconds: number;
}

export type VideoUploadEvent = { matchId: string } & (
  | { kind: "started"; fileName: string; cancel: () => void }
  | { kind: "progress"; progress: VideoUploadProgress }
  | { kind: "done" }
  | { kind: "cancelled" }
  | { kind: "failed"; error: string }
);

export interface UseUploadMatchWizardReturn {
  // State
  step: Step;
  selectedProvider: ProviderId | null;
  sourceType: string;
  uploadedFile: UploadedFile | null;
  isOver: boolean;
  isCreating: boolean;
  isUploading: boolean;
  error: string | null;
  uploadError: string | null;
  isPrivateMatch: boolean;
  formData: MatchFormData;
  parsingState: ParsingState;

  // Provider flow shape
  /** Step sequence for the selected provider's kind. */
  stepOrder: Step[];
  /** True when the selected provider analyses video rather than parsing a file. */
  isProcessingProvider: boolean;

  // Video analysis (processing providers only)
  videoProbe: VideoProbeSummary | null;
  videoWarnings: string[];
  isProbing: boolean;
  /** Provider-owned media rules, so the wizard never names a vendor. */
  minTrimSeconds: number;
  acceptString: string;
  requirementChips: readonly string[];
  onVideoPick: (file: File | null) => void;
  handleTrimChange: (startSeconds: number, endSeconds: number) => void;
  handleRemoveVideo: () => void;

  // Step navigation
  setStep: (step: Step) => void;
  handleProviderSelect: (providerId: string | null) => void;
  handleProviderContinue: () => void;
  handleVideoContinue: () => void;
  handleMatchContinue: () => void;
  handleBack: () => void;
  handleClose: () => void;
  /** Deep-link from Confirm back to Match with a specific detail field focused. */
  goEditDetail: (field: DetailField) => void;
  /** When set, DetailsContent should auto-expand details and focus this field. */
  pendingDetailFocus: DetailField | null;
  /** Clears pendingDetailFocus once consumed by DetailsContent. */
  consumePendingDetailFocus: () => void;

  // File handling
  setIsOver: (isOver: boolean) => void;
  setSourceType: (type: string) => void;
  onDrop: (files: FileList | null) => void;
  handleDrop: React.DragEventHandler<HTMLDivElement>;
  handleFileChange: React.ChangeEventHandler<HTMLInputElement>;
  handleRemoveFile: () => void;

  // Form handling
  handleInputChange: (field: keyof MatchFormData, value: string | number | boolean | undefined) => void;
  handleScoreChange: (player: "player" | "opponent", index: number, value: string) => void;
  handleTiebreakChange: (player: "player" | "opponent", index: number, value: string) => void;

  // Match creation
  handleCreateMatch: () => Promise<void>;
}

// Helper to get current date in YYYY-MM-DD format.
// Use LOCAL date components (not toISOString, which is UTC) so the default date matches
// the user's local day — otherwise an evening upload behind UTC defaults to tomorrow.
function getCurrentDate(): string {
  const now = new Date();
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

// Helper to get current time in HH:MM format
function getCurrentTime(): string {
  const now = new Date();
  return now.toTimeString().slice(0, 5);
}

// Get default form data with current date/time
function getDefaultFormData(): MatchFormData {
  return {
    ...DEFAULT_FORM_DATA,
    date: getCurrentDate(),
    time: getCurrentTime()
  };
}

export function useUploadMatchWizard({
  open,
  onOpenChange,
  onCreated,
  onVideoUpload,
}: UseUploadMatchWizardProps): UseUploadMatchWizardReturn {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);

  // State
  const [step, setStep] = useState<Step>("provider");
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [sourceType, setSourceType] = useState<string>("swing-vision");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isOver, setIsOver] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPrivateMatch] = useState(true);
  const [formData, setFormData] = useState<MatchFormData>(getDefaultFormData);
  // Set when Confirm asks Match to focus a specific detail field. DetailsContent
  // reads this on mount, expands its Details disclosure, focuses the matching
  // <select>, and clears the request.
  const [pendingDetailFocus, setPendingDetailFocus] = useState<DetailField | null>(null);
  const [parsingState, setParsingState] = useState<ParsingState>({
    isParsing: false,
    parseError: null,
    parseWarnings: [],
    parseSuccess: false,
  });

  // Video-analysis state. Only populated for processing providers; the probe
  // result is kept so the Video step can show the user why their file passed
  // and the trim rail knows the true duration.
  const [videoProbe, setVideoProbe] = useState<VideoProbeSummary | null>(null);
  const [videoWarnings, setVideoWarnings] = useState<string[]>([]);
  const [isProbing, setIsProbing] = useState(false);
  // The picked File itself rides along on `uploadedFile.file`, held in memory
  // only — a File cannot be serialised to localStorage, so a resumed draft
  // requires re-picking the video.

  // Which flow we're in. Falls back to the import order before a provider is
  // chosen, which is correct: the Provider step is shared by both.
  const providerKind: ProviderKind = selectedProvider
    ? getProviderKind(selectedProvider)
    : "import";
  // STEP_ORDER_BY_KIND is a module const, so indexing it already returns a
  // stable reference — memoizing would allocate a closure to prevent an
  // identity change that cannot happen.
  const stepOrder = STEP_ORDER_BY_KIND[providerKind];
  const isProcessingProvider = providerKind === "processing";

  // Media rules, trim floor and billing all come from the provider rather than
  // from a vendor config the wizard imports directly — the wizard is written
  // against `kind`, so it must not know whose thresholds these are.
  const processingStrategy =
    selectedProvider && isProcessingProvider
      ? (getProviderStrategy(selectedProvider) as IProcessingProviderStrategy)
      : null;

  // Cached on modal open so handleCreateMatch doesn't pay an auth round-trip
  // at click time. Why: getUser() can take 100–300ms over the network and the
  // user has been authenticated since they opened the dashboard.
  const cachedUserIdRef = useRef<string | null>(null);

  // Load data from localStorage when modal opens
  useEffect(() => {
    if (!open) return;

    const existingProvider = localStorage.getItem(STORAGE_KEYS.SELECTED_PROVIDER);
    let resumedProvider = false;
    if (existingProvider && isProviderSupported(existingProvider)) {
      setSelectedProvider(existingProvider as ProviderId);
      setSourceType(existingProvider);
      resumedProvider = true;
    }

    const storedFormData = loadFormDataFromStorage();
    if (storedFormData) {
      // Merge over defaults so newly added fields (e.g. player hand/backhand)
      // pick up their preselected values when stored data predates them.
      setFormData({ ...getDefaultFormData(), ...storedFormData });
    }

    const storedFile = loadUploadedFileFromStorage();
    if (storedFile) {
      setUploadedFile(storedFile);
    }

    // Resume past Provider when the user previously got that far — otherwise an
    // accidental close means a wasted click on reopen. Video flows resume on the
    // Video step: the File can't be persisted, so it has to be picked again.
    if (resumedProvider && existingProvider) {
      const resumedOrder = STEP_ORDER_BY_KIND[getProviderKind(existingProvider as ProviderId)];
      setStep(resumedOrder[1]);
    } else {
      setStep("provider");
    }

    // Prefill the user's own name from their profile so a returning player
    // doesn't retype it for every match. Skips if any stored data exists for
    // playerName (the user has already typed something they want preserved).
    let cancelled = false;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled || !user) return;
        cachedUserIdRef.current = user.id;
        const { data: profile } = await supabase
          .from("users")
          .select("first_name, last_name")
          .eq("id", user.id)
          .single();
        if (cancelled) return;
        const fullName = [profile?.first_name, profile?.last_name]
          .filter(Boolean)
          .join(" ")
          .trim();
        if (!fullName) return;
        setFormData((prev) => (prev.playerName.trim() ? prev : { ...prev, playerName: fullName }));
      } catch {
        // Profile prefill is purely a convenience — a fetch failure shouldn't surface.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, supabase]);

  // Step navigation handlers
  const handleProviderSelect = useCallback((providerId: string | null) => {
    // Validate provider ID before setting
    if (providerId && isProviderSupported(providerId)) {
      setSelectedProvider(providerId as ProviderId);
      setSourceType(providerId);
      localStorage.setItem(STORAGE_KEYS.SELECTED_PROVIDER, providerId);
    } else {
      setSelectedProvider(null);
      localStorage.removeItem(STORAGE_KEYS.SELECTED_PROVIDER);
    }
    // Clear any previous upload errors when changing provider
    setUploadError(null);
    setUploadedFile(null);
  }, []);

  const handleProviderContinue = useCallback(() => {
    if (selectedProvider) {
      // Processing providers get a video step before the form; import providers
      // go straight to the merged file+details step.
      setStep(stepOrder[1]);
    }
  }, [selectedProvider, stepOrder]);

  const handleVideoContinue = useCallback(() => {
    setStep("match");
  }, []);

  /**
   * Pick and validate a video, entirely locally.
   *
   * Nothing uploads here. The probe reads resolution, duration and frame rate
   * from the file itself so an unusable video is refused at pick time rather
   * than after a twenty-minute upload.
   */
  const onVideoPick = useCallback(async (file: File | null) => {
    if (!file || !selectedProvider) return;

    setUploadError(null);
    setVideoWarnings([]);
    setVideoProbe(null);
    setUploadedFile(null);
    setIsProbing(true);

    try {
      const strategy = getProviderStrategy(selectedProvider);
      const result: ValidationResult = await strategy.validateFile(file);

      if (!result.success) {
        setUploadError(result.error || "This video can't be analysed.");
        return;
      }

      const summary = result.details?.video ?? null;

      setVideoProbe(summary);
      setVideoWarnings(result.warnings ?? []);
      setUploadedFile({
        name: file.name,
        size: formatFileSize(file.size),
        status: "ready",
        file,
        type: file.type,
      });

      // Default the trim to the whole video. The user narrows it on the rail;
      // starting at the full extent means a straight-through flow still submits
      // a valid window.
      setFormData((prev) => ({
        ...prev,
        videoStartSeconds: 0,
        videoEndSeconds: summary?.durationSeconds ?? prev.videoEndSeconds,
      }));
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Couldn't read this video.");
    } finally {
      setIsProbing(false);
    }
  }, [selectedProvider]);

  /** Set the trim window. Values are seconds into the original video. */
  const handleTrimChange = useCallback((startSeconds: number, endSeconds: number) => {
    setFormData((prev) => ({
      ...prev,
      videoStartSeconds: startSeconds,
      videoEndSeconds: endSeconds,
    }));
  }, []);

  const handleRemoveVideo = useCallback(() => {
    setVideoProbe(null);
    setVideoWarnings([]);
    setUploadedFile(null);
    setUploadError(null);
    setFormData((prev) => ({
      ...prev,
      videoStartSeconds: undefined,
      videoEndSeconds: undefined,
    }));
  }, []);

  const handleMatchContinue = useCallback(() => {
    saveFormDataToStorage(formData);
    setStep("confirm");
  }, [formData]);

  const goEditDetail = useCallback((field: DetailField) => {
    setPendingDetailFocus(field);
    setStep("match");
  }, []);

  const consumePendingDetailFocus = useCallback(() => {
    setPendingDetailFocus(null);
  }, []);

  // Derived from the active order rather than a hardcoded map, so adding a step
  // to STEP_ORDER_BY_KIND is the only edit a new flow needs.
  const handleBack = useCallback(() => {
    const index = stepOrder.indexOf(step);
    if (index > 0) {
      setStep(stepOrder[index - 1]);
    }
  }, [step, stepOrder]);

  // Close keeps localStorage intact so an accidental ✕ doesn't destroy in-flight
  // typing. Storage is cleared only after a successful create (see handleCreateMatch)
  // or when the user explicitly removes the file. Reopening picks up where they left off.
  const handleClose = useCallback(() => {
    onOpenChange(false);
  }, [onOpenChange]);

  // File handling
  const onDrop = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!selectedProvider) {
      setUploadError("Please select a provider first");
      return;
    }

    const file = files[0];

    // Basic file type validation using provider strategy. Awaited because
    // processing providers validate asynchronously (they probe media metadata);
    // awaiting an import provider's synchronous result is a no-op.
    try {
      const strategy = getProviderStrategy(selectedProvider);
      const validationResult: ValidationResult = await strategy.validateFile(file);

      if (!validationResult.success) {
        setUploadError(validationResult.error || "Invalid file");
        return;
      }
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : "Validation error");
      return;
    }

    // For SwingVision files, validate structure using Python script
    if (selectedProvider === "swing-vision" && file.name.endsWith(".xlsx")) {
      setIsUploading(true);
      setUploadError(null);

      try {
        // Convert file to base64 for API
        const reader = new FileReader();
        const fileData = await new Promise<string>((resolve, reject) => {
          reader.onload = () => {
            const result = reader.result as string;
            resolve(result);
          };
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });

        // Call validation API
        const response = await fetch("/api/validate-file", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify({
            file: fileData,
            fileName: file.name,
          }),
        });

        const validationResult = await response.json();

        if (!validationResult.success) {
          // Use the error message directly from the API (already formatted)
          const errorMessage = validationResult.error || "File validation failed";
          setUploadError(errorMessage);
          setIsUploading(false);
          return;
        }

        // Validation passed
        setUploadError(null);
      } catch (err) {
        console.error("Validation API error:", err);
        setUploadError(
          err instanceof Error
            ? `Validation error: ${err.message}`
            : "Failed to validate file. Please try again."
        );
        setIsUploading(false);
        return;
      } finally {
        setIsUploading(false);
      }
    }

    // Set file data for display
    const fileData: UploadedFile = {
      name: file.name,
      size: formatFileSize(file.size),
      status: "Ready",
      file: file
    };
    setUploadedFile(fileData);

    // Store file reference in localStorage (metadata only, not the actual file)
    const fileDataForStorage = {
      name: file.name,
      size: fileData.size,
      status: "Ready",
      type: file.type
    };
    localStorage.setItem(STORAGE_KEYS.UPLOADED_FILE, JSON.stringify(fileDataForStorage));

    // Attempt to parse file if parser exists for this provider
    const parserExists = await hasParser(selectedProvider);
    if (parserExists) {
      setParsingState({ isParsing: true, parseError: null, parseWarnings: [], parseSuccess: false });

      try {
        const parser = await getParser(selectedProvider);
        if (parser) {
          const parseResult = await parser.parse(file);

          if (parseResult.success && parseResult.data) {
            // Merge parsed data with existing form data
            setFormData((prev) => ({
              ...prev,
              playerName: parseResult.data?.playerName || prev.playerName,
              opponentName: parseResult.data?.opponentName || prev.opponentName,
              playerScores: parseResult.data?.playerScores || prev.playerScores,
              opponentScores: parseResult.data?.opponentScores || prev.opponentScores,
              playerTiebreaks: parseResult.data?.playerTiebreaks || prev.playerTiebreaks,
              opponentTiebreaks: parseResult.data?.opponentTiebreaks || prev.opponentTiebreaks,
              bestOf: parseResult.data?.bestOf || prev.bestOf,
              numberOfSets: parseResult.data?.numberOfSets ?? prev.numberOfSets,
              adScoring: parseResult.data?.adScoring !== undefined ? parseResult.data.adScoring : prev.adScoring,
              result: parseResult.data?.result || prev.result,
              duration: parseResult.data?.duration || prev.duration,
              // Preserve existing date/time if parser didn't provide them
              date: prev.date,
              time: prev.time,
            }));

            setParsingState({
              isParsing: false,
              parseError: null,
              parseWarnings: parseResult.warnings,
              parseSuccess: true,
            });
          } else {
            // Parsing failed - show error but allow manual entry
            setParsingState({
              isParsing: false,
              parseError: parseResult.error || "Failed to parse file",
              parseWarnings: parseResult.warnings,
              parseSuccess: false,
            });
          }
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Parsing error";
        setParsingState({
          isParsing: false,
          parseError: message,
          parseWarnings: [],
          parseSuccess: false,
        });
      }
    }
  }, [selectedProvider]);

  const handleDrop: React.DragEventHandler<HTMLDivElement> = useCallback(
    (e) => {
      e.preventDefault();
      e.stopPropagation();
      setIsOver(false);
      onDrop(e.dataTransfer?.files ?? null);
    },
    [onDrop]
  );

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = useCallback(
    (e) => {
      onDrop(e.target.files);
      e.currentTarget.value = "";
    },
    [onDrop]
  );

  const handleRemoveFile = useCallback(() => {
    setUploadedFile(null);
    localStorage.removeItem(STORAGE_KEYS.UPLOADED_FILE);
  }, []);

  // Form handling
  const handleInputChange = useCallback((field: keyof MatchFormData, value: string | number | boolean | undefined) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // When bestOf changes, reset numberOfSets so it uses the new format's default
      if (field === "bestOf") {
        next.numberOfSets = undefined;
      }
      return next;
    });
  }, []);

  const updateScoreArray = useCallback(
    (
      field: "playerScores" | "opponentScores" | "playerTiebreaks" | "opponentTiebreaks",
      index: number,
      value: string,
      max?: number
    ) => {
      let next: number | null;
      if (value === "") {
        next = null;
      } else if (/^\d+$/.test(value)) {
        next = max != null ? Math.min(max, Number(value)) : Number(value);
      } else {
        return;
      }
      setFormData((prev) => ({
        ...prev,
        [field]: prev[field].map((s, i) => (i === index ? next : s)),
      }));
    },
    []
  );

  const handleScoreChange = useCallback(
    (player: "player" | "opponent", index: number, value: string) => {
      updateScoreArray(
        player === "player" ? "playerScores" : "opponentScores",
        index,
        value
      );
    },
    [updateScoreArray]
  );

  // Tiebreaks rarely exceed 20; clamp to 99 as a safety bound.
  const handleTiebreakChange = useCallback(
    (player: "player" | "opponent", index: number, value: string) => {
      updateScoreArray(
        player === "player" ? "playerTiebreaks" : "opponentTiebreaks",
        index,
        value,
        99
      );
    },
    [updateScoreArray]
  );

  // Match creation
  const handleCreateMatch = useCallback(async () => {
    if (!formData || !uploadedFile?.file) {
      setError("Please complete all required fields and upload a file.");
      return;
    }

    if (!selectedProvider) {
      setError("Please select a provider.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      // Use the userId cached on modal open. Falls back to auth.getUser() only
      // if the cache hasn't populated yet (race against modal open).
      let userId = cachedUserIdRef.current;
      if (!userId) {
        const { data: { user }, error: authError } = await supabase.auth.getUser();
        if (authError || !user) throw new Error("Not authenticated");
        userId = user.id;
        cachedUserIdRef.current = userId;
      }

      const matchId = crypto.randomUUID();

      const adjustedPlayerScores = getAdjustedScores(
        formData.playerScores,
        formData.bestOf,
        formData.numberOfSets
      );
      const adjustedOpponentScores = getAdjustedScores(
        formData.opponentScores,
        formData.bestOf,
        formData.numberOfSets
      );
      const { winner, loser } = determineWinner(
        adjustedPlayerScores,
        adjustedOpponentScores,
        parseInt(formData.bestOf),
        userId,
        formData.playerName,
        formData.opponentName
      );

      const eventName = formData.eventName || `${formData.playerName} vs ${formData.opponentName}`;

      const metadata: MatchMetadata = {
        userId,
        sourceProvider: selectedProvider,
        // Video providers run computer-vision analysis; file imports carry
        // electronic line-calling data the provider already computed.
        analysisMethod: isProcessingProvider ? 'ai' : 'elc',
        matchType: formData.matchType,
        courtType: formData.courtType
      };

      const matchData = buildMatchData(matchId, { ...formData, eventName }, winner, loser, isPrivateMatch, metadata);

      // Camera context is only meaningful for video analysis.
      const matchRow = isProcessingProvider
        ? {
            ...matchData,
            fixed_camera: formData.fixedCamera ?? null,
            initial_top_player_is_player1: formData.initialTopPlayerIsPlayer1 ?? null,
          }
        : matchData;

      const { error: matchError } = await supabase.from("matches").insert(matchRow);

      if (matchError) {
        console.error("Supabase insert error:", matchError);
        throw new Error(
          `Database error: ${matchError.message || matchError.details || JSON.stringify(matchError)}`
        );
      }

      // Match row is in. Close the modal now so the user can move on; the file
      // upload (1–10s for typical .xlsx) and downstream processing run in the
      // background. The home page already shows a "match processing" toast
      // driven by the match-created event + sessionStorage flag, so this is the
      // user's signal that work is in flight.
      clearStorageData();
      // Store the real matchId (recent-activity reads this back as the id to poll for
      // processing completion). Storing a literal "true" made the first-upload poll
      // target a bogus id and never detect completion.
      //
      // Skipped for draft video jobs: the "analyzing" toast resolves on a
      // match_stats INSERT, and a draft has nothing uploaded to produce one. It
      // would sit spinning forever and reappear on every page load.
      if (!isProcessingProvider) {
        sessionStorage.setItem("match-processing", matchId);
      }
      window.dispatchEvent(new CustomEvent("match-created", { detail: { matchId } }));
      onCreated?.(matchId);

      // Close the modal FIRST, then refresh after it has finished closing. The modal is
      // a Radix dialog that locks <body> (pointer-events + scroll) while open. On the
      // first upload, the refresh flips the dashboard from empty to populated, which
      // unmounts EmptyDashboard — the subtree that hosts this open dialog. Refreshing
      // while it's open tears the dialog down mid-close so Radix never restores <body>,
      // freezing the whole page. Deferring past the 200ms close animation lets the
      // dialog unmount and unlock <body> before the layout swaps.
      onOpenChange(false);
      setTimeout(() => router.refresh(), 300);

      // Video providers (e.g. Advantage Intelligence): record job & upload video to Azure
      if (processingStrategy) {
        const startSeconds = formData.videoStartSeconds ?? 0;
        const endSeconds = formData.videoEndSeconds ?? 0;
        const videoFileToUpload = uploadedFile?.file;

        const { error: jobError } = await supabase.from("processing_jobs").insert({
          match_id: matchId,
          created_by: userId,
          provider: selectedProvider,
          status: videoFileToUpload ? "uploading" : "pending",
          start_time_seconds: startSeconds,
          end_time_seconds: endSeconds,
          billable_seconds: processingStrategy.billableSeconds(startSeconds, endSeconds),
        });

        if (jobError) {
          console.error("Processing job insert error:", jobError);
          // Roll back the match row so the user gets a clean retry
          await supabase.from("matches").delete().eq("id", matchId);
          window.dispatchEvent(
            new CustomEvent("match-upload-failed", {
              detail: {
                matchId,
                error: jobError.message || "Couldn't queue this match for analysis",
              },
            })
          );
          return;
        }

        // Kick off background upload to Azure Blob Storage. The vendor will only
        // fetch a VideoUrl on blob.core.windows.net, so that is where the source
        // video lives — see src/lib/services/splitstep/video-url/azure-sas.ts.
        if (videoFileToUpload) {
          void (async () => {
            try {
              const res = await fetch("/api/splitstep/upload-url", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  matchId,
                  fileName: videoFileToUpload.name,
                }),
              });

              const payload = await res.json().catch(() => null);

              if (!res.ok || !payload?.uploadUrl) {
                throw new Error(
                  payload?.error || `Could not get an upload URL (HTTP ${res.status})`
                );
              }

              const { uploadUrl, videoObjectKey } = payload;
              // Log the key, never the URL. `uploadUrl` is a live write
              // credential — six hours of write access to this blob — and the
              // browser console outlives the upload: it survives screen
              // shares, extensions, and anyone opening devtools. The key is
              // what you actually want when debugging anyway.
              console.log("🚀 Upload credential acquired for:", videoObjectKey);
              console.log(`Starting upload to Azure Blob Storage (${formatFileSize(videoFileToUpload.size)})...`);

              // Hand the canceller up before any bytes move, so the screen that
              // replaced this wizard can offer a Cancel that actually works.
              const controller = new AbortController();
              const startedAt = Date.now();
              onVideoUpload?.({
                matchId,
                kind: "started",
                fileName: videoFileToUpload.name,
                cancel: () => controller.abort(),
              });

              // The wizard has already closed by this point, so this guard is the
              // only thing telling the user the work is not finished.
              //
              // Says what is actually at risk: the match itself is saved and
              // survives, only the video transfer dies with the page. Leaving
              // used to strand the job at `uploading` forever with no error —
              // reap_stalled_uploads() now marks it failed, but a cancelled
              // upload still means starting the transfer over, so it is worth
              // stopping rather than merely recovering from.
              const handleBeforeUnload = (e: BeforeUnloadEvent) => {
                e.preventDefault();
                e.returnValue =
                  "Your video is still uploading. The match is saved, but leaving now cancels the upload and you'll have to add the video again.";
                return e.returnValue;
              };
              window.addEventListener("beforeunload", handleBeforeUnload);

              try {
                // Persist progress as it goes. The wizard has already closed by
                // now and this upload runs in the background, so a console line
                // is invisible — the matches list is where the user actually
                // looks, and it reads this column.
                //
                // Write on a 2-point move or every 60 seconds, whichever comes
                // first. The old rule was `pct % 10 === 0`, which skipped the
                // write entirely whenever a chunk boundary stepped over a
                // multiple of ten. That is not cosmetic: this column is the
                // liveness signal reap_stalled_uploads() reads, and 15 minutes
                // without one marks the job failed — underneath an upload that
                // is still running.
                //
                // Fire-and-forget throughout: a dropped progress write must
                // never disturb the upload itself.
                let lastWrittenPct = -1;
                let lastWriteAt = 0;
                // The UI renders one decimal, so events that cannot change a
                // rendered digit are dropped before they reach React. On a 5 GB
                // upload 0.1% is ~7 seconds of transfer, so ~140 consecutive
                // events would otherwise re-render an identical string.
                let lastSentTenth = -1;

                await uploadFileInBlocks({
                  file: videoFileToUpload,
                  uploadUrl,
                  contentType: videoFileToUpload.type || "video/mp4",
                  signal: controller.signal,
                  onProgress: (loaded, total) => {
                    const exact = (loaded / total) * 100;
                    const pct = Math.floor(exact);
                    const now = Date.now();

                    // Local UI first: throttled only to the precision it can
                    // actually show, not to the database's cadence. A bar that
                    // moves once a minute is the problem this exists to fix.
                    const tenth = Math.round(exact * 10);
                    if (tenth !== lastSentTenth) {
                      lastSentTenth = tenth;
                      const elapsed = (now - startedAt) / 1000;
                      const speed = elapsed > 0 ? loaded / elapsed : 0;
                      onVideoUpload?.({
                        matchId,
                        kind: "progress",
                        progress: {
                          pct: tenth / 10,
                          bytesUploaded: loaded,
                          bytesTotal: total,
                          speed,
                          etaSeconds: speed > 0 ? (total - loaded) / speed : 0,
                        },
                      });
                    }

                    // The database write stays throttled. It is a liveness
                    // heartbeat, not a progress bar, and one write per XHR event
                    // on a 600-block upload would be tens of thousands.
                    if (pct - lastWrittenPct < 2 && now - lastWriteAt < 60_000) {
                      return;
                    }
                    lastWrittenPct = pct;
                    lastWriteAt = now;

                    console.log(
                      `Uploading to Azure: ${pct}% (${(loaded / (1024 * 1024)).toFixed(1)}MB / ${(total / (1024 * 1024)).toFixed(1)}MB)`
                    );

                    void supabase
                      .from("processing_jobs")
                      .update({ upload_progress_percent: pct })
                      // By match_id, matching the status writes below — the
                      // insert above never selects the row id back.
                      .eq("match_id", matchId)
                      .then(({ error }) => {
                        if (error) {
                          console.warn(
                            "Could not record upload progress:",
                            error.message
                          );
                        }
                      });
                  },
                });
              } finally {
                window.removeEventListener("beforeunload", handleBeforeUnload);
              }

              console.log("🎉 Upload completed! Updating processing_jobs row...");

              // Update processing job status and video key
              await supabase
                .from("processing_jobs")
                .update({
                  video_object_key: videoObjectKey,
                  status: "uploaded",
                  // Explicitly 100. The throttle above skips the final write —
                  // 99→100 is a 1-point move and the last block rarely takes 60
                  // seconds — so without this the bar sits at 99 forever.
                  upload_progress_percent: 100,
                  updated_at: new Date().toISOString(),
                })
                .eq("match_id", matchId);

              console.log("✅ Successfully updated processing_jobs status to 'uploaded' for match:", matchId);
              onVideoUpload?.({ matchId, kind: "done" });
            } catch (uploadErr: any) {
              const cancelled = uploadErr instanceof UploadAbortedError;
              console[cancelled ? "log" : "error"](
                cancelled ? "Upload cancelled by the user" : "❌ Video upload error:",
                cancelled ? "" : uploadErr
              );

              const message = uploadErr?.message || "Video upload failed";
              onVideoUpload?.(
                cancelled
                  ? { matchId, kind: "cancelled" }
                  : { matchId, kind: "failed", error: message }
              );

              await supabase
                .from("processing_jobs")
                .update({
                  status: "failed",
                  error_message: message,
                  updated_at: new Date().toISOString(),
                })
                .eq("match_id", matchId);

              window.dispatchEvent(
                new CustomEvent("match-upload-failed", {
                  detail: { matchId, error: message },
                })
              );
            }
          })();
        }

        return;
      }

      // Background upload. On failure, surface via a custom event so the
      // toast/banner system can react without the modal needing to stay open.
      const fileToUpload = uploadedFile.file;
      const providerId = selectedProvider;
      void (async () => {
        try {
          const fd = new FormData();
          fd.append("file", fileToUpload);
          fd.append("matchId", matchId);
          fd.append("providerId", providerId);
          const response = await fetch("/api/upload", { method: "POST", body: fd });
          const result = await response.json();
          if (!response.ok || !result.success) {
            throw new Error(result.error || "Upload failed");
          }
        } catch (err) {
          console.error("Background file upload error:", err);
          // Roll back the phantom match row so the user has a clean retry path.
          await supabase.from("matches").delete().eq("id", matchId);
          window.dispatchEvent(
            new CustomEvent("match-upload-failed", {
              detail: {
                matchId,
                error: err instanceof Error ? err.message : "Upload failed",
              },
            })
          );
        }
      })();
    } catch (e: any) {
      console.error("Error creating match:", e);
      const errorMessage =
        e?.message ||
        e?.error?.message ||
        e?.details ||
        e?.hint ||
        JSON.stringify(e) ||
        "Failed to create match. Please try again.";
      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  }, [formData, uploadedFile, selectedProvider, isProcessingProvider, supabase, isPrivateMatch, onOpenChange, onCreated, router]);

  return {
    // State
    step,
    selectedProvider,
    sourceType,
    uploadedFile,
    isOver,
    isCreating,
    isUploading,
    error,
    uploadError,
    isPrivateMatch,
    formData,
    parsingState,
    pendingDetailFocus,

    // Step navigation
    setStep,
    handleProviderSelect,
    handleProviderContinue,
    handleMatchContinue,
    handleBack,
    handleClose,
    goEditDetail,
    consumePendingDetailFocus,

    // File handling
    setIsOver,
    setSourceType,
    onDrop,
    handleDrop,
    handleFileChange,
    handleRemoveFile,

    // Provider flow shape
    stepOrder,
    isProcessingProvider,

    // Video analysis
    videoProbe,
    videoWarnings,
    isProbing,
    minTrimSeconds: processingStrategy?.minTrimSeconds ?? 0,
    acceptString: processingStrategy?.getAcceptString() ?? "",
    requirementChips: processingStrategy?.requirementChips ?? [],
    onVideoPick,
    handleTrimChange,
    handleRemoveVideo,
    handleVideoContinue,

    // Form handling
    handleInputChange,
    handleScoreChange,
    handleTiebreakChange,

    // Match creation
    handleCreateMatch
  };
}
