-- ============================================================================
-- VAT MANAGEMENT SYSTEM — MIGRATION 0004: SEED DATA (SAFE / IDEMPOTENT)
-- Seeds the official centers, classes, subjects, responsibilities,
-- the first VAT session and default system configuration.
-- ============================================================================

-- Official centers, exact names, initial display order.
-- NOTE: Kaduna Headquarters is marked as headquarters but NOT automatically
-- as Center One — that designation is configurable by the System Manager.
insert into centers (name, code, location, display_order, is_headquarters, is_center_one, is_active)
values
  ('Kaduna Headquarters', 'KAD-HQ', 'Kaduna', 1, true,  false, true),
  ('Nnewi',               'NNE',    'Anambra', 2, false, false, true),
  ('Aguata',              'AGU',    'Anambra', 3, false, false, true),
  ('Onitsha',             'ONI',    'Anambra', 4, false, false, true),
  ('Nudes',               'NUD',    '',        5, false, false, true),
  ('Zaria',               'ZAR',    'Kaduna',  6, false, false, true),
  ('Manchok',             'MAN',    'Kaduna',  7, false, false, true)
on conflict (name) do nothing;

insert into school_classes (name, level_order)
values ('JS1',1),('JS2',2),('JS3',3),('SS1',4),('SS2',5),('SS3',6)
on conflict (name) do nothing;

insert into subjects (name, is_language)
values ('English', false), ('Mathematics', false), ('Language', true)
on conflict (name) do nothing;

insert into responsibilities (name)
values ('Subject Teacher'),('Form Teacher'),('PDR Parent'),('GDC Teacher'),('Media Person')
on conflict (name) do nothing;

insert into vat_sessions (year, theme, activation_date, status)
values (2026, null, '2026-08-01', 'upcoming')
on conflict (year) do nothing;

-- Default system configuration (all adjustable by the System Manager)
insert into system_config (key, value) values
  ('current_session_year', '2026'::jsonb),
  ('registration_number_format', '"VAT/{year}/{pdr}/{gdc}/{serial}"'::jsonb),
  ('media_can_create_centers', '{"enabled": true}'::jsonb),
  ('grading_scale', '{"pending_official_scheme": true, "note": "Awaiting official VAT grading rules. No invented grade bands are applied until supplied."}'::jsonb),
  ('attendance_deadline_wat', '"12:00"'::jsonb),
  ('result_components', '{"first_ca_max": 20, "second_ca_max": 20, "exam_max": 60, "total_max": 100}'::jsonb)
on conflict (key) do nothing;
