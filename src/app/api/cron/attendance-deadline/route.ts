import { NextResponse, type NextRequest } from "next/server";

/**
 * Vercel Cron endpoint — runs daily at 11:00 UTC (12:00 WAT) and flags any
 * class that has not submitted attendance. Secured with the CRON_SECRET
 * environment variable; runs server-side, independent of any open browser.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const { createClient } = await import("@/lib/supabase/server");
  const supabase = await createClient();

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });
  const { data: session } = await supabase
    .from("vat_sessions")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();

  if (!session) {
    return NextResponse.json({ ok: true, flagged: 0, reason: "No active session" });
  }

  // Classes registered this session without a submission today
  const { data: regs } = await supabase
    .from("student_registrations")
    .select("school_class_id, center_id")
    .eq("session_id", session.id)
    .eq("is_alumni", false);
  const { data: subs } = await supabase
    .from("attendance_submissions")
    .select("class_id")
    .eq("session_id", session.id)
    .eq("attendance_date", today);
  const submitted = new Set((subs ?? []).map((s: { class_id: string }) => s.class_id));

  const outstanding = new Map<string, string>(); // classId -> centerId
  for (const r of (regs ?? []) as { school_class_id: string; center_id: string }[]) {
    if (!submitted.has(r.school_class_id)) {
      outstanding.set(r.school_class_id, r.center_id);
    }
  }

  let flagged = 0;
  for (const [classId, centerId] of outstanding) {
    const { error } = await supabase
      .from("attendance_warnings")
      .upsert(
        { class_id: classId, center_id: centerId, session_id: session.id, attendance_date: today },
        { onConflict: "class_id,attendance_date,session_id" }
      );
    if (!error) flagged++;
  }

  return NextResponse.json({ ok: true, flagged, date: today });
}
