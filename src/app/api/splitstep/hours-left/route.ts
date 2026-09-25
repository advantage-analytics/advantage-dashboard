/**
 * Video hours left this month for the active workspace, for the header's Beta
 * pill.
 *
 * A route rather than a browser read because an individual's figure is the
 * tighter of their own cap and a shared band (the pilot pool or the open-beta
 * ceiling), and the band spans everyone's rows: `individual_tier_usage` is
 * service-role only. `peekQuota()` is the same read `/api/splitstep/upload-url`
 * refuses on, so the pill cannot promise hours the upload will not honour.
 *
 * Advisory, like every peek: `reserveQuota()` at submit time still decides.
 */

import { pipelineLog } from "@/lib/services/splitstep/pipeline-log";
import { NextResponse } from "next/server";

import { createAdminClient } from "@/lib/supabase/admin";
import {
  monthlyCapSecondsFor,
  peekQuota,
  type HoursLeft,
} from "@/lib/services/splitstep/quota";
import { getWorkspaceContext } from "@/lib/workspace/active-workspace-server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  // Resolves the session first; an anonymous caller never reaches the
  // service-role client.
  const context = await getWorkspaceContext();
  if (!context) {
    return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  }

  try {
    const peek = await peekQuota(
      createAdminClient(),
      context.active,
      context.viewer.id,
    );
    const body: HoursLeft = {
      workspaceId: context.active.id,
      remainingSeconds: peek.remainingSeconds,
      capSeconds: monthlyCapSecondsFor(context.active),
      bandFull: peek.limit !== "account" && peek.remainingSeconds === 0,
    };
    return NextResponse.json(body, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (error) {
    pipelineLog.error("[splitstep-hours-left] could not read usage", {
      error: error instanceof Error ? error.message : String(error),
    });
    return NextResponse.json(
      { error: "Could not read usage" },
      { status: 503 },
    );
  }
}
