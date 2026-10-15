"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import {
  registerNewStudent,
  registerExistingStudent,
  registerWorker,
  registerFosterParent,
  assignTask,
  unassignTask,
  saveMemoryVerse,
  sendNotification,
  setAssignmentSubmission,
  approveResult,
} from "@/app/actions";
import { PageHeader, StatCard, SectionCard, EmptyState, Badge } from "@/components/ui";
import { CLASS_ORDER } from "@/lib/types";

type Row = Record<string, unknown>;

const inputCls = "input-base";

export function MediaDashboard({ profile }: { profile: { full_name: string; center_id: string | null } }) {
  const supabase = useMemo(() => createClient(), []);
  const [stats, setStats] = useState({ students: 0, workers: 0, fosterParents: 0, classes: [] as { name: string; count: number }[] });
  const [tab, setTab] = useState("register-new");

  async function loadStats() {
    const { data: session } = await supabase.from("vat_sessions").select("id").eq("status", "active").limit(1).maybeSingle();
    if (!session || !profile.center_id) return;
    const [{ count: sc }, { count: wc }, { count: fc }, { data: regs }] = await Promise.all([
      supabase.from("student_registrations").select("id, school_class_id", { count: "exact", head: false }).eq("session_id", session.id).eq("center_id", profile.center_id).eq("is_alumni", false),
      supabase.from("workers").select("id", { count: "exact", head: true }).eq("center_id", profile.center_id),
      supabase.from("foster_parents").select("id", { count: "exact", head: true }).eq("center_id", profile.center_id),
      supabase.from("student_registrations").select("school_class_id, school_classes(name)").eq("session_id", session.id).eq("center_id", profile.center_id).eq("is_alumni", false),
    ]);
    const byClass = CLASS_ORDER.map((name) => ({
      name,
      count: (regs ?? []).filter((r: Row) => (r.school_classes as Row[] | null)?.[0]?.name === name).length,
    }));
    setStats({ students: sc ?? 0, workers: wc ?? 0, fosterParents: fc ?? 0, classes: byClass });
  }

  useEffect(() => {
    loadStats();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const tabs = [
    { key: "register-new", label: "Register New Student" },
    { key: "register-existing", label: "Register Existing Student" },
    { key: "workers", label: "Workers & Assign Tasks" },
    { key: "foster", label: "Foster Parents" },
    { key: "assignments", label: "Assignment Submissions" },
    { key: "academic", label: "Scores & Approval" },
    { key: "verses", label: "Memory Verses" },
    { key: "notifications", label: "Notifications" },
  ];

  return (
    <>
      <PageHeader title="Media Dashboard" description={`Operational administration for ${profile.full_name}'s center.`}>
        <a href="/dashboard/results" className="btn-primary">🖨️ Results & Printing</a>
      </PageHeader>

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <StatCard label="Students registered" value={stats.students} icon="🎓" accent="blue" />
        <StatCard label="Workers" value={stats.workers} icon="🧑‍🏫" accent="emerald" />
        <StatCard label="Foster parents" value={stats.fosterParents} icon="🏠" accent="amber" />
        <StatCard label="Classes" value={stats.classes.filter((c) => c.count > 0).length} icon="🏫" accent="violet" />
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.map((t) => (
          <button key={t.key} className={tab === t.key ? "btn-primary" : "btn-secondary"} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === "register-new" && <RegisterNewStudentPanel onDone={loadStats} />}
      {tab === "register-existing" && <RegisterExistingPanel onDone={loadStats} />}
      {tab === "workers" && <WorkersPanel onDone={loadStats} />}
      {tab === "foster" && <FosterPanel onDone={loadStats} />}
      {tab === "assignments" && <AssignmentSubmissionsPanel />}
      {tab === "academic" && <AcademicPanel />}
      {tab === "verses" && <VersesPanel />}
      {tab === "notifications" && <NotificationsPanel />}
    </>
  );
}

// ---------------------------------------------------------------------------
function ClassSelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <select className={inputCls} required value={value} onChange={(e) => onChange(e.target.value)} aria-label="School class">
      <option value="">Select class…</option>
      {CLASS_ORDER.map((c) => (
        <option key={c} value={c}>{c}</option>
      ))}
    </select>
  );
}

function RegisterNewStudentPanel({ onDone }: { onDone: () => void }) {
  const [form, setForm] = useState({
    full_name: "", parent_name: "", parent_phone: "", location: "",
    is_born_again: false, school: "", school_class: "", gender: "male", date_of_birth: "",
  });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    const res = await registerNewStudent({ ...form, gender: form.gender as "male" | "female" });
    setBusy(false);
    if (res.ok) {
      setMsg(`✅ ${form.full_name} registered successfully.`);
      setForm({ full_name: "", parent_name: "", parent_phone: "", location: "", is_born_again: false, school: "", school_class: "", gender: "male", date_of_birth: "" });
      onDone();
    } else {
      setMsg(res.error ?? "Registration failed.");
    }
  }

  return (
    <SectionCard title="Register New Student">
      <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2">
        <input className={inputCls} required placeholder="Student's full name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} aria-label="Student full name" />
        <input className={inputCls} required placeholder="Parent/guardian name" value={form.parent_name} onChange={(e) => setForm({ ...form, parent_name: e.target.value })} aria-label="Parent or guardian name" />
        <input className={inputCls} required type="tel" placeholder="Parent/guardian phone" value={form.parent_phone} onChange={(e) => setForm({ ...form, parent_phone: e.target.value })} aria-label="Parent or guardian phone" />
        <input className={inputCls} required placeholder="Student's location" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} aria-label="Student location" />
        <input className={inputCls} required placeholder="School" value={form.school} onChange={(e) => setForm({ ...form, school: e.target.value })} aria-label="School" />
        <input className={inputCls} required type="date" value={form.date_of_birth} onChange={(e) => setForm({ ...form, date_of_birth: e.target.value })} aria-label="Date of birth" />
        <ClassSelect value={form.school_class} onChange={(v) => setForm({ ...form, school_class: v })} />
        <select className={inputCls} value={form.gender} onChange={(e) => setForm({ ...form, gender: e.target.value })} aria-label="Gender">
          <option value="male">Male</option>
          <option value="female">Female</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={form.is_born_again} onChange={(e) => setForm({ ...form, is_born_again: e.target.checked })} />
          Born again
        </label>
        <button className="btn-primary sm:col-span-2" disabled={busy}>{busy ? "Registering…" : "Register student"}</button>
      </form>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </SectionCard>
  );
}

function RegisterExistingPanel({ onDone }: { onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
  const [selected, setSelected] = useState<Row | null>(null);
  const [cls, setCls] = useState("");
  const [msg, setMsg] = useState<string | null>(null);

  async function search() {
    if (query.trim().length < 2) return;
    const { data } = await supabase
      .from("students")
      .select("id, full_name, gender, location, school, parent_name")
      .ilike("full_name", `%${query.trim()}%`)
      .limit(10);
    setResults((data as Row[]) ?? []);
  }

  async function submit() {
    if (!selected) return;
    const res = await registerExistingStudent({ student_id: selected.id as string, school_class: cls });
    if (res.ok) {
      setMsg(`✅ ${selected.full_name as string} registered for the new VAT session.`);
      setSelected(null);
      setResults(null);
      setQuery("");
      onDone();
    } else {
      setMsg(res.error ?? "Failed.");
    }
  }

  return (
    <SectionCard title="Register Existing Student">
      <p className="mb-3 text-sm text-muted">Search the student directory by name, confirm the record, and register them for the current VAT session without creating a duplicate identity.</p>
      <div className="flex flex-wrap gap-2">
        <input className={`${inputCls} flex-1 min-w-48`} placeholder="Search by student name…" value={query} onChange={(e) => setQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && search()} aria-label="Search existing students" />
        <button className="btn-primary" onClick={search}>Search</button>
      </div>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
      {results && results.length === 0 && <p className="mt-3 text-sm text-muted">No matching students found.</p>}
      {results && results.length > 0 && (
        <ul className="mt-3 flex flex-col gap-2">
          {results.map((s) => (
            <li key={s.id as string} className={`rounded-xl px-4 py-3 text-sm ${selected?.id === s.id ? "bg-blue-500/20" : ""}`} style={selected?.id === s.id ? {} : { background: "rgba(var(--border)/0.06)" }}>
              <button className="w-full text-left" onClick={() => setSelected(s)}>
                <strong>{s.full_name as string}</strong>
                <span className="ml-2 text-muted capitalize">{s.gender as string ?? ""}</span>
                <span className="ml-2 text-muted">{s.school as string ?? ""}</span>
                <span className="ml-2 text-muted">Parent: {s.parent_name as string ?? "—"}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {selected && (
        <div className="mt-4 flex flex-wrap items-end gap-2 rounded-2xl bg-blue-500/5 p-4">
          <ClassSelect value={cls} onChange={setCls} />
          <button className="btn-primary" onClick={submit}>Register for current session</button>
        </div>
      )}
    </SectionCard>
  );
}

function WorkersPanel({ onDone }: { onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [workers, setWorkers] = useState<Row[]>([]);
  const [assignments, setAssignments] = useState<Row[]>([]);
  const [form, setForm] = useState({ full_name: "", phone: "", create_account: true });
  const [assignForm, setAssignForm] = useState({ worker_id: "", responsibility: "Form Teacher", school_class: "", subject: "", gdc_group: "", pdr_group: "" });
  const [gdcGroups, setGdcGroups] = useState<Row[]>([]);
  const [pdrGroups, setPdrGroups] = useState<Row[]>([]);
  const [gdcName, setGdcName] = useState("");
  const [pdrId, setPdrId] = useState("");
  const [pdrGender, setPdrGender] = useState<"male" | "female">("male");
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data: session } = await supabase.from("vat_sessions").select("id").eq("status", "active").limit(1).maybeSingle();
    const [{ data: w }, { data: a }, { data: g }, { data: p }] = await Promise.all([
      supabase.from("workers").select("*").order("full_name"),
      session ? supabase.from("worker_assignments").select("*, workers(full_name), responsibilities(name), school_classes(name), subjects(name), gdc_groups(name), pdr_groups(identifier, gender)").eq("session_id", session.id).eq("is_active", true) : Promise.resolve({ data: [] }),
      supabase.from("gdc_groups").select("*").order("name"),
      supabase.from("pdr_groups").select("*").order("identifier"),
    ]);
    setWorkers((w as Row[]) ?? []);
    setAssignments((a as Row[]) ?? []);
    setGdcGroups((g as Row[]) ?? []);
    setPdrGroups((p as Row[]) ?? []);
  }

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function submitWorker(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    setCreds(null);
    const res = await registerWorker(form);
    if (res.ok) {
      if (res.credentials) setCreds(res.credentials);
      setMsg(`✅ Worker ${form.full_name} registered.`);
      setForm({ full_name: "", phone: "", create_account: true });
      onDone();
      load();
    } else setMsg(res.error ?? "Failed.");
  }

  async function submitAssign(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await assignTask({
      worker_id: assignForm.worker_id,
      responsibility: assignForm.responsibility,
      school_class: assignForm.school_class || undefined,
      subject: assignForm.subject || undefined,
      gdc_group: assignForm.gdc_group || undefined,
      pdr_group: assignForm.pdr_group || undefined,
    });
    setMsg(res.ok ? "✅ Assignment active immediately." : res.error ?? "Failed.");
    load();
  }

  async function createGdc() {
    const res = await (await import("@/app/actions")).createGdcGroup({ name: gdcName });
    setMsg(res.ok ? "GDC group created." : res.error ?? "Failed.");
    setGdcName("");
    load();
  }

  async function createPdr() {
    const res = await (await import("@/app/actions")).createPdrGroup({ identifier: pdrId, gender: pdrGender });
    setMsg(res.ok ? "PDR group created." : res.error ?? "Failed.");
    setPdrId("");
    load();
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Register Worker">
        <form onSubmit={submitWorker} className="flex flex-col gap-3">
          <input className={inputCls} required placeholder="Worker's name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} aria-label="Worker name" />
          <input className={inputCls} required type="tel" placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-label="Worker phone" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.create_account} onChange={(e) => setForm({ ...form, create_account: e.target.checked })} />
            Also create a dashboard sign-in account
          </label>
          <button className="btn-primary self-start">Register worker</button>
        </form>
        {creds && (
          <div className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm">
            <p className="font-semibold">Share these credentials with the worker (shown once):</p>
            <p>Email: <code>{creds.email}</code></p>
            <p>Password: <code>{creds.password}</code></p>
          </div>
        )}
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </SectionCard>

      <SectionCard title="Assign Tasks">
        <form onSubmit={submitAssign} className="grid gap-3 sm:grid-cols-2">
          <select className={inputCls} required value={assignForm.worker_id} onChange={(e) => setAssignForm({ ...assignForm, worker_id: e.target.value })} aria-label="Worker">
            <option value="">Select worker…</option>
            {workers.map((w) => (
              <option key={w.id as string} value={w.id as string}>{w.full_name as string}</option>
            ))}
          </select>
          <select className={inputCls} value={assignForm.responsibility} onChange={(e) => setAssignForm({ ...assignForm, responsibility: e.target.value })} aria-label="Responsibility">
            {["Form Teacher", "Subject Teacher", "PDR Parent", "GDC Teacher"].map((r) => (
              <option key={r} value={r}>{r}</option>
            ))}
          </select>
          {assignForm.responsibility === "Form Teacher" && <ClassSelect value={assignForm.school_class} onChange={(v) => setAssignForm({ ...assignForm, school_class: v })} />}
          {assignForm.responsibility === "Subject Teacher" && (
            <>
              <ClassSelect value={assignForm.school_class} onChange={(v) => setAssignForm({ ...assignForm, school_class: v })} />
              <select className={inputCls} value={assignForm.subject} onChange={(e) => setAssignForm({ ...assignForm, subject: e.target.value })} aria-label="Subject">
                <option value="">Select subject…</option>
                {["English", "Mathematics", "Language"].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
            </>
          )}
          {assignForm.responsibility === "GDC Teacher" && (
            <select className={inputCls} required value={assignForm.gdc_group} onChange={(e) => setAssignForm({ ...assignForm, gdc_group: e.target.value })} aria-label="GDC group">
              <option value="">Select GDC group…</option>
              {gdcGroups.map((g) => <option key={g.id as string} value={g.id as string}>{g.name as string}</option>)}
            </select>
          )}
          {assignForm.responsibility === "PDR Parent" && (
            <select className={inputCls} required value={assignForm.pdr_group} onChange={(e) => setAssignForm({ ...assignForm, pdr_group: e.target.value })} aria-label="PDR group">
              <option value="">Select PDR group…</option>
              {pdrGroups.map((g) => <option key={g.id as string} value={g.id as string}>{g.identifier as string} ({g.gender as string})</option>)}
            </select>
          )}
          <button className="btn-primary sm:col-span-2">Assign (active immediately)</button>
        </form>

        <div className="mt-4 border-t border-black/5 pt-4 dark:border-white/10">
          <p className="mb-2 text-sm font-semibold">Groups</p>
          <div className="flex flex-wrap items-center gap-2">
            <input className={`${inputCls} w-40`} placeholder="New GDC group name" value={gdcName} onChange={(e) => setGdcName(e.target.value)} aria-label="GDC group name" />
            <button className="btn-secondary" onClick={createGdc}>Create GDC group</button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input className={`${inputCls} w-24`} placeholder="ID (A / AA)" value={pdrId} onChange={(e) => setPdrId(e.target.value)} aria-label="PDR identifier" />
            <select className={`${inputCls} w-28`} value={pdrGender} onChange={(e) => setPdrGender(e.target.value as "male" | "female")} aria-label="PDR gender">
              <option value="male">Male</option>
              <option value="female">Female</option>
            </select>
            <button className="btn-secondary" onClick={createPdr}>Create PDR group</button>
          </div>
        </div>
      </SectionCard>

      <SectionCard title="Worker directory & active assignments">
        {workers.length === 0 ? <EmptyState icon="🧑‍🏫" title="No workers registered" /> : (
          <ul className="flex flex-col gap-1.5">
            {workers.map((w) => (
              <li key={w.id as string} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(var(--border)/0.06)" }}>
                <span>{w.full_name as string}<span className="ml-2 text-xs text-muted">{w.phone as string}</span></span>
                <span className="flex flex-wrap gap-1">
                  {assignments.filter((a) => (a.workers as Row[] | null)?.[0]?.id === w.id).map((a) => (
                    <Badge key={a.id as string} tone="blue">
                      {(a.responsibilities as Row[] | null)?.[0]?.name as string}
                      {a.school_classes ? ` · ${(a.school_classes as Row[])[0].name as string}` : ""}
                    </Badge>
                  ))}
                </span>
              </li>
            ))}
          </ul>
        )}
        {assignments.length > 0 && (
          <div className="mt-4">
            <p className="mb-2 text-sm font-semibold">Reassign / remove</p>
            <ul className="flex flex-col gap-1.5">
              {assignments.map((a) => (
                <li key={a.id as string} className="flex items-center justify-between gap-2 rounded-xl px-3 py-2 text-xs" style={{ background: "rgba(var(--border)/0.06)" }}>
                  <span>
                    {(a.workers as Row[] | null)?.[0]?.full_name as string} — {(a.responsibilities as Row[] | null)?.[0]?.name as string}
                    {a.school_classes ? ` (${(a.school_classes as Row[])[0].name as string})` : ""}
                    {a.subjects ? ` (${(a.subjects as Row[])[0].name as string})` : ""}
                  </span>
                  <button
                    className="font-semibold text-red-500 underline"
                    onClick={async () => {
                      await unassignTask(a.id as string);
                      load();
                    }}
                  >
                    Unassign
                  </button>
                </li>
              ))}
            </ul>
            <p className="mt-2 text-xs text-muted">Historical attendance and scores are preserved; authorship is not transferred.</p>
          </div>
        )}
      </SectionCard>
    </div>
  );
}

function FosterPanel({ onDone }: { onDone: () => void }) {
  const supabase = useMemo(() => createClient(), []);
  const [fosterParents, setFosterParents] = useState<Row[]>([]);
  const [form, setForm] = useState({ full_name: "", phone: "", home_name: "", create_account: true });
  const [creds, setCreds] = useState<{ email: string; password: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("foster_parents").select("*").order("full_name");
    setFosterParents((data as Row[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setCreds(null);
    setMsg(null);
    const res = await registerFosterParent(form);
    if (res.ok) {
      if (res.credentials) setCreds(res.credentials);
      setMsg(`✅ Foster parent ${form.full_name} registered.`);
      setForm({ full_name: "", phone: "", home_name: "", create_account: true });
      onDone();
      load();
    } else setMsg(res.error ?? "Failed.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Register Foster Parent">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <input className={inputCls} required placeholder="Foster parent's name" value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} aria-label="Foster parent name" />
          <input className={inputCls} required type="tel" placeholder="Phone number" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} aria-label="Foster parent phone" />
          <input className={inputCls} placeholder="Home name (optional)" value={form.home_name} onChange={(e) => setForm({ ...form, home_name: e.target.value })} aria-label="Home name" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.create_account} onChange={(e) => setForm({ ...form, create_account: e.target.checked })} />
            Also create a dashboard sign-in account
          </label>
          <button className="btn-primary self-start">Register foster parent</button>
        </form>
        {creds && (
          <div className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm">
            <p className="font-semibold">Share these credentials (shown once):</p>
            <p>Email: <code>{creds.email}</code></p>
            <p>Password: <code>{creds.password}</code></p>
          </div>
        )}
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </SectionCard>

      <SectionCard title="Registered foster parents">
        {fosterParents.length === 0 ? <EmptyState icon="🏠" title="No foster parents registered" /> : (
          <ul className="flex flex-col gap-1.5">
            {fosterParents.map((f) => (
              <li key={f.id as string} className="flex items-center justify-between rounded-xl px-3 py-2 text-sm" style={{ background: "rgba(var(--border)/0.06)" }}>
                <span>{f.full_name as string}<span className="ml-2 text-xs text-muted">{(f.home_name as string) ?? ""}</span></span>
                {f.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="gray">Inactive</Badge>}
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function AssignmentSubmissionsPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Row[]>([]);
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase
      .from("student_registrations")
      .select("id, spiritual_submitted, vocational_submitted, students(full_name), school_classes(name)")
      .eq("is_alumni", false)
      .order("id")
      .limit(200);
    setRows((data as Row[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function toggle(regId: string, kind: "spiritual" | "vocational", value: boolean) {
    const res = await setAssignmentSubmission(regId, kind, value);
    if (!res.ok) setMsg(res.error ?? "Failed.");
    load();
  }

  return (
    <SectionCard title="Physical assignment submission records">
      <p className="mb-3 text-sm text-muted">Record whether each student has physically submitted the spiritual and vocational assignments at the center.</p>
      {msg && <p className="mb-3 text-sm text-red-500">{msg}</p>}
      {rows.length === 0 ? <EmptyState icon="📦" title="No registrations yet" /> : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-muted">
                <th className="py-2 pr-3">Student</th>
                <th className="py-2 pr-3">Class</th>
                <th className="py-2 pr-3">Spiritual</th>
                <th className="py-2">Vocational</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id as string} className="border-t border-black/5 dark:border-white/10">
                  <td className="py-2 pr-3 font-medium">{((r.students as Row[] | null)?.[0]?.full_name as string) ?? ""}</td>
                  <td className="py-2 pr-3">{((r.school_classes as Row[] | null)?.[0]?.name as string) ?? ""}</td>
                  {(["spiritual_submitted", "vocational_submitted"] as const).map((k) => (
                    <td key={k} className="py-2 pr-3">
                      <input
                        type="checkbox"
                        checked={!!r[k]}
                        onChange={(e) => toggle(r.id as string, k === "spiritual_submitted" ? "spiritual" : "vocational", e.target.checked)}
                        aria-label={`${k} for ${((r.students as Row[] | null)?.[0]?.full_name as string) ?? ""}`}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}

function AcademicPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [regs, setRegs] = useState<Row[]>([]);
  const [sel, setSel] = useState<number>(0);
  const [scores, setScores] = useState<Record<string, Record<string, string>>>({});
  const [approvals, setApprovals] = useState<Record<string, boolean>>({});
  const [msg, setMsg] = useState<string | null>(null);
  const [subjects, setSubjects] = useState<{ id: string; name: string }[]>([]);

  async function load() {
    const { data: session } = await supabase.from("vat_sessions").select("id").eq("status", "active").limit(1).maybeSingle();
    if (!session) return;
    const [{ data: r }, { data: sc }, { data: ap }, { data: subs }] = await Promise.all([
      supabase.from("student_registrations").select("id, student_id, students(full_name), school_classes(name)").eq("session_id", session.id).eq("is_alumni", false).order("id").limit(300),
      supabase.from("scores").select("student_id, subject_id, component, marks").eq("session_id", session.id),
      supabase.from("result_approvals").select("student_id, approved").eq("session_id", session.id),
      supabase.from("subjects").select("id, name").order("id"),
    ]);
    setRegs((r as Row[]) ?? []);
    setSubjects((subs as { id: string; name: string }[]) ?? []);
    const map: Record<string, Record<string, string>> = {};
    for (const s of sc ?? []) {
      const row = s as { student_id: string; subject_id: string; component: string; marks: number };
      const key = `${row.student_id}|${row.subject_id}`;
      (map[key] ??= {})[row.component] = String(row.marks);
    }
    setScores(map);
    setApprovals(Object.fromEntries((ap ?? []).map((a) => [(a as { student_id: string }).student_id, (a as { approved: boolean }).approved])));
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const r = regs[sel];

  async function saveScore(studentId: string, subjectId: string, component: string, value: string) {
    setMsg(null);
    const marks = Number(value);
    if (Number.isNaN(marks)) return;
    const max = component === "exam" ? 60 : 20;
    if (marks < 0 || marks > max) { setMsg(`Score must be between 0 and ${max}.`); return; }
    const { saveScore: action } = await import("@/app/actions");
    const res = await action({ student_id: studentId, subject_id: subjectId, component: component as "first_ca", marks });
    setMsg(res.ok ? "Score saved." : res.error ?? "Failed.");
    load();
  }

  async function toggleApproval(studentId: string, approved: boolean) {
    const { data: session } = await supabase.from("vat_sessions").select("id").eq("status", "active").limit(1).maybeSingle();
    if (!session) return;
    const { approveResult: action } = await import("@/app/actions");
    const res = await action(studentId, session.id, approved);
    setMsg(res.ok ? (approved ? "Result approved — ready for official printing." : "Approval revoked.") : res.error ?? "Failed.");
    load();
  }

  if (regs.length === 0) return <SectionCard title="Scores & result approval"><EmptyState icon="📚" title="No students registered yet" /></SectionCard>;
  if (subjects.length === 0) return <SectionCard title="Scores & result approval"><EmptyState icon="📚" title="Subjects not configured" hint="Run migration 0004_seed.sql." /></SectionCard>;

  return (
    <SectionCard
      title="Scores & result approval"
      action={
        <select className="input-base w-auto" value={sel} onChange={(e) => setSel(Number(e.target.value))} aria-label="Select student">
          {regs.map((x, i) => (
            <option key={x.id as string} value={i}>
              {((x.students as Row[] | null)?.[0]?.full_name as string) ?? ""} — {((x.school_classes as Row[] | null)?.[0]?.name as string) ?? ""}
            </option>
          ))}
        </select>
      }
    >
      {r && (
        <>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-muted">
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3">First CA (20)</th>
                  <th className="py-2 pr-3">Second CA (20)</th>
                  <th className="py-2 pr-3">Exam (60)</th>
                  <th className="py-2">Total</th>
                </tr>
              </thead>
              <tbody>
                {subjects.map((subj) => {
                  const key = `${r.student_id}|${subj.id}`;
                  const s = scores[key] ?? {};
                  return (
                    <tr key={subj.id} className="border-t border-black/5 dark:border-white/10">
                      <td className="py-2 pr-3 font-medium">{subj.name}</td>
                      {(["first_ca", "second_ca", "exam"] as const).map((c) => (
                        <td key={c} className="py-2 pr-3">
                          <input
                            className="input-base w-20"
                            type="number" min={0} max={c === "exam" ? 60 : 20}
                            value={s[c] ?? ""}
                            onChange={(e) => {
                              const v = e.target.value;
                              setScores((prev) => ({ ...prev, [key]: { ...(prev[key] ?? {}), [c]: v } }));
                            }}
                            onBlur={(e) => saveScore(r.student_id as string, subj.id, c, e.target.value)}
                            aria-label={`${subj.name} ${c}`}
                          />
                        </td>
                      ))}
                      <td className="py-2 font-semibold">
                        {["first_ca", "second_ca", "exam"].reduce((sum, c) => sum + (Number(s[c]) || 0), 0)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            {approvals[r.student_id as string] ? (
              <>
                <Badge tone="green">✓ Approved</Badge>
                <button className="btn-danger" onClick={() => toggleApproval(r.student_id as string, false)}>Revoke approval</button>
              </>
            ) : (
              <button className="btn-primary" onClick={() => toggleApproval(r.student_id as string, true)}>Approve result</button>
            )}
          </div>
          {msg && <p className="mt-3 text-sm">{msg}</p>}
          <p className="mt-2 text-xs text-muted">Score history is kept automatically — edits are audited and never silently overwritten.</p>
        </>
      )}
    </SectionCard>
  );
}

function VersesPanel() {
  const supabase = useMemo(() => createClient(), []);
  const [verses, setVerses] = useState<Row[]>([]);
  const [form, setForm] = useState({ school_class: "JS1", reference: "", verse_text: "" });
  const [msg, setMsg] = useState<string | null>(null);

  async function load() {
    const { data } = await supabase.from("memory_verses").select("*, school_classes(name)").order("class_id");
    setVerses((data as Row[]) ?? []);
  }
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    const { data: cls } = await supabase.from("school_classes").select("id").eq("name", form.school_class).single();
    if (!cls) return;
    const res = await saveMemoryVerse({ class_id: cls.id, reference: form.reference, verse_text: form.verse_text });
    if (res.ok) {
      setMsg(`✅ Verse saved for ${form.school_class}.`);
      setForm({ ...form, reference: "", verse_text: "" });
      load();
    } else setMsg(res.error ?? "Failed.");
  }

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <SectionCard title="Upload / update memory verse">
        <form onSubmit={submit} className="flex flex-col gap-3">
          <ClassSelect value={form.school_class} onChange={(v) => setForm({ ...form, school_class: v })} />
          <input className={inputCls} required placeholder="Reference (e.g. John 3:16)" value={form.reference} onChange={(e) => setForm({ ...form, reference: e.target.value })} aria-label="Verse reference" />
          <textarea className={`${inputCls} min-h-24`} required placeholder="Verse text (do not invent — paste the official verse)" value={form.verse_text} onChange={(e) => setForm({ ...form, verse_text: e.target.value })} aria-label="Verse text" />
          <button className="btn-primary self-start">Save verse</button>
        </form>
        {msg && <p className="mt-3 text-sm">{msg}</p>}
      </SectionCard>
      <SectionCard title="Current verses">
        {verses.length === 0 ? <EmptyState icon="📖" title="No verses uploaded" /> : (
          <ul className="flex flex-col gap-2">
            {verses.map((v) => (
              <li key={v.id as string} className="rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(var(--border)/0.06)" }}>
                <strong>{((v.school_classes as Row[] | null)?.[0]?.name as string) ?? ""}</strong> — {v.reference as string}
                <p className="text-muted">{v.verse_text as string}</p>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </div>
  );
}

function NotificationsPanel() {
  const [form, setForm] = useState({ title: "", body: "", recipient_role: "all" });
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const res = await sendNotification(form);
    setBusy(false);
    if (res.ok) {
      setMsg("✅ Notification sent.");
      setForm({ title: "", body: "", recipient_role: "all" });
    } else setMsg(res.error ?? "Failed.");
  }

  return (
    <SectionCard title="Send notification">
      <form onSubmit={submit} className="flex flex-col gap-3 max-w-xl">
        <input className={inputCls} required placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} aria-label="Notification title" />
        <textarea className={`${inputCls} min-h-24`} required placeholder="Message" value={form.body} onChange={(e) => setForm({ ...form, body: e.target.value })} aria-label="Notification message" />
        <select className={inputCls} value={form.recipient_role} onChange={(e) => setForm({ ...form, recipient_role: e.target.value })} aria-label="Recipients">
          <option value="all">Everyone</option>
          <option value="worker">Workers</option>
          <option value="foster_parent">Foster parents</option>
          <option value="center_principal">Center principals</option>
          <option value="media">Media team</option>
        </select>
        <button className="btn-primary self-start" disabled={busy}>{busy ? "Sending…" : "Send notification"}</button>
      </form>
      {msg && <p className="mt-3 text-sm">{msg}</p>}
    </SectionCard>
  );
}
