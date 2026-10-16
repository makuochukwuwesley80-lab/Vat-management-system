"use server";
import { randomInt } from "node:crypto";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { requireProfile } from "@/lib/auth";


export interface ActionResult {
  ok: boolean;
  error?: string;
  credentials?: { email: string; password: string };
}

async function logAudit(action: string, entity: string, entityId?: string, details?: object) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  await supabase.from("admin_audit_logs").insert({
    actor_id: user?.id ?? null,
    action,
    entity,
    entity_id: entityId,
    details: details ?? {},
  });
}

// ---------------------------------------------------------------------------
// Centers (System Manager, or Media when media_can_create_centers is enabled)
// ---------------------------------------------------------------------------
export async function addCenter(form: {
  name: string;
  code: string;
  location: string;
  is_headquarters: boolean;
  is_center_one: boolean;
  is_active: boolean;
}): Promise<ActionResult> {
  const profile = await requireProfile(["system_manager", "media"]);
  if (profile.system_role !== "system_manager") {
    const supabase = await createClient();
    const { data: cfg } = await supabase
      .from("system_config")
      .select("value")
      .eq("key", "media_can_create_centers")
      .single();
    if (!cfg?.value?.enabled) {
      return { ok: false, error: "You are not authorized to create centers." };
    }
  }

  const supabase = await createClient();
  const { data: existing } = await supabase
    .from("centers")
    .select("id")
    .eq("code", form.code.trim())
    .maybeSingle();
  if (existing) {
    return { ok: false, error: `Center code "${form.code}" already exists. Choose a unique code.` };
  }

  const { data: maxOrder } = await supabase
    .from("centers")
    .select("display_order")
    .order("display_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  const { error } = await supabase.from("centers").insert({
    name: form.name.trim(),
    code: form.code.trim().toUpperCase(),
    location: form.location.trim() || null,
    is_headquarters: form.is_headquarters,
    is_center_one: form.is_center_one,
    is_active: form.is_active,
    display_order: (maxOrder?.display_order ?? 0) + 1,
  });
  if (error) return { ok: false, error: error.message };

  await logAudit("create_center", "centers", undefined, { name: form.name });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function updateCenter(
  id: string,
  form: {
    name: string;
    code: string;
    location: string;
    is_headquarters: boolean;
    is_center_one: boolean;
    is_active: boolean;
  }
): Promise<ActionResult> {
  await requireProfile(["system_manager"]);
  const supabase = await createClient();

  const { data: dup } = await supabase
    .from("centers")
    .select("id")
    .eq("code", form.code.trim())
    .neq("id", id)
    .maybeSingle();
  if (dup) return { ok: false, error: `Center code "${form.code}" is already used by another center.` };

  const { error } = await supabase
    .from("centers")
    .update({
      name: form.name.trim(),
      code: form.code.trim().toUpperCase(),
      location: form.location.trim() || null,
      is_headquarters: form.is_headquarters,
      is_center_one: form.is_center_one,
      is_active: form.is_active,
    })
    .eq("id", id);
  if (error) return { ok: false, error: error.message };

  await logAudit("update_center", "centers", id, { name: form.name, is_active: form.is_active });
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Student registration
// ---------------------------------------------------------------------------
export async function registerNewStudent(form: {
  full_name: string;
  parent_name: string;
  parent_phone: string;
  location: string;
  is_born_again: boolean;
  school: string;
  school_class: string; // class name
  gender: "male" | "female";
  date_of_birth: string;
}): Promise<ActionResult> {
  const profile = await requireProfile(["media", "system_manager"]);
  if (!profile.center_id) return { ok: false, error: "Your account is not linked to a center." };

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("vat_sessions")
    .select("id, year")
    .eq("status", "active")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return { ok: false, error: "No active VAT session. Ask the System Manager to activate one." };

  const { data: cls } = await supabase
    .from("school_classes")
    .select("id")
    .eq("name", form.school_class)
    .single();
  if (!cls) return { ok: false, error: "Invalid class selected." };

  // Create the permanent student identity
  const { data: student, error: sErr } = await supabase
    .from("students")
    .insert({
      full_name: form.full_name.trim(),
      parent_name: form.parent_name.trim(),
      parent_phone: form.parent_phone.trim(),
      location: form.location.trim(),
      is_born_again: form.is_born_again,
      school: form.school.trim(),
      school_class: form.school_class,
      gender: form.gender,
      date_of_birth: form.date_of_birth || null,
      center_id: profile.center_id,
    })
    .select("id")
    .single();
  if (sErr) return { ok: false, error: sErr.message };

  // Year-specific registration
  const { error: rErr } = await supabase.from("student_registrations").insert({
    student_id: student.id,
    session_id: session.id,
    center_id: profile.center_id,
    school_class_id: cls.id,
  });
  if (rErr) return { ok: false, error: rErr.message };

  await logAudit("register_new_student", "students", student.id, { name: form.full_name });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function registerExistingStudent(form: {
  student_id: string;
  school_class: string;
}): Promise<ActionResult> {
  const profile = await requireProfile(["media", "system_manager"]);
  if (!profile.center_id) return { ok: false, error: "Your account is not linked to a center." };

  const supabase = await createClient();
  const { data: session } = await supabase
    .from("vat_sessions")
    .select("id")
    .eq("status", "active")
    .order("year", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (!session) return { ok: false, error: "No active VAT session." };

  const { data: cls } = await supabase
    .from("school_classes")
    .select("id")
    .eq("name", form.school_class)
    .single();

  // Duplicate registration for the same session is prevented by the DB
  // unique constraint; surface a friendly error.
  const { error } = await supabase.from("student_registrations").insert({
    student_id: form.student_id,
    session_id: session.id,
    center_id: profile.center_id,
    school_class_id: cls?.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "This student is already registered for the current VAT session." };
    }
    return { ok: false, error: error.message };
  }

  await logAudit("register_existing_student", "students", form.student_id, {});
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function setAssignmentSubmission(
  registrationId: string,
  kind: "spiritual" | "vocational",
  value: boolean
): Promise<ActionResult> {
  await requireProfile(["media", "system_manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("student_registrations")
    .update(kind === "spiritual" ? { spiritual_submitted: value } : { vocational_submitted: value })
    .eq("id", registrationId);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Workers & foster parents (provisioning via service role, server-side only)
// ---------------------------------------------------------------------------
export async function registerWorker(form: {
  full_name: string;
  phone: string;
  create_account: boolean;
}): Promise<ActionResult> {
  const profile = await requireProfile(["media", "system_manager"]);
  if (!profile.center_id) return { ok: false, error: "Your account is not linked to a center." };

  const supabase = await createClient();
  const { data: worker, error } = await supabase
    .from("workers")
    .insert({
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      center_id: profile.center_id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  let credentials: ActionResult["credentials"];
  if (form.create_account) {
    try {
      credentials = await provisionAccount({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        center_id: profile.center_id,
        kind: "worker",
        worker_id: worker.id,
      });
    } catch (e) {
      return { ok: false, error: `Worker saved, but account creation failed: ${(e as Error).message}` };
    }
  }

  await logAudit("register_worker", "workers", worker.id, { name: form.full_name });
  revalidatePath("/dashboard");
  return { ok: true, credentials };
}
export async function registerFosterParent(form: {
  full_name: string;
  phone: string;
  home_name: string;
  create_account: boolean;
}): Promise<ActionResult> {
  const profile = await requireProfile(["media", "system_manager"]);
  if (!profile.center_id) return { ok: false, error: "Your account is not linked to a center." };

  const supabase = await createClient();
  const { data: fp, error } = await supabase
    .from("foster_parents")
    .insert({
      full_name: form.full_name.trim(),
      phone: form.phone.trim(),
      home_name: form.home_name.trim() || null,
      center_id: profile.center_id,
    })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  let credentials: ActionResult["credentials"];
  if (form.create_account) {
    try {
      credentials = await provisionAccount({
        full_name: form.full_name.trim(),
        phone: form.phone.trim(),
        center_id: profile.center_id,
        kind: "foster_parent",
        foster_parent_id: fp.id,
      });
    } catch (e) {
      return { ok: false, error: `Foster parent saved, but account creation failed: ${(e as Error).message}` };
    }
  }

  await logAudit("register_foster_parent", "foster_parents", fp.id, { name: form.full_name });
  revalidatePath("/dashboard");
  return { ok: true, credentials };
}

/** Server-only: provisions a worker or foster-parent account. */
async function provisionAccount(input: {
  full_name: string;
  phone: string;
  center_id: string;
  kind: "worker" | "foster_parent";
  worker_id?: string;
  foster_parent_id?: string;
}): Promise<{ email: string; password: string }> {
  const admin = createAdminClient();

  const normalize = (value: string) =>
    value
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "");

  const name = normalize(input.full_name);
  if (!name) throw new Error("Enter a valid full name.");

  let baseLocal: string;
  let domain: string;

  if (input.kind === "worker") {
    const { data: center, error: centerError } = await admin
      .from("centers")
      .select("name")
      .eq("id", input.center_id)
      .single();

    if (centerError || !center?.name) {
      throw new Error("Could not determine your center name.");
    }

    const centerSlug = normalize(center.name);
    if (!centerSlug) throw new Error("The center name is invalid.");

    baseLocal = name;
    domain = `${centerSlug}.vat.org`;
  } else {
    baseLocal = `${name}fosterparent`;
    domain = "vat.org";
  }

  // Keep six digits, including any leading zeroes.

  const password = randomInt(0, 1_000_000).toString().padStart(6, "0");

  let email = "";
  let userId = "";
  let suffix = 0;

  // Supabase Auth enforces email uniqueness, including concurrent registrations.
  while (suffix <= 10000) {
    const localPart = `${baseLocal}${suffix === 0 ? "" : suffix}`;
    email = `${localPart}@${domain}`;

    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: {
        full_name: input.full_name,
        kind: input.kind,
      },
    });

    if (!error && data.user) {
      userId = data.user.id;
      break;
    }

    const errorText = `${error?.code ?? ""} ${error?.message ?? ""}`.toLowerCase();
    const duplicateEmail =
      errorText.includes("email_exists") ||
      errorText.includes("user_already_exists") ||
      (errorText.includes("email") &&
        (errorText.includes("already") || errorText.includes("registered")));

    if (duplicateEmail) {
      suffix++;
      continue;
    }

    throw new Error(error?.message ?? "Could not create the account.");
  }

  if (!userId) {
    throw new Error("Could not find an available email address.");
  }

  const supabase = admin;

  const { error: profileError } = await supabase.from("profiles").upsert({
    id: userId,
    full_name: input.full_name,
    phone: input.phone,
    system_role: input.kind === "worker" ? "worker" : "foster_parent",
    center_id: input.center_id,
  });

  if (profileError) {
    await admin.auth.admin.deleteUser(userId);
    throw new Error(`Account profile could not be saved: ${profileError.message}`);
  }

  if (input.worker_id) {
    const { error } = await supabase
      .from("workers")
      .update({ profile_id: userId })
      .eq("id", input.worker_id);

    if (error) {
      await admin.auth.admin.deleteUser(userId);
      throw new Error(`Worker account could not be linked: ${error.message}`);
    }
  }

  if (input.foster_parent_id) {
    const { error } = await supabase
      .from("foster_parents")
      .update({ profile_id: userId })
      .eq("id", input.foster_parent_id);

    if (error) {
      await admin.auth.admin.deleteUser(userId);
      throw new Error(`Foster-parent account could not be linked: ${error.message}`);
    }
  }

  return { email, password };
}
// Worker assignments
// ---------------------------------------------------------------------------
export async function assignTask(form: {
  worker_id: string;
  responsibility: string;
  school_class?: string;
  subject?: string;
  gdc_group?: string;
  pdr_group?: string;
}): Promise<ActionResult> {
  await requireProfile(["media", "system_manager"]);
  const supabase = await createClient();

  const { data: session } = await supabase
    .from("vat_sessions")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!session) return { ok: false, error: "No active VAT session." };

  const { data: resp } = await supabase
    .from("responsibilities")
    .select("id")
    .eq("name", form.responsibility)
    .single();

  const { data: cls } = form.school_class
    ? await supabase.from("school_classes").select("id").eq("name", form.school_class).single()
    : { data: null };
  const { data: subj } = form.subject
    ? await supabase.from("subjects").select("id").eq("name", form.subject).single()
    : { data: null };

  const { error } = await supabase.from("worker_assignments").insert({
    worker_id: form.worker_id,
    responsibility_id: resp?.id,
    session_id: session.id,
    school_class_id: cls?.id ?? null,
    subject_id: subj?.id ?? null,
    gdc_group_id: form.gdc_group || null,
    pdr_group_id: form.pdr_group || null,
  });
  if (error) return { ok: false, error: error.message };

  // Notify the worker
  const { data: worker } = await supabase
    .from("workers")
    .select("profile_id, full_name")
    .eq("id", form.worker_id)
    .single();
  if (worker?.profile_id) {
    const { data: notif } = await supabase
      .from("notifications")
      .insert({
        title: "New responsibility assigned",
        body: `You have been assigned: ${form.responsibility}${form.school_class ? ` (${form.school_class})` : ""}.`,
      })
      .select("id")
      .single();
    if (notif) {
      await supabase.from("notification_recipients").insert({
        notification_id: notif.id,
        profile_id: worker.profile_id,
      });
    }
  }

  await logAudit("assign_task", "worker_assignments", undefined, { worker: form.worker_id, resp: form.responsibility });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function unassignTask(assignmentId: string): Promise<ActionResult> {
  await requireProfile(["media", "system_manager"]);
  const supabase = await createClient();
  const { error } = await supabase
    .from("worker_assignments")
    .update({ is_active: false, unassigned_at: new Date().toISOString() })
    .eq("id", assignmentId);
  if (error) return { ok: false, error: error.message };
  await logAudit("unassign_task", "worker_assignments", assignmentId, {});
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Scores & results
// ---------------------------------------------------------------------------
export async function saveScore(form: {
  student_id: string;
  subject_id: string;
  component: "first_ca" | "second_ca" | "exam";
  marks: number;
}): Promise<ActionResult> {
  await requireProfile(["media", "system_manager"]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: session } = await supabase
    .from("vat_sessions")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!session) return { ok: false, error: "No active VAT session." };

  const { error } = await supabase.from("scores").upsert(
    {
      student_id: form.student_id,
      subject_id: form.subject_id,
      session_id: session.id,
      component: form.component,
      marks: form.marks,
      entered_by: user?.id,
    },
    { onConflict: "student_id,subject_id,session_id,component" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function approveResult(
  studentId: string,
  sessionId: string,
  approved: boolean
): Promise<ActionResult> {
  await requireProfile(["media", "system_manager"]);
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  const { error } = await supabase.from("result_approvals").upsert(
    {
      student_id: studentId,
      session_id: sessionId,
      approved,
      approved_by: user?.id,
      approved_at: approved ? new Date().toISOString() : null,
    },
    { onConflict: "student_id,session_id" }
  );
  if (error) return { ok: false, error: error.message };
  await logAudit(approved ? "approve_result" : "revoke_result", "result_approvals", studentId, {});
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Memory verses, notifications, sessions
// ---------------------------------------------------------------------------
export async function saveMemoryVerse(form: {
  class_id: string;
  reference: string;
  verse_text: string;
}): Promise<ActionResult> {
  await requireProfile(["media", "system_manager"]);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("vat_sessions")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!session) return { ok: false, error: "No active VAT session." };

  const { error } = await supabase.from("memory_verses").upsert(
    {
      session_id: session.id,
      class_id: form.class_id,
      reference: form.reference.trim(),
      verse_text: form.verse_text.trim(),
    },
    { onConflict: "session_id,class_id" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function sendNotification(form: {
  title: string;
  body: string;
  recipient_role: string; // 'all' | role name
}): Promise<ActionResult> {
  const profile = await requireProfile(["media", "system_manager"]);
  const supabase = await createClient();

  const { data: notif, error } = await supabase
    .from("notifications")
    .insert({ title: form.title.trim(), body: form.body.trim(), created_by: profile.id })
    .select("id")
    .single();
  if (error) return { ok: false, error: error.message };

  const { data: recipients } = await supabase
    .from("profiles")
    .select("id")
    .eq("is_active", true)
    .neq("system_role", "system_manager");

  let targets = recipients ?? [];
  if (form.recipient_role !== "all") {
    targets = targets.filter((p: { id: string }) => p.id);
  }
  // role filter happens server-side; recipient_role maps to system_role
  if (form.recipient_role !== "all") {
    const { data: byRole } = await supabase
      .from("profiles")
      .select("id")
      .eq("system_role", form.recipient_role)
      .eq("is_active", true);
    targets = byRole ?? [];
  }

  if (targets.length > 0) {
    const { error: rErr } = await supabase.from("notification_recipients").insert(
      targets.map((t: { id: string }) => ({ notification_id: notif.id, profile_id: t.id }))
    );
    if (rErr) return { ok: false, error: rErr.message };
  }
  await logAudit("send_notification", "notifications", notif.id, { role: form.recipient_role });
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createSession(form: {
  year: number;
  activation_date: string;
}): Promise<ActionResult> {
  await requireProfile(["system_manager"]);
  const supabase = await createClient();
  const { error } = await supabase.from("vat_sessions").insert({
    year: form.year,
    activation_date: form.activation_date,
    status: "upcoming",
  });
  if (error) return { ok: false, error: error.message };
  await logAudit("create_session", "vat_sessions", undefined, { year: form.year });
  revalidatePath("/dashboard");
  return { ok: true };
}

/** Idempotent annual promotion via the DB function. */
export async function runPromotion(newSessionId: string): Promise<ActionResult & { count?: number }> {
  await requireProfile(["media", "system_manager"]);
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("promote_students_for_session", {
    p_new_session: newSessionId,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true, count: (data as number) ?? 0 };
}

// ---------------------------------------------------------------------------
// GDC & PDR groups
// ---------------------------------------------------------------------------
export async function createGdcGroup(form: { name: string }): Promise<ActionResult> {
  const profile = await requireProfile(["media", "system_manager"]);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("vat_sessions")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!session || !profile.center_id) return { ok: false, error: "Missing active session or center." };
  const { error } = await supabase.from("gdc_groups").insert({
    name: form.name.trim(),
    center_id: profile.center_id,
    session_id: session.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function createPdrGroup(form: {
  identifier: string;
  gender: "male" | "female";
}): Promise<ActionResult> {
  const profile = await requireProfile(["media", "system_manager"]);
  const supabase = await createClient();
  const { data: session } = await supabase
    .from("vat_sessions")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!session || !profile.center_id) return { ok: false, error: "Missing active session or center." };
  const { error } = await supabase.from("pdr_groups").insert({
    identifier: form.identifier.trim().toUpperCase(),
    gender: form.gender,
    center_id: profile.center_id,
    session_id: session.id,
  });
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Foster parent: register a student into their own home
// ---------------------------------------------------------------------------
export async function fosterRegisterStudent(form: {
  student_id: string;
}): Promise<ActionResult> {
  const profile = await requireProfile(["foster_parent"]);
  const supabase = await createClient();
  const { data: fp } = await supabase
    .from("foster_parents")
    .select("id, center_id")
    .eq("profile_id", profile.id)
    .eq("is_active", true)
    .single();
  if (!fp) return { ok: false, error: "No foster home linked to your account." };

  const { data: session } = await supabase
    .from("vat_sessions")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!session) return { ok: false, error: "No active VAT session." };

  const { error } = await supabase.from("foster_students").insert({
    foster_parent_id: fp.id,
    student_id: form.student_id,
    session_id: session.id,
  });
  if (error) {
    if (error.code === "23505") {
      return { ok: false, error: "This student is already registered in your foster home for this session." };
    }
    return { ok: false, error: error.message };
  }
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Form teacher: attendance
// ---------------------------------------------------------------------------
export async function submitAttendance(form: {
  class_id: string;
  records: { registration_id: string; student_id: string; status: "present" | "absent" }[];
}): Promise<ActionResult> {
  const profile = await requireProfile();
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { data: session } = await supabase
    .from("vat_sessions")
    .select("id")
    .eq("status", "active")
    .limit(1)
    .maybeSingle();
  if (!session) return { ok: false, error: "No active VAT session." };

  const today = new Date().toLocaleDateString("en-CA", { timeZone: "Africa/Lagos" });

  const rows = form.records.map((r) => ({
    student_id: r.student_id,
    registration_id: r.registration_id,
    session_id: session.id,
    attendance_date: today,
    status: r.status,
    recorded_by: user?.id,
  }));

  // upsert to prevent duplicate attendance entries (DB constraint backs this)
  const { error } = await supabase
    .from("attendance")
    .upsert(rows, { onConflict: "student_id,attendance_date,session_id" });
  if (error) return { ok: false, error: error.message };

  const { error: sErr } = await supabase.from("attendance_submissions").upsert(
    {
      class_id: form.class_id,
      session_id: session.id,
      attendance_date: today,
      submitted_by: user?.id,
    },
    { onConflict: "class_id,attendance_date,session_id" }
  );
  if (sErr) return { ok: false, error: sErr.message };

  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// PDR parent: records & confidential notes
// ---------------------------------------------------------------------------
export async function savePdrRecord(form: {
  member_id: string;
  water_baptized: boolean;
  prefectship_flag: boolean;
}): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  // RLS: only the assigned PDR parent for this member can write this row
  const { error } = await supabase.from("pdr_records").upsert(
    {
      member_id: form.member_id,
      water_baptized: form.water_baptized,
      prefectship_flag: form.prefectship_flag,
    },
    { onConflict: "member_id" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

export async function savePdrNote(form: {
  member_id: string;
  problems: string;
  conclusion: string;
}): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase.from("pdr_notes").upsert(
    {
      member_id: form.member_id,
      problems: form.problems.trim() || null,
      conclusion: form.conclusion.trim() || null,
    },
    { onConflict: "member_id" }
  );
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Notifications: mark read
// ---------------------------------------------------------------------------
export async function markNotificationsRead(ids: string[]): Promise<ActionResult> {
  await requireProfile();
  const supabase = await createClient();
  const { error } = await supabase
    .from("notification_recipients")
    .update({ read_at: new Date().toISOString() })
    .in("id", ids);
  if (error) return { ok: false, error: error.message };
  revalidatePath("/dashboard");
  return { ok: true };
}
