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
  providerKindOrNull,
  IProcessingProviderStrategy,
  ProviderId,
  ProviderKind,
  ValidationResult,
} from "@/lib/services/upload";
import { getParser, hasParser } from "@/lib/services/upload/parsers";
import { providers } from "@/lib/providers";
import {
  createProcessingJob,
  uploadAndSubmitVideo,
  type VideoUploadEvent,
} from "@/lib/services/splitstep/submit-match-video";
import {
  currentBillingMonth,
  getMonthlyCapSeconds,
} from "@/lib/services/splitstep/config";
import { accountTypeFor } from "@/lib/services/splitstep/quota";
import { formatResetDate } from "@/lib/data/usage-format";
import { useWorkspace } from "@/components/dashboard/workspace-provider";
import {
  Step,
  FormData as MatchFormData,
  UploadedFile,
  ParsingState,
  DetailField,
  VideoProbeSummary,
  DEFAULT_FORM_DATA,
  STEP_ORDER_BY_KIND,
  type EventPreset
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

/**
 * The source a new match starts on.
 *
 * Resolved from the registry by KIND rather than named, so the wizard stays
 * written against "your own video" instead of against a particular vendor.
 */
const DEFAULT_PROVIDER_ID: ProviderId | null =
  providers.find(
    (p) => p.available !== false && providerKindOrNull(p.id) === "processing"
  )?.id ?? null;

/**
 * Where a line that CANNOT take video starts instead.
 *
 * A doubles line was handed the processing provider like every other preset,
 * and `PinnedMatchContent` replaces the provider step, so there was no way to
 * choose anything else. The coach picked a multi-gigabyte file and met
 * "Video analysis supports singles matches only" from `job-request.ts` after
 * the upload — a 422 at the end of the most expensive step, with an orphaned
 * blob and a job stuck at `uploaded`.
 *
 * `supportsVideo()` already knows this at page-build time, and the import
 * provider is a real path for a doubles line: it parses numbers and never goes
 * near the vision pipeline. Its step order also skips the video step, so the
 * wizard asks for a file instead of a video and the "Add file" label the
 * schedule row already shows becomes true.
 */
const DEFAULT_IMPORT_PROVIDER_ID: ProviderId | null =
  providers.find(
    (p) => p.available !== false && providerKindOrNull(p.id) === "import"
  )?.id ?? null;

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
  /**
   * Set in a team workspace: the event line this upload belongs to.
   *
   * When present the wizard stops being a match CREATOR and becomes a match
   * FILLER — the line already exists, so provider, players, date, surface,
   * format and often the score all arrive answered, and the only thing left is
   * the video and the two questions no lineup can know.
   */
  preset?: EventPreset | null;
}

/**
 * The video-upload event stream.
 *
 * Defined in `lib/services/splitstep/submit-match-video.ts` now that two
 * wizards emit it, and re-exported here so existing importers do not move.
 */
export type {
  VideoUploadEvent,
  VideoUploadProgress,
} from "@/lib/services/splitstep/submit-match-video";

export interface UseUploadMatchWizardReturn {
  // State
  step: Step;
  selectedProvider: ProviderId | null;
  uploadedFile: UploadedFile | null;
  isOver: boolean;
  isCreating: boolean;
  isUploading: boolean;
  error: string | null;
  uploadError: string | null;
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
  /**
   * Seconds left in this month's allowance, for the trim step's cost note.
   * Undefined while it loads, and for providers that do not bill.
   */
  remainingQuotaSeconds?: number;
  /** This month's allowance for the active workspace — 2h personal, 75h program. */
  quotaCapSeconds: number;
  /** When the allowance comes back, already formatted — "Sep 1". */
  quotaResetsOn: string;
  acceptString: string;
  requirementChips: readonly string[];
  onVideoPick: (file: File | null) => void;
  handleTrimChange: (startSeconds: number, endSeconds: number) => void;
  handleRemoveVideo: () => void;

  // Step navigation
  handleProviderSelect: (providerId: string | null) => void;
  handleProviderContinue: () => void;
  handleVideoContinue: () => void;
  handleMatchContinue: () => void;
  handleBack: () => void;
  /** Deep-link from Confirm back to Match with a specific detail field focused. */
  goEditDetail: (field: DetailField) => void;
  /** When set, DetailsContent should auto-expand details and focus this field. */
  pendingDetailFocus: DetailField | null;
  /** Clears pendingDetailFocus once consumed by DetailsContent. */
  consumePendingDetailFocus: () => void;

  // File handling
  setIsOver: (isOver: boolean) => void;
  handleDrop: React.DragEventHandler<HTMLDivElement>;
  handleFileChange: React.ChangeEventHandler<HTMLInputElement>;
  handleRemoveFile: () => void;

  // Form handling
  handleInputChange: (field: keyof MatchFormData, value: string | number | boolean | undefined) => void;
  /**
   * Set alongside `playerName` whenever a roster row is picked, and set to null
   * for a name typed by hand. Not part of `MatchFormData` because it is not a
   * field anyone fills in, and the personal wizard never needs it.
   */
  setPickedPlayerUserId: (userId: string | null) => void;
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
  preset,
}: UseUploadMatchWizardProps): UseUploadMatchWizardReturn {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  // The workspace this match will belong to and be billed against. Resolved
  // server-side once per request by the dashboard layout, so reading it here
  // costs nothing and cannot disagree with the sidebar's switcher.
  const { active: activeWorkspace } = useWorkspace();

  // State
  const [step, setStep] = useState<Step>("provider");
  const [selectedProvider, setSelectedProvider] = useState<ProviderId | null>(null);
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isOver, setIsOver] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isPrivateMatch] = useState(true);
  const [formData, setFormData] = useState<MatchFormData>(getDefaultFormData);
  /**
   * The account behind `formData.playerName`, kept beside the form rather than
   * in it — nobody types this, and the personal wizard has no use for it.
   *
   * A dual or tournament line seeds it from the entry. A single match gets it
   * when a roster row is picked, and keeps it null when the name was typed by
   * hand, because a typed name is not evidence of an account.
   */
  const [pickedPlayerUserId, setPickedPlayerUserId] = useState<string | null>(null);
  // Set when Confirm asks Match to focus a specific detail field. DetailsContent
  // reads this on mount, focuses the matching cell, and clears the request.
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

  /**
   * The allowance this upload will be billed against.
   *
   * Keyed by the ACTIVE WORKSPACE, not the signed-in user: `Workspace.id` is
   * `processing_usage.account_id` — the user's id for a personal workspace, the
   * program's for a team one — and the two tiers have different caps. Reading
   * the personal ledger while a coach sits in a program showed 2 hours against
   * a 75-hour budget.
   */
  const quotaAccountType = accountTypeFor(activeWorkspace);
  const quotaCapSeconds = getMonthlyCapSeconds(quotaAccountType);
  // "Sep 1". Settings › Usage already answers "when does this come back" from
  // the same billing-month key, so the wizard asks it rather than re-deriving.
  const quotaResetsOn = formatResetDate(currentBillingMonth());

  /**
   * Seconds left in this month's allowance, for the trim step's cost warning
   * and the footer meter.
   *
   * Advisory only — reserve_processing_quota() is still the authority and
   * refuses with a 429 at submit time. This mirrors its arithmetic exactly:
   * unreleased rows for the current month, actual_seconds where a job finished
   * and the reservation standing in until then. Getting it wrong here shows a
   * misleading number; it cannot let anything through.
   */
  const [remainingQuotaSeconds, setRemainingQuotaSeconds] = useState<
    number | undefined
  >(undefined);

  useEffect(() => {
    if (!isProcessingProvider) return;
    let cancelled = false;

    (async () => {
      const { data, error } = await supabase
        .from("processing_usage")
        .select("reserved_seconds, actual_seconds")
        .eq("account_id", activeWorkspace.id)
        .eq("account_type", quotaAccountType)
        .eq("billing_month", currentBillingMonth())
        .eq("released", false);

      if (error || cancelled) return;

      const used = (data ?? []).reduce(
        (n, row) => n + (row.actual_seconds ?? row.reserved_seconds ?? 0),
        0
      );
      setRemainingQuotaSeconds(Math.max(0, quotaCapSeconds - used));
    })();

    return () => {
      cancelled = true;
    };
  }, [
    isProcessingProvider,
    supabase,
    activeWorkspace.id,
    quotaAccountType,
    quotaCapSeconds,
  ]);


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

    // A team upload never resumes a personal draft. The line it is filling is
    // named in the URL, and restoring a half-finished personal match over it
    // would put another player's opponent and score on somebody else's court.
    if (preset) {
      // The line already knows whose match it is; a single match learns it when
      // somebody picks from the roster. Both land in the same piece of state.
      setPickedPlayerUserId(preset.playerUserId);
      setSelectedProvider(
        preset.supportsVideo ? DEFAULT_PROVIDER_ID : DEFAULT_IMPORT_PROVIDER_ID
      );
      setFormData((prev) => ({
        ...prev,
        eventName: preset.eventName ?? "",
        round: preset.round ?? "",
        playerName: preset.playerName,
        opponentName: preset.opponentName,
        date: preset.date,
        courtType: preset.surface ?? prev.courtType,
        bestOf: String(preset.bestOf),
        adScoring: preset.adScoring ?? undefined,
        matchType: preset.supportsVideo ? "Singles" : "Doubles",
        ...(preset.score
          ? {
              playerScores: preset.score.player1,
              opponentScores: preset.score.player2,
              numberOfSets: preset.score.player1.length,
            }
          : {}),
      }));
      return;
    }

    const existingProvider = localStorage.getItem(STORAGE_KEYS.SELECTED_PROVIDER);
    let resumedProvider = false;
    if (existingProvider && isProviderSupported(existingProvider)) {
      setSelectedProvider(existingProvider as ProviderId);
      resumedProvider = true;
    } else if (DEFAULT_PROVIDER_ID) {
      // Your own video is the default source — it is what most people came to
      // do, and the alternative is an import from somewhere else. Deliberately
      // NOT written to storage: a default is not a choice, and persisting it
      // would make the next visit resume past the step that offers it.
      setSelectedProvider(DEFAULT_PROVIDER_ID);
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
  }, [open, supabase, preset]);

  // Step navigation handlers
  const handleProviderSelect = useCallback((providerId: string | null) => {
    // Validate provider ID before setting
    if (providerId && isProviderSupported(providerId)) {
      setSelectedProvider(providerId as ProviderId);
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
    if (!selectedProvider) return;
    // Belt as well as braces. The preset above already opens a doubles line on
    // the import provider, but nothing else stops a processing provider being
    // selected for one, and the cost of getting it wrong is paid entirely by
    // the coach — a full video upload, then a 422.
    if (preset && !preset.supportsVideo && isProcessingProvider) return;
    // A single match in a team workspace cannot move on without a player: it is
    // the one thing the workspace does not already know, and a match created
    // without it belongs to nobody's season.
    if (preset?.kind === "single" && !formData.playerName.trim()) return;
    // Processing providers get a video step before the form; import providers
    // go straight to the merged file+details step.
    setStep(stepOrder[1]);
  }, [selectedProvider, stepOrder, preset, formData.playerName, isProcessingProvider]);

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
      setFormData((prev) => {
        const end = summary?.durationSeconds ?? prev.videoEndSeconds;
        return {
          ...prev,
          videoStartSeconds: 0,
          videoEndSeconds: end,
          // Same rule as handleTrimChange: the untrimmed clip is the starting
          // window, so it is also the starting duration. It narrows with the
          // handles.
          duration: end !== undefined ? Math.max(0, Math.round(end)) * 1000 : prev.duration,
        };
      });
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
      // The window IS the match: it was trimmed to the first serve and the
      // final point, so how long it runs is how long the match took. Typing
      // that a second time only creates a chance to disagree with the
      // "analysed window" printed two screens later.
      duration: Math.max(0, Math.round(endSeconds - startSeconds)) * 1000,
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
      // The duration came from the window; without a video there is no window.
      duration: 0,
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

      // A preset line that has already been scored HAS a match — reuse it.
      // Minting a second would give one court two results and count it twice in
      // the dual's team score, which is the duplicate 22e's "fills 3 of 9"
      // receipt exists to rule out.
      const matchId = preset?.matchId ?? crypto.randomUUID();
      const reusingMatch = Boolean(preset?.matchId);

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
      // WHOSE match this is, which in a team workspace is not the uploader.
      //
      // No preset means the personal wizard, where the uploader IS the player.
      // With a preset the answer comes from the roster — and `null` when the
      // named player has no account is the correct answer, not a gap to fill
      // with `userId`. Falling back to the uploader is exactly the bug this
      // replaces: it attributes an athlete's match to their coach, and since
      // `player1_id` is half the `matches` SELECT policy, it also hands the
      // coach read access the athlete then loses.
      const playerUserId = preset ? pickedPlayerUserId : userId;

      const { winner, loser } = determineWinner(
        adjustedPlayerScores,
        adjustedOpponentScores,
        parseInt(formData.bestOf),
        playerUserId,
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
        courtType: formData.courtType,
        // NULL for a personal workspace, which is what the column means. The
        // jobs route reads this back to pick the ledger, so a team upload has
        // to carry the program or it silently bills the uploader.
        programId: activeWorkspace.kind === "team" ? activeWorkspace.id : null,
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

      // Fill vs create. A preset line whose match exists gets its score and the
      // camera answers written onto the row it already has; everything else
      // inserts. `event_entry_id` is what ties a new one back to its line.
      const { data: written, error: matchError } = reusingMatch
        ? await supabase
            .from("matches")
            .update({
              score: matchRow.score,
              player1_name: matchRow.player1_name,
              player2_name: matchRow.player2_name,
              ...(isProcessingProvider
                ? {
                    fixed_camera: formData.fixedCamera ?? null,
                    initial_top_player_is_player1:
                      formData.initialTopPlayerIsPlayer1 ?? null,
                  }
                : {}),
            })
            .eq("id", matchId)
            // `.select()` so an update that matched NO ROW is visible. This is
            // a browser-client write against a policy of `auth.uid() =
            // created_by`, and a coach filling a line somebody else recorded
            // is not the creator — so RLS silently filtered the row out and
            // PostgREST returned success with `error: null`. The score
            // correction was discarded, and `fixed_camera` /
            // `initial_top_player_is_player1` never persisted, which is
            // exactly the fallback `/api/splitstep/jobs` reads when the wizard
            // could not answer the camera questions. The submission then 400s
            // permanently with nothing explaining why.
            .select("id")
        : await supabase
            .from("matches")
            .insert({ ...matchRow, event_entry_id: preset?.entryId ?? null })
            .select("id");

      if (matchError) {
        console.error("Supabase insert error:", matchError);
        throw new Error(
          `Database error: ${matchError.message || matchError.details || JSON.stringify(matchError)}`
        );
      }

      if (!written || written.length === 0) {
        throw new Error(
          reusingMatch
            ? "This match belongs to someone else on the program, so we could not " +
              "save the changes. Ask whoever recorded it to make them, or record " +
              "a new result for this line."
            : "The match could not be saved. Nothing was uploaded — try again."
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

      // Video providers (e.g. Advantage Intelligence): record job & upload video
      // to Azure. The sequence itself lives in
      // `lib/services/splitstep/submit-match-video.ts` so the team upload
      // wizard runs the same one per video rather than keeping a second copy of
      // the invariants in guardrails 3.1.
      if (processingStrategy) {
        const startSeconds = formData.videoStartSeconds ?? 0;
        const endSeconds = formData.videoEndSeconds ?? 0;
        const videoFileToUpload = uploadedFile?.file;

        let jobId: string;
        try {
          const job = await createProcessingJob({
            supabase,
            matchId,
            userId,
            provider: selectedProvider,
            startSeconds,
            endSeconds,
            billableSeconds: processingStrategy.billableSeconds(startSeconds, endSeconds),
            hasFile: Boolean(videoFileToUpload),
          });
          jobId = job.id;
        } catch (jobErr) {
          console.error("Processing job insert error:", jobErr);
          // Roll back the match row so the user gets a clean retry — but ONLY
          // one this wizard just created. A personal match row exists purely to
          // carry its video, so removing it is the clean retry; an event line's
          // match is a recorded result that predates this upload, and deleting
          // it would destroy a score somebody entered courtside.
          if (!reusingMatch) {
            await supabase.from("matches").delete().eq("id", matchId);
          }
          window.dispatchEvent(
            new CustomEvent("match-upload-failed", {
              detail: {
                matchId,
                error:
                  jobErr instanceof Error
                    ? jobErr.message
                    : "Couldn't queue this match for analysis",
              },
            })
          );
          return;
        }

        // Background: the wizard has already closed by now.
        if (videoFileToUpload) {
          void uploadAndSubmitVideo({
            supabase,
            jobId,
            matchId,
            file: videoFileToUpload,
            answers: {
              initialTopPlayerIsPlayer1: formData.initialTopPlayerIsPlayer1,
              adScoring: formData.adScoring,
              fixedCamera: formData.fixedCamera,
            },
            onEvent: (event) => onVideoUpload?.(event),
            onTransferFailed: (message) => {
              window.dispatchEvent(
                new CustomEvent("match-upload-failed", {
                  detail: { matchId, error: message },
                })
              );
            },
          });
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
          // Same exemption as above: never delete a row that already carried a
          // result before this upload started.
          if (!reusingMatch) {
            await supabase.from("matches").delete().eq("id", matchId);
          }
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
    // activeWorkspace is in here on purpose: a coach who switches workspaces
    // with the wizard open must not create the match against the one they left.
  }, [formData, uploadedFile, selectedProvider, isProcessingProvider, supabase, isPrivateMatch, onOpenChange, onCreated, router, activeWorkspace.id, activeWorkspace.kind]);

  return {
    // State
    step,
    selectedProvider,
    uploadedFile,
    isOver,
    isCreating,
    isUploading,
    error,
    uploadError,
    formData,
    parsingState,
    pendingDetailFocus,

    // Step navigation
    handleProviderSelect,
    handleProviderContinue,
    handleMatchContinue,
    handleBack,
    goEditDetail,
    consumePendingDetailFocus,

    // File handling
    setIsOver,
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
    remainingQuotaSeconds,
    quotaCapSeconds,
    quotaResetsOn,
    acceptString: processingStrategy?.getAcceptString() ?? "",
    requirementChips: processingStrategy?.requirementChips ?? [],
    onVideoPick,
    handleTrimChange,
    handleRemoveVideo,
    handleVideoContinue,

    // Form handling
    handleInputChange,
    /** Set together with `playerName` whenever a roster row is picked. */
    setPickedPlayerUserId,
    handleScoreChange,
    handleTiebreakChange,

    // Match creation
    handleCreateMatch
  };
}
