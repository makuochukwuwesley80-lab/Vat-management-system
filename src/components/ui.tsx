import { Logo } from "@/components/Logo";

export function StatCard({
  label,
  value,
  icon,
  accent = "blue",
  hint,
}: {
  label: string;
  value: string | number;
  icon: string;
  accent?: "blue" | "emerald" | "amber" | "rose" | "violet";
  hint?: string;
}) {
  const accents: Record<string, string> = {
    blue: "from-blue-500/20 to-blue-500/5 text-blue-500",
    emerald: "from-emerald-500/20 to-emerald-500/5 text-emerald-500",
    amber: "from-amber-500/20 to-amber-500/5 text-amber-500",
    rose: "from-rose-500/20 to-rose-500/5 text-rose-500",
    violet: "from-violet-500/20 to-violet-500/5 text-violet-500",
  };
  return (
    <div className="card flex items-center gap-4 animate-fade-up">
      <div
        className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br text-xl ${accents[accent]}`}
        aria-hidden
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs font-medium uppercase tracking-wide text-muted">{label}</p>
        <p className="truncate text-2xl font-bold tracking-tight">{value}</p>
        {hint ? <p className="truncate text-xs text-muted">{hint}</p> : null}
      </div>
    </div>
  );
}

export function PageHeader({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children?: React.ReactNode;
}) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{title}</h1>
        {description ? <p className="mt-1 text-sm text-muted">{description}</p> : null}
      </div>
      {children ? <div className="flex flex-wrap gap-2">{children}</div> : null}
    </div>
  );
}

export function EmptyState({ icon = "📭", title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="card flex flex-col items-center justify-center gap-2 py-12 text-center">
      <span className="text-4xl" aria-hidden>{icon}</span>
      <p className="font-semibold">{title}</p>
      {hint ? <p className="max-w-sm text-sm text-muted">{hint}</p> : null}
    </div>
  );
}

export function SectionCard({
  title,
  children,
  action,
}: {
  title: string;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="card animate-fade-up">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </div>
  );
}

export function BrandMark() {
  return (
    <div className="flex items-center gap-2.5">
      <Logo size={34} />
      <div className="leading-tight">
        <p className="text-sm font-bold tracking-tight">VAT Portal</p>
        <p className="text-[11px] text-muted">VAT Management System</p>
      </div>
    </div>
  );
}

export function Badge({ children, tone = "blue" }: { children: React.ReactNode; tone?: "blue" | "green" | "red" | "amber" | "gray" | "violet" }) {
  const tones: Record<string, string> = {
    blue: "bg-blue-500/15 text-blue-600 dark:text-blue-300 border-blue-500/25",
    green: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border-emerald-500/25",
    red: "bg-red-500/15 text-red-600 dark:text-red-300 border-red-500/25",
    amber: "bg-amber-500/15 text-amber-600 dark:text-amber-300 border-amber-500/25",
    gray: "bg-slate-500/15 text-slate-600 dark:text-slate-300 border-slate-500/25",
    violet: "bg-violet-500/15 text-violet-600 dark:text-violet-300 border-violet-500/25",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}

export { Logo };
