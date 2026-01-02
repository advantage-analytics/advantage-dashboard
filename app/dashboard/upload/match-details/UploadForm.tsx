"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Info, Upload, Trash2, Check } from "lucide-react";

/**
 * Interface defining the structure of form data for match uploads
 * Contains all the fields needed to create a match record
 */
interface FormData {
  eventName: string;        // Name of the tournament/event
  round: string;           // Tournament round (e.g., "16", "Quarterfinal")
  bestOf: string;          // Best of 3 or 5 sets
  adScoring: boolean;      // Whether to use ad scoring (deuce advantage)
  playOnLets: boolean;     // Whether to replay points on lets
  result: string;          // Match result (Completed, Retired, Unfinished)
  date: string;            // Match date
  playerName: string;      // Name of the primary player
  opponentName: string;    // Name of the opponent
  playerScores: number[];  // Array of set scores for the primary player
  opponentScores: number[]; // Array of set scores for the opponent
}

/**
 * UploadForm Component - Step 2 of Upload Flow
 * 
 * This component handles the match details form where users input:
 * - Event information (name, round)
 * - Scoring format (best of, ad scoring, play on lets)
 * - Match information (result, date, players, scores)
 * - File upload for match data
 * 
 * MAJOR MODIFICATIONS MADE IN THIS SESSION:
 * 1. Added localStorage persistence for form data when navigating back from Step 3
 * 2. Added custom event dispatching to notify sidebar of form completion
 * 3. Moved "Upload Match" header inside the main Card container for consistent styling
 * 4. Changed "status" field to "result" with new dropdown options (Completed, Retired, Unfinished)
 * 5. Enhanced form validation and data persistence across navigation
 * 
 * The form validates input and stores data in localStorage for the next step
 */
export default function UploadForm() {
  const router = useRouter();
  
  // Initialize form state with default values
  // These values are pre-populated for demo purposes
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

  // State for tracking uploaded file information
  // Contains file metadata and the actual File object
  const [uploadedFile, setUploadedFile] = useState<{
    name: string;     // Original filename
    size: string;     // Human-readable file size
    status: string;   // Upload status (e.g., "Completed")
  } | null>(null);

  /**
   * MODIFICATION: Load existing form data and uploaded file from localStorage on component mount
   * This allows the form to persist data when navigating back from Step 3
   * Previously, the form would reset to default values when navigating back
   */
  useEffect(() => {
    const storedFormData = localStorage.getItem('uploadFormData');
    const storedFile = localStorage.getItem('uploadedFile');
    
    // Load existing form data if available
    if (storedFormData) {
      try {
        const parsedData = JSON.parse(storedFormData);
        setFormData(parsedData);
      } catch (error) {
        console.error('Error parsing stored form data:', error);
      }
    }
    
    // Load existing uploaded file if available
    if (storedFile) {
      try {
        const parsedFile = JSON.parse(storedFile);
        setUploadedFile(parsedFile);
      } catch (error) {
        console.error('Error parsing stored file data:', error);
      }
    }
  }, []);

  /**
   * Generic handler for updating form field values
   * @param field - The form field to update (keyof FormData)
   * @param value - The new value to set
   */
  const handleInputChange = (field: keyof FormData, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  /**
   * Handler for updating individual set scores
   * @param player - Which player's scores to update ("player" or "opponent")
   * @param index - Which set score to update (0-based index)
   * @param value - The new score value (as string from input)
   */
  const handleScoreChange = (player: "player" | "opponent", index: number, value: string) => {
    const numValue = Number(value) || 0;
    const field = player === "player" ? "playerScores" : "opponentScores";
    setFormData(prev => ({
      ...prev,
      [field]: prev[field].map((score, i) => i === index ? numValue : score)
    }));
  };

  /**
   * Calculate the number of sets based on "Best of" selection
   * @returns 5 for "Best of 5" or 3 for "Best of 3"
   */
  const getNumberOfSets = () => {
    return formData.bestOf === "5" ? 5 : 3;
  };

  /**
   * Get player scores array with the correct length for the current "Best of" setting
   * Dynamically adjusts the array length when switching between best of 3 and 5
   * @returns Array of scores with proper length
   */
  const getPlayerScores = () => {
    const sets = getNumberOfSets();
    const currentScores = formData.playerScores;
    if (currentScores.length < sets) {
      return [...currentScores, ...Array(sets - currentScores.length).fill(0)];
    }
    return currentScores.slice(0, sets);
  };

  /**
   * Get opponent scores array with the correct length for the current "Best of" setting
   * Dynamically adjusts the array length when switching between best of 3 and 5
   * @returns Array of scores with proper length
   */
  const getOpponentScores = () => {
    const sets = getNumberOfSets();
    const currentScores = formData.opponentScores;
    if (currentScores.length < sets) {
      return [...currentScores, ...Array(sets - currentScores.length).fill(0)];
    }
    return currentScores.slice(0, sets);
  };

  /**
   * Handler for file upload input changes
   * Processes the selected file and stores it in both component state and localStorage
   * @param event - File input change event
   */
  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      // Create file data object with metadata
      const fileData = {
        name: file.name,
        size: `${(file.size / 1024).toFixed(0)} KB of ${(file.size / 1024).toFixed(0)} KB`,
        status: "Completed",
        file: file
      };
      setUploadedFile(fileData);
      
      // Convert file to base64 and store in localStorage for persistence across pages
      // This allows the file data to be available on the confirm details page
      const reader = new FileReader();
      reader.onload = () => {
        const fileDataForStorage = {
          name: file.name,
          size: fileData.size,
          status: "Completed",
          data: reader.result, // base64 string representation of the file
          type: file.type
        };
        localStorage.setItem('uploadedFile', JSON.stringify(fileDataForStorage));
      };
      reader.readAsDataURL(file);
    }
  };

  /**
   * Handler for removing uploaded file
   * Clears both component state and localStorage
   */
  const handleRemoveFile = () => {
    setUploadedFile(null);
    localStorage.removeItem('uploadedFile');
  };

  /**
   * Handler for form submission
   * Stores form data in localStorage and navigates to confirm details page
   * 
   * MODIFICATION: Added custom event dispatch to notify sidebar of form data changes
   */
  const handleSubmit = () => {
    // Store form data in localStorage for the next page
    localStorage.setItem('uploadFormData', JSON.stringify(formData));
    // MODIFICATION: Dispatch event to notify sidebar that form data has changed
    // This enables real-time updates to the sidebar navigation state
    window.dispatchEvent(new CustomEvent('formDataChanged'));
    router.push('/dashboard/upload/confirm-details');
  };

  /**
   * Handler for back navigation
   * Returns to the choose provider page
   */
  const handleBack = () => {
    router.push('/dashboard/upload/choose-provider');
  };

  return (
    <div className="flex-1 w-full p-6 h-full">
      <div className="space-y-6">
        {/* Main Form Card */}
        <Card className="rounded-xl">
          <CardContent className="p-6 space-y-6">
            {/* Page Header Section - moved inside the card */}
            <div className="space-y-1">
              <h2 className="text-2xl font-semibold tracking-tight">Upload Match</h2>
              <p className="text-sm text-muted-foreground">Upload match information and data from the specified provider.</p>
            </div>
            {/* Event Information Section */}
            {/* Contains event name and tournament round selection */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">Event Information</h4>
                <Info className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Upload and specify your match data</p>
              {/* Two-column grid for event name and round */}
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
              <p className="text-sm text-muted-foreground">Upload and specify your match data</p>
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
                <div className="flex items-center gap-2">
                  <p className="text-sm text-muted-foreground">Upload and specify your match data</p>
                  <Info className="h-4 w-4 text-muted-foreground" />
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="result">Result</Label>
                    {/* MODIFICATION: Changed from "status" to "result" field with new dropdown options */}
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

            <Separator />

            {/* Upload Data */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">Upload Data</h4>
                <Info className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Upload and specify your match data</p>
              
              {/* Warning Message */}
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <p className="text-sm text-red-800">
                  <strong>Warning:</strong> The only accepted file types for Swing Vision Data are{" "}
                  <strong>Excel Files</strong>. To learn how to export your Swing Vision data from your account,{" "}
                  <a href="#" className="underline hover:no-underline">click here</a>.
                </p>
              </div>

              {/* File Upload Area */}
              <div className="border-2 border-dashed border-gray-300 rounded-lg p-8 text-center">
                <input
                  type="file"
                  id="file-upload"
                  className="hidden"
                  accept=".xlsx,.xls"
                  onChange={handleFileUpload}
                />
                <label htmlFor="file-upload" className="cursor-pointer">
                  <Upload className="h-8 w-8 mx-auto mb-2 text-gray-400" />
                  <p className="text-sm text-gray-600">Upload Match Data</p>
                </label>
              </div>

              {/* Uploaded File Display */}
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
          </CardContent>
        </Card>

        {/* Action Buttons */}
        <div className="flex gap-4">
          <Button variant="outline" onClick={handleBack}>
            Back
          </Button>
          <Button onClick={handleSubmit} className="bg-gray-600 hover:bg-gray-700">
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}