import { Logo } from "@/components/Logo";

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh items-center justify-center p-4">
      <div className="w-full max-w-md animate-fade-up">{children}</div>
    </div>
  );
}

export function LoginHeader() {
  return (
    <div className="mb-6 flex flex-col items-center text-center">
      <Logo size={72} />
      <h1 className="mt-4 text-2xl font-bold tracking-tight">VAT Management System</h1>
      <p className="mt-1 text-sm text-muted">
        Vacation Adolescent Training — Centers across Nigeria
      </p>
    </div>
  );
}
