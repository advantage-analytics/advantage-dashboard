/**
 * `GET /.well-known/oauth-authorization-server` — a fallback for MCP clients
 * written against the 2025-03-26 authorization spec, which looked for the
 * authorization server's metadata (RFC 8414) on the MCP server's own host
 * instead of following the protected-resource document.
 *
 * The authorization server is Supabase Auth, so this answers with its
 * document, fetched from the issuer's own well-known URL and passed through
 * as it came — including the 404 (`feature_disabled`) it sends while the
 * OAuth server is switched off, which is the clearest signal a client can
 * get that the setup step in docs/ask-mcp-connector.md is still to do.
 * Current clients never reach this: the protected-resource document names
 * the issuer and they fetch the metadata from Supabase directly.
 */

import { NextResponse } from "next/server";

import { authorizationServerMetadataUrl } from "@/lib/services/mcp/auth";
import { WELL_KNOWN_CORS_HEADERS } from "../oauth-protected-resource/route";

export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    return NextResponse.json(
      { error: "The authorization server is not configured." },
      { status: 500, headers: { "Cache-Control": "no-store" } },
    );
  }
  try {
    const upstream = await fetch(authorizationServerMetadataUrl(supabaseUrl), {
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const body = await upstream.text();
    return new Response(body, {
      status: upstream.status,
      headers: {
        ...WELL_KNOWN_CORS_HEADERS,
        "Content-Type": "application/json",
        "Cache-Control": upstream.ok ? "public, max-age=300" : "no-store",
      },
    });
  } catch (error) {
    console.error("[mcp] could not read the authorization server metadata", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "The authorization server could not be reached." },
      { status: 502, headers: { "Cache-Control": "no-store" } },
    );
  }
}

export async function OPTIONS(): Promise<Response> {
  return new Response(null, { status: 204, headers: WELL_KNOWN_CORS_HEADERS });
}
