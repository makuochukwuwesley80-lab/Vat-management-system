-- ============================================================================
-- VAT MANAGEMENT SYSTEM — MIGRATION 0002: ROW LEVEL SECURITY
-- Enable RLS on every table and create role-aware policies.
-- Default posture: no policy = no access.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- Security-definer helpers (stable, callable inside policies)
-- ---------------------------------------------------------------------------
create or replace function public.current_system_role() returns text
language sql stable security definer set search_path = public as $$
  select system_role from profiles where id = auth.uid() and is_active;
$$;

create or replace function public.current_center_id() returns uuid
language sql stable security definer set search_path = public as $$
  select center_id from profiles where id = auth.uid() and is_active;
$$;

create or replace function public.has_system_role(roles text[]) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from profiles where id = auth.uid() and is_active and system_role = any(roles));
$$;

create or replace function public.is_system_manager() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_system_role(array['system_manager']) $$;

create or replace function public.is_media_user() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_system_role(array['media']) $$;

create or replace function public.is_general_principal() returns boolean
language sql stable security definer set search_path = public as $$ select public.has_system_role(array['general_principal']) $$;

create or replace function public.media_can_create_centers() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select (value->>'enabled')::boolean from system_config where key = 'media_can_create_centers'), false);
$$;

-- Active worker record for the logged-in user
create or replace function public.current_worker_id() returns uuid
language sql stable security definer set search_path = public as $$
  select w.id from workers w where w.profile_id = auth.uid() and w.is_active limit 1;
$$;

create or replace function public.current_foster_parent_id() returns uuid
language sql stable security definer set search_path = public as $$
  select f.id from foster_parents f where f.profile_id = auth.uid() and f.is_active limit 1;
$$;

-- Is the caller the currently assigned form teacher of this class (this session)?
create or replace function public.is_form_teacher_of(class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from worker_assignments wa
    join vat_sessions s on s.id = wa.session_id and s.status = 'active'
    where wa.worker_id = public.current_worker_id()
      and wa.school_class_id = class
      and wa.is_active
  );
$$;

-- Assigned subject teacher of (subject, class) for the active session?
create or replace function public.is_subject_teacher_of(subj uuid, class uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from worker_assignments wa
    join vat_sessions s on s.id = wa.session_id and s.status = 'active'
    where wa.worker_id = public.current_worker_id()
      and wa.subject_id = subj and wa.school_class_id = class
      and wa.is_active
  );
$$;

-- Is the caller an active GDC teacher for this group?
create or replace function public.is_gdc_teacher_of(g uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from worker_assignments wa
    join vat_sessions s on s.id = wa.session_id and s.status = 'active'
    where wa.worker_id = public.current_worker_id()
      and wa.gdc_group_id = g and wa.is_active
  );
$$;

-- CONFIDENTIAL: is the caller the assigned PDR parent for this member?
create or replace function public.is_pdr_parent_of(member uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from worker_assignments wa
    join vat_sessions s on s.id = wa.session_id and s.status = 'active'
    join pdr_members pm on pm.group_id = wa.pdr_group_id
    where wa.worker_id = public.current_worker_id()
      and wa.pdr_group_id is not null and wa.is_active
      and pm.id = member
  );
$$;

-- ---------------------------------------------------------------------------
-- Enable RLS on all application tables
-- ---------------------------------------------------------------------------
do $$
declare t text;
begin
  foreach t in array array[
    'system_config','centers','center_updates_audit','profiles','role_changes_audit',
    'vat_sessions','school_classes','subjects','workers','responsibilities','worker_assignments',
    'students','student_registrations','attendance','attendance_submissions','attendance_warnings',
    'gdc_groups','gdc_members','gdc_attendance','pdr_groups','pdr_members','pdr_records','pdr_notes',
    'foster_parents','foster_students','scores','score_history','result_approvals','result_generation_log',
    'memory_verses','memory_verse_recitations','notifications','notification_recipients','admin_audit_logs'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- centers
-- ---------------------------------------------------------------------------
create policy centers_select_all on centers
  for select to authenticated using (true);

create policy centers_insert_admin on centers for insert to authenticated
  with check (public.is_system_manager() or (public.is_media_user() and public.media_can_create_centers()));

create policy centers_update_admin on centers for update to authenticated
  using (public.is_system_manager() or (public.is_media_user() and public.media_can_create_centers()));

create policy centers_delete_admin on centers for delete to authenticated
  using (public.is_system_manager());

-- ---------------------------------------------------------------------------
-- system_config
-- ---------------------------------------------------------------------------
create policy config_select_authenticated on system_config
  for select to authenticated using (true);
create policy config_write_admin on system_config for all to authenticated
  using (public.is_system_manager()) with check (public.is_system_manager());

-- ---------------------------------------------------------------------------
-- profiles — a user can read own row; privileged roles manage others
-- ---------------------------------------------------------------------------
create policy profiles_select_self on profiles
  for select to authenticated using (id = auth.uid() or public.is_system_manager()
    or public.is_general_principal() or public.is_media_user());
create policy profiles_update_self_limited on profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and system_role = (select system_role from profiles where id = auth.uid())
              and center_id = (select center_id from profiles where id = auth.uid()));
create policy profiles_manage_admin on profiles for all to authenticated
  using (public.is_system_manager()) with check (public.is_system_manager());

-- ---------------------------------------------------------------------------
-- vat_sessions / school_classes / subjects / responsibilities
-- ---------------------------------------------------------------------------
create policy sessions_read on vat_sessions for select to authenticated using (true);
create policy sessions_manage on vat_sessions for all to authenticated
  using (public.is_system_manager() or public.is_media_user())
  with check (public.is_system_manager() or public.is_media_user());
create policy classes_read on school_classes for select to authenticated using (true);
create policy subjects_read on subjects for select to authenticated using (true);
create policy responsibilities_read on responsibilities for select to authenticated using (true);

-- ---------------------------------------------------------------------------
-- workers — visible within center to that center's staff; managed by media
-- ---------------------------------------------------------------------------
create policy workers_select on workers for select to authenticated using (
  public.is_system_manager() or public.is_general_principal() or public.is_media_user()
  or center_id = public.current_center_id()
);
create policy workers_insert_media on workers for insert to authenticated
  with check (public.is_system_manager() or public.is_media_user());
create policy workers_update_media on workers for update to authenticated
  using (public.is_system_manager() or public.is_media_user());

-- ---------------------------------------------------------------------------
-- worker_assignments
-- ---------------------------------------------------------------------------
create policy assignments_select on worker_assignments for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or worker_id = public.current_worker_id()
);
create policy assignments_manage on worker_assignments for all to authenticated
  using (public.is_system_manager() or public.is_media_user())
  with check (public.is_system_manager() or public.is_media_user());

-- ---------------------------------------------------------------------------
-- students — media + system manager see all; other roles only own center
-- ---------------------------------------------------------------------------
create policy students_select on students for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or center_id = public.current_center_id()
);
create policy students_insert_media on students for insert to authenticated
  with check ((public.is_media_user() or public.is_system_manager()) and center_id = public.current_center_id());
create policy students_update_media on students for update to authenticated
  using (public.is_system_manager() or (public.is_media_user() and center_id = public.current_center_id()));
create policy students_delete_media on students for delete to authenticated
  using (public.is_system_manager());

-- ---------------------------------------------------------------------------
-- student_registrations — same visibility model as students
-- ---------------------------------------------------------------------------
create policy registrations_select on student_registrations for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or center_id = public.current_center_id()
);
create policy registrations_insert_media on student_registrations for insert to authenticated
  with check ((public.is_media_user() or public.is_system_manager()) and center_id = public.current_center_id());
create policy registrations_update_media on student_registrations for update to authenticated
  using (public.is_system_manager() or (public.is_media_user() and center_id = public.current_center_id()));

-- ---------------------------------------------------------------------------
-- attendance — form teacher of the class writes; center-scoped reads
-- ---------------------------------------------------------------------------
create policy attendance_select on attendance for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or exists (select 1 from student_registrations r where r.id = registration_id
             and r.center_id = public.current_center_id())
);
create policy attendance_write_formteacher on attendance for insert to authenticated
  with check (public.is_form_teacher_of(
        (select school_class_id from student_registrations where id = registration_id))
        or public.is_media_user() or public.is_system_manager());
create policy attendance_update_formteacher on attendance for update to authenticated
  using (public.is_media_user() or public.is_system_manager() or public.is_form_teacher_of(
        (select school_class_id from student_registrations where id = registration_id)));

create policy submissions_select on attendance_submissions for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or center_id = public.current_center_id()
);
create policy submissions_write on attendance_submissions for insert to authenticated
  with check (public.is_form_teacher_of(class_id) or public.is_media_user() or public.is_system_manager());
create policy submissions_update on attendance_submissions for update to authenticated
  using (public.is_form_teacher_of(class_id) or public.is_media_user() or public.is_system_manager());

create policy warnings_select on attendance_warnings for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or center_id = public.current_center_id()
);

-- ---------------------------------------------------------------------------
-- GDC
-- ---------------------------------------------------------------------------
create policy gdc_groups_select on gdc_groups for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or center_id = public.current_center_id() or public.is_gdc_teacher_of(id)
);
create policy gdc_groups_manage on gdc_groups for all to authenticated
  using (public.is_system_manager() or public.is_media_user())
  with check (public.is_system_manager() or public.is_media_user());

create policy gdc_members_select on gdc_members for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or public.is_gdc_teacher_of(group_id)
  or exists (select 1 from gdc_groups g where g.id = group_id and g.center_id = public.current_center_id())
);
create policy gdc_members_manage on gdc_members for all to authenticated
  using (public.is_system_manager() or public.is_media_user())
  with check (public.is_system_manager() or public.is_media_user());

create policy gdc_attendance_select on gdc_attendance for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or public.is_gdc_teacher_of(group_id)
  or exists (select 1 from gdc_groups g where g.id = group_id and g.center_id = public.current_center_id())
);
create policy gdc_attendance_write on gdc_attendance for insert to authenticated
  with check (public.is_gdc_teacher_of(group_id) or public.is_media_user() or public.is_system_manager());
create policy gdc_attendance_update on gdc_attendance for update to authenticated
  using (public.is_gdc_teacher_of(group_id) or public.is_media_user() or public.is_system_manager());

-- ---------------------------------------------------------------------------
-- PDR — groups/members visible to own center; records only to assigned
-- PDR parent; NOTES strictly confidential
-- ---------------------------------------------------------------------------
create policy pdr_groups_select on pdr_groups for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or center_id = public.current_center_id()
);
create policy pdr_groups_manage on pdr_groups for all to authenticated
  using (public.is_system_manager() or public.is_media_user())
  with check (public.is_system_manager() or public.is_media_user());

create policy pdr_members_select on pdr_members for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or public.is_pdr_parent_of(id)
  or exists (select 1 from pdr_groups g where g.id = group_id and g.center_id = public.current_center_id())
);
create policy pdr_members_manage on pdr_members for all to authenticated
  using (public.is_system_manager() or public.is_media_user())
  with check (public.is_system_manager() or public.is_media_user());

create policy pdr_records_select on pdr_records for select to authenticated using (
  public.is_pdr_parent_of(member_id) or public.is_media_user() or public.is_system_manager()
);
create policy pdr_records_write on pdr_records for insert to authenticated
  with check (public.is_pdr_parent_of(member_id));
create policy pdr_records_update on pdr_records for update to authenticated
  using (public.is_pdr_parent_of(member_id) or public.is_media_user() or public.is_system_manager());

-- CONFIDENTIAL: only the assigned PDR parent reads or writes notes.
-- Media accesses ONLY the final conclusion via the security-definer RPC
-- get_pdr_conclusion_for_result (migration 0003).
create policy pdr_notes_parent on pdr_notes for all to authenticated
  using (public.is_pdr_parent_of(member_id))
  with check (public.is_pdr_parent_of(member_id));

-- ---------------------------------------------------------------------------
-- foster parents / foster students
-- ---------------------------------------------------------------------------
create policy foster_parents_select on foster_parents for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or center_id = public.current_center_id() or id = public.current_foster_parent_id()
);
create policy foster_parents_insert on foster_parents for insert to authenticated
  with check (public.is_system_manager() or public.is_media_user());
create policy foster_parents_update on foster_parents for update to authenticated
  using (public.is_system_manager() or public.is_media_user());

create policy foster_students_select on foster_students for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or foster_parent_id = public.current_foster_parent_id()
  or exists (select 1 from foster_parents f where f.id = foster_parent_id
             and f.center_id = public.current_center_id())
);
create policy foster_students_write on foster_students for insert to authenticated
  with check (foster_parent_id = public.current_foster_parent_id()
              or public.is_media_user() or public.is_system_manager());
create policy foster_students_update on foster_students for update to authenticated
  using (foster_parent_id = public.current_foster_parent_id()
         or public.is_media_user() or public.is_system_manager());

-- ---------------------------------------------------------------------------
-- scores / history / approvals
-- ---------------------------------------------------------------------------
create policy scores_select on scores for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or exists (select 1 from student_registrations r where r.student_id = scores.student_id
             and r.session_id = scores.session_id and r.center_id = public.current_center_id())
  or exists (select 1 from worker_assignments wa join vat_sessions s on s.id = wa.session_id and s.status='active'
             where wa.worker_id = public.current_worker_id() and wa.subject_id = scores.subject_id and wa.is_active)
);
create policy scores_insert_teacher on scores for insert to authenticated
  with check (
    (marks <= (select case component when 'first_ca' then 20 when 'second_ca' then 20 else 60 end
                from (values (component)) v(component)))
    and (public.is_media_user() or public.is_system_manager()
         or public.is_subject_teacher_of(subject_id,
              (select school_class_id from student_registrations r
               where r.student_id = scores.student_id and r.session_id = scores.session_id)))
  );
create policy scores_update on scores for update to authenticated
  using (public.is_media_user() or public.is_system_manager() or public.is_subject_teacher_of(
        subject_id, (select school_class_id from student_registrations r
                     where r.student_id = scores.student_id and r.session_id = scores.session_id)));

create policy score_history_select on score_history for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
);

create policy approvals_select on result_approvals for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
  or exists (select 1 from student_registrations r where r.student_id = result_approvals.student_id
             and r.session_id = result_approvals.session_id and r.center_id = public.current_center_id())
);
create policy approvals_manage on result_approvals for all to authenticated
  using (public.is_media_user() or public.is_system_manager())
  with check (public.is_media_user() or public.is_system_manager());

create policy result_log_select on result_generation_log for select to authenticated using (
  public.is_system_manager() or public.is_media_user() or public.is_general_principal()
);
create policy result_log_insert on result_generation_log for insert to authenticated
  with check (public.is_media_user() or public.is_system_manager());

-- ---------------------------------------------------------------------------
-- memory verses
-- ---------------------------------------------------------------------------
create policy verses_select on memory_verses for select to authenticated using (true);
create policy verses_manage on memory_verses for all to authenticated
  using (public.is_system_manager() or public.is_media_user())
  with check (public.is_system_manager() or public.is_media_user());

create policy recitations_select on memory_verse_recitations for select to authenticated using (
  public.is_system_manager() or public.is_media_user()
  or exists (select 1 from memory_verses v
             join worker_assignments wa on wa.school_class_id = v.class_id
             where v.id = verse_id and wa.worker_id = public.current_worker_id() and wa.is_active)
);
create policy recitations_write on memory_verse_recitations for insert to authenticated
  with check (public.is_media_user() or public.is_system_manager()
              or exists (select 1 from memory_verses v
                         join worker_assignments wa on wa.school_class_id = v.class_id
                         where v.id = verse_id and wa.worker_id = public.current_worker_id() and wa.is_active));
create policy recitations_update on memory_verse_recitations for update to authenticated
  using (recorded_by = auth.uid() or public.is_media_user() or public.is_system_manager());

-- ---------------------------------------------------------------------------
-- notifications
-- ---------------------------------------------------------------------------
create policy notifications_select on notifications for select to authenticated using (
  exists (select 1 from notification_recipients nr
          where nr.notification_id = notifications.id and nr.profile_id = auth.uid())
  or public.is_media_user() or public.is_system_manager()
);
create policy notifications_insert on notifications for insert to authenticated
  with check (public.is_media_user() or public.is_system_manager());

create policy notification_recipients_select on notification_recipients for select to authenticated
  using (profile_id = auth.uid() or public.is_media_user() or public.is_system_manager());
create policy notification_recipients_write on notification_recipients for all to authenticated
  using (public.is_media_user() or public.is_system_manager())
  with check (public.is_media_user() or public.is_system_manager());

-- recipients can mark their own as read
create policy notification_recipients_mark_read on notification_recipients for update to authenticated
  using (profile_id = auth.uid()) with check (profile_id = auth.uid());

-- ---------------------------------------------------------------------------
-- audit logs — write allowed for authenticated (via server actions), read
-- restricted to system manager
-- ---------------------------------------------------------------------------
create policy audit_insert on admin_audit_logs for insert to authenticated with check (true);
create policy audit_select_admin on admin_audit_logs for select to authenticated
  using (public.is_system_manager());

create policy center_audit_select on center_updates_audit for select to authenticated
  using (public.is_system_manager() or public.is_media_user());
create policy role_audit_select on role_changes_audit for select to authenticated
  using (public.is_system_manager());
