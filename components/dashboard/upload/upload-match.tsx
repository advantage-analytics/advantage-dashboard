"use client";

import { useCallback, useMemo, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { createClient } from "@/lib/supabase/client";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type UploadKind = "data" | "video";

export function UploadMatch({ matchId }: { matchId?: string | null }) {
  const supabase = useMemo(() => createClient(), []);
  const [active, setActive] = useState<UploadKind>("data");
  const [isOver, setIsOver] = useState(false);
  const [sourceType, setSourceType] = useState<string>("Swingvision");
  const disabled = !matchId;

  const onDrop = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0 || !matchId) return;
    const file = files[0];
    const storagePath = `matches/${matchId}/${file.name}`;
    try {
      // Get authenticated user
      const { data: { user }, error: authError } = await supabase.auth.getUser();
      if (authError || !user) {
        throw new Error("Not authenticated");
      }

      // Upload to Supabase Storage first
      const { error: storageError } = await supabase.storage
        .from("match-data")
        .upload(storagePath, file, { upsert: true, contentType: file.type || undefined });
      if (storageError) throw storageError;

      if (active === "data") {
        const { error } = await supabase.from("match_files").insert({
          match_id: matchId,
          file_type: sourceType,
          file_name: file.name,
          uploaded_by: user.id,
        });
        if (error) {
          // eslint-disable-next-line no-console
          console.error("Insert error:", error);
          throw error;
        }
      } else {
        const { error } = await supabase.from("video_files").insert({
          match_id: matchId,
          video_type: sourceType,
          video_name: file.name,
          uploaded_by: user.id,
        });
        if (error) {
          // eslint-disable-next-line no-console
          console.error("Insert error:", error);
          throw error;
        }
      }
      // eslint-disable-next-line no-alert
      alert("File metadata uploaded");
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error(e);
      // eslint-disable-next-line no-alert
      alert("Upload failed. Check console.");
    }
  }, [active, matchId, supabase]);

  const handleDrop: React.DragEventHandler<HTMLDivElement> = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsOver(false);
    if (disabled) return;
    onDrop(e.dataTransfer?.files ?? null);
  };

  const handleChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
    if (disabled) return;
    onDrop(e.target.files);
    e.currentTarget.value = "";
  };

  return (
    <div className="space-y-3">
      <div className="space-y-1">
        <h3 className="text-2xl font-semibold tracking-tight">Upload Match</h3>
        <p className="text-sm text-muted-foreground">Upload and specify your match data</p>
      </div>

      <Tabs value={active} onValueChange={(v) => setActive(v as UploadKind)}>
        <TabsList>
          <TabsTrigger value="data">Data</TabsTrigger>
          <TabsTrigger value="video">Video</TabsTrigger>
        </TabsList>
      </Tabs>

      {/* Source/Data Type selector */}
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

      <Card className={"rounded-xl"}>
        <CardContent className="p-0">
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!disabled) setIsOver(true);
            }}
            onDragLeave={() => setIsOver(false)}
            onDrop={handleDrop}
            className={`border-2 border-dashed rounded-xl flex items-center justify-center h-52 text-sm text-muted-foreground ${
              isOver ? "border-primary bg-primary/5" : "border-gray-300"
            } ${disabled ? "opacity-50 cursor-not-allowed" : "cursor-pointer"}`}
          >
            <label className="w-full h-full flex items-center justify-center" htmlFor="upload-input">
              <div className="text-center select-none">
                <div className="text-xl mb-2">⬇️</div>
                <div>{disabled ? "Select a match to enable uploads" : "Upload your Match"}</div>
              </div>
              <input
                id="upload-input"
                type="file"
                disabled={disabled}
                onChange={handleChange}
                className="hidden"
                accept={active === "video" ? "video/*" : undefined}
              />
            </label>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default UploadMatch;


