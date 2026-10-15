/**
 * `GET /.well-known/oauth-protected-resource` — RFC 9728 metadata for the
 * MCP server at `/api/mcp`: who the authorization server is (the project's
 * Supabase Auth), and that the token travels in the `Authorization` header.
 *
 * This is the first thing an MCP client fetches after a 401 from `/api/mcp`
 * (`src/lib/services/mcp/auth.ts`). The path-specific form the spec prefers,
 * `/.well-known/oauth-protected-resource/api/mcp`, re-exports these handlers.
 * Public by nature — it holds nothing but URLs — so it is cacheable and
 * answers cross-origin preflights, for a browser-based client such as the
 * MCP Inspector. The resource it names is this deployment's configured
 * origin (`mcpOrigin`), never one read from a request header.
 */

import { NextResponse } from "next/server";

import { protectedResourceMetadata } from "@/lib/services/mcp/auth";
import { mcpOrigin } from "@/lib/services/mcp/origin";

export const dynamic = "force-dynamic";

export const WELL_KNOWN_CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "mcp-protocol-version, content-type",
} as const;

export async function GET(request: Request): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json(
      { error: "The authorization server is not configured." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.json(
    protectedResourceMetadata({
      origin: mcpOrigin(request.headers),
      supabaseUrl,
    }),
    {
      headers: {
        ...WELL_KNOWN_CORS_HEADERS,
        "Cache-Control": "public, max-age=300",
      },
    },
  );
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: WELL_KNOWN_CORS_HEADERS });
}
