"use client";

import { useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { ImageAdjustDialog } from "@/components/dashboard/settings/image-adjust-dialog";
import { fetchImageFile } from "@/lib/ui/image-adjust";
import { ProgramCrest } from "@/components/dashboard/settings/teams/program-crest";
import {
  removeProgramCrest,
  uploadProgramCrest,
} from "@/components/dashboard/settings/team-actions";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

/** Edge of the square the dialog bakes. Drawn at 38–52px; 512 leaves room. */
const CREST_EDGE_PX = 512;

/**
 * The 52px crest at the head of the identity card, as a control.
 *
 * The mark itself is the button — hover paints a camera over it — and the
 * words beside it say what to upload. One hidden file input serves both.
 * Choosing a file opens the adjust dialog rather than uploading: an SVG crest
 * is usually off-centre inside its own canvas with nothing behind it, and
 * uploaded as-is it came out small, lopsided and on the grey tile. Save bakes
 * the placed, backed square and posts that. "Adjust" reopens the current
 * crest so a nudge does not mean finding the file again.
 *
 * `upload` and `remove` default to the Settings actions, so every existing
 * caller and test is untouched. The admin console passes the `admin*` pair,
 * which run the identical upload → `set_program_crest` → delete-the-old
 * sequence (rollback included) but authorize on `requireAdmin()` and do their
 * storage writes with the service-role key, because the `program-crests`
 * bucket policy is member-scoped and an admin is not a member.
 */
export function CrestControl({
  programId,
  name,
  crestUrl,
  onError,
  upload = uploadProgramCrest,
  remove: removeAction = removeProgramCrest,
}: {
  programId: string;
  name: string;
  crestUrl: string | null;
  onError: (message: string | null) => void;
  upload?: typeof uploadProgramCrest;
  remove?: typeof removeProgramCrest;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [adjusting, setAdjusting] = useState<File | null>(null);

  const submit = (baked: Blob) => {
    const ext = baked.type === "image/webp" ? "webp" : "png";
    const formData = new FormData();
    formData.set("programId", programId);
    formData.set(
      "file",
      new File([baked], `crest.${ext}`, { type: baked.type }),
    );
    onError(null);
    startTransition(async () => {
      const result = await upload(formData);
      if (!result.ok) onError(result.error);
      else setAdjusting(null);
    });
  };

  const remove = () => {
    onError(null);
    startTransition(async () => {
      const result = await removeAction(programId);
      if (!result.ok) onError(result.error);
    });
  };

  /** Reopen the crest that is up now. The bucket is public and sends CORS. */
  const adjustCurrent = async () => {
    if (!crestUrl) return;
    onError(null);
    try {
      setAdjusting(await fetchImageFile(crestUrl, "crest"));
    } catch {
      onError("Couldn't load the current crest. Upload it again instead.");
    }
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
          Crest, name and home courts — used on team match cards, the roster and
          shared reports.
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
              onClick={adjustCurrent}
              className="cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] focus-visible:outline-none disabled:opacity-50"
            >
              Adjust
            </button>
          )}
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
            PNG, JPG, WebP or SVG · under 512 KB
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
          if (file) {
            onError(null);
            setAdjusting(file);
          }
        }}
      />

      <ImageAdjustDialog
        open={adjusting !== null}
        file={adjusting}
        shape="square"
        outputEdge={CREST_EDGE_PX}
        saving={isPending}
        onSave={submit}
        onCancel={() => setAdjusting(null)}
        onChooseAnother={() => inputRef.current?.click()}
      />
    </div>
  );
}
