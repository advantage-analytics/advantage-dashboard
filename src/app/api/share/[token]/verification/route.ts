import type { NextRequest } from "next/server";

import { readShareToken } from "@/lib/data/match-share-format";
import { sharedMatchVerifiedAt } from "@/lib/data/match-share-server";
import { errorResponse, jsonResponse } from "@/lib/services/match-video/http";
import { matchVideoError } from "@/lib/match-video/types";

/**
 * `GET /api/share/[token]/verification` — whether the shared match has been
 * Verified by Advantage, and when: `{ verifiedAt: string | null }`.
 *
 * An open `/m/[token]` page asks this on focus and once a minute while it is
 * visible (`VerificationWatch`), so a reader who opened the link before the
 * review landed is not left reading the automatic numbers. The dashboard's
 * report asks the database directly; a reader with a link has no session, so
 * the TOKEN is the question here, as on `GET /api/share/[token]/video`.
 *
 * One 404 for every refusal — a bad token, a link turned off, a failed read
 * — so the route cannot be used to learn which. It answers only what the
 * page itself already shows its reader (the verified badge and its date). No
 * CORS header and `no-store`; nothing here writes.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const verifiedAt = await sharedMatchVerifiedAt(readShareToken(token));
  if (verifiedAt === undefined) {
    return errorResponse(matchVideoError("match_not_found", "share_token"));
  }
  return jsonResponse({ verifiedAt });
}
