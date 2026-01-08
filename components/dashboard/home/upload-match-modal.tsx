"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { ProviderCard } from "@/components/dashboard/upload/provider-card";
import { providers } from "@/lib/providers";
import { createClient } from "@/lib/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Info, Upload, Trash2, Check, Upload as UploadIcon } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { useRouter } from "next/navigation";

type Step = "method" | "provider" | "upload" | "details" | "confirm";

interface UploadMatchModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface FormData {
  eventName: string;
  round: string;
  bestOf: string;
  adScoring: boolean;
  playOnLets: boolean;
  result: string;
  date: string;
  playerName: string;
  opponentName: string;
  playerScores: number[];
  opponentScores: number[];
}

interface UploadedFile {
  name: string;
  size: string;
  status: string;
  file?: File | null;
  data?: string;
  type?: string;
}

export function UploadMatchModal({ open, onOpenChange }: UploadMatchModalProps) {
  const router = useRouter();
  const supabase = useMemo(() => createClient(), []);
  const [step, setStep] = useState<Step>("method");
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);
  const [matchId, setMatchId] = useState<string | null>(null);
  const [sourceType, setSourceType] = useState<string>("Swingvision");
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  const [isOver, setIsOver] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPrivateMatch] = useState(true);

  const [formData, setFormData] = useState<FormData>({
    eventName: "ATP 250 Shanghi",
    round: "16",
    bestOf: "3",
    adScoring: false,
    playOnLets: false,
    result: "Completed",
    date: "04/25/2003",
    playerName: "",
    opponentName: "",
    playerScores: [0, 0, 0],
    opponentScores: [0, 0, 0]
  });

  // Load data from localStorage when modal opens
  useEffect(() => {
    if (open) {
      const existingProvider = localStorage.getItem("selectedProvider");
      if (existingProvider) {
        setSelectedProvider(existingProvider);
      }
      const storedFormData = localStorage.getItem('uploadFormData');
      const storedFile = localStorage.getItem('uploadedFile');
      if (storedFormData) {
        try {
          setFormData(JSON.parse(storedFormData));
        } catch (e) {
          console.error('Error parsing form data:', e);
        }
      }
      if (storedFile) {
        try {
          setUploadedFile(JSON.parse(storedFile));
        } catch (e) {
          console.error('Error parsing file data:', e);
        }
      }
    }
  }, [open]);

  const handleMethodSelect = () => {
    setStep("provider");
  };

  const handleProviderSelect = (providerId: string) => {
    setSelectedProvider(providerId);
    localStorage.setItem("selectedProvider", providerId);
  };

  const handleProviderContinue = () => {
    if (selectedProvider) {
      setStep("upload");
    }
  };

  // File upload handler
  const onDrop = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const file = files[0];
    const fileData = {
      name: file.name,
      size: `${(file.size / 1024).toFixed(0)} KB of ${(file.size / 1024).toFixed(0)} KB`,
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
      localStorage.setItem('uploadedFile', JSON.stringify(fileDataForStorage));
    };
    reader.readAsDataURL(file);
  }, []);

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    onDrop(e.dataTransfer?.files ?? null);
  };

  const handleFileChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    onDrop(e.target.files);
    e.currentTarget.value = "";
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
    localStorage.removeItem('uploadedFile');
  };

  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleScoreChange = (player: "player" | "opponent", index: number, value: string) => {
    const numValue = Number(value) || 0;
    const field = player === "player" ? "playerScores" : "opponentScores";
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((score, i) => i === index ? numValue : score)
    }));
  };

  const getNumberOfSets = () => {
    return formData.bestOf === "5" ? 5 : 3;
  };

  const getPlayerScores = () => {
    const sets = getNumberOfSets();
    const currentScores = formData.playerScores;
    if (currentScores.length < sets) {
      return [...currentScores, ...Array(sets - currentScores.length).fill(0)];
    }
    return currentScores.slice(0, sets);
  };

  const getOpponentScores = () => {
    const sets = getNumberOfSets();
    const currentScores = formData.opponentScores;
    if (currentScores.length < sets) {
      return [...currentScores, ...Array(sets - currentScores.length).fill(0)];
    }
    return currentScores.slice(0, sets);
  };

  const handleUploadContinue = () => {
    localStorage.setItem('uploadFormData', JSON.stringify(formData));
    setStep("details");
  };

  const handleDetailsContinue = () => {
    localStorage.setItem('uploadFormData', JSON.stringify(formData));
    setStep("confirm");
  };

  // Create match handler
  const handleCreateMatch = async () => {
    if (!formData || !uploadedFile) {
      setError("Please complete all required fields and upload a file.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("Not authenticated");
      }

      // Generate a unique match ID
      const matchId = crypto.randomUUID();

      // Determine winner and loser based on scores
      const determineWinner = (playerScores: number[], opponentScores: number[], bestOf: number) => {
        const setsToWin = Math.ceil(bestOf / 2);
        let playerSetsWon = 0;
        let opponentSetsWon = 0;
        
        for (let i = 0; i < Math.min(playerScores.length, opponentScores.length); i++) {
          if (playerScores[i] > opponentScores[i]) {
            playerSetsWon++;
          } else if (opponentScores[i] > playerScores[i]) {
            opponentSetsWon++;
          }
        }
        
        const playerWon = playerSetsWon > opponentSetsWon;
        
        return {
          winner: playerWon ? {
            id: user.id,
            name: formData.playerName,
            scores: formData.playerScores
          } : {
            id: null,
            name: formData.opponentName,
            scores: formData.opponentScores
          },
          loser: playerWon ? {
            id: null,
            name: formData.opponentName,
            scores: formData.opponentScores
          } : {
            id: user.id,
            name: formData.playerName,
            scores: formData.playerScores
          }
        };
      };

      const { winner, loser } = determineWinner(formData.playerScores, formData.opponentScores, parseInt(formData.bestOf));

      // Create match record
      const matchData = {
        id: matchId,
        player1_id: winner.id,
        player1_name: winner.name,
        player2_id: loser.id,
        player2_name: loser.name,
        tournament_name: formData.eventName,
        round: formData.round,
        format: {
          best_of: parseInt(formData.bestOf),
          ad_scoring: formData.adScoring,
          play_on_lets: formData.playOnLets
        },
        result: formData.result,
        date: formData.date,
        private: isPrivateMatch,
        score: {
          player1: winner.scores,
          player2: loser.scores
        }
      };

      console.log("Attempting to insert match data:", matchData);
      const { error: matchError } = await supabase
        .from("matches")
        .insert(matchData);

      if (matchError) {
        console.error("Supabase insert error:", matchError);
        throw new Error(`Database error: ${matchError.message || matchError.details || JSON.stringify(matchError)}`);
      }

      // Upload file if exists
      if (uploadedFile?.data) {
        try {
          // Convert base64 string back to binary blob for Supabase Storage upload
          const base64Data = (uploadedFile as any).data.split(',')[1]; // Remove data URL prefix
          const byteCharacters = atob(base64Data); // Decode base64
          const byteNumbers = new Array(byteCharacters.length);
          for (let i = 0; i < byteCharacters.length; i++) {
            byteNumbers[i] = byteCharacters.charCodeAt(i);
          }
          const byteArray = new Uint8Array(byteNumbers);
          const blob = new Blob([byteArray], { 
            type: (uploadedFile as any).type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' 
          });

          const storagePath = `matches/${matchId}/${uploadedFile.name}`;
          const { error: storageError } = await supabase.storage.from("match-data").upload(storagePath, blob, { upsert: true });
          
          if (storageError) {
            console.error("Storage upload error:", storageError);
            // Don't throw - file upload failure shouldn't prevent match creation
          } else {
            await supabase.from("match_files").insert({
              match_id: matchId,
              file_type: sourceType,
              file_name: uploadedFile.name,
              uploaded_by: user.id,
            });
          }
        } catch (fileError) {
          console.error("File upload error:", fileError);
          // Don't throw - file upload failure shouldn't prevent match creation
        }
      }

      // Clean up localStorage
      localStorage.removeItem('uploadFormData');
      localStorage.removeItem('uploadedFile');
      localStorage.removeItem('selectedProvider');

      // Close modal and redirect
      onOpenChange(false);
      router.push('/dashboard');
    } catch (e: any) {
      console.error('Error creating match:', e);
      // Extract error message from various possible error formats
      const errorMessage = e?.message || e?.error?.message || e?.details || e?.hint || JSON.stringify(e) || "Failed to create match. Please try again.";
      setError(errorMessage);
    } finally {
      setIsCreating(false);
    }
  };

  const handleBack = () => {
    if (step === "provider") {
      setStep("method");
    } else if (step === "upload") {
      setStep("provider");
    } else if (step === "details") {
      setStep("upload");
    } else if (step === "confirm") {
      setStep("details");
    }
  };

  const handleClose = () => {
    onOpenChange(false);
    setTimeout(() => {
      setStep("method");
      setSelectedProvider(null);
      setMatchId(null);
      setUploadedFile(null);
    }, 200);
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "method" && "Your Analysis, Your Way"}
            {step === "provider" && "Choose Provider"}
            {step === "upload" && "Upload Match"}
            {step === "details" && "Match Details"}
            {step === "confirm" && "Confirm Details"}
          </DialogTitle>
          <DialogDescription>
            {step === "method" && "Choose which method to analyze your data"}
            {step === "provider" && "Choose from a variety of protocols such as SwingVision, Goodminton, and many more."}
            {step === "upload" && "Upload and specify your match data"}
            {step === "details" && "Enter match information and details"}
            {step === "confirm" && "Review and confirm your match details"}
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4">
          {/* Step 1: Choose Analysis Method */}
          {step === "method" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <Card
                  className="cursor-pointer hover:shadow-lg transition-shadow"
                  onClick={handleMethodSelect}
                >
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                        <span className="text-gray-400">Tennis Court Image</span>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Electronic Line Calling</h3>
                        <p className="text-sm text-muted-foreground">
                          Choose from a variety of protocols such as SwingVision, Goodminton, and many more.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
                <Card className="opacity-50 cursor-not-allowed">
                  <CardContent className="p-6">
                    <div className="space-y-4">
                      <div className="aspect-video bg-gray-100 rounded-lg flex items-center justify-center">
                        <span className="text-gray-400">Advantage Logo</span>
                      </div>
                      <div>
                        <h3 className="font-semibold mb-2">Coming Soon</h3>
                        <p className="text-sm text-muted-foreground">
                          Choose to label with advantage intelligence or traditional labeling techniques.
                        </p>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          {/* Step 2: Choose Provider */}
          {step === "provider" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {providers.map((provider) => (
                  <ProviderCard
                    key={provider.id}
                    id={provider.id}
                    name={provider.name}
                    description={provider.description}
                    logo={provider.logo}
                    onClick={handleProviderSelect}
                    isSelected={selectedProvider === provider.id}
                  />
                ))}
              </div>
              <div className="flex gap-4">
                <Button variant="outline" onClick={handleBack}>
                  Back
                </Button>
                <Button
                  onClick={handleProviderContinue}
                  disabled={!selectedProvider}
                  className={selectedProvider ? "bg-gray-600 hover:bg-gray-700" : ""}
                >
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 3: Upload Files */}
          {step === "upload" && (
            <div className="space-y-6">
              <div className="space-y-3">
                <div className="space-y-1">
                  <h3 className="text-2xl font-semibold tracking-tight">Upload Match</h3>
                  <p className="text-sm text-muted-foreground">Upload and specify your match data</p>
                </div>

                <div className="space-y-1">
                  <div className="text-sm font-medium">Data Type</div>
                  <Select value={sourceType} onValueChange={setSourceType}>
                    <SelectTrigger className="w-full justify-between">
                      <SelectValue>{sourceType}</SelectValue>
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Swingvision">Swingvision</SelectItem>
                      <SelectItem value="ATP">ATP</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                <Card className="rounded-xl">
                  <CardContent className="p-0">
                    <div
                      onDragOver={(e) => {
                        e.preventDefault();
                        setIsOver(true);
                      }}
                      onDragLeave={() => setIsOver(false)}
                      onDrop={handleDrop}
                      className={`rounded-xl flex items-center justify-center h-52 text-sm text-muted-foreground ${
                        isOver ? "bg-primary/5" : ""
                      } cursor-pointer`}
                    >
                      <label className="w-full h-full flex items-center justify-center" htmlFor="upload-input">
                        <div className="text-center select-none">
                          <div className="mb-2 flex items-center justify-center">
                            <UploadIcon className="h-6 w-6 text-muted-foreground" />
                          </div>
                          <div>Upload Match Data</div>
                        </div>
                        <input
                          id="upload-input"
                          type="file"
                          onChange={handleFileChange}
                          className="hidden"
                          accept=".xlsx,.xls"
                        />
                      </label>
                    </div>
                  </CardContent>
                </Card>

                {uploadedFile && (
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">XLSX</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium">{uploadedFile.name}</p>
                        <p className="text-xs text-gray-500">{uploadedFile.size}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-green-600">
                        <Check className="h-4 w-4" />
                        <span className="text-sm">{uploadedFile.status}</span>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleRemoveFile}
                        className="text-gray-500 hover:text-red-500"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                )}
              </div>
              <div className="flex gap-4">
                <Button variant="outline" onClick={handleBack}>
                  Back
                </Button>
                <Button onClick={handleUploadContinue} className="bg-gray-600 hover:bg-gray-700">
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 4: Match Details */}
          {step === "details" && (
            <div className="space-y-6">
              <Card className="rounded-xl">
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight">Upload Match</h2>
                    <p className="text-sm text-muted-foreground">Upload match information and data from the specified provider.</p>
                  </div>

                  {/* Event Information */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">Event Information</h4>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="eventName">Event Name</Label>
                        <Input
                          id="eventName"
                          value={formData.eventName}
                          onChange={(e) => handleInputChange("eventName", e.target.value)}
                        />
                      </div>
                      <div className="space-y-1.5">
                        <Label htmlFor="round">Round</Label>
                        <Select value={formData.round} onValueChange={(value) => handleInputChange("round", value)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="16">16</SelectItem>
                            <SelectItem value="32">32</SelectItem>
                            <SelectItem value="64">64</SelectItem>
                            <SelectItem value="Quarterfinal">Quarterfinal</SelectItem>
                            <SelectItem value="Semifinal">Semifinal</SelectItem>
                            <SelectItem value="Final">Final</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Scoring Format */}
                  <div className="space-y-3">
                    <div className="flex items-center gap-2">
                      <h4 className="font-semibold">Scoring Format</h4>
                      <Info className="h-4 w-4 text-muted-foreground" />
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <Label htmlFor="bestOf">Best of...</Label>
                        <Select value={formData.bestOf} onValueChange={(value) => handleInputChange("bestOf", value)}>
                          <SelectTrigger className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="3">3</SelectItem>
                            <SelectItem value="5">5</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="grid grid-cols-2 gap-4">
                        <div className="space-y-1.5 flex flex-col items-center">
                          <Label htmlFor="adScoring" className="text-center">Ad Scoring</Label>
                          <input
                            type="checkbox"
                            id="adScoring"
                            checked={formData.adScoring}
                            onChange={(e) => handleInputChange("adScoring", e.target.checked)}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                          />
                        </div>
                        <div className="space-y-1.5 flex flex-col items-center">
                          <Label htmlFor="playOnLets" className="text-center">Play on Lets</Label>
                          <input
                            type="checkbox"
                            id="playOnLets"
                            checked={formData.playOnLets}
                            onChange={(e) => handleInputChange("playOnLets", e.target.checked)}
                            className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                          />
                        </div>
                      </div>
                    </div>
                  </div>

                  <Separator />

                  {/* Match Information */}
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-semibold">Match Information</h4>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="result">Result</Label>
                          <Select value={formData.result} onValueChange={(value) => handleInputChange("result", value)}>
                            <SelectTrigger className="w-full">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="Completed">Completed</SelectItem>
                              <SelectItem value="Retired">Retired</SelectItem>
                              <SelectItem value="Unfinished">Unfinished</SelectItem>
                            </SelectContent>
                          </Select>
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="playerName">Name</Label>
                          <Input
                            id="playerName"
                            value={formData.playerName}
                            onChange={(e) => handleInputChange("playerName", e.target.value)}
                            placeholder="Player Name"
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label htmlFor="opponentName">Opponent</Label>
                          <Input
                            id="opponentName"
                            value={formData.opponentName}
                            onChange={(e) => handleInputChange("opponentName", e.target.value)}
                            placeholder="Opponent Name"
                          />
                        </div>
                      </div>
                      <div className="space-y-3">
                        <div className="space-y-1.5">
                          <Label htmlFor="date">Date</Label>
                          <Input
                            id="date"
                            value={formData.date}
                            onChange={(e) => handleInputChange("date", e.target.value)}
                          />
                        </div>
                        <div className="space-y-1.5">
                          <Label>Game Score</Label>
                          <div className="flex gap-2">
                            {getPlayerScores().map((score, i) => (
                              <Input
                                key={i}
                                className={`text-center ${formData.bestOf === "3" ? "flex-1" : "w-12"}`}
                                value={score}
                                onChange={(e) => handleScoreChange("player", i, e.target.value)}
                              />
                            ))}
                          </div>
                        </div>
                        <div className="space-y-1.5">
                          <Label>Game Score</Label>
                          <div className="flex gap-2">
                            {getOpponentScores().map((score, i) => (
                              <Input
                                key={i}
                                className={`text-center ${formData.bestOf === "3" ? "flex-1" : "w-12"}`}
                                value={score}
                                onChange={(e) => handleScoreChange("opponent", i, e.target.value)}
                              />
                            ))}
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <div className="flex gap-4">
                <Button variant="outline" onClick={handleBack}>
                  Back
                </Button>
                <Button onClick={handleDetailsContinue} className="bg-gray-600 hover:bg-gray-700">
                  Continue
                </Button>
              </div>
            </div>
          )}

          {/* Step 5: Confirm Details */}
          {step === "confirm" && (
            <div className="space-y-6">
              <Card className="rounded-xl">
                <CardContent className="p-6 space-y-6">
                  <div className="space-y-1">
                    <h2 className="text-2xl font-semibold tracking-tight">Confirm Details</h2>
                    <p className="text-sm text-muted-foreground">Review and confirm your match details</p>
                  </div>

                  {/* Display form data summary */}
                  <div className="space-y-4">
                    <div>
                      <h4 className="font-semibold mb-2">Event Information</h4>
                      <p className="text-sm"><strong>Event Name:</strong> {formData.eventName}</p>
                      <p className="text-sm"><strong>Round:</strong> {formData.round}</p>
                    </div>
                    <Separator />
                    <div>
                      <h4 className="font-semibold mb-2">Match Information</h4>
                      <p className="text-sm"><strong>Player:</strong> {formData.playerName || "N/A"}</p>
                      <p className="text-sm"><strong>Opponent:</strong> {formData.opponentName || "N/A"}</p>
                      <p className="text-sm"><strong>Date:</strong> {formData.date}</p>
                      <p className="text-sm"><strong>Result:</strong> {formData.result}</p>
                    </div>
                    {uploadedFile && (
                      <>
                        <Separator />
                        <div>
                          <h4 className="font-semibold mb-2">Uploaded File</h4>
                          <p className="text-sm"><strong>File:</strong> {uploadedFile.name}</p>
                        </div>
                      </>
                    )}
                    <Separator />
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-semibold">Private Match</h4>
                        <p className="text-sm text-gray-500">Note: All matches will be private during our Beta Testing</p>
                      </div>
                      <Switch checked={isPrivateMatch} disabled={true} className="opacity-50 cursor-not-allowed" />
                    </div>
                  </div>

                  {error && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                      <p className="text-sm text-red-800">{error}</p>
                    </div>
                  )}

                  <div className="flex gap-4">
                    <Button variant="outline" onClick={handleBack}>
                      Back
                    </Button>
                    <Button
                      onClick={handleCreateMatch}
                      disabled={isCreating}
                      className="bg-gray-600 hover:bg-gray-700 w-full"
                    >
                      {isCreating ? "Creating Match..." : "Create Match"}
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
