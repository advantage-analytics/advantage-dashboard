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
  result: string;          // Match result (Completed, Retired, Unfinished)
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
 * ConfirmDetailsForm Component - Step 3 of Upload Flow
 * 
 * This component displays a summary of all the match information entered by the user
 * and allows them to confirm and create the match in the database.
 * 
 * MAJOR MODIFICATIONS MADE IN THIS SESSION:
 * 1. Added form completion validation - shows warning message if form is incomplete
 * 2. Locked "Private Match" switch to always be true and disabled user interaction
 * 3. Changed redirect destination from /dashboard to /dashboard/profile after match creation
 * 4. Restructured match data to store format information in JSONB column instead of separate fields
 * 5. Added winner/loser determination logic based on scores
 * 6. Changed "status" field to "result" throughout the component
 * 7. Added Card wrapper with rounded-xl styling to match other pages
 * 8. Enhanced error handling and user feedback
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
  
  // State for private match toggle - always true and locked
  // MODIFICATION: Changed from false to true and locked the switch
  const [isPrivateMatch, setIsPrivateMatch] = useState(true);
  
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
   * MODIFICATION: Added form completion validation function
   * Checks if all required fields are filled out before allowing user to proceed
   * Required fields: playerName, opponentName, eventName, date
   * 
   * @param data - The form data to validate
   * @returns true if form is complete, false otherwise
   */
  const isFormComplete = (data: FormData | null): boolean => {
    if (!data) return false;
    
    // Check required fields
    const requiredFields = [
      data.playerName?.trim(),
      data.opponentName?.trim(),
      data.eventName?.trim(),
      data.date?.trim()
    ];
    
    // All required fields must have non-empty values
    return requiredFields.every(field => field && field.length > 0);
  };

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

      /**
       * MODIFICATION: Added winner/loser determination logic
       * Analyzes scores to determine who won and who lost the match
       * Winner becomes player1, loser becomes player2 in the database
       */
      const determineWinner = (playerScores: number[], opponentScores: number[], bestOf: number) => {
        const setsToWin = Math.ceil(bestOf / 2); // 2 sets for best of 3, 3 sets for best of 5
        
        let playerSetsWon = 0;
        let opponentSetsWon = 0;
        
        // Count sets won by each player
        for (let i = 0; i < Math.min(playerScores.length, opponentScores.length); i++) {
          if (playerScores[i] > opponentScores[i]) {
            playerSetsWon++;
          } else if (opponentScores[i] > playerScores[i]) {
            opponentSetsWon++;
          }
        }
        
        // Determine winner (player with more sets won)
        const playerWon = playerSetsWon > opponentSetsWon;
        
        return {
          winner: playerWon ? {
            id: user.id,
            name: formData.playerName,
            scores: formData.playerScores
          } : {
            id: null, // Opponent doesn't have an ID in our system yet
            name: formData.opponentName,
            scores: formData.opponentScores
          },
          loser: playerWon ? {
            id: null, // Opponent doesn't have an ID in our system yet
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

      // MODIFICATION: Prepare match data object for database insertion
      // This structure matches the matches table schema with winner/loser logic
      const matchData = {
        id: matchId,                           // Unique UUID for the match
        player1_id: winner.id,                 // Winner's ID (or null if opponent)
        player1_name: winner.name,             // Winner's name
        player2_id: loser.id,                  // Loser's ID (or null if opponent)
        player2_name: loser.name,              // Loser's name
        date: formData.date,                   // Match date
        round: formData.round,                 // Tournament round
        result: formData.result,               // MODIFICATION: Changed from "status" to "result"
        score: {                               // JSON object containing both players' scores
          player1: winner.scores,
          player2: loser.scores
        },
        tournament_name: formData.eventName,   // Event/tournament name
        format: {                              // MODIFICATION: JSONB column containing format information
          best_of: parseInt(formData.bestOf),
          ad_scoring: formData.adScoring,
          play_on_lets: formData.playOnLets
        },
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
      
      // MODIFICATION: Changed redirect from dashboard home to profile page
      // Redirect to profile page after successful match creation
      router.push('/dashboard/profile');
      
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

  // MODIFICATION: Added form completion check to show "fill out form" message when incomplete
  // Show fill out form message if form is incomplete
  if (!isFormComplete(formData)) {
    return (
      <div className="flex-1 w-full p-6 h-full">
        <div className="space-y-6">
          <div className="space-y-1">
            <h2 className="text-2xl font-semibold tracking-tight">Confirm Details</h2>
            <p className="text-sm text-muted-foreground">Complete your match details to proceed</p>
          </div>
          
          {/* MODIFICATION: Added yellow warning card for incomplete form */}
          <div className="text-center py-12">
            <div className="max-w-md mx-auto">
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6">
                <div className="flex items-center justify-center w-12 h-12 mx-auto mb-4 bg-yellow-100 rounded-full">
                  <Info className="h-6 w-6 text-yellow-600" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900 mb-2">Complete Your Match Details</h3>
                <p className="text-gray-600 mb-4">
                  Please go back and fill out all required fields in the match details form before confirming.
                </p>
                <p className="text-sm text-gray-500 mb-6">
                  Required fields: Player Name, Opponent Name, Event Name, and Date
                </p>
                <Button onClick={handleBack} className="w-full">
                  Go Back to Fill Out Form
                </Button>
              </div>
            </div>
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
        {/* Main Form Card - matching the styling from match details page */}
        <Card className="rounded-xl">
          <CardContent className="p-6 space-y-6">
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
                {/* Result and Date */}
                <div className="flex items-center gap-4">
                  <span className="text-gray-900 font-medium">{formData.result}</span>
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
              {/* MODIFICATION: Locked private match switch to always be true */}
              <Switch
                checked={isPrivateMatch}
                onCheckedChange={() => {}} // Disabled - no action
                disabled={true}
                className="opacity-50 cursor-not-allowed"
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
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
