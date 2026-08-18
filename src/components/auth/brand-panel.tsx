import Image from "next/image";
import { MARKETING_SITE_URL } from "@/lib/constants";

const hero = ["Performance", "Intelligence", "for Competitive", "Tennis."];
const subtitle =
  "AI-powered match analysis and performance tracking to elevate your game and outsmart opponents.";

/**
 * The brand half of the auth split — identical on all four pages, per the v2
 * set spec. Copy is kept verbatim from the shipped panel; what changed is that
 * the subtitle drops to body weight (18px/300 at white/86 read as a second
 * heading competing with the lockup) and the 48px decorative rule is gone,
 * since v2 retired eyebrow rules in favour of whitespace.
 *
 * Padding is the spec's 32/64/40. That is ~4px lower than the old 27.5px top,
 * which had been tuned to sit the logo's centre 40px down to match the
 * marketing nav; the v2 set spec pins the same padding on every auth page, so
 * cross-page consistency wins over cross-site continuity here.
 */
export default function BrandPanel() {
  return (
    <div className="brand-mesh-gradient flex h-full flex-1 flex-col items-start justify-between px-[64px] pt-[32px] pb-[40px]">
      <a
        href={MARKETING_SITE_URL}
        aria-label="Advantage Analytics — Home"
        className="flex items-center"
      >
        <Image
          src="/logos/logo.svg"
          alt="Advantage Logo"
          width={320}
          height={57}
          priority
          className="h-6 w-auto brightness-0 invert"
        />
      </a>

      <div className="flex max-w-[440px] flex-col gap-[24px]">
        {/* Not a heading: the page's h1 is the form's own title. When this was
            an <h1> every auth page shipped two, and a screen reader announced
            the marketing slogan as the document heading instead of "Sign in". */}
        <p className="text-[56px] leading-[1.02] font-light tracking-[-1.5px] text-white">
          {hero.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </p>

        <p className="max-w-[46ch] text-[15px] leading-[1.6] font-normal text-white/70">
          {subtitle}
        </p>
      </div>

      <p className="text-[12px] leading-[1.7] font-normal text-white/[0.62]">
        Built by former collegiate players.
        <br />
        Designed for competitive advantage.
      </p>
    </div>
  );
}
