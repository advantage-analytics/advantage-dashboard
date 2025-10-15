// app/auth/forgot-password/page.tsx
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata = {
  title: "Reset Password — Advantage",
  description: "Type in your email and we'll send you a link to reset your password.",
};

export default function Page() {
  return <ForgotPasswordForm />;
}
