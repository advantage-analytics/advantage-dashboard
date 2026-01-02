"use client";

import Link from "next/link";
import { Button } from "@/components/ui/button";
import Image from "next/image";
import { X } from "lucide-react";

export default function AuthNav() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-white/80 backdrop-blur-sm md:bg-transparent md:backdrop-blur-none">
      <nav className="mx-auto flex items-center justify-between px-10 py-9 md:px-20">
        {/* Logo */}
        <Link href="/" aria-label="Advantage — Home">
          <Image
            src="/logo.svg"
            alt="Advantage Logo"
            width={120}
            height={22}
            priority
            className="h-6 w-auto md:h-7"
          />
        </Link>

        {/* Navigation actions */}
        <div>
          <Button
            asChild
            variant="ghost"
            size="icon"
            className="h-8 w-8 rounded-full text-black hover:text-white bg-gray-500/10 hover:bg-black/80"
          >
            <Link href="/">
              <X className="h-4 w-4" />
            </Link>
          </Button>
        </div>
      </nav>
    </header>
  );
}
