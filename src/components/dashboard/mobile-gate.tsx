"use client";

import Image from "next/image";
import { motion, useReducedMotion } from "framer-motion";
import { Monitor, Tablet } from "lucide-react";

/**
 * MobileGate
 *
 * Advantage's data surfaces (court maps, shot plots, dense stat tables) need
 * horizontal room to read accurately, so the dashboard is desktop/tablet only.
 *
 * This is a pure-CSS viewport gate: `md:hidden` means it is rendered (and covers
 * everything) below 768px, and is `display: none` at 768px and up. Tablets in
 * portrait (>=768px) pass straight through; phones get this screen instead. No
 * user-agent sniffing, so there is no SSR/client hydration mismatch.
 *
 * It mounts last in the dashboard layout with a high z-index so it sits over the
 * sidebar, header, and content.
 */
export function MobileGate() {
  const shouldReduceMotion = useReducedMotion();

  return (
    <div
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="mobile-gate-title"
      aria-describedby="mobile-gate-desc"
      className="fixed inset-0 z-[100] flex flex-col bg-[#FAFAFA] overscroll-contain md:hidden"
    >
      {/* Wordmark */}
      <div className="px-7 pt-10">
        <Image
          src="/logos/logo4.svg"
          alt="Advantage"
          width={129}
          height={22}
          style={{ width: 129, height: 22 }}
          priority
        />
      </div>

      {/* Message */}
      <div className="flex flex-1 flex-col justify-center px-7 pb-4">
        <motion.div
          initial={shouldReduceMotion ? false : { opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="max-w-[320px]"
        >
          {/* Focal: where the dashboard belongs */}
          <div className="flex size-14 items-center justify-center rounded-2xl border border-[#F3F3F3] bg-white shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]">
            <Monitor className="size-6 text-[#0D0D0D]" strokeWidth={1.5} aria-hidden="true" />
          </div>

          {/* Eyebrow + hairline rule (system signature) */}
          <div className="mt-8 flex items-center gap-3">
            <span className="text-[10px] font-medium uppercase tracking-[2.5px] text-[#AAAAAA]">
              Desktop &amp; Tablet
            </span>
            <span className="h-px flex-1 bg-[#F3F3F3]" />
          </div>

          <h1
            id="mobile-gate-title"
            className="mt-4 text-[30px] font-light leading-[36px] tracking-[-0.6px] text-[#0D0D0D]"
          >
            Built for the bigger screen
          </h1>

          <p
            id="mobile-gate-desc"
            className="mt-3 text-[13px] leading-[1.5] text-[#525252]"
          >
            Advantage&rsquo;s court maps, shot plots, and stat tables need room to
            read clearly. Open the dashboard on a desktop or tablet for the full
            picture.
          </p>

          {/* Supported surfaces */}
          <div className="mt-8 flex items-center gap-6 border-t border-[#F3F3F3] pt-6">
            <div className="flex items-center gap-2 text-[#525252]">
              <Monitor className="size-4 text-[#71717A]" strokeWidth={1.5} aria-hidden="true" />
              <span className="text-[12px]">Desktop</span>
            </div>
            <div className="flex items-center gap-2 text-[#525252]">
              <Tablet className="size-4 text-[#71717A]" strokeWidth={1.5} aria-hidden="true" />
              <span className="text-[12px]">Tablet</span>
            </div>
          </div>
        </motion.div>
      </div>

      {/* Precision footnote */}
      <div className="px-7 pb-9">
        <p className="text-[11px] tabular-nums text-[#AAAAAA]">
          Optimized for screens 768px and wider
        </p>
      </div>
    </div>
  );
}
