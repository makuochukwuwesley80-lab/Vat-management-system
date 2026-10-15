-- ============================================================================
-- VAT MANAGEMENT SYSTEM — MIGRATION 0001: CORE SCHEMA
-- Run order: 0001 → 0002 → 0003 → 0004
-- Verify after each file using the checks at the bottom of the file.
-- ============================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------------
-- Helper: current VAT session is resolved from system_config
-- ---------------------------------------------------------------------------
create table if not exists system_config (
  key            text primary key,
  value          jsonb not null,
  updated_at     timestamptz not null default now(),
  updated_by     uuid references auth.users(id) on delete set null
);

-- Centers ---------------------------------------------------------------
create table if not exists centers (
  id                  uuid primary key default gen_random_uuid(),
  name                text not null,
  code                text not null unique,
  location            text,
  display_order       int not null default 100,
  is_headquarters     boolean not null default false,
  is_center_one       boolean not null default false,
  is_active           boolean not null default true,
  language_subject    text not null default 'Language', -- configured per center: Igbo / Yoruba / Hausa ...
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint centers_name_unique unique (name)
);

create table if not exists center_updates_audit (
  id           bigint generated always as identity primary key,
  center_id    uuid not null references centers(id) on delete cascade,
  changed_by   uuid references auth.users(id) on delete set null,
  change       jsonb not null,
  changed_at   timestamptz not null default now()
);

-- Profiles: one auth user -> one profile with a system-wide role ---------
create table if not exists profiles (
  id                uuid primary key references auth.users(id) on delete cascade,
  full_name         text not null,
  phone             text,
  system_role       text not null default 'worker'
                    check (system_role in ('system_manager','general_principal','center_principal','media','worker','foster_parent')),
  center_id         uuid references centers(id) on delete set null,
  is_active         boolean not null default true,
  is_bootstrap_admin boolean not null default false,
  created_at        timestamptz not null default now(),
  updated_at        timestamptz not null default now()
);

create table if not exists role_changes_audit (
  id          bigint generated always as identity primary key,
  profile_id  uuid not null references profiles(id) on delete cascade,
  changed_by  uuid references auth.users(id) on delete set null,
  old_role    text,
  new_role    text,
  changed_at  timestamptz not null default now()
);

-- VAT sessions ------------------------------------------------------------
create table if not exists vat_sessions (
  id                  uuid primary key default gen_random_uuid(),
  year                int not null unique,
  theme               text,
  activation_date     date,
  status              text not null default 'upcoming'
                      check (status in ('upcoming','active','closed')),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

-- School classes (global list; JS1..SS3) ---------------------------------
create table if not exists school_classes (
  id           uuid primary key default gen_random_uuid(),
  name         text not null unique,
  level_order  int not null unique check (level_order between 1 and 6)
);

-- Subjects ---------------------------------------------------------------
create table if not exists subjects (
  id       uuid primary key default gen_random_uuid(),
  name     text not null,
  is_language boolean not null default false,
  constraint subjects_name_unique unique (name)
);

-- Workers (directory entry created by media; auth linked later) ----------
create table if not exists workers (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text not null,
  center_id    uuid not null references centers(id) on delete cascade,
  profile_id   uuid references profiles(id) on delete set null,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists workers_center_idx on workers(center_id);
create index if not exists workers_phone_idx on workers(phone);

-- Responsibilities (catalog) --------------------------------------------
create table if not exists responsibilities (
  id       uuid primary key default gen_random_uuid(),
  name     text not null unique  -- 'Subject Teacher','Form Teacher','PDR Parent','GDC Teacher','Media Person'
);

-- Worker assignment history (event log; reassignment preserves history) --
create table if not exists worker_assignments (
  id                  uuid primary key default gen_random_uuid(),
  worker_id           uuid not null references workers(id) on delete cascade,
  responsibility_id   uuid not null references responsibilities(id) on delete cascade,
  session_id          uuid not null references vat_sessions(id) on delete cascade,
  school_class_id     uuid references school_classes(id) on delete set null,  -- form teacher
  subject_id          uuid references subjects(id) on delete set null,        -- subject teacher
  gdc_group_id        uuid,                                                   -- gdc teacher (fk added later)
  pdr_group_id        uuid,                                                   -- pdr parent (fk added later)
  is_active           boolean not null default true,
  assigned_at         timestamptz not null default now(),
  unassigned_at       timestamptz,
  assigned_by         uuid references auth.users(id) on delete set null
);
create index if not exists worker_assignments_worker_idx on worker_assignments(worker_id);
create unique index if not exists worker_assignments_unique_ctx
  on worker_assignments(worker_id, responsibility_id, session_id,
    coalesce(school_class_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(subject_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(gdc_group_id, '00000000-0000-0000-0000-000000000000'::uuid),
    coalesce(pdr_group_id, '00000000-0000-0000-0000-000000000000'::uuid))
  where is_active;

-- Students (permanent identity) -------------------------------------------
create table if not exists students (
  id              uuid primary key default gen_random_uuid(),
  full_name       text not null,
  gender          text check (gender in ('male','female')),
  date_of_birth   date,
  parent_name     text,
  parent_phone    text,
  location        text,
  school          text,
  is_born_again   boolean,
  center_id       uuid not null references centers(id) on delete cascade,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);
create index if not exists students_center_idx on students(center_id);
create index if not exists students_name_idx on students using gin (to_tsvector('simple', full_name));

-- Student session registrations (year-specific record) -------------------
create table if not exists student_registrations (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references students(id) on delete cascade,
  session_id          uuid not null references vat_sessions(id) on delete cascade,
  center_id           uuid not null references centers(id) on delete cascade,
  school_class_id     uuid not null references school_classes(id),
  registration_number text,
  is_alumni           boolean not null default false,
  spiritual_submitted boolean not null default false,
  vocational_submitted boolean not null default false,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint student_registrations_unique unique (student_id, session_id)
);
create index if not exists student_registrations_session_idx on student_registrations(session_id, center_id);
create index if not exists student_registrations_class_idx on student_registrations(session_id, school_class_id);

-- Attendance --------------------------------------------------------------
create table if not exists attendance (
  id                  uuid primary key default gen_random_uuid(),
  student_id          uuid not null references students(id) on delete cascade,
  registration_id     uuid not null references student_registrations(id) on delete cascade,
  session_id          uuid not null references vat_sessions(id) on delete cascade,
  attendance_date    date not null,
  status              text not null check (status in ('present','absent')),
  recorded_by         uuid references auth.users(id) on delete set null,
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint attendance_unique unique (student_id, attendance_date, session_id)
);
create index if not exists attendance_date_idx on attendance(session_id, attendance_date);

create table if not exists attendance_submissions (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references school_classes(id) on delete cascade,
  center_id     uuid not null references centers(id) on delete cascade,
  session_id    uuid not null references vat_sessions(id) on delete cascade,
  attendance_date date not null,
  submitted_by  uuid references auth.users(id) on delete set null,
  submitted_at  timestamptz not null default now(),
  is_corrected  boolean not null default false,
  constraint attendance_submissions_unique unique (class_id, attendance_date, session_id)
);

create table if not exists attendance_warnings (
  id            uuid primary key default gen_random_uuid(),
  class_id      uuid not null references school_classes(id) on delete cascade,
  center_id     uuid not null references centers(id) on delete cascade,
  session_id    uuid not null references vat_sessions(id) on delete cascade,
  attendance_date date not null,
  resolved      boolean not null default false,
  created_at    timestamptz not null default now(),
  constraint attendance_warnings_unique unique (class_id, attendance_date, session_id)
);

-- GDC groups --------------------------------------------------------------
create table if not exists gdc_groups (
  id         uuid primary key default gen_random_uuid(),
  name       text not null,
  center_id  uuid not null references centers(id) on delete cascade,
  session_id uuid not null references vat_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint gdc_groups_unique unique (name, center_id, session_id)
);

create table if not exists gdc_members (
  id            uuid primary key default gen_random_uuid(),
  group_id      uuid not null references gdc_groups(id) on delete cascade,
  student_id    uuid not null references students(id) on delete cascade,
  session_id    uuid not null references vat_sessions(id) on delete cascade,
  constraint gdc_members_unique unique (student_id, session_id)
);

create table if not exists gdc_attendance (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references gdc_groups(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  session_id  uuid not null references vat_sessions(id) on delete cascade,
  session_date date not null,
  present     boolean not null default false,
  recorded_by uuid references auth.users(id) on delete set null,
  constraint gdc_attendance_unique unique (student_id, session_date, session_id)
);

-- PDR groups & records -----------------------------------------------------
create table if not exists pdr_groups (
  id         uuid primary key default gen_random_uuid(),
  identifier text not null,          -- male: 'A','B'... female: 'AA','AB'...
  gender     text not null check (gender in ('male','female')),
  center_id  uuid not null references centers(id) on delete cascade,
  session_id uuid not null references vat_sessions(id) on delete cascade,
  created_at timestamptz not null default now(),
  constraint pdr_groups_unique unique (identifier, gender, center_id, session_id)
);

create table if not exists pdr_members (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references pdr_groups(id) on delete cascade,
  student_id  uuid not null references students(id) on delete cascade,
  session_id  uuid not null references vat_sessions(id) on delete cascade,
  constraint pdr_members_unique unique (student_id, session_id)
);

-- Per-student, per-session PDR summary fields (non-confidential) -----------
create table if not exists pdr_records (
  id             uuid primary key default gen_random_uuid(),
  member_id      uuid not null references pdr_members(id) on delete cascade,
  water_baptized boolean not null default false,
  prefectship_flag boolean not null default false,   -- recommendation only (SS2)
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint pdr_records_unique unique (member_id)
);

-- CONFIDENTIAL PDR notes — separate table, separate strict RLS -------------
create table if not exists pdr_notes (
  id          uuid primary key default gen_random_uuid(),
  member_id   uuid not null references pdr_members(id) on delete cascade,
  problems    text,
  conclusion  text,
  updated_at  timestamptz not null default now(),
  constraint pdr_notes_unique unique (member_id)
);

-- Foster homes -------------------------------------------------------------
create table if not exists foster_parents (
  id           uuid primary key default gen_random_uuid(),
  full_name    text not null,
  phone        text not null,
  center_id    uuid not null references centers(id) on delete cascade,
  profile_id   uuid references profiles(id) on delete set null,
  home_name    text,
  is_active    boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);
create index if not exists foster_parents_center_idx on foster_parents(center_id);

create table if not exists foster_students (
  id                uuid primary key default gen_random_uuid(),
  foster_parent_id  uuid not null references foster_parents(id) on delete cascade,
  student_id        uuid not null references students(id) on delete cascade,
  session_id        uuid not null references vat_sessions(id) on delete cascade,
  return_date       date,
  created_at        timestamptz not null default now(),
  constraint foster_students_unique unique (foster_parent_id, student_id, session_id)
);

-- Scores -------------------------------------------------------------------
create table if not exists scores (
  id             uuid primary key default gen_random_uuid(),
  student_id     uuid not null references students(id) on delete cascade,
  subject_id     uuid not null references subjects(id) on delete cascade,
  session_id     uuid not null references vat_sessions(id) on delete cascade,
  component      text not null check (component in ('first_ca','second_ca','exam')),
  marks          numeric(5,2) not null check (marks >= 0),
  entered_by     uuid references auth.users(id) on delete set null,
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  constraint scores_unique unique (student_id, subject_id, session_id, component)
);
create index if not exists scores_session_idx on scores(session_id, subject_id);

create table if not exists score_history (
  id          bigint generated always as identity primary key,
  score_id    uuid not null references scores(id) on delete cascade,
  old_marks   numeric(5,2),
  new_marks   numeric(5,2),
  changed_by  uuid references auth.users(id) on delete set null,
  changed_at  timestamptz not null default now()
);

-- Result approval ----------------------------------------------------------
create table if not exists result_approvals (
  id            uuid primary key default gen_random_uuid(),
  student_id    uuid not null references students(id) on delete cascade,
  session_id    uuid not null references vat_sessions(id) on delete cascade,
  approved      boolean not null default false,
  approved_by   uuid references auth.users(id) on delete set null,
  approved_at   timestamptz,
  constraint result_approvals_unique unique (student_id, session_id)
);

create table if not exists result_generation_log (
  id          bigint generated always as identity primary key,
  student_id  uuid not null references students(id) on delete cascade,
  session_id  uuid not null references vat_sessions(id) on delete cascade,
  generated_by uuid references auth.users(id) on delete set null,
  generated_at timestamptz not null default now()
);

-- Memory verses ------------------------------------------------------------
create table if not exists memory_verses (
  id          uuid primary key default gen_random_uuid(),
  session_id  uuid not null references vat_sessions(id) on delete cascade,
  class_id    uuid not null references school_classes(id) on delete cascade,
  reference   text not null,
  verse_text  text not null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  constraint memory_verses_unique unique (session_id, class_id)
);

create table if not exists memory_verse_recitations (
  id             uuid primary key default gen_random_uuid(),
  verse_id       uuid not null references memory_verses(id) on delete cascade,
  student_id     uuid not null references students(id) on delete cascade,
  recited        boolean not null default false,
  recorded_by    uuid references auth.users(id) on delete set null,
  recorded_at    timestamptz not null default now(),
  constraint memory_verse_recitations_unique unique (verse_id, student_id)
);

-- Notifications -------------------------------------------------------------
create table if not exists notifications (
  id           uuid primary key default gen_random_uuid(),
  title        text not null,
  body         text not null,
  created_by   uuid references auth.users(id) on delete set null,
  created_at   timestamptz not null default now()
);

create table if not exists notification_recipients (
  id                uuid primary key default gen_random_uuid(),
  notification_id   uuid not null references notifications(id) on delete cascade,
  profile_id        uuid not null references profiles(id) on delete cascade,
  read_at           timestamptz,
  constraint notification_recipients_unique unique (notification_id, profile_id)
);
create index if not exists notification_recipients_profile_idx on notification_recipients(profile_id);

-- Administrative audit log ---------------------------------------------------
create table if not exists admin_audit_logs (
  id          bigint generated always as identity primary key,
  actor_id    uuid references auth.users(id) on delete set null,
  action      text not null,
  entity      text,
  entity_id   text,
  details     jsonb,
  created_at  timestamptz not null default now()
);

-- Add self-references for worker_assignments group columns --------------------
alter table worker_assignments
  add constraint worker_assignments_gdc_fk
  foreign key (gdc_group_id) references gdc_groups(id) on delete set null;
alter table worker_assignments
  add constraint worker_assignments_pdr_fk
  foreign key (pdr_group_id) references pdr_groups(id) on delete set null;

-- updated_at triggers ---------------------------------------------------------
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['centers','profiles','vat_sessions','workers','students',
                           'student_registrations','attendance','scores','memory_verses',
                           'pdr_records','pdr_notes','foster_parents'] loop
    execute format('drop trigger if exists trg_%s_updated on %I', t, t);
    execute format('create trigger trg_%s_updated before update on %I
                    for each row execute function set_updated_at()', t, t);
  end loop;
end $$;

-- Score history trigger: never silently overwrite score history ---------------
create or replace function log_score_change() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if TG_OP = 'UPDATE' and new.marks is distinct from old.marks then
    insert into score_history(score_id, old_marks, new_marks, changed_by)
    values (new.id, old.marks, new.marks, auth.uid());
  end if;
  return new;
end;
$$;

drop trigger if exists trg_score_history on scores;
create trigger trg_score_history after update on scores
for each row execute function log_score_change();
