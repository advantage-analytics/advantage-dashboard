"use client";

/**
 * DetailsContent - Step 4 content
 * Match details form with event info, scoring format, and match info
 */

import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Separator } from "@/components/ui/separator";
import { Info } from "lucide-react";
import { FormData } from "./types";
import { getAdjustedScores } from "./utils";

export interface DetailsContentProps {
  formData: FormData;
  onInputChange: (field: keyof FormData, value: any) => void;
  onScoreChange: (player: "player" | "opponent", index: number, value: string) => void;
}

export function DetailsContent({ formData, onInputChange, onScoreChange }: DetailsContentProps) {
  const playerScores = getAdjustedScores(formData.playerScores, formData.bestOf);
  const opponentScores = getAdjustedScores(formData.opponentScores, formData.bestOf);

  return (
    <Card className="rounded-xl">
      <CardContent className="p-6 space-y-6">
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
                onChange={(e) => onInputChange("eventName", e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="round">Round</Label>
              <Select
                value={formData.round}
                onValueChange={(value) => onInputChange("round", value)}
              >
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
              <Select
                value={formData.bestOf}
                onValueChange={(value) => onInputChange("bestOf", value)}
              >
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
                  onChange={(e) => onInputChange("adScoring", e.target.checked)}
                  className="w-4 h-4 text-blue-600 bg-gray-100 border-gray-300 rounded focus:ring-blue-500 focus:ring-2"
                />
              </div>
              <div className="space-y-1.5 flex flex-col items-center">
                <Label htmlFor="playOnLets" className="text-center">Play on Lets</Label>
                <input
                  type="checkbox"
                  id="playOnLets"
                  checked={formData.playOnLets}
                  onChange={(e) => onInputChange("playOnLets", e.target.checked)}
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
                <Select
                  value={formData.result}
                  onValueChange={(value) => onInputChange("result", value)}
                >
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
                  onChange={(e) => onInputChange("playerName", e.target.value)}
                  placeholder="Player Name"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="opponentName">Opponent</Label>
                <Input
                  id="opponentName"
                  value={formData.opponentName}
                  onChange={(e) => onInputChange("opponentName", e.target.value)}
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
                  onChange={(e) => onInputChange("date", e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label>Player Score</Label>
                <div className="flex gap-2">
                  {playerScores.map((score, i) => (
                    <Input
                      key={i}
                      className={`text-center ${formData.bestOf === "3" ? "flex-1" : "w-12"}`}
                      value={score}
                      onChange={(e) => onScoreChange("player", i, e.target.value)}
                    />
                  ))}
                </div>
              </div>
              <div className="space-y-1.5">
                <Label>Opponent Score</Label>
                <div className="flex gap-2">
                  {opponentScores.map((score, i) => (
                    <Input
                      key={i}
                      className={`text-center ${formData.bestOf === "3" ? "flex-1" : "w-12"}`}
                      value={score}
                      onChange={(e) => onScoreChange("opponent", i, e.target.value)}
                    />
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
