import type { ReactNode } from "react";
import type { AuthError, AuthErrorField } from "@/lib/auth/error-messages";

/** The one error treatment in the set: 11px, --error, announced. */
export function ErrorText({ id, children }: { id?: string; children: ReactNode }) {
  return (
    <span id={id} role="alert" className="text-[11px] text-[var(--error)]">
      {children}
    </span>
  );
}

/**
 * The form-level catch-all: renders an error only when no field on this page
 * owns it.
 *
 * Pages declare which fields they render inline rather than each testing for
 * `field === "form"`, because that test silently drops real errors — a
 * `"password"`-attributed message on the reset page, which has no password
 * field, would have rendered nowhere at all.
 */
export default function FormError({
  error,
  inlineFields,
}: {
  error: AuthError | null;
  inlineFields: readonly AuthErrorField[];
}) {
  if (!error || inlineFields.includes(error.field)) return null;
  return <ErrorText>{error.message}</ErrorText>;
}
