interface WelcomeMessageProps {
  name?: string;
}

function getInitials(name: string): string {
  return name
    .split(" ")
    .map((word) => word[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);
}

export default function WelcomeMessage({
  name = "Player",
}: WelcomeMessageProps) {
  const initials = getInitials(name);

  return (
    <div className="flex flex-row items-center gap-5">
      <div className="size-20 rounded-full bg-white/20 flex items-center justify-center">
        <span className="text-white text-2xl font-medium tracking-wide">
          {initials}
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <h1 className="font-medium text-white text-3xl tracking-tight">
          Welcome back, {name}
        </h1>
        <p className="text-white/70 text-base">
          Take your game to the next level with data-driven insights.
        </p>
      </div>
    </div>
  );
}
