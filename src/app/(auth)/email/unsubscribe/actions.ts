"use server";

import { redirect } from "next/navigation";

import { applyUnsubscribe } from "@/lib/services/notifications/unsubscribe-action";

/** The button on `/email/unsubscribe`. POST only, so a mail scanner's GET of
 *  the link never turns anyone's mail off. */
export async function unsubscribeForm(formData: FormData) {
  const read = (name: string) => {
    const value = formData.get(name);
    return typeof value === "string" ? value : null;
  };
  const outcome = await applyUnsubscribe(read("u"), read("t"));
  redirect(`/email/unsubscribe?status=${outcome}`);
}
