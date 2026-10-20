/**
 * Refusals the credit routes answer, in the `{ error, code?, detail? }` shape
 * every route here uses (`errorResponse()` in `match-video/http.ts`).
 */

import type { MatchVideoHttpError } from "@/lib/services/match-video/http";

export type CreditsRefusalCode =
  | "unauthenticated"
  | "invalid_pack"
  | "checkout_unavailable"
  | "not_found"
  | "not_paid";

export function creditsRefusal(
  code: CreditsRefusalCode,
  status: number,
  message: string,
  detail: string,
): MatchVideoHttpError {
  return { code, status, message, detail } as unknown as MatchVideoHttpError;
}
