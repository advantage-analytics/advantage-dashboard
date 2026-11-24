import { notFound } from "next/navigation";
import { SignedInCard } from "@/components/auth/signed-in-card";

export const metadata = { title: "Signed in — design" };

/**
 * `/login` and `/sign-up` as an already-signed-in browser sees them: the
 * shipped `SignedInCard` on a fixture account, inside the real (auth)
 * layout. `?mode=sign-up` shows the sign-up copy; `?name=0` the account with
 * no name on file. Reads no data and needs no session. Gated like `/design`:
 * a 404 on the production deployment only.
 */
export default async function SignedInAuthDesignPage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  if (process.env.VERCEL_ENV === "production") notFound();
  const { mode, name } = await searchParams;
  return (
    <SignedInCard
      mode={mode === "sign-up" ? "sign-up" : "login"}
      account={{
        name: name === "0" ? null : "Jordan Avery",
        email: "jordan.avery@university.edu",
      }}
    />
  );
}
