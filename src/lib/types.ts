export type SystemRole =
  | "system_manager"
  | "general_principal"
  | "center_principal"
  | "media"
  | "worker"
  | "foster_parent";

export interface Profile {
  id: string;
  full_name: string;
  phone: string | null;
  system_role: SystemRole;
  center_id: string | null;
  is_active: boolean;
  is_bootstrap_admin?: boolean;
}

export interface Center {
  id: string;
  name: string;
  code: string;
  location: string | null;
  display_order: number;
  is_headquarters: boolean;
  is_center_one: boolean;
  is_active: boolean;
  language_subject: string;
}

export interface VatSession {
  id: string;
  year: number;
  theme: string | null;
  activation_date: string | null;
  status: "upcoming" | "active" | "closed";
}

export interface Student {
  id: string;
  full_name: string;
  gender: "male" | "female" | null;
  date_of_birth: string | null;
  parent_name: string | null;
  parent_phone: string | null;
  location: string | null;
  school: string | null;
  is_born_again: boolean | null;
  center_id: string;
}

export interface StudentRegistration {
  id: string;
  student_id: string;
  session_id: string;
  center_id: string;
  school_class_id: string;
  registration_number: string | null;
  is_alumni: boolean;
  spiritual_submitted: boolean;
  vocational_submitted: boolean;
  students?: Student;
  school_classes?: { id: string; name: string; level_order: number };
}

export interface SchoolClass {
  id: string;
  name: string;
  level_order: number;
}

export interface Worker {
  id: string;
  full_name: string;
  phone: string;
  center_id: string;
  profile_id: string | null;
  is_active: boolean;
}

export interface WorkerAssignment {
  id: string;
  worker_id: string;
  responsibility_id: string;
  session_id: string;
  school_class_id: string | null;
  subject_id: string | null;
  gdc_group_id: string | null;
  pdr_group_id: string | null;
  is_active: boolean;
  assigned_at: string;
  responsibilities?: { name: string } | null;
  school_classes?: { name: string } | null;
  subjects?: { name: string } | null;
  gdc_groups?: { name: string } | null;
  pdr_groups?: { identifier: string; gender: string } | null;
}

export interface FosterParent {
  id: string;
  full_name: string;
  phone: string;
  center_id: string;
  profile_id: string | null;
  home_name: string | null;
  is_active: boolean;
}

export const ROLE_LABELS: Record<SystemRole, string> = {
  system_manager: "System Manager",
  general_principal: "General Principal",
  center_principal: "Center Principal",
  media: "Media Team",
  worker: "Worker",
  foster_parent: "Foster Parent",
};

export const CLASS_ORDER = ["JS1", "JS2", "JS3", "SS1", "SS2", "SS3"] as const;

export const SCORE_COMPONENTS = [
  { key: "first_ca", label: "First CA", max: 20 },
  { key: "second_ca", label: "Second CA", max: 20 },
  { key: "exam", label: "Examination", max: 60 },
] as const;

export type ScoreComponent = (typeof SCORE_COMPONENTS)[number]["key"];
