export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div className="w-96 max-w-sm space-y-8">
        {children}
      </div>
    </div>
  );
}
