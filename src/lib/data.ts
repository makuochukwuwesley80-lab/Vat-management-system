import "server-only";
import { createClient } from "@/lib/supabase/server";
import type {
  Center,
  VatSession,
  StudentRegistration,
  SchoolClass,
} from "@/lib/types";

/** The currently active VAT session (or the next upcoming one). */
export async function getActiveSession(): Promise<VatSession | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vat_sessions")
    .select("*")
    .in("status", ["active", "upcoming"])
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  return (data as VatSession) ?? null;
}

export async function getAllSessions(): Promise<VatSession[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("vat_sessions")
    .select("*")
    .order("year", { ascending: false });
  return (data as VatSession[]) ?? [];
}

export async function getCenters(): Promise<Center[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("centers")
    .select("*")
    .order("display_order", { ascending: true });
  return (data as Center[]) ?? [];
}

export async function getClasses(): Promise<SchoolClass[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("school_classes")
    .select("*")
    .order("level_order");
  return (data as SchoolClass[]) ?? [];
}

export interface AttendanceSummary {
  total: number;
  present: number;
  absent: number;
  rate: number;
}

/** Per-class attendance for a center on a date (defaults to today, WAT). */
export async function getCenterAttendance(
  centerId: string,
  sessionId: string,
  date?: string
): Promise<{
  today: AttendanceSummary;
  byClass: { className: string; total: number; present: number; submitted: boolean }[];
  outstandingClasses: string[];
}> {
  const supabase = await createClient();
  const today =
    date ?? new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

  const [{ data: regs }, { data: att }, { data: subs }] = await Promise.all([
    supabase
      .from("student_registrations")
      .select("id, school_class_id")
      .eq("session_id", sessionId)
      .eq("center_id", centerId)
      .eq("is_alumni", false),
    supabase
      .from("attendance")
      .select("registration_id, status")
      .eq("session_id", sessionId)
      .eq("attendance_date", today),
    supabase
      .from("attendance_submissions")
      .select("class_id")
      .eq("session_id", sessionId)
      .eq("attendance_date", today),
  ]);

  const classes = await getClasses();
  const attByReg = new Map(
    (att ?? []).map((a: { registration_id: string; status: string }) => [
      a.registration_id,
      a.status,
    ])
  );
  const submittedSet = new Set((subs ?? []).map((s: { class_id: string }) => s.class_id));

  const byClass = classes.map((c) => {
    const classRegs = (regs ?? []).filter(
      (r: { school_class_id: string }) => r.school_class_id === c.id
    );
    const present = classRegs.filter(
      (r: { id: string }) => attByReg.get(r.id) === "present"
    ).length;
    return {
      className: c.name,
      total: classRegs.length,
      present,
      submitted: submittedSet.has(c.id),
    };
  });

  const total = byClass.reduce((s, c) => s + c.total, 0);
  const present = byClass.reduce((s, c) => s + c.present, 0);

  return {
    today: {
      total,
      present,
      absent: total - present,
      rate: total > 0 ? Math.round((present / total) * 1000) / 10 : 0,
    },
    byClass: byClass.filter((c) => c.total > 0),
    outstandingClasses: byClass.filter((c) => c.total > 0 && !c.submitted).map((c) => c.className),
  };
}

export interface CenterRow {
  center: Center;
  students: number;
  workers: number;
  fosterParents: number;
  present: number;
  submitted: boolean;
}

/** National overview rows — aggregate data only (no confidential records). */
export async function getNationalOverview(sessionId: string): Promise<{
  centers: CenterRow[];
  totals: { centers: number; students: number; workers: number; fosterParents: number; present: number; absent: number };
}> {
  const supabase = await createClient();
  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

  const [centersRes, regsRes, workersRes, fosterRes, attRes, subsRes] = await Promise.all([
    getCenters(),
    supabase.from("student_registrations").select("center_id, id, is_alumni").eq("session_id", sessionId),
    supabase.from("workers").select("center_id, id").eq("is_active", true),
    supabase.from("foster_parents").select("center_id, id").eq("is_active", true),
    supabase
      .from("attendance")
      .select("registration_id, status")
      .eq("session_id", sessionId)
      .eq("attendance_date", today),
    supabase
      .from("attendance_submissions")
      .select("center_id, class_id")
      .eq("session_id", sessionId)
      .eq("attendance_date", today),
  ]);

  const attByReg = new Map(
    (attRes.data ?? []).map((a: { registration_id: string; status: string }) => [
      a.registration_id,
      a.status,
    ])
  );

  const centers: CenterRow[] = centersRes.map((c) => {
    const regs = (regsRes.data ?? []).filter(
      (r: { center_id: string }) => r.center_id === c.id
    );
    const present = regs.filter(
      (r: { id: string }) => attByReg.get(r.id) === "present"
    ).length;
    return {
      center: c,
      students: regs.length,
      workers: (workersRes.data ?? []).filter(
        (w: { center_id: string }) => w.center_id === c.id
      ).length,
      fosterParents: (fosterRes.data ?? []).filter(
        (f: { center_id: string }) => f.center_id === c.id
      ).length,
      present,
      submitted: (subsRes.data ?? []).some(
        (s: { center_id: string }) => s.center_id === c.id
      ),
    };
  });

  const totals = {
    centers: centers.length,
    students: centers.reduce((s, c) => s + c.students, 0),
    workers: centers.reduce((s, c) => s + c.workers, 0),
    fosterParents: centers.reduce((s, c) => s + c.fosterParents, 0),
    present: centers.reduce((s, c) => s + c.present, 0),
    absent: 0,
  };
  totals.absent = totals.students - totals.present;

  return { centers, totals };
}

/** Students registered under the signed-in foster parent (own home only). */
export async function getFosterHomeRoster(fosterParentId: string, sessionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("foster_students")
    .select("*, students!inner(id, full_name, gender, parent_phone), student_registrations(school_class_id, registration_number)")
    .eq("foster_parent_id", fosterParentId)
    .eq("session_id", sessionId);
  return data ?? [];
}

/** Worker's active responsibilities for the active session. */
export async function getWorkerAssignments(workerId: string, sessionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("worker_assignments")
    .select(
      "*, responsibilities(name), school_classes(name), subjects(name), gdc_groups(name), pdr_groups(identifier, gender)"
    )
    .eq("worker_id", workerId)
    .eq("session_id", sessionId)
    .eq("is_active", true);
  return data ?? [];
}

/** Students assigned to the signed-in PDR parent (their group only). */
export async function getPdrRoster(pdrGroupId: string, sessionId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("pdr_members")
    .select("id, student_id, students(id, full_name, is_born_again), student_registrations(school_class_id)")
    .eq("group_id", pdrGroupId)
    .eq("session_id", sessionId);
  return data ?? [];
}

export async function getActiveWorkerId(profileId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("workers")
    .select("id")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}

export async function getActiveFosterParentId(profileId: string): Promise<string | null> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("foster_parents")
    .select("id")
    .eq("profile_id", profileId)
    .eq("is_active", true)
    .limit(1)
    .maybeSingle();
  return data?.id ?? null;
}
