/**
 * `GET /.well-known/oauth-protected-resource/api/mcp` — the path-specific
 * form of the resource metadata (RFC 9728 §3.1), which is the URL
 * `/api/mcp`'s 401 names. Same document as the root form. The segment
 * config is declared here rather than re-exported: Next refuses a
 * re-exported `dynamic`.
 */
export { GET, OPTIONS } from "../../route";

export const dynamic = "force-dynamic";
