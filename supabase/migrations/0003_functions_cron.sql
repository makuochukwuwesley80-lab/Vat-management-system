-- ============================================================================
-- VAT MANAGEMENT SYSTEM — MIGRATION 0003: FUNCTIONS & SCHEDULED JOBS
-- ============================================================================

-- ---------------------------------------------------------------------------
-- One-time bootstrap: promote the FIRST auth user to System Manager.
-- Usage (Supabase SQL Editor):
--   1. Create the user in Dashboard → Authentication → Users → "Add user"
--      (this prevents anyone self-promoting through the app).
--   2. select public.bootstrap_system_manager('you@example.com');
-- Refuses once a bootstrap admin exists.
-- ---------------------------------------------------------------------------
create or replace function public.bootstrap_system_manager(p_email text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_user_id uuid;
begin
  if exists (select 1 from profiles where is_bootstrap_admin) then
    raise exception 'A System Manager account already exists. Use the normal sign-in flow.';
  end if;

  select id into v_user_id from auth.users where lower(email) = lower(p_email) limit 1;
  if v_user_id is null then
    raise exception 'No auth user found for %. Create the user first under Authentication → Users.', p_email;
  end if;

  insert into profiles (id, full_name, system_role, is_bootstrap_admin)
  values (v_user_id, 'System Manager', 'system_manager', true)
  on conflict (id) do update
    set system_role = 'system_manager', is_bootstrap_admin = true;

  insert into admin_audit_logs (actor_id, action, entity, details)
  values (v_user_id, 'bootstrap_system_manager', 'profiles',
          json_build_object('profile_id', v_user_id));

  return v_user_id;
end;
$$;

revoke execute on function public.bootstrap_system_manager(text) from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- Auto-activate sessions whose activation date has arrived
-- ---------------------------------------------------------------------------
create or replace function public.activate_due_sessions() returns void
language plpgsql security definer set search_path = public as $$
begin
  update vat_sessions
  set status = 'active'
  where status = 'upcoming'
    and activation_date is not null
    and activation_date <= (now() at time zone 'Africa/Lagos')::date;
end;
$$;

-- ---------------------------------------------------------------------------
-- Idempotent annual promotion (media/system manager invokes via RPC).
-- Students move up one class; SS3 graduates become alumni.
-- ---------------------------------------------------------------------------
create or replace function public.promote_students_for_session(p_new_session uuid)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_active_session uuid;
  v_count int := 0;
  rec record;
begin
  if not (public.is_media_user() or public.is_system_manager()) then
    raise exception 'Not authorized';
  end if;

  -- idempotency guard: refuse when the new session already has registrations
  if exists (select 1 from student_registrations where session_id = p_new_session) then
    raise exception 'Registrations already exist for this session. Promotion was already completed.';
  end if;

  select id into v_active_session from vat_sessions
  where status = 'active' order by year desc limit 1;
  if v_active_session is null then
    raise exception 'No active session found to promote from.';
  end if;

  for rec in
    select r.*, c.level_order
    from student_registrations r
    join school_classes c on c.id = r.school_class_id
    where r.session_id = v_active_session and r.is_alumni = false
  loop
    if rec.level_order < 6 then
      insert into student_registrations
        (student_id, session_id, center_id, school_class_id, is_alumni)
      select rec.student_id, p_new_session, rec.center_id,
             (select id from school_classes where level_order = rec.level_order + 1),
             false
      on conflict (student_id, session_id) do nothing;
    else
      -- SS3 graduate: no new class registration; flag record as alumni
      update student_registrations set is_alumni = true where id = rec.id;
    end if;
    v_count := v_count + 1;
  end loop;

  insert into admin_audit_logs (actor_id, action, entity, details)
  values (auth.uid(), 'promote_students', 'student_registrations',
          json_build_object('new_session', p_new_session, 'processed', v_count));

  return v_count;
end;
$$;

-- ---------------------------------------------------------------------------
-- Confidential PDR conclusion — scalar RPC used only for result printing.
-- Private problems/notes are NOT returned.
-- ---------------------------------------------------------------------------
create or replace function public.get_pdr_conclusion_for_result(p_student uuid, p_session uuid)
returns text
language plpgsql security definer set search_path = public as $$
declare v_conclusion text;
begin
  if not (public.is_media_user() or public.is_system_manager() or public.is_general_principal()) then
    raise exception 'Not authorized';
  end if;
  select n.conclusion into v_conclusion
  from pdr_notes n
  join pdr_members m on m.id = n.member_id
  where m.student_id = p_student and m.session_id = p_session
  limit 1;
  return v_conclusion;
end;
$$;

-- ---------------------------------------------------------------------------
-- Noon attendance deadline check (Africa/Lagos).
-- Flags classes without submissions; warnings are unique per event
-- (idempotent) and clear automatically when a submission arrives (the
-- dashboard query only shows unresolved warnings).
-- ---------------------------------------------------------------------------
create or replace function public.process_attendance_deadline(p_date date default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_session uuid;
  v_today date := coalesce(p_date, (now() at time zone 'Africa/Lagos')::date);
  v_created int := 0;
  rec record;
  v_notif_id uuid;
begin
  select id into v_session from vat_sessions where status = 'active' limit 1;
  if v_session is null then return 0; end if;

  for rec in
    select r.class_id, r.center_id
    from (select distinct school_class_id as class_id, center_id
          from student_registrations
          where session_id = v_session and is_alumni = false) r
    where not exists (
      select 1 from attendance_submissions s
      where s.class_id = rec.class_id
        and s.attendance_date = v_today
        and s.session_id = v_session)
  loop
    insert into attendance_warnings (class_id, center_id, session_id, attendance_date)
    values (rec.class_id, rec.center_id, v_session, v_today)
    on conflict (class_id, attendance_date, session_id) do nothing;
    v_created := v_created + 1;
  end loop;

  -- one notification per (class, date) for assigned form teachers
  for rec in
    select w.class_id, w.center_id, w.profile_id
    from (select distinct wa.school_class_id as class_id, c.center_id, c.profile_id
          from worker_assignments wa
          join workers c on c.id = wa.worker_id
          join vat_sessions s on s.id = wa.session_id and s.status = 'active'
          where wa.is_active and wa.school_class_id is not null) w
    where w.profile_id is not null
      and not exists (
        select 1 from attendance_submissions s
        where s.class_id = w.class_id
          and s.attendance_date = v_today
          and s.session_id = v_session)
      and not exists (
        select 1 from notifications n
        join notification_recipients nr on nr.notification_id = n.id
        where nr.profile_id = w.profile_id
          and n.title = 'Attendance not submitted'
          and n.body like '%|' || v_today::text || '|%'
          and n.body like '%|' || w.class_id::text || '|%')
  loop
    insert into notifications (title, body)
    values ('Attendance not submitted',
            'Attendance for your class on ' || v_today || ' has not been submitted. Please submit before end of day. [' || v_today || '|' || rec.class_id || ']')
    returning id into v_notif_id;

    insert into notification_recipients (notification_id, profile_id)
    values (v_notif_id, rec.profile_id);
  end loop;

  return v_created;
end;
$$;

-- ---------------------------------------------------------------------------
-- pg_cron schedules — Africa/Lagos = UTC+1, so 12:00 WAT = 11:00 UTC
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;

select cron.unschedule('vat-attendance-deadline');
select cron.schedule(
  'vat-attendance-deadline',
  '0 11 * * *',
  $$select public.process_attendance_deadline();$$
);

select cron.unschedule('vat-session-activation');
select cron.schedule(
  'vat-session-activation',
  '0 * * * *',
  $$select public.activate_due_sessions();$$
);

-- ---------------------------------------------------------------------------
-- Registration number builder — format read from
-- system_config.registration_number_format ({year} {pdr} {gdc} {serial}).
-- The official format is configured by the administrator; nothing hardcoded.
-- ---------------------------------------------------------------------------
create or replace function public.build_registration_number(
  p_session int, p_pdr text, p_gdc text, p_serial int
) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  v_fmt text;
begin
  select coalesce(value->>'format', 'VAT/{year}/{pdr}/{gdc}/{serial}')
    into v_fmt
  from system_config where key = 'registration_number_format';
  return replace(replace(replace(replace(v_fmt,
    '{year}', p_session::text),
    '{pdr}', coalesce(p_pdr, '')),
    '{gdc}', coalesce(p_gdc, '')),
    '{serial}', lpad(p_serial::text, 4, '0'));
end;
$$;
