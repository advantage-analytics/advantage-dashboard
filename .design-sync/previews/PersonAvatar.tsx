import { PersonAvatar } from "advantage-analytics-ds";

/** Size and type scale come from the call site — the same person at 22, 26, 36 and 40px. */
export function Sizes() {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <PersonAvatar initials="JL" className="size-[22px] text-[8px]" />
      <PersonAvatar initials="JL" className="size-[26px] text-[9px]" />
      <PersonAvatar initials="JL" className="size-9 text-[12px]" />
      <PersonAvatar initials="JL" className="size-[40px] text-[13px]" />
    </div>
  );
}

/** A photo, when the person set one, at the same size. */
export function Photo() {
  const svg = encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><rect width="40" height="40" fill="#CBD5E1"/><circle cx="20" cy="15" r="7" fill="#64748B"/><path d="M6 38c2-9 8-13 14-13s12 4 14 13z" fill="#64748B"/></svg>',
  );
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
      <PersonAvatar
        initials="EV"
        photoUrl={`data:image/svg+xml;utf8,${svg}`}
        className="size-[26px] text-[9px]"
      />
      <PersonAvatar
        initials="EV"
        photoUrl={`data:image/svg+xml;utf8,${svg}`}
        className="size-[40px] text-[13px]"
      />
    </div>
  );
}
