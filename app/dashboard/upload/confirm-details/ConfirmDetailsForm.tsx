"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Info, Check, Trash2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

/**
 * Interface defining the structure of form data for match uploads
 * This matches the FormData interface from the upload form
 */
interface FormData {
  eventName: string;        // Name of the tournament/event
  round: string;           // Tournament round (e.g., "16", "Quarterfinal")
  bestOf: string;          // Best of 3 or 5 sets
  adScoring: boolean;      // Whether to use ad scoring (deuce advantage)
  playOnLets: boolean;     // Whether to replay points on lets
  status: string;          // Match status (Completed, In Progress, Scheduled)
  date: string;            // Match date
  playerName: string;      // Name of the primary player
  opponentName: string;    // Name of the opponent
  playerScores: number[];  // Array of set scores for the primary player
  opponentScores: number[]; // Array of set scores for the opponent
}

/**
 * Interface for uploaded file data structure
 * Contains file metadata and the actual File object
 */
interface UploadedFile {
  name: string;           // Original filename
  size: string;           // Human-readable file size
  status: string;         // Upload status (e.g., "Completed")
  file: File | null;      // The actual File object (may be null if loaded from localStorage)
}

/**
 * ConfirmDetailsForm Component
 * 
 * This component displays a summary of all the match information entered by the user
 * and allows them to confirm and create the match in the database.
 * 
 * Features:
 * - Displays all form data in a clean, organized layout
 * - Shows uploaded file information
 * - Handles match creation with Supabase integration
 * - Manages file uploads to Supabase Storage
 * - Creates records in both matches and match_files tables
 */
export default function ConfirmDetailsForm() {
  const router = useRouter();
  
  // State for form data loaded from localStorage
  const [formData, setFormData] = useState<FormData | null>(null);
  
  // State for uploaded file information
  const [uploadedFile, setUploadedFile] = useState<UploadedFile | null>(null);
  
  // State for private match toggle
  const [isPrivateMatch, setIsPrivateMatch] = useState(false);
  
  // State for loading indicator during match creation
  const [isCreating, setIsCreating] = useState(false);
  
  // State for error messages
  const [error, setError] = useState<string | null>(null);

  /**
   * Load form data and uploaded file from localStorage on component mount
   * This data was stored by the previous upload form page
   */
  useEffect(() => {
    const storedData = localStorage.getItem('uploadFormData');
    const storedFile = localStorage.getItem('uploadedFile');
    
    if (storedData) {
      setFormData(JSON.parse(storedData));
    }
    
    if (storedFile) {
      setUploadedFile(JSON.parse(storedFile));
    }
  }, []);

  /**
   * Main handler for creating a match in the database
   * This function:
   * 1. Validates form data exists
   * 2. Gets the current authenticated user
   * 3. Generates a unique match ID
   * 4. Creates the match record in the matches table
   * 5. Handles file upload to Supabase Storage (if file exists)
   * 6. Creates file record in match_files table
   * 7. Redirects to dashboard on success
   */
  const handleCreateMatch = async () => {
    // Validate that form data exists
    if (!formData) {
      setError("No form data found. Please go back and fill out the form.");
      return;
    }

    setIsCreating(true);
    setError(null);

    try {
      const supabase = createClient();
      
      // Get current authenticated user
      const { data: { user }, error: userError } = await supabase.auth.getUser();
      if (userError || !user) {
        throw new Error("User not authenticated");
      }

      // Get user's current match count to determine index
      // This could be used for generating sequential match IDs if needed
      const { data: existingMatches, error: countError } = await supabase
        .from("matches")
        .select("id")
        .eq("player1_id", user.id);

      // Generate a completely new UUID for the match ID
      // This ensures each match has a unique identifier
      const matchId = crypto.randomUUID();

      // Prepare match data object for database insertion
      // This structure matches the matches table schema
      const matchData = {
        id: matchId,                           // Unique UUID for the match
        player1_id: user.id,                   // Current user's ID
        player1_name: formData.playerName,     // Player's name from form
        player2_id: null,                      // Opponent ID (null for now)
        player2_name: formData.opponentName,   // Opponent's name from form
        date: formData.date,                   // Match date
        round: formData.round,                 // Tournament round
        score: {                               // JSON object containing both players' scores
          player1: formData.playerScores,
          player2: formData.opponentScores
        },
        tournament_name: formData.eventName,   // Event/tournament name
        best_of: parseInt(formData.bestOf),    // Best of 3 or 5 sets
        ad_scoring: formData.adScoring,        // Ad scoring preference
        play_on_lets: formData.playOnLets,     // Play on lets preference
        private: isPrivateMatch                // Private match setting
      };

      // Insert match record into the matches table
      console.log("Attempting to insert match data:", matchData);
      const { error: matchError } = await supabase
        .from("matches")
        .insert(matchData);

      if (matchError) {
        console.error("Supabase insert error:", matchError);
        throw new Error(`Database error: ${matchError.message}`);
      }

      // Handle file upload if a file was uploaded
      console.log("Uploaded file data:", uploadedFile);
      if (uploadedFile && (uploadedFile as any).data) {
        try {
          // Convert base64 string back to binary blob for Supabase Storage upload
          // The file was stored as base64 in localStorage, so we need to convert it back
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

          // Upload file to Supabase Storage bucket
          const fileExt = uploadedFile.name.split('.').pop(); // Get file extension
          const fileName = `${matchId}.${fileExt}`; // Create filename with match ID
          const filePath = `matches/${matchId}/${fileName}`; // Storage path

          console.log("Uploading file to:", filePath);
          const { error: uploadError } = await supabase.storage
            .from('match-data')
            .upload(filePath, blob);

          if (uploadError) {
            console.error("File upload error:", uploadError);
          } else {
            console.log("File uploaded successfully");

            // Create record in match_files table to track the uploaded file
            const { error: fileRecordError } = await supabase
              .from("match_files")
              .insert({
                id: matchId,                    // Same as match ID
                match_id: matchId,             // Reference to the match
                file_type: (uploadedFile as any).type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
                file_name: uploadedFile.name,  // Original filename
                uploaded_by: user.id,          // User who uploaded the file
                uploaded_at: new Date().toISOString() // Upload timestamp
              });

            if (fileRecordError) {
              console.error("File record error:", fileRecordError);
            } else {
              console.log("File record created successfully");
            }
          }
        } catch (error) {
          console.error("Error processing file upload:", error);
        }
      }

      // Clear localStorage data since we've successfully processed it
      localStorage.removeItem('uploadFormData');
      localStorage.removeItem('uploadedFile');
      
      // Redirect to dashboard after successful match creation
      router.push('/dashboard');
      
    } catch (error) {
      console.error("Error creating match:", error);
      setError(error instanceof Error ? error.message : "Failed to create match");
    } finally {
      setIsCreating(false);
    }
  };

  /**
   * Handler for back navigation
   * Returns to the match details form page
   */
  const handleBack = () => {
    router.push('/dashboard/upload/match-details');
  };

  // Show loading/error state if no form data is available
  if (!formData) {
    return (
      <div className="flex-1 w-full p-6 h-full">
        <div className="space-y-6">
          <div className="text-center py-12">
            <p className="text-gray-600">No form data found. Please go back and fill out the form.</p>
            <Button onClick={handleBack} className="mt-4">
              Go Back
            </Button>
          </div>
        </div>
      </div>
    );
  }

  /**
   * Utility function to determine number of sets based on "Best of" selection
   * @returns 5 for "Best of 5" or 3 for "Best of 3"
   */
  const getNumberOfSets = () => {
    return formData.bestOf === "5" ? 5 : 3;
  };

  /**
   * Get player scores array with correct length for display
   * Truncates or extends the array based on the current "Best of" setting
   * @returns Array of player scores with proper length
   */
  const getPlayerScores = () => {
    const sets = getNumberOfSets();
    return formData.playerScores.slice(0, sets);
  };

  /**
   * Get opponent scores array with correct length for display
   * Truncates or extends the array based on the current "Best of" setting
   * @returns Array of opponent scores with proper length
   */
  const getOpponentScores = () => {
    const sets = getNumberOfSets();
    return formData.opponentScores.slice(0, sets);
  };

  return (
    <div className="flex-1 w-full p-6 h-full">
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Confirm Details</h2>
          <p className="text-sm text-muted-foreground">Confirm your match details and upload to your profile</p>
        </div>

        <div className="space-y-6">
          {/* Event Information */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">Event Information</h4>
              <Info className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-gray-900">
              {formData.eventName}, Round of {formData.round}
            </p>
          </div>

          {/* Scoring Format */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">Scoring Format</h4>
              <Info className="h-4 w-4 text-muted-foreground" />
            </div>
            <p className="text-gray-900">
              Best of {formData.bestOf} Sets
              {formData.adScoring && ", Ad Scoring"}
              {formData.playOnLets && ", Play on Lets"}
            </p>
          </div>

          {/* Match Information */}
          <div className="space-y-3">
            <div className="flex items-center gap-2">
              <h4 className="font-semibold">Match Information</h4>
              <Info className="h-4 w-4 text-muted-foreground" />
            </div>
            
            {/* Match Details Card */}
            <Card className="bg-gray-50">
              <CardContent className="p-4 space-y-3">
                {/* Status and Date */}
                <div className="flex items-center gap-4">
                  <span className="text-gray-900 font-medium">{formData.status}</span>
                  <span className="text-gray-900">{formData.date}</span>
                </div>

                {/* Player 1 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                      <span className="text-xs text-gray-600">P1</span>
                    </div>
                    <span className="text-gray-900">{formData.playerName}</span>
                  </div>
                  <div className="flex gap-2">
                    {getPlayerScores().map((score, i) => (
                      <span key={i} className="text-gray-900 font-medium">{score}</span>
                    ))}
                  </div>
                </div>

                {/* Player 2 */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                      <span className="text-xs text-gray-600">P2</span>
                    </div>
                    <span className="text-gray-900">{formData.opponentName}</span>
                  </div>
                  <div className="flex gap-2">
                    {getOpponentScores().map((score, i) => (
                      <span key={i} className="text-gray-900 font-medium">{score}</span>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Upload Data */}
          {uploadedFile && (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">Upload Data</h4>
                <Info className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Upload and specify your match data</p>
              
              <Card className="bg-gray-50">
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 bg-green-500 rounded flex items-center justify-center">
                        <span className="text-white text-xs font-bold">XLSX</span>
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{uploadedFile.name}</p>
                        <p className="text-xs text-gray-500">{uploadedFile.size}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="flex items-center gap-1 text-green-600">
                        <Check className="h-4 w-4" />
                        <span className="text-sm">{uploadedFile.status}</span>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          )}

          {/* Private Match */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="font-semibold">Private Match</h4>
                <p className="text-sm text-gray-500">Note: All matches will be private during our Beta Testing</p>
              </div>
              <Switch
                checked={isPrivateMatch}
                onCheckedChange={setIsPrivateMatch}
              />
            </div>
          </div>

          {/* Error Message */}
          {error && (
            <div className="bg-red-50 border border-red-200 rounded-lg p-4">
              <p className="text-sm text-red-800">{error}</p>
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex gap-4">
            <Button 
              onClick={handleCreateMatch} 
              disabled={isCreating}
              className="bg-gray-600 hover:bg-gray-700 w-full"
            >
              {isCreating ? "Creating Match..." : "Create Match"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
