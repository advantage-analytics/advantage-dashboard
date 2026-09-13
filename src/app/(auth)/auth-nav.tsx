"use client";

import Link from "next/link";
import Image from "next/image";
import { X } from "lucide-react";

export default function AuthNav() {
  return (
    <header className="fixed top-0 right-0 left-0 z-50 bg-white/80 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none">
      <nav className="mx-auto flex items-center justify-between px-10 py-9 md:px-20">
        {/* Logo */}
        <Link href="/" aria-label="Advantage — Home">
          <Image
            src="/logos/logo.svg"
            alt="Advantage Logo"
            width={120}
            height={22}
            priority
            className="h-6 w-auto md:h-7"
          />
        </Link>

        {/* Navigation actions */}
        <div>
          <Link
            href="/"
            aria-label="Close and return to the landing page"
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--ink-100)] text-[var(--ink-900)] transition-colors duration-[var(--duration-hover)] hover:bg-[var(--ink-900)] hover:text-white focus-visible:shadow-[var(--focus-ring)] focus-visible:outline-none"
          >
            <X className="h-4 w-4" />
          </Link>
        </div>
      </nav>
    </header>
  );
}
