interface WelcomeBannerProps {
  name?: string;
  school?: string;
  classYear?: string;
}

export function WelcomeBanner({
  name = "Player Name",
  school = "School Name",
  classYear = "Class Year",
}: WelcomeBannerProps) {
  return (
    <div className="bg-white text-gray-900 border border-gray-200 p-6 rounded-lg mb-6">
      <h1 className="text-2xl font-bold mb-2">Welcome, {name}</h1>
      <p>
        {school} | {classYear}
      </p>
    </div>
  );
}
