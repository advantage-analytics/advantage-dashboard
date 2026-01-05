interface WelcomeMessageProps {
  name?: string;
}

export default function WelcomeMessage({
  name = "Player",
}: WelcomeMessageProps) {
  return (
    <div className="flex flex-row items-center px-4 gap-6 shrink-0">
      <div className="h-20 w-20 rounded-full bg-gray-100"></div>
      <div className="flex flex-col gap-2">
        <p className="font-medium text-white text-3xl">
          Welcome Back, Clajerson Gimena!
        </p>
        <p className="font-medium text-white text-base">
          Take your game to the next level with data-driven insights.
        </p>
      </div>
    </div>
  );
}
