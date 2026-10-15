"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { addCenter, updateCenter, createSession, runPromotion } from "@/app/actions";
import { PageHeader, StatCard, SectionCard, EmptyState, Badge } from "@/components/ui";
import type { Profile } from "@/lib/types";

type Row = Record<string, unknown>;

export function SystemManagerDashboard({ profile }: { profile: Profile }) {
  const supabase = useMemo(() => createClient(), []);
  const [centers, setCenters] = useState<Row[] | null>(null);
  const [sessions, setSessions] = useState<Row[]>([]);
  const [stats, setStats] = useState({ students: 0, workers: 0, fosterParents: 0 });
  const [showAdd, setShowAdd] = useState(false);
  const [editing, setEditing] = useState<Row | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [form, setForm] = useState({ name: "", code: "", location: "", is_headquarters: false, is_center_one: false, is_active: true });
  const [sessionForm, setSessionForm] = useState({ year: new Date().getFullYear() + 1, activation_date: `${new Date().getFullYear() + 1}-08-01` });
  const [promoteMsg, setPromoteMsg] = useState<string | null>(null);

  async function load() {
    const [{ data: c }, { data: s }, { data: regs }, { data: w }, { data: f }] = await Promise.all([
      supabase.from("centers").select("*").order("display_order"),
      supabase.from("vat_sessions").select("*").order("year", { ascending: false }),
      supabase.from("student_registrations").select("id", { count: "exact", head: true }),
      supabase.from("workers").select("id", { count: "exact", head: true }),
      supabase.from("foster_parents").select("id", { count: "exact", head: true }),
    ]);
    setCenters(c ?? []);
    setSessions((s as Row[]) ?? []);
    const counts = await Promise.all(
      ["student_registrations", "workers", "foster_parents"].map((t) =>
        supabase.from(t).select("id", { count: "exact", head: true }).then((r) => r.count ?? 0)
      )
    );
    setStats({ students: counts[0], workers: counts[1], fosterParents: counts[2] });
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submitCenter(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = editing
      ? await updateCenter(editing.id as string, form)
      : await addCenter(form);
    if (res.ok) {
      setMsg(editing ? "Center updated." : `Center "${form.name}" created.`);
      setShowAdd(false);
      setEditing(null);
      setForm({ name: "", code: "", location: "", is_headquarters: false, is_center_one: false, is_active: true });
      load();
    } else {
      setMsg(res.error ?? "Failed.");
    }
  }

  async function submitSession(e: React.FormEvent) {
    e.preventDefault();
    setMsg(null);
    const res = await createSession(sessionForm);
    setMsg(res.ok ? `VAT ${sessionForm.year} created. It activates automatically on ${sessionForm.activation_date}.` : res.error ?? "Failed.");
    load();
  }

  async function promote(sessionId: string) {
    setPromoteMsg(null);
    const res = await runPromotion(sessionId);
    setPromoteMsg(res.ok ? `Promotion complete — ${res.count} students processed. SS3 graduates moved to the VAT Alumni directory.` : res.error ?? "Failed.");
    load();
  }

  if (centers === null) return <div className="card animate-pulse">Loading system overview…</div>;

  const activeSession = sessions.find((s) => s.status === "active") ?? sessions.find((s) => s.status === "upcoming");

  return (
    <>
      <PageHeader
        title="System Manager"
        description={`Signed in as ${profile.full_name}. Full system configuration and oversight.`}
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-5">
        <StatCard label="Centers" value={centers.length} icon="🏛️" accent="blue" hint={`${centers.filter((c) => c.is_active).length} active`} />
        <StatCard label="Students" value={stats.students} icon="🎓" accent="violet" />
        <StatCard label="Workers" value={stats.workers} icon="🧑‍🏫" accent="emerald" />
        <StatCard label="Foster parents" value={stats.fosterParents} icon="🏠" accent="amber" />
        <StatCard
          label="Current session"
          value={activeSession ? `VAT ${String(activeSession.year)}` : "None"}
          icon="🗓️"
          accent="rose"
          hint={activeSession ? `Status: ${String(activeSession.status)}` : "Create a session below"}
        />
      </div>

      {msg && <p className="mb-4 rounded-xl border border-blue-400/30 bg-blue-500/10 px-4 py-3 text-sm">{msg}</p>}

      {/* Centers management */}
      <div className="grid gap-6 lg:grid-cols-2">
        <SectionCard
          title="Centers"
          action={
            <button className="btn-primary" onClick={() => { setShowAdd((s) => !s); setEditing(null); }}>
              {showAdd ? "Close" : "+ Add New Center"}
            </button>
          }
        >
          {showAdd && (
            <form onSubmit={submitCenter} className="mb-4 flex flex-col gap-3 rounded-2xl bg-blue-500/5 p-4">
              <input className="input-base" placeholder="Official center name" required value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} aria-label="Center name" />
              <input className="input-base" placeholder="Unique center code (e.g. LAG01)" required value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} aria-label="Center code" />
              <input className="input-base" placeholder="Location or state" value={form.location} onChange={(e) => setForm({ ...form, location: e.target.value })} aria-label="Location" />
              <div className="flex flex-wrap gap-4 text-sm">
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.is_headquarters} onChange={(e) => setForm({ ...form, is_headquarters: e.target.checked })} />
                  Headquarters
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.is_center_one} onChange={(e) => setForm({ ...form, is_center_one: e.target.checked })} />
                  Center One (General Principal's center)
                </label>
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} />
                  Active
                </label>
              </div>
              <button className="btn-primary self-start">{editing ? "Save changes" : "Create center"}</button>
            </form>
          )}
          {centers.length === 0 ? (
            <EmptyState icon="🏛️" title="No centers" />
          ) : (
            <ul className="flex flex-col gap-2">
              {centers.map((c) => (
                <li key={c.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(var(--border)/0.06)" }}>
                  <span>
                    <strong>{c.name as string}</strong>
                    <span className="ml-2 text-xs text-muted">{c.code as string}</span>
                    {!!c.is_headquarters && <span className="ml-2"><Badge tone="blue">HQ</Badge></span>}
                    {!!c.is_center_one && <span className="ml-2"><Badge tone="green">Center One</Badge></span>}
                  </span>
                  <span className="flex items-center gap-2">
                    {c.is_active ? <Badge tone="green">Active</Badge> : <Badge tone="red">Inactive</Badge>}
                    <button
                      className="text-xs font-semibold text-blue-500 underline"
                      onClick={() => {
                        setEditing(c);
                        setShowAdd(true);
                        setForm({
                          name: c.name as string,
                          code: c.code as string,
                          location: (c.location as string) ?? "",
                          is_headquarters: !!c.is_headquarters,
                          is_center_one: !!c.is_center_one,
                          is_active: !!c.is_active,
                        });
                      }}
                    >
                      Edit
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}
        </SectionCard>

        {/* Sessions */}
        <SectionCard title="VAT sessions & annual promotion">
          <form onSubmit={submitSession} className="mb-4 flex flex-wrap items-end gap-2 rounded-2xl bg-blue-500/5 p-4">
            <div>
              <label htmlFor="sess-year" className="mb-1 block text-xs font-medium">Year</label>
              <input id="sess-year" className="input-base w-28" type="number" value={sessionForm.year} onChange={(e) => setSessionForm({ ...sessionForm, year: Number(e.target.value) })} />
            </div>
            <div>
              <label htmlFor="sess-date" className="mb-1 block text-xs font-medium">Activation date</label>
              <input id="sess-date" className="input-base w-44" type="date" value={sessionForm.activation_date} onChange={(e) => setSessionForm({ ...sessionForm, activation_date: e.target.value })} />
            </div>
            <button className="btn-primary">Create session</button>
          </form>

          {promoteMsg && <p className="mb-3 rounded-xl bg-emerald-500/10 px-4 py-2 text-sm text-emerald-700 dark:text-emerald-300">{promoteMsg}</p>}

          <ul className="flex flex-col gap-2">
            {sessions.map((s) => (
              <li key={s.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(var(--border)/0.06)" }}>
                <span>
                  <strong>VAT {s.year as number}</strong>
                  <span className="ml-2 text-xs text-muted">Activates: {(s.activation_date as string) ?? "—"}</span>
                </span>
                <span className="flex items-center gap-2">
                  <Badge tone={s.status === "active" ? "green" : s.status === "upcoming" ? "amber" : "gray"}>{s.status as string}</Badge>
                  {s.status === "upcoming" && (
                    <button className="text-xs font-semibold text-blue-500 underline" onClick={() => promote(s.id as string)}>
                      Promote students into {s.year as number}
                    </button>
                  )}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-xs text-muted">
            Promotion moves each student up one class (JS1→JS2 … SS2→SS3). SS3 graduates move to the VAT Alumni
            directory. It is idempotent — running it twice will not create duplicates.
          </p>
        </SectionCard>
      </div>
    </>
  );
}
