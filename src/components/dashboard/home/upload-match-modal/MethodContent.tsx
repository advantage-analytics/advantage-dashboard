"use client";

/**
 * MethodContent - Step 1 content
 * Two cards for selecting analysis method
 */

export interface MethodContentProps {
  selectedMethod: string | null;
  onMethodSelect: (methodId: string | null) => void;
}

export function MethodContent({ selectedMethod, onMethodSelect }: MethodContentProps) {
  return (
    <div className="h-full flex items-center justify-center gap-6">
      <div
        className={`w-[240px] h-[252px] cursor-pointer transition-all duration-200 rounded-2xl relative overflow-visible group hover:scale-[1.02] ${
          selectedMethod === "elc" ? "ring-2 ring-[var(--color-accent-blue)] ring-offset-2" : ""
        }`}
        onClick={() => onMethodSelect(selectedMethod === "elc" ? null : "elc")}
      >
        <div className="absolute inset-0 overflow-hidden rounded-2xl" style={{ clipPath: "inset(0 round 16px)" }}>
          <img
            src="/marketing/elc-image.png"
            alt="Electronic Line Calling"
            className="absolute inset-0 w-full h-full object-cover scale-100 origin-top"
          />
          {/* Hover overlay */}
          <div className="absolute inset-0 bg-black/0 group-hover:bg-white/5 transition-all duration-200 z-[5]" />
          <div className="absolute bottom-0 left-0 right-0 h-32 z-10 rounded-b-2xl overflow-hidden" style={{ clipPath: "inset(0 0 0 0 round 0 0 16px 16px)" }}>
            <div className="absolute inset-0 backdrop-blur-[24px]" style={{ maskImage: 'linear-gradient(to top, black, transparent)', WebkitMaskImage: 'linear-gradient(to top, black, transparent)' }} />
            <div className="absolute inset-0 bg-gradient-to-t from-black/[0.60] to-transparent" />
            <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 space-y-1.5">
              <p className="italic font-medium text-xs text-white">Electronic Line Calling</p>
              <p className="text-[10px] text-normal text-white/80">
                Choose from a variety of providers such as SwingVision, BaselineVision, and many more.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="w-[240px] h-[252px] cursor-not-allowed rounded-2xl relative overflow-hidden bg-white border-[0.5px] border-[#EAECF0]" style={{ clipPath: "inset(0 round 16px)" }}>
        <img
          src="/logos/logo.svg"
          alt="Advantage"
          className="absolute top-[92px] left-1/2 -translate-x-1/2 w-[78px] h-[14px]"
        />
        <div className="absolute bottom-0 left-0 right-0 h-32 z-10 rounded-b-2xl overflow-hidden" style={{ clipPath: "inset(0 0 0 0 round 0 0 16px 16px)" }}>
          <div className="absolute inset-0 backdrop-blur-[24px]" style={{ maskImage: 'linear-gradient(to top, black, transparent)', WebkitMaskImage: 'linear-gradient(to top, black, transparent)' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/[0.20] to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 space-y-1.5">
            <p className="italic font-medium text-xs text-[var(--color-text-primary)]">Coming Soon</p>
            <p className="text-[10px] text-normal text-[#999999]">
              Choose to label with Advantage Intelligence or traditional labeling techniques.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
