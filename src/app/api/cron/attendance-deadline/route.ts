import { NextResponse, type NextRequest } from "next/server";

/**
 * Vercel Cron endpoint — runs daily at 11:00 UTC (12:00 WAT).
 * Secured with CRON_SECRET. Uses the service-role client so it can
 * execute the security-definer function process_attendance_deadline()
 * without being blocked by RLS.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;

  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const { createAdminClient } = await import("@/lib/supabase/admin");
    const admin = createAdminClient();

    const { data, error } = await admin.rpc("process_attendance_deadline");

    if (error) {
      console.error("attendance-deadline cron failed:", error.message);
      return NextResponse.json(
        { ok: false, error: error.message },
        { status: 500 }
      );
    }

    const today = new Date().toLocaleDateString("en-CA", {
      timeZone: "Africa/Lagos",
    });

    return NextResponse.json({
      ok: true,
      flagged: data ?? 0,
      date: today,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("attendance-deadline cron exception:", message);
    return NextResponse.json({ ok: false, error: message }, { status: 500 });
  }
}
