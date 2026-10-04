import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { createClient } from "@/lib/supabase/server";
import {
  divisionLabel,
  getProgramPublicStatus,
  programSubtitle,
  teamLabel,
} from "@/lib/data/programs-server";
import { claimPreview } from "@/lib/data/program-claim-preview";

/**
 * The card a program's claim link unfurls into (iMessage, Slack, X): the
 * program's name under the wordmark, with what the recipient is being asked to
 * do. Same construction as the shared-match card in `m/[token]` — Satori draws
 * a flexbox subset, colours are literal design-system hex, the wordmark is the
 * email PNG — and it borrows that route's Inter file, which `next.config.ts`
 * traces into this route's bundle too.
 *
 * There is no school logo in the directory, so the school's name is the
 * picture. An unknown key is a 404, never a generic card.
 */
export const alt = "Set up your program on Advantage";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const interMedium = await readFile(
  join(process.cwd(), "src", "app", "m", "[token]", "inter-medium.woff"),
);
const logoData = await readFile(
  join(process.cwd(), "public", "logos", "logo-email.png"),
  "base64",
);
const logoSrc = `data:image/png;base64,${logoData}`;

const INK_900 = "#0D0D0D";
const INK_500 = "#888888";
const BLUE = "#3B82F6";
const SURFACE = "#FFFFFF";

export default async function Image({
  params,
}: {
  params: Promise<{ programKey: string }>;
}) {
  const { programKey } = await params;
  const program = await getProgramPublicStatus(
    await createClient(),
    programKey,
  );
  if (!program) return new Response(null, { status: 404 });

  const { eyebrow } = claimPreview({
    schoolName: program.schoolName,
    teamLabel: teamLabel(program.team),
    status: program.status,
  });
  const squad = `${teamLabel(program.team)} Tennis`;
  // Conference names run to 76 characters ("Region 23 - Mississippi
  // Association of Community Colleges Conference (MACCC)") and wrap to three
  // lines. Past one line (about 56 characters with the squad) the conference is dropped and the division
  // stays, the same trade the claim flow's eyebrow makes.
  const full = programSubtitle(program.division, program.conference);
  const facts =
    `${squad} · ${full}`.length > 56
      ? (divisionLabel(program.division) ?? "")
      : full;
  // A long school name steps down rather than wrapping to four lines.
  const nameSize = program.schoolName.length > 28 ? 64 : 80;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        padding: "64px 72px",
        background: SURFACE,
        color: INK_900,
        fontFamily: "Inter",
      }}
    >
      <div style={{ display: "flex" }}>
        <img src={logoSrc} width={222} height={40} alt="" />
      </div>

      {/* Anchored from the top, not centred between logo and footer: the
          eyebrow sits on the same line whatever the name's length, so a set
          of these cards reads as one family. The eyebrow hugs its name; the
          facts sit a step further off as supporting detail. */}
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 14,
          marginTop: 96,
        }}
      >
        <div
          style={{
            display: "flex",
            fontSize: 26,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: BLUE,
          }}
        >
          {eyebrow}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: nameSize,
            lineHeight: 1.1,
            letterSpacing: -1.5,
          }}
        >
          {program.schoolName}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 40,
            lineHeight: 1.2,
            color: INK_500,
            marginTop: 14,
          }}
        >
          {[squad, facts].filter(Boolean).join("  ·  ")}
        </div>
      </div>

      <div
        style={{
          display: "flex",
          marginTop: "auto",
          fontSize: 22,
          color: INK_500,
          letterSpacing: 0.2,
        }}
      >
        Tennis analytics for college programs · Advantage
      </div>
    </div>,
    {
      ...size,
      fonts: [
        { name: "Inter", data: interMedium, style: "normal", weight: 500 },
      ],
    },
  );
}
