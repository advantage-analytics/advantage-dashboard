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

import { useState, useEffect, useCallback, useMemo } from "react";
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
  selectedMethod: string | null;
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
  handleMethodSelect: (methodId: string | null) => void;
  handleMethodContinue: () => void;
  handleProviderSelect: (providerId: string | null) => void;
  handleProviderContinue: () => void;
  handleUploadContinue: () => void;
  handleDetailsContinue: () => void;
  handleBack: () => void;
  handleClose: () => void;

  // File handling
  setIsOver: (isOver: boolean) => void;
  setSourceType: (type: string) => void;
  onDrop: (files: FileList | null) => void;
  handleDrop: React.DragEventHandler<HTMLDivElement>;
  handleFileChange: React.ChangeEventHandler<HTMLInputElement>;
  handleRemoveFile: () => void;

  // Form handling
  handleInputChange: (field: keyof MatchFormData, value: string | number | boolean) => void;
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
  const [step, setStep] = useState<Step>("method");
  const [selectedMethod, setSelectedMethod] = useState<string | null>(null);
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
  const [parsingState, setParsingState] = useState<ParsingState>({
    isParsing: false,
    parseError: null,
    parseWarnings: [],
    parseSuccess: false,
  });

  // Load data from localStorage when modal opens
  useEffect(() => {
    if (open) {
      const existingProvider = localStorage.getItem(STORAGE_KEYS.SELECTED_PROVIDER);
      if (existingProvider && isProviderSupported(existingProvider)) {
        setSelectedProvider(existingProvider as ProviderId);
        setSourceType(existingProvider);
      }

      const storedFormData = loadFormDataFromStorage();
      if (storedFormData) {
        setFormData(storedFormData);
      }

      const storedFile = loadUploadedFileFromStorage();
      if (storedFile) {
        setUploadedFile(storedFile);
      }
    }
  }, [open]);

  // Step navigation handlers
  const handleMethodSelect = useCallback((methodId: string | null) => {
    setSelectedMethod(methodId);
  }, []);

  const handleMethodContinue = useCallback(() => {
    if (selectedMethod) {
      setStep("provider");
    }
  }, [selectedMethod]);

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
      setStep("upload");
    }
  }, [selectedProvider]);

  const handleUploadContinue = useCallback(() => {
    saveFormDataToStorage(formData);
    setStep("details");
  }, [formData]);

  const handleDetailsContinue = useCallback(() => {
    saveFormDataToStorage(formData);
    setStep("confirm");
  }, [formData]);

  const handleBack = useCallback(() => {
    const stepMap: Record<Step, Step | null> = {
      method: null,
      provider: "method",
      upload: "provider",
      details: "upload",
      confirm: "details"
    };
    const prevStep = stepMap[step];
    if (prevStep) {
      setStep(prevStep);
    }
  }, [step]);

  const handleClose = useCallback(() => {
    clearStorageData();
    onOpenChange(false);
    setTimeout(() => {
      setStep("method");
      setSelectedProvider(null);
      setUploadedFile(null);
      setFormData(getDefaultFormData());
      setSelectedMethod(null);
    }, 200);
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
  const handleInputChange = useCallback((field: keyof MatchFormData, value: string | number | boolean) => {
    setFormData((prev) => {
      const next = { ...prev, [field]: value };
      // When bestOf changes, reset numberOfSets so it uses the new format's default
      if (field === "bestOf") {
        next.numberOfSets = undefined;
      }
      return next;
    });
  }, []);

  const handleScoreChange = useCallback(
    (player: "player" | "opponent", index: number, value: string) => {
      // Only allow empty string or valid integers
      if (value === "") {
        const numValue = null;
        const field = player === "player" ? "playerScores" : "opponentScores";
        setFormData((prev) => ({
          ...prev,
          [field]: prev[field].map((score, i) => (i === index ? numValue : score))
        }));
      } else if (/^\d+$/.test(value)) {
        // Only accept positive integers
        const numValue = Number(value);
        const field = player === "player" ? "playerScores" : "opponentScores";
        setFormData((prev) => ({
          ...prev,
          [field]: prev[field].map((score, i) => (i === index ? numValue : score))
        }));
      }
      // Silently ignore invalid input
    },
    []
  );

  const handleTiebreakChange = useCallback(
    (player: "player" | "opponent", index: number, value: string) => {
      // Only allow empty string or valid integers
      if (value === "") {
        const numValue = null;
        const field = player === "player" ? "playerTiebreaks" : "opponentTiebreaks";
        setFormData((prev) => ({
          ...prev,
          [field]: prev[field].map((score, i) => (i === index ? numValue : score))
        }));
      } else if (/^\d+$/.test(value)) {
        // Only accept positive integers
        const numValue = Number(value);
        const field = player === "player" ? "playerTiebreaks" : "opponentTiebreaks";
        setFormData((prev) => ({
          ...prev,
          [field]: prev[field].map((score, i) => (i === index ? numValue : score))
        }));
      }
      // Silently ignore invalid input
    },
    []
  );

  /**
   * Upload file to Supabase storage via API route
   *
   * @param matchId - The match ID to associate the file with
   * @returns Promise with upload result
   */
  const uploadFileToStorage = useCallback(async (matchId: string): Promise<{ success: boolean; error?: string }> => {
    if (!uploadedFile?.file || !selectedProvider) {
      return { success: false, error: "No file or provider selected" };
    }

    setIsUploading(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", uploadedFile.file);
      formData.append("matchId", matchId);
      formData.append("providerId", selectedProvider);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: formData,
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        return { success: false, error: result.error || "Upload failed" };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: err instanceof Error ? err.message : "Upload error",
      };
    } finally {
      setIsUploading(false);
    }
  }, [uploadedFile, selectedProvider]);

  // Match creation
  const handleCreateMatch = useCallback(async () => {
    if (!formData || !uploadedFile) {
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
      const {
        data: { user },
        error: authError
      } = await supabase.auth.getUser();

      if (authError || !user) {
        throw new Error("Not authenticated");
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
        user.id,
        formData.playerName,
        formData.opponentName
      );

      // Auto-fill event name if empty
      let eventName = formData.eventName;
      if (!eventName) {
        eventName = `${formData.playerName} vs ${formData.opponentName}`;
      }

      // Build metadata for the match
      const metadata: MatchMetadata = {
        userId: user.id,
        sourceProvider: selectedProvider,
        analysisMethod: selectedMethod || 'elc', // Default to ELC if not set
        matchType: formData.matchType,
        courtType: formData.courtType
      };

      const matchData = buildMatchData(matchId, { ...formData, eventName }, winner, loser, isPrivateMatch, metadata);

      console.log("Attempting to insert match data:", matchData);

      const { error: matchError } = await supabase.from("matches").insert(matchData);

      if (matchError) {
        console.error("Supabase insert error:", matchError);
        throw new Error(
          `Database error: ${matchError.message || matchError.details || JSON.stringify(matchError)}`
        );
      }

      // Upload file to storage via API route
      if (uploadedFile?.file) {
        const uploadResult = await uploadFileToStorage(matchId);

        if (!uploadResult.success) {
          // Log the error but don't fail the match creation
          // The file can be re-uploaded later
          console.error("File upload error:", uploadResult.error);
          setUploadError(uploadResult.error || "File upload failed, but match was created.");
        }
      }

      clearStorageData();
      onOpenChange(false);
      router.push("/dashboard");
      window.dispatchEvent(new Event("match-created"));
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
  }, [formData, uploadedFile, selectedProvider, selectedMethod, supabase, isPrivateMatch, onOpenChange, router, uploadFileToStorage]);

  return {
    // State
    step,
    selectedMethod,
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

    // Step navigation
    setStep,
    handleMethodSelect,
    handleMethodContinue,
    handleProviderSelect,
    handleProviderContinue,
    handleUploadContinue,
    handleDetailsContinue,
    handleBack,
    handleClose,

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
