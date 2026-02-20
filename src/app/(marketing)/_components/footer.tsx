"use client";

import { useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { Linkedin, Instagram } from "lucide-react";
import { createClient } from "@/lib/supabase/client";

export function Footer() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");

  const handleSubscribe = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      const supabase = createClient();
      const { error: subscribeError } = await supabase
        .from("newsletter_subscribers")
        .insert([{ email }])
        .single();

      if (subscribeError) {
        if (subscribeError.code === "23505") {
          throw new Error("Already Subscribed!");
        }
        throw subscribeError;
      }

      setSuccess(true);
      setEmail("");
    } catch (err) {
      console.error("Newsletter subscription error:", err);
      setError(err instanceof Error ? err.message : "Failed to subscribe");
    } finally {
      setLoading(false);
    }
  };

  return (
    <footer className="py-12 md:py-16 px-6 md:px-20 border-t border-gray-100">
      <div className="max-w-8xl mx-auto">
        <div className="flex flex-col md:flex-row justify-between">
          {/* Logo & Newsletter Section */}
          <div className="mb-12 md:mb-12">
            <div className="flex flex-row items-center text-left md:text-left">
              <Image
                src="/logos/logo.svg"
                alt="Advantage Logo"
                width={120}
                height={22}
                className="h-6 w-auto mx-auto md:mx-0"
              />
              <div className="h-12 w-px bg-gray-300 mx-4 md:block" />
              <p className="text-sm text-gray-400 max-w-sm mx-auto md:mx-0">
                The world&apos;s first centralized hub for tennis analytics.
                Built for the modern athlete.
              </p>
            </div>

            <div className="mt-8 text-left md:text-left">
              <p className="mb-1 text-sm font-medium text-[#1D1D1F]">
                Get the weekly &apos;Advantage&apos; newsletter
              </p>
              <p className="text-sm text-gray-400 mb-4">
                Tennis analytics in your inbox.
              </p>
              <form
                onSubmit={handleSubscribe}
                className="flex flex-col gap-2 max-w-full mx-auto md:mx-0"
              >
                <div className="flex flex-row gap-2">
                  <input
                    type="email"
                    placeholder="Enter your email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    disabled={loading || success}
                    className="flex-1 px-4 py-2.5 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-black text-sm disabled:opacity-50 disabled:cursor-not-allowed autofill:shadow-[inset_0_0_0px_1000px_white] autofill:text-[#1D1D1F]"
                  />
                  <button
                    type="submit"
                    disabled={loading || success}
                    className="px-6 py-2.5 bg-black enabled:hover:bg-[#659BFF] text-white rounded-lg transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {loading ? "..." : success ? "Subscribed!" : "Subscribe"}
                  </button>
                </div>
                {error && (
                  <p className="text-xs pl-1 text-gray-400">{error}</p>
                )}
              </form>
            </div>
          </div>

          {/* Links Section */}
          <div className="grid grid-cols-2 md:grid-cols-3 md:gap-40 mb-12">
            <div className="text-left">
              <h4 className="font-medium text-[#1D1D1F] mb-4">Product</h4>
              <ul className="space-y-3">
                <li>
                  <button
                    onClick={() =>
                      document
                        .getElementById("hero")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Home
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      document
                        .getElementById("features")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Features
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      document
                        .getElementById("pricing")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Pricing
                  </button>
                </li>
                <li>
                  <button
                    onClick={() =>
                      document
                        .getElementById("testimonial")
                        ?.scrollIntoView({ behavior: "smooth" })
                    }
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Testimonials
                  </button>
                </li>
              </ul>
            </div>

            {/* Mobile: Combined Other section */}
            <div className="md:hidden text-left flex flex-col items-center">
              <div className="w-full max-w-auto">
                <h4 className="font-medium text-[#1D1D1F] mb-4">Other</h4>
                <ul className="space-y-3">
                  <li>
                    <Link
                      href="/contact"
                      className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Contact
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/about"
                      className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      About
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/legal/privacy-policy"
                      className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Privacy
                    </Link>
                  </li>
                  <li>
                    <Link
                      href="/legal/terms-and-conditions"
                      className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      Terms
                    </Link>
                  </li>
                </ul>
              </div>
            </div>

            {/* Desktop: Company section */}
            <div className="hidden md:block text-left">
              <h4 className="font-medium text-[#1D1D1F] mb-4">Company</h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/contact"
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Contact
                  </Link>
                </li>
                <li>
                  <Link
                    href="/about"
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    About
                  </Link>
                </li>
              </ul>
            </div>

            {/* Desktop: Legal section */}
            <div className="hidden md:block text-left">
              <h4 className="font-medium text-[#1D1D1F] mb-4">Legal</h4>
              <ul className="space-y-3">
                <li>
                  <Link
                    href="/legal/privacy-policy"
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Privacy
                  </Link>
                </li>
                <li>
                  <Link
                    href="/legal/terms-and-conditions"
                    className="text-sm text-gray-400 hover:text-gray-600 transition-colors"
                  >
                    Terms
                  </Link>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* Bottom Section */}
        <div className="pt-8 border-t border-gray-100 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-sm text-gray-400 text-center md:text-left">
            &copy; 2025 Advantage Analytics. Built for the modern athlete.
          </p>
          <div className="flex items-center gap-6">
            <Link
              href="https://www.linkedin.com/company/advantage-team-analytics/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="LinkedIn"
            >
              <Linkedin className="w-5 h-5" />
            </Link>
            <Link
              href="https://www.instagram.com/advantage.analytics/"
              target="_blank"
              rel="noopener noreferrer"
              className="text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Instagram"
            >
              <Instagram className="w-5 h-5" />
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}
