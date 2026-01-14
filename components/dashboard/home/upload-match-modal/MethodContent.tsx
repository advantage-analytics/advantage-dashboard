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
    <div className="flex justify-center gap-6">
      <div
        className={`w-[240px] h-[252px] cursor-pointer hover:shadow-lg transition-all duration-200 rounded-2xl relative overflow-hidden ${
          selectedMethod === "elc" ? "scale-105" : ""
        }`}
        onClick={() => onMethodSelect(selectedMethod === "elc" ? null : "elc")}
      >
        <img
          src="/elc-image.png"
          alt="Electronic Line Calling"
          className="absolute inset-0 w-full h-full object-cover scale-100 origin-top"
        />
        <div className="absolute bottom-0 left-0 right-0 h-32 z-10">
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

      <div className="w-[240px] h-[252px] cursor-not-allowed rounded-2xl relative overflow-hidden bg-white border-[0.5px] border-[#EAECF0]">
        <img
          src="/logo.svg"
          alt="Advantage"
          className="absolute top-[92px] left-1/2 -translate-x-1/2 w-[78px] h-[14px]"
        />
        <div className="absolute bottom-0 left-0 right-0 h-32 z-10">
          <div className="absolute inset-0 backdrop-blur-[24px]" style={{ maskImage: 'linear-gradient(to top, black, transparent)', WebkitMaskImage: 'linear-gradient(to top, black, transparent)' }} />
          <div className="absolute inset-0 bg-gradient-to-t from-black/[0.20] to-transparent" />
          <div className="absolute bottom-0 left-0 right-0 px-4 pb-4 space-y-1.5">
            <p className="italic font-medium text-xs text-[#0D0D0D]">Coming Soon</p>
            <p className="text-[10px] text-normal text-[#999999]">
              Choose to label with Advantage Intelligence or traditional labeling techniques.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
