"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { PageHeader, SectionCard, EmptyState, Badge } from "@/components/ui";
import { Logo } from "@/components/Logo";

type Row = Record<string, unknown>;

interface ResultData {
  studentName: string;
  regNumber: string;
  centerName: string;
  year: number | string;
  className: string;
  subjects: { name: string; first: string; second: string; exam: string; total: string }[];
  totalScore: string;
  grade: string;
  spiritual: boolean;
  vocational: boolean;
  pdrConclusion: string;
  attendance: { present: number; total: number };
}

export default function ResultsPage() {
  const supabase = useMemo(() => createClient(), []);
  const [sessions, setSessions] = useState<Row[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [classes, setClasses] = useState<Row[]>([]);
  const [classId, setClassId] = useState<string>("");
  const [students, setStudents] = useState<Row[]>([]);
  const [selected, setSelected] = useState<Row[]>([]); // multi-select for batch
  const [result, setResult] = useState<ResultData | null>(null);
  const [batchResults, setBatchResults] = useState<ResultData[] | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const [{ data: s }, { data: c }] = await Promise.all([
        supabase.from("vat_sessions").select("*").order("year", { ascending: false }),
        supabase.from("school_classes").select("*").order("level_order"),
      ]);
      setSessions((s as Row[]) ?? []);
      setClasses((c as Row[]) ?? []);
      if (s && s.length > 0) setSessionId((s[0] as Row).id as string);
    })();
  }, [supabase]);

  useEffect(() => {
    (async () => {
      if (!sessionId) return;
      const { data } = await supabase
        .from("student_registrations")
        .select("*, students(full_name), school_classes(name)")
        .eq("session_id", sessionId)
        .eq("is_alumni", false)
        .order("id")
        .limit(500);
      setStudents((data as Row[]) ?? []);
    })();
  }, [supabase, sessionId]);

  const filtered = classId
    ? students.filter((s) => (s.school_classes as Row[] | null)?.[0]?.id === classId)
    : students;

  async function buildResult(reg: Row): Promise<ResultData> {
    const student = (reg.students as Row[] | null)?.[0] ?? {};
    const cls = (reg.school_classes as Row[] | null)?.[0] ?? {};
    const [{ data: center }, { data: session }, { data: scores }, { data: approval }, { data: att }, { data: conclusion }] =
      await Promise.all([
        supabase.from("centers").select("name").eq("id", reg.center_id as string).single(),
        supabase.from("vat_sessions").select("year").eq("id", reg.session_id as string).single(),
        supabase.from("scores").select("marks, subjects(name), component").eq("student_id", reg.student_id as string).eq("session_id", reg.session_id as string),
        supabase.from("result_approvals").select("approved").eq("student_id", reg.student_id as string).eq("session_id", reg.session_id as string).maybeSingle(),
        supabase.from("attendance").select("status").eq("registration_id", reg.id as string),
        supabase.rpc("get_pdr_conclusion_for_result", { p_student: reg.student_id as string, p_session: reg.session_id as string }),
      ]);

    const subjects = ["English", "Mathematics", "Language"].map((name) => {
      const rows = (scores ?? []).filter((s: Row) => (s.subjects as Row[] | null)?.[0]?.name === name);
      const get = (comp: string) => {
        const row = rows.find((s: Row) => s.component === comp);
        return row ? String((row as { marks: number }).marks) : "—";
      };
      const first = get("first_ca");
      const second = get("second_ca");
      const exam = get("exam");
      const total = [first, second, exam].every((v) => v !== "—")
        ? String(Number(first) + Number(second) + Number(exam))
        : "—";
      return { name, first, second, exam, total };
    });

    const totalScore = subjects.every((s) => s.total !== "—")
      ? String(subjects.reduce((sum, s) => sum + Number(s.total), 0))
      : "—";

    // Grading: configurable — no invented bands until the official VAT scheme
    // is supplied in system_config.grading_scale.
    const grade = "Pending official grading scheme";

    const present = (att ?? []).filter((a: Row) => a.status === "present").length;

    return {
      studentName: (student.full_name as string) ?? "",
      regNumber: (reg.registration_number as string) ?? "—",
      centerName: (center?.name as string) ?? "",
      year: (session?.year as number) ?? "",
      className: (cls.name as string) ?? "",
      subjects,
      totalScore,
      grade,
      spiritual: !!reg.spiritual_submitted,
      vocational: !!reg.vocational_submitted,
      pdrConclusion: (conclusion as string | null) ?? "",
      attendance: { present, total: (att ?? []).length },
    };
  }

  async function preview(reg: Row) {
    setMsg(null);
    const { data: approval } = await supabase
      .from("result_approvals")
      .select("approved")
      .eq("student_id", reg.student_id as string)
      .eq("session_id", reg.session_id as string)
      .maybeSingle();
    if (!approval?.approved) {
      setMsg("This result has not been approved yet. Approve it in the Media Dashboard before official printing.");
    }
    setResult(await buildResult(reg));
    setBatchResults(null);
  }

  async function printBatch() {
    if (filtered.length === 0) return;
    const unapproved = await supabase
      .from("result_approvals")
      .select("student_id, approved")
      .eq("session_id", sessionId);
    const approvedSet = new Set(
      (unapproved.data ?? []).filter((a: Row) => a.approved).map((a: Row) => a.student_id as string)
    );
    const eligible = filtered.filter((r) => approvedSet.has(r.student_id as string));
    if (eligible.length === 0) {
      setMsg("No approved results in this selection. Approve results first.");
      return;
    }
    const results: ResultData[] = [];
    for (const reg of eligible) {
      results.push(await buildResult(reg));
    }
    setBatchResults(results);
    setResult(null);
  }

  return (
    <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
      <div className="no-print">
        <PageHeader title="Results & Printing" description="Preview, approve, and print official VAT results." />
      </div>

      <div className="no-print mb-6 flex flex-wrap items-end gap-3">
        <div>
          <label htmlFor="r-session" className="mb-1 block text-xs font-medium">VAT year</label>
          <select id="r-session" className="input-base w-36" value={sessionId} onChange={(e) => setSessionId(e.target.value)}>
            {sessions.map((s) => (
              <option key={s.id as string} value={s.id as string}>VAT {s.year as number}</option>
            ))}
          </select>
        </div>
        <div>
          <label htmlFor="r-class" className="mb-1 block text-xs font-medium">Class</label>
          <select id="r-class" className="input-base w-36" value={classId} onChange={(e) => setClassId(e.target.value)}>
            <option value="">All classes</option>
            {classes.map((c) => (
              <option key={c.id as string} value={c.id as string}>{c.name as string}</option>
            ))}
          </select>
        </div>
        <button className="btn-primary" onClick={printBatch}>🖨️ Print batch (approved only)</button>
        {msg && <p className="text-sm text-amber-600 dark:text-amber-300">{msg}</p>}
      </div>

      {/* Student selection */}
      <div className="no-print card mb-6">
        <h2 className="mb-3 text-base font-semibold">Select student</h2>
        {filtered.length === 0 ? (
          <EmptyState icon="🎓" title="No students for this selection" />
        ) : (
          <ul className="grid max-h-64 gap-1.5 overflow-y-auto sm:grid-cols-2">
            {filtered.map((r) => (
              <li key={r.id as string}>
                <button
                  className="w-full rounded-xl px-3 py-2 text-left text-sm font-medium transition hover:bg-blue-500/10"
                  style={{ background: "rgba(var(--border)/0.06)" }}
                  onClick={() => preview(r)}
                >
                  {(r.students as Row[] | null)?.[0]?.full_name as string}
                  <span className="ml-2 text-xs text-muted">{(r.school_classes as Row[] | null)?.[0]?.name as string}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Print area */}
      <div id="print-area">
        {result && <ResultSheet data={result} />}
        {batchResults && batchResults.map((d, i) => (
          <div key={i} className="print-page"><ResultSheet data={d} /></div>
        ))}
      </div>

      {batchResults && batchResults.length > 0 && (
        <button className="btn-primary no-print mt-6" onClick={() => window.print()}>
          Print {batchResults.length} result{batchResults.length > 1 ? "s" : ""}
        </button>
      )}
    </div>
  );
}

function ResultSheet({ data }: { data: ResultData }) {
  return (
    <div className="mx-auto mb-8 max-w-3xl rounded-2xl border-2 border-blue-900/20 bg-white p-8 text-black shadow-glass-lg print:mb-0 print:rounded-none print:shadow-none">
      <div className="mb-6 flex items-center justify-between border-b-2 border-blue-900/20 pb-4">
        <div className="flex items-center gap-3">
          <Logo size={52} />
          <div>
            <p className="text-xl font-extrabold tracking-tight">VAT {data.year}</p>
            <p className="text-sm text-gray-600">{data.centerName} — Vacation Adolescent Training</p>
          </div>
        </div>
        <div className="text-right text-xs text-gray-600">
          <p>Issued: {new Date().toLocaleDateString("en-NG")}</p>
          <p>Session: VAT {data.year}</p>
        </div>
      </div>

      <div className="mb-4 grid gap-1 text-sm">
        <p><strong>Student:</strong> {data.studentName}</p>
        <p><strong>Registration number:</strong> {data.regNumber}</p>
        <p><strong>Class:</strong> {data.className}</p>
      </div>

      <table className="mb-4 w-full border-collapse text-sm">
        <thead>
          <tr className="bg-blue-900/5 text-left">
            <th className="border border-gray-300 px-3 py-2">Subject</th>
            <th className="border border-gray-300 px-3 py-2">First CA (20)</th>
            <th className="border border-gray-300 px-3 py-2">Second CA (20)</th>
            <th className="border border-gray-300 px-3 py-2">Exam (60)</th>
            <th className="border border-gray-300 px-3 py-2">Total (100)</th>
          </tr>
        </thead>
        <tbody>
          {data.subjects.map((s) => (
            <tr key={s.name}>
              <td className="border border-gray-300 px-3 py-2 font-medium">{s.name}</td>
              <td className="border border-gray-300 px-3 py-2">{s.first}</td>
              <td className="border border-gray-300 px-3 py-2">{s.second}</td>
              <td className="border border-gray-300 px-3 py-2">{s.exam}</td>
              <td className="border border-gray-300 px-3 py-2 font-semibold">{s.total}</td>
            </tr>
          ))}
          <tr className="bg-blue-900/5">
            <td className="border border-gray-300 px-3 py-2 font-bold" colSpan={4}>Overall total</td>
            <td className="border border-gray-300 px-3 py-2 font-bold">{data.totalScore}</td>
          </tr>
        </tbody>
      </table>
      <p className="mb-4 text-sm"><strong>Grade:</strong> {data.grade}</p>

      <div className="mb-4 grid gap-1 text-sm">
        <p><strong>Spiritual assignment:</strong> {data.spiritual ? "Submitted" : "Not submitted"}</p>
        <p><strong>Vocational assignment:</strong> {data.vocational ? "Submitted" : "Not submitted"}</p>
        <p><strong>Attendance:</strong> {data.attendance.present} of {data.attendance.total} days present</p>
        <p><strong>PDR conclusion:</strong> {data.pdrConclusion || "—"}</p>
      </div>

      <div className="mt-10 flex justify-end">
        <div className="text-center text-xs text-gray-600">
          <div className="mb-1 w-48 border-b border-gray-500" />
          <p>Principal's signature</p>
        </div>
      </div>
    </div>
  );
}
