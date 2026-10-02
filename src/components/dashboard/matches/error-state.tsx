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
    ? {
        initial: false as const,
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0 },
      }
    : {
        initial: { opacity: 0, y: 8 },
        animate: { opacity: 1, y: 0 },
        transition: { duration: 0.4, ease: EASE_CURVE },
      };

  return (
    <div className="flex w-full flex-1 items-start justify-center px-6 pt-24 pb-16">
      <motion.div
        {...anim}
        className="flex max-w-[420px] flex-col items-center text-center"
      >
        <Icon className="size-6 text-[#AAAAAA]" strokeWidth={1.5} aria-hidden />

        <h1 className="mt-5 text-[28px] leading-[34px] font-light tracking-[-0.5px] text-[#0D0D0D]">
          {title}
        </h1>

        <p className="mt-3 text-[13px] leading-[1.6] font-normal text-[#888888]">
          {description}
        </p>

        <div className="mt-8 flex flex-col items-center gap-4">
          {primaryAction.type === "button" ? (
            <button
              onClick={primaryAction.onClick}
              disabled={primaryAction.loading}
              className="rounded-[6px] bg-[#3B82F6] px-5 py-2 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#2563EB] focus-visible:outline-none active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-60"
            >
              {primaryAction.loading ? "Retrying…" : primaryAction.label}
            </button>
          ) : (
            <Link
              href={primaryAction.href}
              className="rounded-[6px] bg-[#3B82F6] px-5 py-2 text-[13px] font-medium text-white transition-colors duration-200 hover:bg-[#2563EB] focus-visible:outline-none active:scale-[0.97]"
            >
              {primaryAction.label}
            </Link>
          )}

          {secondaryAction ? (
            <Link
              href={secondaryAction.href}
              className="text-[12px] font-medium text-[#888888] underline-offset-4 transition-colors duration-200 hover:text-[#525252] focus-visible:underline focus-visible:outline-none"
            >
              {secondaryAction.label}
            </Link>
          ) : null}
        </div>

        {meta && meta.length > 0 ? (
          <dl className="mt-12 flex w-full flex-col gap-2 border-t border-[var(--border-hairline)] pt-5">
            {meta.map((item) => (
              <MetaRow key={item.label} item={item} />
            ))}
          </dl>
        ) : null}

        {helpLink ? (
          <Link
            href={helpLink.href}
            className="mt-5 text-[12px] font-normal text-[#888888] underline-offset-4 transition-colors duration-200 hover:text-[#525252] focus-visible:underline focus-visible:outline-none"
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
        <dt className="font-medium tracking-[1.5px] text-[#AAAAAA] uppercase">
          {item.label}
        </dt>
        <dd className="tracking-[0.3px] text-[#525252] tabular-nums select-all">
          {item.value}
        </dd>
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
      <dt className="font-medium tracking-[1.5px] text-[#AAAAAA] uppercase">
        {item.label}
      </dt>
      <dd className="tracking-[0.3px] text-[#525252] tabular-nums select-all">
        {item.value}
      </dd>
      <button
        type="button"
        onClick={copy}
        aria-label={copied ? "Copied" : `Copy ${item.label.toLowerCase()}`}
        className="ml-0.5 rounded-[4px] p-1 text-[#AAAAAA] transition-colors duration-150 hover:bg-[#F5F5F5] hover:text-[#525252] focus-visible:outline-none"
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
