import { ImageResponse } from "next/og";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * The one card every shared link unfurls into (iMessage, Slack, X): a match
 * report, a program's claim link, a team's join link. One layout so a set of
 * them reads as a family — the wordmark, then a headline, one line under it,
 * the facts, and a kicker at the foot.
 *
 * Satori draws a flexbox subset, so every box says `display: flex`, colours
 * are literal (design-system hex, no CSS variables here — there is no
 * stylesheet), and the wordmark is the email PNG rather than the SVG, which
 * uses a mask Satori will not rasterise. The fonts and the logo are read once
 * at module scope, from the project root; `next.config.ts` traces them into
 * each card route's bundle so a deployed function finds them.
 *
 * The type follows the dashboard's scale, enlarged for a 1200px card: the
 * headline and the line are the display step (weight 300, tight tracking),
 * the facts are body, and the kicker is the eyebrow (uppercase, 400, tracked).
 * Each weight is one file covering Latin and Latin Extended, so a name like
 * "Świątek" draws in Inter — Satori does not fall back between two files of
 * the same family, it drops to its built-in face.
 */
export const LINK_CARD_SIZE = { width: 1200, height: 630 };

const FONT_DIR = join(process.cwd(), "src", "app", "m", "[token]");
const [interLight, interRegular] = await Promise.all(
  ["inter-light.woff", "inter-regular.woff"].map((file) =>
    readFile(join(FONT_DIR, file)),
  ),
);
const logoData = await readFile(
  join(process.cwd(), "public", "logos", "logo-email.png"),
  "base64",
);
const logoSrc = `data:image/png;base64,${logoData}`;

// Design-system ink and blue, spelled out because there is no stylesheet.
const INK_900 = "#0D0D0D";
const INK_700 = "#525252";
const INK_600 = "#71717A";
const INK_500 = "#888888";
const BLUE = "#3B82F6";
const SURFACE = "#FFFFFF";

const OPTIONS = {
  ...LINK_CARD_SIZE,
  fonts: [
    {
      name: "Inter",
      data: interLight,
      style: "normal" as const,
      weight: 300 as const,
    },
    {
      name: "Inter",
      data: interRegular,
      style: "normal" as const,
      weight: 400 as const,
    },
  ],
};

export interface LinkCard {
  /** Who or what the link is about: the match-up, the school, the team. */
  headline: string;
  /** The line under it: a score, or what the link asks of its reader. */
  line?: string;
  /**
   * Blue is the one accent: a result, or something the reader can do. A line
   * that offers nothing ("Every player seat is taken") is `quiet`.
   */
  lineTone?: "accent" | "quiet";
  facts?: string;
  /** What kind of link this is, in two words. */
  kicker: string;
}

/** Past two lines of 68px a headline steps down rather than crowding the foot. */
const HEADLINE_STEP_DOWN = 56;

export function linkCard(card: LinkCard): ImageResponse {
  const stepDown = card.headline.length > HEADLINE_STEP_DOWN;

  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        flexDirection: "column",
        justifyContent: "space-between",
        padding: "64px 72px",
        background: SURFACE,
        color: INK_900,
        fontFamily: "Inter",
        fontWeight: 400,
      }}
    >
      <div style={{ display: "flex" }}>
        {/* 450×81 source, drawn at 40px tall. Satori draws an <img>, not next/image. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={logoSrc} width={222} height={40} alt="" />
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div
          style={{
            display: "flex",
            fontSize: stepDown ? 56 : 68,
            fontWeight: 300,
            lineHeight: 1.1,
            letterSpacing: stepDown ? -1.1 : -1.4,
          }}
        >
          {card.headline}
        </div>
        {card.line && (
          <div
            style={{
              display: "flex",
              fontSize: 48,
              fontWeight: 300,
              lineHeight: 1.2,
              color: card.lineTone === "quiet" ? INK_700 : BLUE,
              letterSpacing: -1,
            }}
          >
            {card.line}
          </div>
        )}
        {card.facts && (
          <div
            style={{
              display: "flex",
              marginTop: 6,
              fontSize: 28,
              lineHeight: 1.3,
              color: INK_600,
            }}
          >
            {card.facts}
          </div>
        )}
      </div>

      <div
        style={{
          display: "flex",
          fontSize: 20,
          color: INK_500,
          letterSpacing: 3,
          textTransform: "uppercase",
        }}
      >
        {card.kicker}
      </div>
    </div>,
    OPTIONS,
  );
}

/**
 * The wordmark alone, centred — the site's default card redrawn. For a link
 * whose page says nothing about what it is (an unknown or spent token), so
 * its preview tells a stranger no more than the page would.
 */
export function wordmarkCard(): ImageResponse {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        background: SURFACE,
      }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={logoSrc} width={372} height={67} alt="" />
    </div>,
    OPTIONS,
  );
}
