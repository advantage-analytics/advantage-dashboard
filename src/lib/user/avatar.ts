/** The bucket a profile photo lives in. Mirrors the migration that creates it. */
export const USER_AVATARS_BUCKET = "user-avatars";

/** MIME type → stored extension. The bucket allows exactly these three. */
export const AVATAR_TYPES: Record<string, string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
};

/** The bucket's own limit, restated so the refusal is a sentence, not a 413. */
export const AVATAR_MAX_BYTES = 2_097_152;

/** Longest edge the browser downscales to before upload. */
export const AVATAR_EDGE_PX = 512;
