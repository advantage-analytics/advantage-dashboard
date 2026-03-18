import Image from "next/image";

const content = {
  default: {
    hero: ["Performance", "Intelligence", "for Competitive", "Tennis."],
    subtitle:
      "AI-powered match analysis and performance tracking to elevate your game and outsmart opponents.",
  },
  "request-access": {
    hero: ["Join the Next", "Generation of", "Tennis Analytics."],
    subtitle:
      "Applications are reviewed on a rolling basis. Selected athletes and coaches will receive credentials via email.",
  },
};

export default function BrandPanel({
  variant = "default",
}: {
  variant?: keyof typeof content;
}) {
  const { hero, subtitle } = content[variant];
  return (
    <div className="flex h-full flex-1 flex-col items-start justify-between brand-mesh-gradient px-[64px] pt-10 pb-16">
      {/* Logo */}
      <div className="flex h-8 items-center">
        <Image
          src="/logos/logo.svg"
          alt="Advantage Logo"
          width={100}
          height={20}
          priority
          className="h-6 w-auto brightness-0 invert"
        />
      </div>

      {/* Center Content */}
      <div className="flex flex-col gap-[32px] max-w-[420px]">
        <h1 className="text-[56px] font-light leading-[1.05] tracking-[-1px] text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.15)]">
          {hero.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>

        <p className="text-[16px] font-light leading-[1.6] tracking-[0.2px] text-white/90">
          {subtitle}
        </p>

        <div className="h-[1px] w-[48px] bg-white/60" />
      </div>

      {/* Bottom Content */}
      <div>
        <p className="text-[13px] leading-[1.7] tracking-[0.5px] text-white/60">
          Built by former collegiate players.
          <br />
          Designed for competitive advantage.
        </p>
      </div>
    </div>
  );
}
