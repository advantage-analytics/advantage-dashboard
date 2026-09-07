"use client";

import { useRef, useTransition } from "react";
import { Camera } from "lucide-react";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import {
  removeProgramCrest,
  uploadProgramCrest,
} from "@/components/dashboard/settings/team-actions";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

/**
 * The 52px crest at the head of the identity card, as a control.
 *
 * The mark itself is the button — hover paints a camera over it — and the
 * words beside it say what to upload. One hidden file input serves both; the
 * form posts the moment a file is chosen, because a crest is one file and a
 * second "Save" for it would be a step with nothing to decide.
 */
export function CrestControl({
  programId,
  name,
  crestUrl,
  onError,
}: {
  programId: string;
  name: string;
  crestUrl: string | null;
  onError: (message: string | null) => void;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();

  const submit = (file: File) => {
    const formData = new FormData();
    formData.set("programId", programId);
    formData.set("file", file);
    onError(null);
    startTransition(async () => {
      const result = await uploadProgramCrest(formData);
      if (!result.ok) onError(result.error);
    });
  };

  const remove = () => {
    onError(null);
    startTransition(async () => {
      const result = await removeProgramCrest(programId);
      if (!result.ok) onError(result.error);
    });
  };

  return (
    <div className="flex items-center gap-4">
      <button
        type="button"
        aria-label="Change the team crest"
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
        className="group relative shrink-0 cursor-pointer overflow-hidden rounded-[8px] focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
      >
        <ProgramCrest name={name} crestUrl={crestUrl} size={52} />
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-[rgba(13,13,13,0.55)] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Camera className="size-4" strokeWidth={1.5} />
        </span>
      </button>

      <div className="min-w-0 flex-1">
        <div className="text-[13px] font-medium text-[var(--ink-900)]">
          Team identity
        </div>
        <div className="mt-[3px] text-[11px] text-[var(--ink-500)]">
          Crest, name and home courts — used on team match cards, the roster
          and shared reports.
        </div>
        <div className="mt-[7px] flex items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] focus-visible:outline-none disabled:opacity-50"
          >
            {crestUrl ? "Replace the crest" : "Upload a crest"}
          </button>
          {crestUrl && (
            <button
              type="button"
              disabled={isPending}
              onClick={remove}
              className="cursor-pointer text-[11px] font-medium text-[var(--ink-600)] hover:text-[var(--ink-900)] focus-visible:outline-none disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <span className="text-[11px] text-[var(--ink-400)]">
            PNG, JPG, WebP or SVG · square · under 512 KB
          </span>
        </div>
      </div>

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        onChange={(event) => {
          const file = event.target.files?.[0];
          // Reset so choosing the same file again still fires a change.
          event.target.value = "";
          if (file) submit(file);
        }}
      />
    </div>
  );
}
