import { requireProfile } from "@/lib/auth";
import { getActiveSession, getCenterAttendance } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";
import { StatCard, PageHeader, SectionCard, Badge, EmptyState } from "@/components/ui";

export const dynamic = "force-dynamic";

export async function CenterPrincipalDashboard() {
  const profile = await requireProfile();
  const session = await getActiveSession();
  const supabase = await createClient();

  if (!session) {
    return (
      <>
        <PageHeader title="Center Principal" />
        <EmptyState icon="🗓️" title="No active VAT session" hint="Statistics will appear once a session is activated." />
      </>
    );
  }

  if (!profile.center_id) {
    return (
      <>
        <PageHeader title="Center Principal" />
        <EmptyState icon="🔗" title="No center linked" hint="Ask the System Manager to link your account to a center." />
      </>
    );
  }

  const { data: center } = await supabase
    .from("centers")
    .select("*")
    .eq("id", profile.center_id)
    .single();

  const { today: { total, present, absent, rate }, byClass, outstandingClasses } =
    await getCenterAttendance(profile.center_id, session.id);

  return (
    <>
      <PageHeader
        title={`${center?.name ?? "Center"} — Principal Dashboard`}
        description={`VAT ${session.year} · attendance for ${new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Registered students" value={total} icon="🎓" accent="blue" />
        <StatCard label="Present today" value={present} icon="✅" accent="emerald" />
        <StatCard label="Absent today" value={absent} icon="🚫" accent="rose" />
        <StatCard label="Attendance rate" value={`${rate}%`} icon="📊" accent="violet" />
        <StatCard
          label="Classes pending"
          value={outstandingClasses.length}
          icon="⏰"
          accent="amber"
          hint={outstandingClasses.length > 0 ? outstandingClasses.join(", ") : "All submitted"}
        />
      </div>

      <SectionCard title="Class-by-class attendance">
        {byClass.length === 0 ? (
          <EmptyState icon="🎓" title="No students registered yet" hint="Registrations will appear here once the media team registers students." />
        ) : (
          <ul className="flex flex-col gap-2">
            {byClass.map((c) => (
              <li
                key={c.className}
                className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm"
                style={{ background: "rgba(var(--border)/0.06)" }}
              >
                <span className="font-semibold">{c.className}</span>
                <span className="text-muted">{c.present} present / {c.total} registered</span>
                {c.submitted ? <Badge tone="green">✓ Submitted</Badge> : <Badge tone="red">⚠ Not submitted</Badge>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
