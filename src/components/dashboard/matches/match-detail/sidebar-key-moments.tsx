const CARD_SHELL =
  "bg-white border border-[#F3F3F3] rounded-[14px] shadow-[0px_2px_8px_0px_rgba(0,0,0,0.06)]";

interface SidebarKeyMomentsProps {
  moments: Array<{ moment: string; description: string }>;
}

export function SidebarKeyMoments({ moments }: SidebarKeyMomentsProps) {
  const visible = moments.slice(0, 6);
  const headingId = "sidebar-key-moments-heading";

  return (
    <section
      aria-labelledby={headingId}
      className={`${CARD_SHELL} flex flex-col gap-4 overflow-hidden py-5`}
    >
      <h2
        id={headingId}
        className="text-[10px] font-medium text-[#AAAAAA] uppercase tracking-[2.5px] leading-[15px] px-5"
      >
        Key Moments
      </h2>

      {visible.length === 0 ? (
        <p className="text-[11px] font-normal text-[#888888] leading-[1.6] px-5">
          Key moments will appear here after your match is analyzed.
        </p>
      ) : (
        <ul className="flex flex-col gap-4">
          {visible.map((m, i) => (
            <li key={i} className="flex gap-3 items-start px-5">
              <span
                aria-hidden="true"
                className="w-px h-10 rounded-full shrink-0 bg-[#3B82F6] mt-0.5"
              />
              <div className="flex flex-col gap-1 min-w-0">
                <p className="text-[11px] font-medium text-[#0D0D0D] leading-[18px]">
                  {m.moment}
                </p>
                <p className="text-[11px] font-normal text-[#525252] leading-[18px]">
                  {m.description}
                </p>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
