"use client";

import { useRef, useTransition } from "react";
import { Camera } from "lucide-react";
import {
  removeAvatar,
  uploadAvatar,
} from "@/components/dashboard/settings/actions";
import { AVATAR_EDGE_PX, AVATAR_MAX_BYTES } from "@/lib/user/avatar";

const ACCEPT = "image/png,image/jpeg,image/webp";

/**
 * The profile photo as a control: the circle is the button, hover paints a
 * camera over it, and the words under the name say what to do.
 *
 * The same shape as the Teams crest control, except the mark is a circle —
 * the design system keeps circles for people and squares for programs.
 * Posts the moment a file is chosen; a photo is one file and a second Save
 * for it would be a step with nothing to decide.
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

  const submit = (file: File) => {
    onError(null);
    startTransition(async () => {
      const prepared = await squareDownscale(file);
      if (!prepared) {
        onError("Couldn't read that image. Use a PNG, JPG or WebP.");
        return;
      }
      if (prepared.size > AVATAR_MAX_BYTES) {
        onError("Keep the photo under 2 MB.");
        return;
      }
      const formData = new FormData();
      formData.set("file", prepared);
      const result = await uploadAvatar(formData);
      if (!result.ok) onError(result.error);
    });
  };

  const remove = () => {
    onError(null);
    startTransition(async () => {
      const result = await removeAvatar();
      if (!result.ok) onError(result.error);
    });
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
              onClick={remove}
              className="cursor-pointer text-[11px] font-medium text-[var(--ink-600)] hover:text-[var(--ink-900)] focus-visible:outline-none disabled:opacity-50"
            >
              Remove
            </button>
          )}
          <span className="text-[11px] text-[var(--ink-400)]">
            PNG, JPG or WebP · cropped to a square
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

/**
 * Centre-crop to a square and scale down to `AVATAR_EDGE_PX` before upload.
 * A phone photo is several MB and 4000px wide; the circle is 80px. Null when
 * the browser cannot decode the file (HEIC outside Safari, a renamed PDF).
 */
async function squareDownscale(file: File): Promise<File | null> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    return null;
  }

  const side = Math.min(bitmap.width, bitmap.height);
  const edge = Math.min(side, AVATAR_EDGE_PX);
  const canvas = document.createElement("canvas");
  canvas.width = edge;
  canvas.height = edge;
  const context = canvas.getContext("2d");
  if (!context) return null;
  context.drawImage(
    bitmap,
    (bitmap.width - side) / 2,
    (bitmap.height - side) / 2,
    side,
    side,
    0,
    0,
    edge,
    edge,
  );
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, "image/webp", 0.9),
  );
  if (!blob) return null;
  // A browser without a WebP encoder hands back PNG instead; name it for
  // what it actually is.
  const ext = blob.type === "image/webp" ? "webp" : "png";
  return new File([blob], `avatar.${ext}`, { type: blob.type });
}
