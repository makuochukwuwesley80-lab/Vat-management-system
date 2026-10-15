import { requireProfile } from "@/lib/auth";
import {
  getActiveSession,
  getNationalOverview,
  getCenterAttendance,
  getCenters,
} from "@/lib/data";
import { StatCard, PageHeader, SectionCard, Badge, EmptyState } from "@/components/ui";
import { attendanceRate } from "@/lib/logic";

export const dynamic = "force-dynamic";

export async function GeneralPrincipalDashboard() {
  const profile = await requireProfile();
  const session = await getActiveSession();
  const centers = await getCenters();
  const centerOne =
    centers.find((c) => c.is_center_one) ??
    centers.find((c) => c.is_headquarters) ??
    null;

  if (!session) {
    return (
      <>
        <PageHeader title="General Principal — National Overview" />
        <EmptyState
          icon="🗓️"
          title="No active VAT session"
          hint="The System Manager has not yet activated a VAT session. Statistics will appear here once a session is active."
        />
      </>
    );
  }

  const national = await getNationalOverview(session.id);
  const centerOneData = centerOne
    ? await getCenterAttendance(centerOne.id, session.id)
    : null;

  const nationalRate = attendanceRate(national.totals.present, national.totals.students);
  const outstanding = national.centers.filter((c) => c.students > 0 && !c.submitted);

  return (
    <>
      <PageHeader
        title="General Principal — National Overview"
        description={`VAT ${session.year} · session ${session.status} · live figures from the database`}
      >
        <Badge tone={session.status === "active" ? "green" : "amber"}>
          {session.status === "active" ? "● Active session" : "● Session pending"}: VAT {session.year}
        </Badge>
      </PageHeader>

      {/* National statistics */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-6">
        <StatCard label="Centers" value={national.totals.centers} icon="🏛️" accent="blue" />
        <StatCard label="Students" value={national.totals.students} icon="🎓" accent="violet" />
        <StatCard label="Workers" value={national.totals.workers} icon="🧑‍🏫" accent="emerald" />
        <StatCard label="Foster parents" value={national.totals.fosterParents} icon="🏠" accent="amber" />
        <StatCard label="Present today" value={national.totals.present} icon="✅" accent="emerald" />
        <StatCard label="Absent today" value={national.totals.absent} icon="🚫" accent="rose" />
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Center comparison */}
        <SectionCard title={`Center-by-center attendance — ${new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })}`}>
          {national.centers.length === 0 ? (
            <EmptyState icon="🏛️" title="No centers yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs uppercase tracking-wide text-muted">
                    <th className="py-2 pr-3">Center</th>
                    <th className="py-2 pr-3">Students</th>
                    <th className="py-2 pr-3">Present</th>
                    <th className="py-2 pr-3">Rate</th>
                    <th className="py-2">Submission</th>
                  </tr>
                </thead>
                <tbody>
                  {national.centers.map((row) => (
                    <tr key={row.center.id} className="border-t border-black/5 dark:border-white/10">
                      <td className="py-2.5 pr-3 font-medium">
                        {row.center.name}
                        {row.center.is_headquarters && (
                          <span className="ml-2"><Badge tone="blue">HQ</Badge></span>
                        )}
                        {row.center.is_center_one && (
                          <span className="ml-2"><Badge tone="violet" >Center One</Badge></span>
                        )}
                      </td>
                      <td className="py-2.5 pr-3">{row.students}</td>
                      <td className="py-2.5 pr-3">{row.present}</td>
                      <td className="py-2.5 pr-3">{attendanceRate(row.present, row.students)}%</td>
                      <td className="py-2.5">
                        {row.students === 0 ? (
                          <Badge tone="gray">No registrations</Badge>
                        ) : row.submitted ? (
                          <Badge tone="green">✓ Submitted</Badge>
                        ) : (
                          <Badge tone="red">⚠ Outstanding</Badge>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <p className="mt-3 text-xs text-muted">
            National attendance rate today: <strong>{nationalRate}%</strong>
          </p>
        </SectionCard>

        {/* Outstanding submissions */}
        <SectionCard title="Outstanding attendance submissions">
          {outstanding.length === 0 ? (
            <EmptyState icon="✅" title="All centers submitted" hint="Every class attendance record for today has been received." />
          ) : (
            <ul className="flex flex-col gap-2">
              {outstanding.map((c) => (
                <li key={c.center.id} className="flex items-center justify-between rounded-xl bg-red-500/10 px-4 py-3 text-sm">
                  <span className="font-medium">{c.center.name}</span>
                  <Badge tone="red">⚠ Attendance not submitted</Badge>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Center One principal view */}
        {centerOneData && (
          <SectionCard title={`Center One — ${centerOne?.name ?? ""} (principal view)`}>
            <div className="grid grid-cols-3 gap-3">
              <StatCard label="Registered" value={centerOneData.today.total} icon="🎓" accent="blue" />
              <StatCard label="Present" value={centerOneData.today.present} icon="✅" accent="emerald" />
              <StatCard label="Absent" value={centerOneData.today.absent} icon="🚫" accent="rose" />
            </div>
            <ul className="mt-4 flex flex-col gap-1.5 text-sm">
              {centerOneData.byClass.map((c) => (
                <li key={c.className} className="flex items-center justify-between rounded-xl px-3 py-2"
                    style={{ background: "rgba(var(--border)/0.06)" }}>
                  <span className="font-medium">{c.className}</span>
                  <span className="text-muted">{c.present}/{c.total} present</span>
                  {!c.submitted && <Badge tone="red">Not submitted</Badge>}
                </li>
              ))}
            </ul>
          </SectionCard>
        )}
      </div>
    </>
  );
}
