import { UUID_RE } from "@/lib/admin/validation";
import {
  ADMIN_UPLOAD_BILLINGS,
  type AdminUploadBilling,
} from "@/lib/admin/uploads/types";

export const ADMIN_UPLOAD_KINDS = [
  "file",
  "video",
  "dual",
  "tournament",
] as const;
export type AdminUploadKind = (typeof ADMIN_UPLOAD_KINDS)[number];
type Param = string | string[] | undefined;

/**
 * A player's personal workspace as an upload target. `billing` defaults to
 * `free`, the board's first answer; only video goes there.
 */
export interface AdminPlayerTarget {
  player: string;
  billing?: AdminUploadBilling;
}

/** Repeated scope parameters are ambiguous, so none is silently trusted. */
export function adminUploadSelection(params: {
  team?: Param;
  player?: Param;
  kind?: Param;
  billing?: Param;
}) {
  const team = typeof params.team === "string" ? params.team : null;
  const player = typeof params.player === "string" ? params.player : null;
  const kind =
    typeof params.kind === "string" &&
    ADMIN_UPLOAD_KINDS.includes(params.kind as AdminUploadKind)
      ? (params.kind as AdminUploadKind)
      : null;
  const billing: AdminUploadBilling =
    params.billing === "player" ? "player" : "free";
  return {
    team,
    player,
    kind,
    billing,
    invalidTeam: params.team !== undefined && (!team || !UUID_RE.test(team)),
    invalidPlayer:
      params.player !== undefined &&
      (!player || !UUID_RE.test(player) || params.team !== undefined),
    invalidBilling:
      params.billing !== undefined &&
      !ADMIN_UPLOAD_BILLINGS.includes(params.billing as AdminUploadBilling),
    invalidKind: params.kind !== undefined && kind === null,
  };
}

export function adminUploadHref(
  target: string | AdminPlayerTarget | null,
  kind: AdminUploadKind | null,
  search?: string,
) {
  const params = new URLSearchParams();
  if (typeof target === "string") params.set("team", target);
  else if (target) {
    params.set("player", target.player);
    if (target.billing === "player") params.set("billing", "player");
  }
  if (kind) params.set("kind", kind);
  if (search) params.set("q", search);
  const query = params.toString();
  return `/admin/uploads/new${query ? `?${query}` : ""}`;
}
