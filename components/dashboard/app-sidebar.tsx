"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  Home, Trophy, ChartColumn, Settings, LifeBuoy, LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { createClient } from "@/lib/supabase/client";

const MAIN_LINKS = [
  { name: "Home", href: "/dashboard", icon: Home },
  { name: "Matches", href: "/dashboard/matches", icon: Trophy },
  { name: "Statistics", href: "/dashboard/statistics", icon: ChartColumn },
] as const;

const BOTTOM_LINKS = [
  { name: "Settings", href: "/dashboard/settings", icon: Settings },
  { name: "Help Center", href: "/dashboard/help", icon: LifeBuoy },
] as const;

export function AppSidebar() {
  const pathname = usePathname();
  const router = useRouter();

  const handleLogout = async () => {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/");
  };

  return (
    <aside
      className="group/sidebar fixed left-0 top-0 z-40 flex h-screen w-16 flex-col bg-white border-r border-gray-200 overflow-hidden transition-[width] duration-300 ease-out hover:w-64"
    >
      {/* Logo */}
      <Link href="/" className="flex items-center h-20 px-4 shrink-0">
        <div className="w-8 flex justify-center shrink-0">
          <img
            src="/logo3.svg"
            alt="Advantage"
            className="w-7 h-5 brightness-0"
          />
        </div>
        <img
          src="/logo5.svg"
          alt="ADVANTAGE"
          className="ml-3 h-5 opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100"
        />
      </Link>

      {/* Main Navigation */}
      <nav className="flex-1 px-2 py-2">
        <ul className="flex flex-col gap-1">
          {MAIN_LINKS.map(({ name, href, icon: Icon }) => {
            const active = pathname === href || (href !== "/dashboard" && pathname?.startsWith(href));

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center h-10 px-3 rounded-xl gap-3",
                    active ? "bg-blue-50 text-blue-500" : "text-gray-900 hover:bg-blue-50 hover:text-blue-500"
                  )}
                >
                  <div className="w-8 flex justify-center shrink-0">
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
                    {name}
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom Section */}
      <div className="px-2 pb-6 shrink-0">
        <div className="mx-2 mb-4 h-px bg-gray-200" />
        <ul className="flex flex-col gap-1">
          {BOTTOM_LINKS.map(({ name, href, icon: Icon }) => {
            const active = pathname === href || pathname?.startsWith(href);

            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center h-10 px-3 rounded-xl gap-3",
                    active ? "bg-blue-50 text-blue-500" : "text-gray-900 hover:bg-blue-50 hover:text-blue-500"
                  )}
                >
                  <div className="w-8 flex justify-center shrink-0">
                    <Icon className="w-5 h-5" strokeWidth={2} />
                  </div>
                  <span className="text-sm font-medium whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
                    {name}
                  </span>
                </Link>
              </li>
            );
          })}
          <li>
            <button
              onClick={handleLogout}
              className="flex items-center h-10 w-full px-3 rounded-xl gap-3 text-gray-900 hover:bg-blue-50 hover:text-blue-500"
            >
              <div className="w-8 flex justify-center shrink-0">
                <LogOut className="w-5 h-5" strokeWidth={2} />
              </div>
              <span className="text-sm font-medium whitespace-nowrap opacity-0 transition-opacity duration-200 group-hover/sidebar:opacity-100">
                Logout
              </span>
            </button>
          </li>
        </ul>
      </div>
    </aside>
  );
}
