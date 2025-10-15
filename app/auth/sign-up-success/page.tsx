// app/auth/sign-up-success/page.tsx
export const metadata = {
  title: "Sign up successful — Advantage",
  description: "Check your email to confirm your account.",
};

export default function Page() {
  return (
    <div className="flex h-full w-full flex-col">
      {/* Heading + subheading */}
      <div className="mt-[220px]">
        <h1 className="text-[24px] leading-[28px] font-semibold">
          You&apos;ve just joined the winning team.
        </h1>
        <p className="mt-2 text-[16px] leading-[22px]">
          Check your email to confirm
        </p>
      </div>

      {/* Body */}
      <div className="mt-6 max-w-[460px]">
        <p className="text-[16px] leading-[22px]">
          You&apos;ve successfully signed up. Please check your email to confirm
          your account before signing in.
        </p>
      </div>
    </div>
  );
}
