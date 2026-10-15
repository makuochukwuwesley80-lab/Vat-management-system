"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { fosterRegisterStudent } from "@/app/actions";
import { PageHeader, StatCard, SectionCard, EmptyState, Badge } from "@/components/ui";

type Row = Record<string, unknown>;

export function FosterParentDashboard({ profile }: { profile: { id: string; full_name: string } }) {
  const supabase = useMemo(() => createClient(), []);
  const [home, setHome] = useState<Row | null>(null);
  const [roster, setRoster] = useState<Row[]>([]);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<Row[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  async function load() {
    const { data: fp } = await supabase
      .from("foster_parents")
      .select("*")
      .eq("profile_id", profile.id)
      .eq("is_active", true)
      .limit(1)
      .maybeSingle();
    setHome(fp);
    if (fp) {
      const { data: session } = await supabase
        .from("vat_sessions")
        .select("id, year")
        .eq("status", "active")
        .limit(1)
        .maybeSingle();
      if (session) {
        const { data } = await supabase
          .from("foster_students")
          .select("id, return_date, students(full_name, gender), student_registrations(registration_number)")
          .eq("foster_parent_id", fp.id)
          .eq("session_id", session.id);
        setRoster((data as Row[]) ?? []);
      }
    }
    setLoaded(true);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search() {
    if (query.trim().length < 2) return;
    const { data } = await supabase
      .from("students")
      .select("id, full_name, gender, location")
      .ilike("full_name", `%${query.trim()}%`)
      .limit(10);
    setResults((data as Row[]) ?? []);
  }

  async function register(studentId: string) {
    const res = await fosterRegisterStudent({ student_id: studentId });
    setMsg(res.ok ? "Student linked to your foster home. The center's media dashboard can see this registration." : res.error ?? "Failed.");
    if (res.ok) {
      setResults(null);
      setQuery("");
      load();
    }
  }

  if (!loaded) return <div className="card animate-pulse">Loading your foster home…</div>;

  if (!home) {
    return (
      <>
        <PageHeader title="Foster Parent" />
        <EmptyState icon="🏠" title="No foster home linked" hint="Ask the media team to link your account to a foster home." />
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={home.home_name ? `${home.home_name}` : `Foster home of ${home.full_name}`}
        description="Students staying in your home for the active VAT session."
      />

      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="Students in my home" value={roster.length} icon="🛏️" accent="blue" />
        <StatCard label="With return date" value={roster.filter((r) => r.return_date).length} icon="🗓️" accent="amber" />
        <StatCard label="Graduated (alumni)" value={roster.filter((r) => (r.students as Row[] | null)?.[0]?.["is_alumni"]).length} icon="🎓" accent="violet" />
      </div>

      <SectionCard title="Register a student into my home">
        <p className="mb-3 text-sm text-muted">
          Search for the student by name, then select the correct record. This links the existing student
          to your home — it does not create a duplicate student.
        </p>
        <div className="flex flex-wrap gap-2">
          <input
            className="input-base flex-1 min-w-48"
            placeholder="Search student by name…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && search()}
            aria-label="Search student by name"
          />
          <button className="btn-primary" onClick={search}>Search</button>
        </div>
        {msg && <p className="mt-3 text-sm text-muted">{msg}</p>}
        {results && (
          <ul className="mt-3 flex flex-col gap-2">
            {results.length === 0 && <p className="text-sm text-muted">No matching students found.</p>}
            {results.map((s) => (
              <li key={s.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(var(--border)/0.06)" }}>
                <span>
                  <strong>{s.full_name as string}</strong>
                  <span className="ml-2 text-muted capitalize">{s.gender as string ?? ""}</span>
                  <span className="ml-2 text-muted">{s.location as string ?? ""}</span>
                </span>
                <button className="btn-primary" onClick={() => register(s.id as string)}>Register into my home</button>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>

      <SectionCard title="Students in my home">
        {roster.length === 0 ? (
          <EmptyState icon="🛏️" title="No students yet" hint="Use the search above to register students into your home." />
        ) : (
          <ul className="flex flex-col gap-2">
            {roster.map((r) => (
              <li key={r.id as string} className="flex flex-wrap items-center justify-between gap-2 rounded-xl px-4 py-3 text-sm" style={{ background: "rgba(var(--border)/0.06)" }}>
                <span className="font-medium">{((r.students as Row[] | null)?.[0]?.full_name as string) ?? ""}</span>
                <span className="flex items-center gap-2">
                  {r.return_date ? <Badge tone="amber">Return: {r.return_date as string}</Badge> : <Badge tone="gray">No return date</Badge>}
                  <span className="text-xs text-muted">{((r.student_registrations as Row[] | null)?.[0]?.registration_number as string) ?? ""}</span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </SectionCard>
    </>
  );
}
