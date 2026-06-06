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
    <div className="flex h-full flex-1 flex-col items-start justify-between brand-mesh-gradient px-[64px] pt-[27.5px] pb-16">
      {/* Logo — matches landing nav: 24px tall, center 40px from top */}
      <div className="flex items-center">
        <Image
          src="/logos/logo.svg"
          alt="Advantage Logo"
          width={320}
          height={57}
          priority
          className="h-6 w-auto brightness-0 invert"
        />
      </div>

      {/* Center Content */}
      <div className="flex flex-col gap-[32px] max-w-[420px]">
        <h1 className="text-[56px] font-light leading-[1.02] tracking-[-1.5px] text-white">
          {hero.map((line) => (
            <span key={line} className="block">
              {line}
            </span>
          ))}
        </h1>

        <p className="text-[18px] font-light leading-[1.55] tracking-[-0.1px] text-white/[0.86]">
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
