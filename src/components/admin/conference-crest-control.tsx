"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Camera, Crop, Trash2, Upload } from "lucide-react";
import { ChromeTooltip } from "@/components/dashboard/shared/chrome-tooltip";
import { ImageAdjustDialog } from "@/components/dashboard/settings/image-adjust-dialog";
import { ConferenceMark } from "@/components/admin/conference-mark";
import { MENU_ROW_ICON } from "@/components/admin/request-drawer";
import { FloatMenu, FloatMenuItem } from "@/components/ui/float-menu";
import { fetchImageFile } from "@/lib/ui/image-adjust";
import {
  adminRemoveConferenceCrest,
  adminUploadConferenceCrest,
} from "@/lib/services/programs/admin-conference-crest-actions";

const ACCEPT = "image/png,image/jpeg,image/webp,image/svg+xml";

/** Edge of the square the adjust dialog bakes — `CrestControl`'s value. */
const CREST_EDGE_PX = 512;

/**
 * A conference's 40px mark as a control — the Conference drawer's head and
 * the Add conference dialog.
 *
 * A sibling of `CrestControl` (Settings › Teams, admin team header) rather
 * than a use of it: that component is program-shaped — it posts `programId`,
 * calls `remove(programId)` and draws `ProgramCrest` — and a conference's
 * mark is `ConferenceMark`. The pieces are the same ones: one hidden file
 * input, `ImageAdjustDialog` to place and back the image, then the baked
 * square goes to the server.
 *
 * The mark is the button. With no crest it opens the file picker; with one it
 * opens a small menu: Replace, Adjust, Remove.
 *
 * Two modes:
 *  - **live** (`conferenceId`): every pick is written at once through the
 *    admin crest actions, then `onChanged()` so the page refreshes.
 *  - **staged** (`onStage`): nothing is written — the baked image is handed
 *    up and previewed here, and the Add dialog uploads it once the conference
 *    exists.
 */
export function ConferenceCrestControl({
  name,
  shortName,
  crestUrl,
  conferenceId,
  onChanged,
  onStage,
  onError,
  disabled = false,
}: {
  name: string;
  shortName: string | null;
  /** The crest drawn now (live mode). Ignored in staged mode. */
  crestUrl?: string | null;
  conferenceId?: string;
  onChanged?: () => void;
  /** Staged mode: the baked crest, or null when removed. */
  onStage?: (crest: Blob | null) => void;
  onError: (message: string | null) => void;
  disabled?: boolean;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [pending, startTransition] = useTransition();
  const [adjusting, setAdjusting] = useState<File | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const staged = !conferenceId;
  const [stagedUrl, setStagedUrl] = useState<string | null>(null);
  // The object URL is ours to free — on replace and on unmount.
  useEffect(() => {
    return () => {
      if (stagedUrl) URL.revokeObjectURL(stagedUrl);
    };
  }, [stagedUrl]);

  const shown = staged ? stagedUrl : (crestUrl ?? null);
  const busy = pending || disabled;

  const submit = (baked: Blob) => {
    onError(null);
    if (staged) {
      setStagedUrl(URL.createObjectURL(baked));
      onStage?.(baked);
      setAdjusting(null);
      return;
    }
    const ext = baked.type === "image/webp" ? "webp" : "png";
    const formData = new FormData();
    formData.set("conferenceId", conferenceId);
    formData.set(
      "file",
      new File([baked], `crest.${ext}`, { type: baked.type }),
    );
    startTransition(async () => {
      const result = await adminUploadConferenceCrest(formData).catch(
        () => ({ ok: false, error: "Couldn't upload the crest." }) as const,
      );
      if (!result.ok) {
        onError(result.error);
        return;
      }
      setAdjusting(null);
      onChanged?.();
    });
  };

  const remove = () => {
    onError(null);
    if (staged) {
      setStagedUrl(null);
      onStage?.(null);
      return;
    }
    startTransition(async () => {
      const result = await adminRemoveConferenceCrest(conferenceId).catch(
        () => ({ ok: false, error: "Couldn't remove the crest." }) as const,
      );
      if (!result.ok) onError(result.error);
      else onChanged?.();
    });
  };

  /** Reopen the crest that is up now. The bucket is public and sends CORS. */
  const adjustCurrent = async () => {
    if (!shown) return;
    onError(null);
    try {
      setAdjusting(await fetchImageFile(shown, "crest"));
    } catch {
      onError("Couldn't load the current crest. Upload it again instead.");
    }
  };

  const pick = () => inputRef.current?.click();
  const label = shown ? "Change the crest" : "Upload a crest";

  const markButton = (
    <button
      type="button"
      aria-label={label}
      aria-haspopup={shown ? "menu" : undefined}
      aria-expanded={shown ? menuOpen : undefined}
      disabled={busy}
      onClick={shown ? undefined : pick}
      className="group relative shrink-0 cursor-pointer overflow-hidden rounded-[var(--radius-element)] focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
    >
      <ConferenceMark
        name={name || "?"}
        shortName={shortName}
        crestUrl={shown}
        size={40}
      />
      {/* A finger has no hover: on touch the wash shows only under the press. */}
      <span
        aria-hidden="true"
        className="absolute inset-0 flex items-center justify-center bg-[rgba(13,13,13,0.55)] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100 touch:group-active:opacity-100"
      >
        {shown ? (
          <Camera className="size-3.5" strokeWidth={1.5} />
        ) : (
          <Upload className="size-3.5" strokeWidth={1.5} />
        )}
      </span>
    </button>
  );

  return (
    <>
      {shown ? (
        <ChromeTooltip label={label} hidden={menuOpen}>
          <span className="inline-flex shrink-0">
            <FloatMenu
              open={menuOpen}
              onOpenChange={setMenuOpen}
              label="Crest"
              align="start"
              width={196}
              trigger={markButton}
            >
              <FloatMenuItem
                label="Replace the crest"
                icon={
                  <Upload
                    className={MENU_ROW_ICON}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                }
                onSelect={() => {
                  setMenuOpen(false);
                  pick();
                }}
              />
              <FloatMenuItem
                label="Adjust"
                icon={
                  <Crop
                    className={MENU_ROW_ICON}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                }
                onSelect={() => {
                  setMenuOpen(false);
                  void adjustCurrent();
                }}
              />
              <FloatMenuItem
                label="Remove the crest"
                icon={
                  <Trash2
                    className={MENU_ROW_ICON}
                    strokeWidth={1.5}
                    aria-hidden
                  />
                }
                onSelect={() => {
                  setMenuOpen(false);
                  remove();
                }}
              />
            </FloatMenu>
          </span>
        </ChromeTooltip>
      ) : (
        <ChromeTooltip label={label}>{markButton}</ChromeTooltip>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
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
        saving={pending}
        onSave={submit}
        onCancel={() => setAdjusting(null)}
        onChooseAnother={pick}
      />
    </>
  );
}
