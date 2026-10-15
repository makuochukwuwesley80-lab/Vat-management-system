"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { submitAttendance, saveScore, savePdrRecord, savePdrNote, markNotificationsRead } from "@/app/actions";
import { PageHeader, StatCard, SectionCard, EmptyState, Badge } from "@/components/ui";
import { SCORE_COMPONENTS, type Profile, type WorkerAssignment } from "@/lib/types";
import { validateScore } from "@/lib/logic";

type Row = Record<string, unknown>;

const NOT_REGISTERED =
  "You are not registered for this responsibility. Please contact the media team.";

export function WorkerDashboard({ profile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const [assignments, setAssignments] = useState<WorkerAssignment[] | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: session }, { data: worker }] = await Promise.all([
        supabase.from("vat_sessions").select("id").eq("status", "active").limit(1).maybeSingle(),
        supabase.from("workers").select("id").eq("profile_id", profile.id).eq("is_active", true).limit(1).maybeSingle(),
      ]);
      if (!worker) {
        setAssignments([]);
        return;
      }
      setWorkerId(worker.id);
      if (!session) {
        setAssignments([]);
        return;
      }
      const { data, error } = await supabase
        .from("worker_assignments")
        .select("*, responsibilities(name), school_classes(name), subjects(name), gdc_groups(name), pdr_groups(identifier, gender)")
        .eq("worker_id", worker.id)
        .eq("session_id", session.id)
        .eq("is_active", true);
      if (error) setError(error.message);
      setAssignments((data as unknown as WorkerAssignment[]) ?? []);
    })();
  }, [supabase, profile.id]);

  const respNames = new Set((assignments ?? []).map((a) => a.responsibilities?.name));
  const has = (r: string) => respNames.has(r);

  if (assignments === null) {
    return <div className="card animate-pulse">Loading your dashboard…</div>;
  }

  const tabs: { key: string; label: string; available: boolean }[] = [
    { key: "form_teacher", label: "Form Teacher", available: has("Form Teacher") },
    { key: "subject_teacher", label: "Subject Teacher", available: has("Subject Teacher") },
    { key: "gdc_teacher", label: "GDC Teacher", available: has("GDC Teacher") },
    { key: "pdr_parent", label: "PDR Parent", available: has("PDR Parent") },
  ];

  return (
    <>
      <PageHeader
        title={`Welcome, ${profile.full_name}`}
        description="Your assigned responsibilities for the active VAT session."
      />

      {error && (
        <p role="alert" className="mb-4 rounded-xl border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-600 dark:text-red-300">
          {error}
        </p>
      )}

      {assignments.length === 0 ? (
        <EmptyState
          icon="📋"
          title="No responsibilities assigned yet"
          hint="The media team will assign your responsibilities. You will see them here as soon as they are assigned."
        />
      ) : (
        <div className="mb-6 grid gap-3 sm:grid-cols-2">
          {assignments.map((a) => (
            <div key={a.id} className="card flex items-center gap-3 animate-fade-up">
              <span className="text-2xl" aria-hidden>📌</span>
              <div>
                <p className="font-semibold">{a.responsibilities?.name}</p>
                <p className="text-xs text-muted">
                  {a.school_classes?.name ? `${a.school_classes.name} · ` : ""}
                  {a.subjects?.name ? `${a.subjects.name} · ` : ""}
                  {a.gdc_groups?.name ? `${a.gdc_groups.name} · ` : ""}
                  {a.pdr_groups ? `PDR ${a.pdr_groups.identifier} (${a.pdr_groups.gender})` : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.filter((t) => t.available).map((t) => (
          <button
            key={t.key}
            className={activeTab === t.key ? "btn-primary" : "btn-secondary"}
            onClick={() => setActiveTab(t.key)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Blocked access for unassigned responsibility */}
      {activeTab && !tabs.find((t) => t.key === activeTab)?.available && (
        <p className="card text-sm text-red-600 dark:text-red-300">{NOT_REGISTERED}</p>
      )}

      {activeTab === "form_teacher" && workerId && <FormTeacherPanel supabase={supabase} />}
      {activeTab === "subject_teacher" && <SubjectTeacherPanel supabase={supabase} assignments={assignments} />}
      {activeTab === "gdc_teacher" && <GdcTeacherPanel supabase={supabase} />}
      {activeTab === "pdr_parent" && <PdrParentPanel supabase={supabase} />}
    </>
  );
}

type SupabaseClient = ReturnType<typeof createClient>;

// ---------------------------------------------------------------------------
function FormTeacherPanel({ supabase }: { supabase: SupabaseClient }) {
  const [classId, setClassId] = useState<string | null>(null);
  const [roster, setRoster] = useState<{ registration_id: string; student_id: string; name: string }[]>([]);
  const [statuses, setStatuses] = useState<Record<string, "present" | "absent">>({});
  const [existing, setExisting] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: session }, { data: me }] = await Promise.all([
        supabase.from("vat_sessions").select("id").eq("status", "active").limit(1).maybeSingle(),
        supabase.from("workers").select("id").eq("profile_id", (await supabase.auth.getUser()).data.user?.id).maybeSingle(),
      ]);
      if (!session || !me) return;
      const { data: assignment } = await supabase
        .from("worker_assignments")
        .select("school_class_id")
        .eq("worker_id", me.id).eq("session_id", session.id).eq("is_active", true)
        .not("school_class_id", "is", null)
        .limit(1).maybeSingle();
      if (!assignment?.school_class_id) return;
      setClassId(assignment.school_class_id);

      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
      const [{ data: regs }, { data: sub }] = await Promise.all([
        supabase
          .from("student_registrations")
          .select("id, student_id, students(full_name)")
          .eq("session_id", session.id).eq("school_class_id", assignment.school_class_id).eq("is_alumni", false),
        supabase
          .from("attendance_submissions")
          .select("id")
          .eq("class_id", assignment.school_class_id).eq("session_id", session.id).eq("attendance_date", today)
          .maybeSingle(),
      ]);
      setExisting(!!sub);
      const roster = (regs ?? []).map((r: Row) => ({
        registration_id: r.id as string,
        student_id: r.student_id as string,
        name: ((r.students as Row[] | null)?.[0]?.full_name as string) ?? "Unknown",
      }));
      setRoster(roster);
      const { data: att } = await supabase
        .from("attendance")
        .select("registration_id, status")
        .eq("session_id", session.id).eq("attendance_date", today);
      const map: Record<string, "present" | "absent"> = {};
      for (const a of att ?? []) map[(a as Row).registration_id as string] = (a as Row).status as "present" | "absent";
      setStatuses(map);
    })();
  }, [supabase]);

  if (!classId) return <EmptyState icon="🏫" title="No class assigned" hint={NOT_REGISTERED} />;

  const presentCount = Object.values(statuses).filter((s) => s === "present").length;

  async function submit() {
    if (!classId) return;
    const records = roster.map((r) => ({
      registration_id: r.registration_id,
      student_id: r.student_id,
      status: statuses[r.registration_id] ?? "absent",
    }));
    const res = await submitAttendance({ class_id: classId, records });
    setMsg(res.ok ? "Attendance submitted successfully." : res.error ?? "Failed to submit.");
    setExisting(res.ok);
  }

  return (
    <SectionCard title={`Daily attendance — ${new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" })}`}>
      {roster.length === 0 ? (
        <EmptyState icon="🎓" title="No students registered in this class" />
      ) : (
        <>
          {existing && (
            <p className="mb-3 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300">
              ✓ Attendance already submitted today. You can review and correct below — corrections are recalculated immediately.
            </p>
          )}
          <div className="mb-3 flex flex-wrap gap-2">
            <button className="btn-secondary" onClick={() => setStatuses(Object.fromEntries(roster.map((r) => [r.registration_id, "present" as const])))}>
              Mark all present
            </button>
            <span className="text-sm text-muted self-center">{presentCount}/{roster.length} present</span>
          </div>
          <ul className="flex flex-col gap-1.5">
            {roster.map((r) => (
              <li key={r.registration_id} className="flex items-center justify-between gap-3 rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(var(--border)/0.06)" }}>
                <span className="min-w-0 truncate font-medium">{r.name}</span>
                <span className="flex shrink-0 gap-1">
                  {(["present", "absent"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setStatuses((prev) => ({ ...prev, [r.registration_id]: s }))}
                      className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition ${
                        statuses[r.registration_id] === s
                          ? s === "present"
                            ? "bg-emerald-500 text-white"
                            : "bg-red-500 text-white"
                          : "bg-black/5 dark:bg-white/10"
                      }`}
                      aria-pressed={statuses[r.registration_id] === s}
                    >
                      {s}
                    </button>
                  ))}
                </span>
              </li>
            ))}
          </ul>
          {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
          <button onClick={submit} className="btn-primary mt-4 w-full sm:w-auto">
            {existing ? "Update attendance" : "Submit attendance"}
          </button>
        </>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
function SubjectTeacherPanel({ supabase, assignments }: { supabase: SupabaseClient; assignments: WorkerAssignment[] }) {
  const subjectAssignments = assignments.filter((a) => a.subject_id && a.school_class_id);
  const [sel, setSel] = useState(0);
  const [roster, setRoster] = useState<{ reg_id: string; student_id: string; name: string }[]>([]);
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: session } = await supabase.from("vat_sessions").select("id").eq("status", "active").limit(1).maybeSingle();
      if (!session || !subjectAssignments[sel]) return;
      const a = subjectAssignments[sel];
      const { data: regs } = await supabase
        .from("student_registrations")
        .select("id, student_id, students(full_name)")
        .eq("session_id", session.id).eq("school_class_id", a.school_class_id!).eq("is_alumni", false);
      const r = (regs ?? []).map((x: Row) => ({
        reg_id: x.id as string,
        student_id: x.student_id as string,
        name: ((x.students as Row[] | null)?.[0]?.full_name as string) ?? "",
      }));
      setRoster(r);

      const { data: existing } = await supabase
        .from("scores")
        .select("student_id, component, marks")
        .eq("session_id", session.id).eq("subject_id", a.subject_id!);
      const map: Record<string, Record<string, string>> = {};
      for (const s of existing ?? []) {
        const row = s as { student_id: string; component: string; marks: number };
        (map[row.student_id] ??= {})[row.component] = String(row.marks);
      }
      setScores(map);
    })();
  }, [supabase, sel, subjectAssignments.length]); // eslint-disable-line react-hooks/exhaustive-deps

  if (subjectAssignments.length === 0)
    return <EmptyState icon="📚" title="No subject assignment" hint={NOT_REGISTERED} />;

  const a = subjectAssignments[sel];

  async function save(studentId: string, component: string, value: string) {
    const marks = Number(value);
    if (value === "" || Number.isNaN(marks)) return;
    const err = validateScore(component as "first_ca" | "second_ca" | "exam", marks);
    if (err) {
      setMsg(err);
      return;
    }
    const res = await saveScore({
      student_id: studentId,
      subject_id: a.subject_id!,
      component: component as "first_ca" | "second_ca" | "exam",
      marks,
    });
    setMsg(res.ok ? "Score saved." : res.error ?? "Failed to save score.");
  }

  return (
    <SectionCard
      title="Score entry"
      action={
        <select
          className="input-base w-auto"
          value={sel}
          onChange={(e) => setSel(Number(e.target.value))}
          aria-label="Select class and subject"
        >
          {subjectAssignments.map((x, i) => (
            <option key={x.id} value={i}>
              {x.school_classes?.name} — {x.subjects?.name}
            </option>
          ))}
        </select>
      }
    >
      {roster.length === 0 ? (
        <EmptyState icon="🎓" title="No students in this class" />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Student</th>
                {SCORE_COMPONENTS.map((c) => (
                  <th key={c.key} className="py-2 pr-3">{c.label} ({c.max})</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {roster.map((r) => (
                <tr key={r.reg_id} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-2 pr-3 font-medium">{r.name}</td>
                  {SCORE_COMPONENTS.map((c) => (
                    <td key={c.key} className="py-2 pr-3">
                      <input
                        className="input-base w-20"
                        type="number"
                        min={0}
                        max={c.max}
                        inputMode="numeric"
                        aria-label={`${c.label} for ${r.name}`}
                        value={scores[r.student_id]?.[c.key] ?? ""}
                        onChange={(e) => {
                          const v = e.target.value;
                          setScores((prev) => ({ ...prev, [r.student_id]: { ...(prev[r.student_id] ?? {}), [c.key]: v } }));
                          save(r.student_id, c.key, v);
                        }}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
      <p className="mt-2 text-xs text-muted">Scores save automatically as you type. First CA 20 · Second CA 20 · Examination 60.</p>
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
function GdcTeacherPanel({ supabase }: { supabase: SupabaseClient }) {
  const [groupId, setGroupId] = useState<string | null>(null);
  const [students, setStudents] = useState<{ id: string; name: string }[]>([]);
  const [present, setPresent] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: session }, { data: me }] = await Promise.all([
        supabase.from("vat_sessions").select("id").eq("status", "active").limit(1).maybeSingle(),
        supabase.from("workers").select("id").eq("profile_id", (await supabase.auth.getUser()).data.user?.id).maybeSingle(),
      ]);
      if (!session || !me) return;
      const { data: assignment } = await supabase
        .from("worker_assignments")
        .select("gdc_group_id")
        .eq("worker_id", me.id).eq("session_id", session.id).eq("is_active", true)
        .not("gdc_group_id", "is", null)
        .limit(1).maybeSingle();
      if (!assignment?.gdc_group_id) return;
      setGroupId(assignment.gdc_group_id);
      const { data: members } = await supabase
        .from("gdc_members")
        .select("id, student_id, students(full_name)")
        .eq("group_id", assignment.gdc_group_id).eq("session_id", session.id);
      setStudents((members ?? []).map((m: Row) => ({
        id: m.student_id as string,
        name: ((m.students as Row[] | null)?.[0]?.full_name as string) ?? "",
      })));
      const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
      const { data: att } = await supabase
        .from("gdc_attendance")
        .select("student_id, present")
        .eq("group_id", assignment.gdc_group_id).eq("session_date", today);
      const map: Record<string, boolean> = {};
      for (const a of att ?? []) map[(a as Row).student_id as string] = (a as Row).present as boolean;
      setPresent(map);
    })();
  }, [supabase]);

  if (!groupId) return <EmptyState icon="📖" title="No GDC group assigned" hint={NOT_REGISTERED} />;

  async function save() {
    const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
    const rows = students.map((s) => ({ group_id: groupId, student_id: s.id, session_date: today, present: !!present[s.id] }));
    const { error } = await supabase
      .from("gdc_attendance")
      .upsert(rows, { onConflict: "student_id,session_date,session_id" });
    setMsg(error ? error.message : "GDC attendance saved.");
  }

  return (
    <SectionCard title="GDC attendance (Tuesdays & Thursdays)">
      {students.length === 0 ? (
        <EmptyState icon="🎓" title="No students assigned to your GDC group" />
      ) : (
        <>
          <ul className="flex flex-col gap-1.5">
            {students.map((s) => (
              <li key={s.id} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(var(--border)/0.06)" }}>
                <span className="font-medium">{s.name}</span>
                <label className="flex items-center gap-2 text-xs">
                  <input
                    type="checkbox"
                    checked={!!present[s.id]}
                    onChange={(e) => setPresent((p) => ({ ...p, [s.id]: e.target.checked }))}
                  />
                  Present
                </label>
              </li>
            ))}
          </ul>
          <button onClick={save} className="btn-primary mt-4">Save GDC attendance</button>
          {msg && <p className="mt-2 text-sm text-muted">{msg}</p>}
        </>
      )}
    </SectionCard>
  );
}

// ---------------------------------------------------------------------------
function PdrParentPanel({ supabase }: { supabase: SupabaseClient }) {
  const [members, setMembers] = useState<{
    member_id: string; student_id: string; name: string; class_name: string;
    is_born_again: boolean | null; water_baptized: boolean; prefectship: boolean;
    problems: string; conclusion: string;
  }[]>([]);
  const [sel, setSel] = useState<number | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    (async () => {
      const [{ data: session }, { data: me }] = await Promise.all([
        supabase.from("vat_sessions").select("id").eq("status", "active").limit(1).maybeSingle(),
        supabase.from("workers").select("id").eq("profile_id", (await supabase.auth.getUser()).data.user?.id).maybeSingle(),
      ]);
      if (!session || !me) { setLoaded(true); return; }
      const { data: assignments } = await supabase
        .from("worker_assignments")
        .select("pdr_group_id")
        .eq("worker_id", me.id).eq("session_id", session.id).eq("is_active", true)
        .not("pdr_group_id", "is", null);
      const groupIds = (assignments ?? []).map((a: Row) => a.pdr_group_id as string);
      if (groupIds.length === 0) { setLoaded(true); return; }
      const { data: rows } = await supabase
        .from("pdr_members")
        .select("id, student_id, students(full_name, is_born_again), student_registrations(school_class_id)")
        .in("group_id", groupIds).eq("session_id", session.id);
      const { data: classes } = await supabase.from("school_classes").select("id, name");
      const className = (id: unknown) =>
        (classes ?? []).find((c: Row) => c.id === id)?.name as string | undefined;

      const list = [];
      for (const m of rows ?? []) {
        const row = m as Row;
        const regs = row.student_registrations as Row[] | null;
        const [{ data: rec }, { data: note }] = await Promise.all([
          supabase.from("pdr_records").select("water_baptized, prefectship_flag").eq("member_id", row.id as string).maybeSingle(),
          supabase.from("pdr_notes").select("problems, conclusion").eq("member_id", row.id as string).maybeSingle(),
        ]);
        list.push({
          member_id: row.id as string,
          student_id: row.student_id as string,
          name: ((row.students as Row[] | null)?.[0]?.full_name as string) ?? "",
          class_name: className(regs?.[0]?.school_class_id) ?? "",
          is_born_again: ((row.students as Row[] | null)?.[0]?.is_born_again as boolean | null) ?? null,
          water_baptized: !!rec?.water_baptized,
          prefectship: !!rec?.prefectship_flag,
          problems: note?.problems ?? "",
          conclusion: note?.conclusion ?? "",
        });
      }
      setMembers(list);
      setLoaded(true);
    })();
  }, [supabase]);

  if (!loaded) return <div className="card animate-pulse">Loading PDR roster…</div>;
  if (members.length === 0) return <EmptyState icon="🤝" title="No students assigned to you for PDR" hint={NOT_REGISTERED} />;

  const m = sel !== null ? members[sel] : null;

  async function persist() {
    if (!m) return;
    const [r1, r2] = await Promise.all([
      savePdrRecord({ member_id: m.member_id, water_baptized: m.water_baptized, prefectship_flag: m.prefectship }),
      savePdrNote({ member_id: m.member_id, problems: m.problems, conclusion: m.conclusion }),
    ]);
    setMsg(r1.ok && r2.ok ? "PDR record saved. Only you and authorized administrators can access this information." : (r1.error ?? r2.error ?? ""));
  }

  return (
    <SectionCard title="Personal Discipleship Relationship (Mondays, Wednesdays & Fridays)">
      <div className="grid gap-4 md:grid-cols-[16rem_1fr]">
        <ul className="flex flex-col gap-1.5">
          {members.map((x, i) => (
            <li key={x.member_id}>
              <button
                onClick={() => setSel(i)}
                className={`w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition ${sel === i ? "bg-blue-500/20" : "bg-black/5 dark:bg-white/10 hover:bg-blue-500/10"}`}
              >
                {x.name}
                <span className="ml-2 text-xs text-muted">{x.class_name}</span>
              </button>
            </li>
          ))}
        </ul>
        {m ? (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge tone="blue">{m.class_name}</Badge>
              {m.is_born_again === true && <Badge tone="green">Born again</Badge>}
              {m.is_born_again === false && <Badge tone="gray">Not born again</Badge>}
            </div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={m.water_baptized} onChange={(e) => setMembers((prev) => prev.map((x, i) => (i === sel ? { ...x, water_baptized: e.target.checked } : x)))} />
              Water baptized
            </label>
            {m.class_name === "SS2" && (
              <label className="flex items-center gap-2 text-sm font-medium">
                <input type="checkbox" checked={m.prefectship} onChange={(e) => setMembers((prev) => prev.map((x, i) => (i === sel ? { ...x, prefectship: e.target.checked } : x)))} />
                Recommend for prefectship (SS2 only — recommendation only)
              </label>
            )}
            <div>
              <label htmlFor="pdr-problems" className="mb-1 block text-sm font-medium">Student problems</label>
              <textarea id="pdr-problems" className="input-base min-h-20" value={m.problems} onChange={(e) => setMembers((prev) => prev.map((x, i) => (i === sel ? { ...x, problems: e.target.value } : x)))} />
            </div>
            <div>
              <label htmlFor="pdr-conclusion" className="mb-1 block text-sm font-medium">Final concluding sentence (appears on printed result)</label>
              <textarea id="pdr-conclusion" className="input-base" value={m.conclusion} onChange={(e) => setMembers((prev) => prev.map((x, i) => (i === sel ? { ...x, conclusion: e.target.value } : x)))} />
            </div>
            <button onClick={persist} className="btn-primary self-start">Save PDR record</button>
            {msg && <p className="text-sm text-muted">{msg}</p>}
            <p className="text-xs text-muted">🔒 PDR notes are confidential. Students, teachers, and media personnel cannot read them.</p>
          </div>
        ) : (
          <p className="text-sm text-muted">Select a student to record PDR information.</p>
        )}
      </div>
    </SectionCard>
  );
}
