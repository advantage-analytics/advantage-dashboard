"use client";

/**
 * Custom hook for managing Upload Match Modal state and logic
 */

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  Step,
  FormData,
  UploadedFile,
  DEFAULT_FORM_DATA
} from "./types";
import {
  determineWinner,
  buildMatchData,
  base64ToBlob,
  formatFileSize,
  clearStorageData,
  loadFormDataFromStorage,
  loadUploadedFileFromStorage,
  saveFormDataToStorage,
  STORAGE_KEYS
} from "./utils";

export interface UseUploadMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export interface UseUploadMatchModalReturn {
  // State
  step: Step;
  selectedMethod: string | null;
  selectedProvider: string | null;
  sourceType: string;
  uploadedFile: UploadedFile | null;
  isOver: boolean;
  isCreating: boolean;
  error: string | null;
  isPrivateMatch: boolean;
  formData: FormData;

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
  handleInputChange: (field: keyof FormData, value: any) => void;
  handleScoreChange: (player: "player" | "opponent", index: number, value: string) => void;

  // Match creation
  handleCreateMatch: () => Promise<void>;
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
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string>("Swingvision");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isOver, setIsOver] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPrivateMatch] = useState(true);
  const [formData, setFormData] = useState<FormData>(DEFAULT_FORM_DATA);

  // Load data from localStorage when modal opens
  useEffect(() => {
    if (open) {
      const existingProvider = localStorage.getItem(STORAGE_KEYS.SELECTED_PROVIDER);
      if (existingProvider) {
        setSelectedProvider(existingProvider);
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
    setSelectedProvider(providerId);
    if (providerId) {
      localStorage.setItem(STORAGE_KEYS.SELECTED_PROVIDER, providerId);
    } else {
      localStorage.removeItem(STORAGE_KEYS.SELECTED_PROVIDER);
    }
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
    onOpenChange(false);
    setTimeout(() => {
      setStep("method");
      setSelectedProvider(null);
      setUploadedFile(null);
    }, 200);
  }, [onOpenChange]);

  // File handling
  const onDrop = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const file = files[0];
    const fileData: UploadedFile = {
      name: file.name,
      size: formatFileSize(file.size),
      status: "Completed",
      file: file
    };
    setUploadedFile(fileData);

    const reader = new FileReader();
    reader.onload = () => {
      const fileDataForStorage = {
        name: file.name,
        size: fileData.size,
        status: "Completed",
        data: reader.result,
        type: file.type
      };
      localStorage.setItem(STORAGE_KEYS.UPLOADED_FILE, JSON.stringify(fileDataForStorage));
    };
    reader.readAsDataURL(file);
  }, []);

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
  const handleInputChange = useCallback((field: keyof FormData, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  }, []);

  const handleScoreChange = useCallback(
    (player: "player" | "opponent", index: number, value: string) => {
      const numValue = Number(value) || 0;
      const field = player === "player" ? "playerScores" : "opponentScores";
      setFormData((prev) => ({
        ...prev,
        [field]: prev[field].map((score, i) => (i === index ? numValue : score))
      }));
    },
    []
  );

  // Match creation
  const handleCreateMatch = useCallback(async () => {
    if (!formData || !uploadedFile) {
      setError("Please complete all required fields and upload a file.");
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

      const { winner, loser } = determineWinner(
        formData.playerScores,
        formData.opponentScores,
        parseInt(formData.bestOf),
        user.id,
        formData.playerName,
        formData.opponentName
      );

      const matchData = buildMatchData(matchId, formData, winner, loser, isPrivateMatch);

      console.log("Attempting to insert match data:", matchData);

      const { error: matchError } = await supabase.from("matches").insert(matchData);

      if (matchError) {
        console.error("Supabase insert error:", matchError);
        throw new Error(
          `Database error: ${matchError.message || matchError.details || JSON.stringify(matchError)}`
        );
      }

      // Upload file if exists
      if (uploadedFile?.data) {
        try {
          const mimeType =
            (uploadedFile as any).type ||
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
          const blob = base64ToBlob((uploadedFile as any).data, mimeType);

          const storagePath = `matches/${matchId}/${uploadedFile.name}`;
          const { error: storageError } = await supabase.storage
            .from("match-data")
            .upload(storagePath, blob, { upsert: true });

          if (storageError) {
            console.error("Storage upload error:", storageError);
          } else {
            await supabase.from("match_files").insert({
              match_id: matchId,
              file_type: sourceType,
              file_name: uploadedFile.name,
              uploaded_by: user.id
            });
          }
        } catch (fileError) {
          console.error("File upload error:", fileError);
        }
      }

      clearStorageData();
      onOpenChange(false);
      router.push("/dashboard");
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
  }, [formData, uploadedFile, supabase, sourceType, isPrivateMatch, onOpenChange, router]);

  return {
    // State
    step,
    selectedMethod,
    selectedProvider,
    sourceType,
    uploadedFile,
    isOver,
    isCreating,
    error,
    isPrivateMatch,
    formData,

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

    // Match creation
    handleCreateMatch
  };
}
