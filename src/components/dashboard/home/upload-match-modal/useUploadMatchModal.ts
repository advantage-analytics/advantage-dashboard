"use client";

/**
 * Custom hook for managing Upload Match Modal state and logic
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
  isProviderSupported,
  ProviderId,
} from "@/lib/services/upload";
import { getParser, hasParser } from "@/lib/services/upload/parsers";
import {
  Step,
  FormData as MatchFormData,
  UploadedFile,
  ParsingState,
  DetailField,
  DEFAULT_FORM_DATA
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

export interface UseUploadMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface UseUploadMatchModalReturn {
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

  // Step navigation
  setStep: (step: Step) => void;
  handleProviderSelect: (providerId: string | null) => void;
  handleProviderContinue: () => void;
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

// Helper to get current date in YYYY-MM-DD format
function getCurrentDate(): string {
  const now = new Date();
  return now.toISOString().split('T')[0];
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

export function useUploadMatchModal({
  open,
  onOpenChange
}: UseUploadMatchModalProps): UseUploadMatchModalReturn {
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

    // Resume on the Match step when the user previously got past Provider —
    // otherwise an accidental close means a wasted click on reopen.
    setStep(resumedProvider ? "match" : "provider");

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
      setStep("match");
    }
  }, [selectedProvider]);

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

  const handleBack = useCallback(() => {
    const stepMap: Record<Step, Step | null> = {
      provider: null,
      match: "provider",
      confirm: "match"
    };
    const prevStep = stepMap[step];
    if (prevStep) {
      setStep(prevStep);
    }
  }, [step]);

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

    // Basic file type validation using provider strategy
    try {
      const strategy = getProviderStrategy(selectedProvider);
      const validationResult = strategy.validateFile(file);

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
        analysisMethod: 'elc',
        matchType: formData.matchType,
        courtType: formData.courtType
      };

      const matchData = buildMatchData(matchId, { ...formData, eventName }, winner, loser, isPrivateMatch, metadata);

      const { error: matchError } = await supabase.from("matches").insert(matchData);

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
      sessionStorage.setItem("match-processing", "true");
      window.dispatchEvent(new CustomEvent("match-created", { detail: { matchId } }));
      router.refresh();
      onOpenChange(false);

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
  }, [formData, uploadedFile, selectedProvider, supabase, isPrivateMatch, onOpenChange, router]);

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

    // Form handling
    handleInputChange,
    handleScoreChange,
    handleTiebreakChange,

    // Match creation
    handleCreateMatch
  };
}
