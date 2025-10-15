"use client"

import Link from "next/link"
import { Button } from "@/components/ui/button"
import Image from "next/image"


export default function LandingNav() {
  return (
    <>
      {/* top-left logo*/}
      <Link
        href="/"
        aria-label="Advantage — Home"
        className="fixed left-[40px] top-[40px] z-50 inline-flex h-[32px] items-center"
      >
        <Image
          src="/logo.svg"
          alt="Advantage Beta"
          width={180}
          height={32}
        />
      </Link>

      {/* Sign In button */}
      <div className="fixed right-[40px] top-[40px] z-50">
        <Button
          asChild
          size="sm"
          className="h-[32px] w-[80px] px-0 rounded-md border bg-black text-white hover:bg-black/90"
        >
          <Link href="/auth/login">Sign In</Link>
        </Button>
      </div>
    </>
  )
}