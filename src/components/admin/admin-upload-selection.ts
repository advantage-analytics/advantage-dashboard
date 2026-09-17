export const ADMIN_UPLOAD_KINDS = [
  "file",
  "video",
  "dual",
  "tournament",
] as const;
export type AdminUploadKind = (typeof ADMIN_UPLOAD_KINDS)[number];
type Param = string | string[] | undefined;

/** Repeated scope parameters are ambiguous, so none is silently trusted. */
export function adminUploadSelection(params: { team?: Param; kind?: Param }) {
  const team = typeof params.team === "string" ? params.team : null;
  const kind =
    typeof params.kind === "string" &&
    ADMIN_UPLOAD_KINDS.includes(params.kind as AdminUploadKind)
      ? (params.kind as AdminUploadKind)
      : null;
  return {
    team,
    kind,
    invalidTeam:
      params.team !== undefined &&
      (!team ||
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
          team,
        )),
    invalidKind: params.kind !== undefined && kind === null,
  };
}

export function adminUploadHref(
  team: string | null,
  kind: AdminUploadKind | null,
  search?: string,
) {
  const params = new URLSearchParams();
  if (team) params.set("team", team);
  if (kind) params.set("kind", kind);
  if (search) params.set("q", search);
  const query = params.toString();
  return `/admin/uploads/new${query ? `?${query}` : ""}`;
}
