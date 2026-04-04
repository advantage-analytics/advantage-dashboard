interface WelcomeMessageProps {
  name?: string;
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
}

function getFormattedDate(): string {
  const now = new Date();
  return now
    .toLocaleDateString("en-US", {
      weekday: "long",
      month: "long",
      day: "numeric",
    })
    .replace(",", ",");
}

export default function WelcomeMessage({ name = "Player" }: WelcomeMessageProps) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs font-medium text-[#999999] uppercase tracking-[1.2px] leading-4">
        {getFormattedDate()}
      </p>
      <h1 className="font-light text-[30px] text-white tracking-[-0.6px] leading-[30px]">
        {getGreeting()}, {name}
      </h1>
    </div>
  );
}
