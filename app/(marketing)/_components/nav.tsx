"use client";

import Link from "next/link";
import Image from "next/image";
import { Menu, X } from "lucide-react";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";

export function Nav() {
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  const scrollToSection = (sectionId: string) => {
    setMobileMenuOpen(false);

    // If we're on the landing page, scroll directly
    if (pathname === "/") {
      const element = document.getElementById(sectionId);
      if (element) {
        element.scrollIntoView({ behavior: "smooth" });
      }
    } else {
      // If we're on another page, navigate to landing page with hash
      router.push(`/#${sectionId}`);
      // Wait for navigation and DOM to be ready, then scroll
      let attempts = 0;
      const maxAttempts = 20;
      const attemptScroll = () => {
        const element = document.getElementById(sectionId);
        if (element) {
          element.scrollIntoView({ behavior: "smooth" });
        } else if (attempts < maxAttempts) {
          attempts++;
          setTimeout(attemptScroll, 50);
        }
      };
      setTimeout(attemptScroll, 100);
    }
  };

  return (
    <>
      {/* Mobile Menu Overlay */}
      <div
        className={`md:hidden fixed inset-0 bg-black/80 backdrop-blur-lg z-[45] transition-opacity duration-300 ease-out ${
          mobileMenuOpen ? "opacity-100" : "opacity-0 pointer-events-none"
        }`}
      >
        <div className="flex flex-col items-start gap-6 pt-36 pl-10">
          <button
            onClick={() => scrollToSection("features")}
            className="text-lg font-normal text-white hover:text-gray-300 transition-colors"
          >
            Features
          </button>
          <button
            onClick={() => scrollToSection("pricing")}
            className="text-lg font-normal text-white hover:text-gray-300 transition-colors"
          >
            Pricing
          </button>
          <Link
            href="/contact"
            className="text-lg font-normal text-white hover:text-gray-300 transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            Contact
          </Link>
          <Link
            href="/about"
            className="text-lg font-normal text-white hover:text-gray-300 transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            About
          </Link>
          <Link
            href="/waitlist"
            className="text-lg font-normal text-purple-400 hover:text-purple-300 transition-colors"
            onClick={() => setMobileMenuOpen(false)}
          >
            BETA
          </Link>
        </div>
      </div>

      <header
        className={`fixed top-0 left-0 right-0 z-50 transition-all ${
          mobileMenuOpen ? "bg-transparent" : "bg-white/10 backdrop-blur-sm"
        }`}
      >
        <nav className="mx-auto flex items-center justify-between px-10 py-9 md:px-20">
          {/* Logo */}
          <Link href="/" aria-label="Advantage — Home">
            <Image
              src="/logos/logo.svg"
              alt="Advantage Logo"
              width={120}
              height={22}
              priority
              className={`h-6 w-auto md:h-7 transition-all ${
                mobileMenuOpen ? "brightness-0 invert" : ""
              }`}
            />
          </Link>

          {/* Center Nav Links - Desktop */}
          <div className="hidden md:flex items-center gap-8 h-8">
            <button
              onClick={() => scrollToSection("features")}
              className="text-[16px] font-normal text-gray-400 hover:text-gray-600 transition-colors"
            >
              Features
            </button>
            <button
              onClick={() => scrollToSection("pricing")}
              className="text-[16px] font-normal text-gray-400 hover:text-gray-600 transition-colors"
            >
              Pricing
            </button>
            <Link
              href="/contact"
              className="text-[16px] font-normal text-gray-400 hover:text-gray-600 transition-colors"
            >
              Contact
            </Link>
            <Link
              href="/about"
              className="text-[16px] font-normal text-gray-400 hover:text-gray-600 transition-colors"
            >
              About
            </Link>
            <Link
              href="/waitlist"
              className="text-[16px] font-normal text-purple-400 hover:text-purple-600 transition-colors"
            >
              BETA
            </Link>
          </div>

          {/* Mobile Menu Button */}
          <button
            className="md:hidden p-2"
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            aria-label="Toggle menu"
          >
            {mobileMenuOpen ? (
              <X className="h-6 w-6 text-white" />
            ) : (
              <Menu className="h-6 w-6 text-gray-900" />
            )}
          </button>
        </nav>
      </header>
    </>
  );
}
