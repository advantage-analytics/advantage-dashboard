"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Separator } from "@/components/ui/separator";
import { Info, Upload, Trash2, Check } from "lucide-react";

interface FormData {
  eventName: string;
  round: string;
  bestOf: string;
  adScoring: boolean;
  playOnLets: boolean;
  status: string;
  date: string;
  playerName: string;
  opponentName: string;
  playerScores: number[];
  opponentScores: number[];
}

export default function UploadForm() {
  const router = useRouter();
  const [formData, setFormData] = useState<FormData>({
    eventName: "ATP 250 Shanghi",
    round: "16",
    bestOf: "3",
    adScoring: false,
    playOnLets: false,
    status: "Completed",
    date: "04/25/2003",
    playerName: "",
    opponentName: "",
    playerScores: [0, 0, 0],
    opponentScores: [0, 0, 0]
  });

  const [uploadedFile, setUploadedFile] = useState<{
    name: string;
    size: string;
    status: string;
  } | null>({
    name: "rudy-quan.xlsx",
    size: "438 KB of 438 KB",
    status: "Completed"
  });

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

  const handleFileUpload = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setUploadedFile({
        name: file.name,
        size: `${(file.size / 1024).toFixed(0)} KB of ${(file.size / 1024).toFixed(0)} KB`,
        status: "Completed"
      });
    }
  };

  const handleRemoveFile = () => {
    setUploadedFile(null);
  };

  const handleSubmit = () => {
    // Store form data and navigate to next step
    localStorage.setItem('uploadFormData', JSON.stringify(formData));
    router.push('/dashboard/upload/confirm-details');
  };

  const handleBack = () => {
    router.push('/dashboard/upload/choose-provider');
  };

  return (
    <div className="flex-1 w-full p-6 h-full">
      <div className="space-y-6">
        <div className="space-y-1">
          <h2 className="text-2xl font-semibold tracking-tight">Upload Match</h2>
          <p className="text-sm text-muted-foreground">Upload match information and data from the specified provider.</p>
        </div>

        <Card className="rounded-xl">
          <CardContent className="p-6 space-y-6">
            {/* Event Information */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">Event Information</h4>
                <Info className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Upload and specify your match data</p>
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
                    <SelectTrigger>
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
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="bestOf">Best of...</Label>
                  <Select value={formData.bestOf} onValueChange={(value) => handleInputChange("bestOf", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="3">3</SelectItem>
                      <SelectItem value="5">5</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="adScoring"
                    checked={formData.adScoring}
                    onCheckedChange={(checked) => handleInputChange("adScoring", checked)}
                  />
                  <Label htmlFor="adScoring">Ad Scoring</Label>
                </div>
                <div className="flex items-center space-x-2">
                  <Switch
                    id="playOnLets"
                    checked={formData.playOnLets}
                    onCheckedChange={(checked) => handleInputChange("playOnLets", checked)}
                  />
                  <Label htmlFor="playOnLets">Play on Lets</Label>
                </div>
              </div>
            </div>

            <Separator />

            {/* Match Information */}
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <h4 className="font-semibold">Match Information</h4>
                <Info className="h-4 w-4 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">Upload and specify your match data</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label htmlFor="status">Status</Label>
                  <Select value={formData.status} onValueChange={(value) => handleInputChange("status", value)}>
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Completed">Completed</SelectItem>
                      <SelectItem value="In Progress">In Progress</SelectItem>
                      <SelectItem value="Scheduled">Scheduled</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="date">Date</Label>
                  <Input
                    id="date"
                    value={formData.date}
                    onChange={(e) => handleInputChange("date", e.target.value)}
                  />
                </div>
              </div>

              {/* Player Information */}
              <div className="space-y-3">
                <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
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
                    <Label>Game Score</Label>
                    <div className="flex gap-2">
                      {formData.playerScores.map((score, i) => (
                        <Input
                          key={i}
                          className="w-12 text-center"
                          value={score}
                          onChange={(e) => handleScoreChange("player", i, e.target.value)}
                        />
                      ))}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-[1fr_auto] gap-4 items-center">
                  <div className="space-y-1.5">
                    <Label htmlFor="opponentName">Opponent</Label>
                    <Input
                      id="opponentName"
                      value={formData.opponentName}
                      onChange={(e) => handleInputChange("opponentName", e.target.value)}
                      placeholder="Opponent Name"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Game Score</Label>
                    <div className="flex gap-2">
                      {formData.opponentScores.map((score, i) => (
                        <Input
                          key={i}
                          className="w-12 text-center"
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