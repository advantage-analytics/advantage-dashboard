// app/auth/error/page.tsx
export default function Page({
  searchParams,
}: { searchParams?: { error?: string } }) {
  const error = searchParams?.error?.trim();

  return (
    <div
      className="
        flex h-full w-full flex-col
        /* Position block within the 440×N panel */
        pt-[0px] pl-[4px]  /* move down/right as needed */
      "
    >
      {/* Heading */}
      <h1 className="text-[22px] leading-[28px] font-semibold tracking-[-0.01em]">
        Sorry, something went wrong.
      </h1>

      {/* Subtext */}
      {error ? (
        <p className="mt-[10px] text-[13px] leading-[20px] text-muted-foreground">
          Code error: <span className="font-medium text-foreground">{error}</span>
        </p>
      ) : (
        <p className="mt-[26px] text-[16px] leading-[20px]">
          An unspecified error occurred.
        </p>
      )}
    </div>
  );
}
