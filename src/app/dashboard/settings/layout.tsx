"use client";

import { ReactNode } from "react";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { SettingsNavigation } from "@/components/dashboard/settings/settings-navigation";

interface SettingsLayoutProps {
  children: ReactNode;
}

const EASE_CURVE: [number, number, number, number] = [0.25, 0.46, 0.45, 0.94];

const PAGE_META: Record<string, { eyebrow: string; subtitle: string }> = {
  profile: {
    eyebrow: "Profile",
    subtitle: "Identity, contact, and tennis information.",
  },
  account: {
    eyebrow: "Account",
    subtitle: "Credentials, sign-in method, and account removal.",
  },
  subscription: {
    eyebrow: "Subscription",
    subtitle: "Plan selection and billing.",
  },
};

export default function SettingsLayout({ children }: SettingsLayoutProps) {
  const pathname = usePathname();
  const segment =
    Object.keys(PAGE_META).find((k) => pathname?.includes(k)) ?? "profile";
  const meta = PAGE_META[segment];

  return (
    <div className="flex-1 w-full min-h-screen bg-[var(--color-surface-card)]">
      <div className="pl-12 pr-8 py-10">
        {/* Page Header — mirrors home/auth: eyebrow + light 30px title */}
        <header className="mb-12 flex flex-col gap-3">
          <p className="text-[10px] font-medium text-[var(--color-ink-400)] uppercase tracking-[2.5px]">
            Settings
          </p>
          <h1 className="font-light text-[30px] text-[var(--color-ink-900)] tracking-[-0.6px] leading-[36px]">
            {meta.eyebrow}
          </h1>
          <p className="text-[13px] text-[var(--color-ink-700)] leading-[1.6] max-w-xl">
            {meta.subtitle}
          </p>
        </header>

        {/* Body */}
        <div className="flex flex-col md:flex-row gap-12">
          <SettingsNavigation />
          <div className="flex-1 min-w-0">
            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={pathname}
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.25, ease: EASE_CURVE }}
              >
                {children}
              </motion.div>
            </AnimatePresence>
          </div>
        </div>
      </div>
    </div>
  );
}
