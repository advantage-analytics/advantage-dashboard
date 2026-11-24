import type { ReactNode } from "react";
import AuthLayout from "@/app/(auth)/layout";

/** The real (auth) split, so the card is judged in the frame it ships in. */
export default function SignedInAuthDesignLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <AuthLayout>{children}</AuthLayout>;
}
