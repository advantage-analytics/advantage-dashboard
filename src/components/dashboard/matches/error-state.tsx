"use client";

import Link from "next/link";
import { motion, useReducedMotion } from "framer-motion";
import { Check, Copy, LucideIcon } from "lucide-react";
import { ReactNode, useState } from "react";

const EASE_CURVE = [0.25, 0.46, 0.45, 0.94] as const;

type PrimaryAction =
  | { type: "button"; label: string; onClick: () => void; loading?: boolean }
  | { type: "link"; label: string; href: string };

type MetaItem = { label: string; value: string; copyable?: boolean };

export function ErrorState({
  icon: Icon,
  title,
  description,
  primaryAction,
  secondaryAction,
  meta,
  helpLink,
}: {
  icon: LucideIcon;
  title: string;
  description: ReactNode;
  primaryAction: PrimaryAction;
  secondaryAction?: { label: string; href: string };
  meta?: MetaItem[];
  helpLink?: { label: string; href: string };
}) {
  const shouldReduceMotion = useReducedMotion();
  const anim = shouldReduceMotion
    ? { initial: false as const, animate: { opacity: 1, y: 0 }, transition: { duration: 0 } }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: EASE_CURVE },
      };

  return (
    <div className="flex-1 w-full flex items-start justify-center pt-24 pb-16 px-6">
      <motion.div
        {...anim}
        className="flex flex-col items-center text-center max-w-[420px]">
        <Icon
          className="text-[#AAAAAA] size-6"
          strokeWidth={1.5}
          aria-hidden
        />

        <h1 className="text-[28px] font-light text-[#0D0D0D] tracking-[-0.5px] leading-[34px] mt-5">
          {title}
        </h1>

        <p className="text-[13px] font-normal text-[#888888] leading-[1.6] mt-3">
          {description}
        </p>

        <div className="mt-8 flex flex-col items-center gap-4">
          {primaryAction.type === "button" ? (
            <button
              onClick={primaryAction.onClick}
              disabled={primaryAction.loading}
              className="px-5 py-2 bg-[#3B82F6] hover:bg-[#2563EB] disabled:opacity-60 disabled:cursor-not-allowed text-white text-[13px] font-medium rounded-[6px] transition-colors duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2"
            >
              {primaryAction.loading ? "Retrying…" : primaryAction.label}
            </button>
          ) : (
            <Link
              href={primaryAction.href}
              className="px-5 py-2 bg-[#3B82F6] hover:bg-[#2563EB] text-white text-[13px] font-medium rounded-[6px] transition-colors duration-200 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-2"
            >
              {primaryAction.label}
            </Link>
          )}

          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="text-[12px] font-medium text-[#888888] hover:text-[#525252] transition-colors duration-200 focus-visible:outline-none focus-visible:underline underline-offset-4"
            >
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>

        {meta && meta.length > 0 ? (
          <dl className="mt-12 pt-5 border-t border-[#F0F0F0] w-full flex flex-col gap-2">
            {meta.map((item) => (
              <MetaRow key={item.label} item={item} />
            ))}
          </dl>
        ) : null}

        {helpLink ? (
          <Link
            href={helpLink.href}
            className="mt-5 text-[12px] font-normal text-[#888888] hover:text-[#525252] transition-colors duration-200 focus-visible:outline-none focus-visible:underline underline-offset-4"
          >
            {helpLink.label} →
          </Link>
        ) : null}
      </motion.div>
    </div>
  );
}

function MetaRow({ item }: { item: MetaItem }) {
  const [copied, setCopied] = useState(false);

  if (!item.copyable) {
    return (
      <div className="flex items-center justify-center gap-2 text-[11px]">
        <dt className="text-[#AAAAAA] uppercase tracking-[1.5px] font-medium">
          {item.label}
        </dt>
        <dd className="tabular-nums tracking-[0.3px] text-[#525252] select-all">{item.value}</dd>
      </div>
    );
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(item.value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      // Clipboard denied — select-all fallback still works
    }
  }

  return (
    <div className="flex items-center justify-center gap-2 text-[11px]">
      <dt className="text-[#AAAAAA] uppercase tracking-[1.5px] font-medium">
        {item.label}
      </dt>
      <dd className="tabular-nums tracking-[0.3px] text-[#525252] select-all">{item.value}</dd>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy ${item.label.toLowerCase()}`}
        className="ml-0.5 p-1 rounded-[4px] text-[#AAAAAA] hover:text-[#525252] hover:bg-[#F5F5F5] transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#3B82F6] focus-visible:ring-offset-1"
      >
        {copied ? (
          <Check className="size-3" strokeWidth={2} />
        ) : (
          <Copy className="size-3" strokeWidth={1.75} />
        )}
      </button>
    </div>
  );
}
