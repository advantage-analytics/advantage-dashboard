"use client";

import { useRef, useState, useTransition } from "react";
import { Camera } from "lucide-react";
import { ImageAdjustDialog } from "@/components/dashboard/settings/image-adjust-dialog";
import { fetchImageFile } from "@/lib/ui/image-adjust";
import {
  removeAvatar,
  uploadAvatar,
} from "@/components/dashboard/settings/actions";
import { AVATAR_EDGE_PX, AVATAR_MAX_BYTES } from "@/lib/user/avatar";
import { WorkspaceMark } from "@/components/dashboard/workspace-mark";

const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * The profile photo as a control: the circle is the button, hover paints a
 * camera over it, and the words under the name say what to do.
 *
 * The same shape as the Teams crest control, except the mark is a circle —
 * the design system keeps circles for people and squares for programs.
 * Choosing a file opens the adjust dialog, which bakes the placed circle to
 * a `AVATAR_EDGE_PX` square before upload; a phone photo is several MB and
 * 4000px wide, and the circle is 80px. "Adjust" reopens the current photo.
 */
export function AvatarControl({
  initials,
  avatarUrl,
  onError,
  children,
}: {
  initials: string;
  avatarUrl: string | null;
  onError: (message: string | null) => void;
  /** Name, pills and meta — drawn beside the circle, above the links. */
  children: React.ReactNode;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isPending, startTransition] = useTransition();
  const [adjusting, setAdjusting] = useState<File | null>(null);

  const submit = (baked: Blob) => {
    if (baked.size > AVATAR_MAX_BYTES) {
      onError("Keep the photo under 2 MB.");
      return;
    }
    // A browser without a WebP encoder hands back PNG instead; name it for
    // what it actually is.
    const ext = baked.type === "image/webp" ? "webp" : "png";
    const formData = new FormData();
    formData.set(
      "file",
      new File([baked], `avatar.${ext}`, { type: baked.type }),
    );
    onError(null);
    startTransition(async () => {
      const result = await uploadAvatar(formData);
      if (!result.ok) onError(result.error);
      else setAdjusting(null);
    });
  };

  const remove = () => {
    onError(null);
    startTransition(async () => {
      const result = await removeAvatar();
      if (!result.ok) onError(result.error);
    });
  };

  /** Reopen the photo that is up now. The bucket is public and sends CORS. */
  const adjustCurrent = async () => {
    if (!avatarUrl) return;
    onError(null);
    try {
      setAdjusting(await fetchImageFile(avatarUrl, "avatar"));
    } catch {
      onError("Couldn't load the current photo. Upload it again instead.");
    }
  };

  return (
    <div className="flex min-w-0 flex-1 items-center gap-6">
      <button
        type="button"
        aria-label={avatarUrl ? "Change your photo" : "Upload a photo"}
        disabled={isPending}
        onClick={() => inputRef.current?.click()}
        className="group relative size-20 shrink-0 cursor-pointer overflow-hidden rounded-full bg-[var(--surface-subtle)] focus-visible:outline-none disabled:cursor-wait disabled:opacity-60"
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- a ≤2 MB photo at 80px from a public bucket; next/image has no host allow-listed
          <img
            src={avatarUrl}
            alt=""
            aria-hidden="true"
            className="size-full object-cover"
          />
        ) : (
          <span
            aria-hidden="true"
            className="flex size-full items-center justify-center text-[22px] font-light text-[var(--ink-700)]"
          >
            {initials}
          </span>
        )}
        <span
          aria-hidden="true"
          className="absolute inset-0 flex items-center justify-center bg-[rgba(13,13,13,0.55)] text-white opacity-0 transition-opacity duration-150 group-hover:opacity-100 group-focus-visible:opacity-100"
        >
          <Camera className="size-5" strokeWidth={1.5} />
        </span>
      </button>

      <div className="min-w-0 flex-1">
        {children}
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={isPending}
            onClick={() => inputRef.current?.click()}
            className="cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] focus-visible:outline-none disabled:opacity-50"
          >
            {isPending
              ? "Saving…"
              : avatarUrl
                ? "Replace photo"
                : "Upload a photo"}
          </button>
          {avatarUrl && (
            <button
              type="button"
              disabled={isPending}
              onClick={adjustCurrent}
              className="cursor-pointer text-[11px] font-medium text-[var(--blue)] hover:text-[var(--blue-hover)] focus-visible:outline-none disabled:opacity-50"
            >
              Adjust
            </button>
          )}
          {avatarUrl && (
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
            PNG, JPG or WebP · cropped to a circle
          </span>
        </div>

        {/* The personal workspace has no icon of its own — it wears this
            photo, squared. Said here, where the photo is changed, so nobody
            goes looking for a second upload. The mark previews the result,
            initials included while there is no photo. */}
        <div className="mt-2.5 flex items-center gap-2">
          <WorkspaceMark
            workspace={{
              kind: "personal",
              mark: initials,
              photoUrl: avatarUrl,
            }}
            className="size-4 rounded-[4px] text-[7px]"
          />
          <span className="text-[11px] text-[var(--ink-600)]">
            Also your Personal workspace icon.
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
        shape="circle"
        outputEdge={AVATAR_EDGE_PX}
        saving={isPending}
        onSave={submit}
        onCancel={() => setAdjusting(null)}
        onChooseAnother={() => inputRef.current?.click()}
      />
    </div>
  );
}
