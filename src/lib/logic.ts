/**
 * Pure business-logic functions — no I/O. These are unit-tested in
 * logic.test.ts and reused by server actions and result generation.
 */
import { SCORE_COMPONENTS, type ScoreComponent } from "@/lib/types";

/** Max marks per assessment component: First CA 20, Second CA 20, Exam 60. */
export const COMPONENT_MAX: Record<ScoreComponent, number> = Object.fromEntries(
  SCORE_COMPONENTS.map((c) => [c.key, c.max])
) as Record<ScoreComponent, number>;

/**
 * Validate a score entry against the configured maximum.
 * Returns null when valid, otherwise a human-readable error.
 */
export function validateScore(
  component: ScoreComponent,
  marks: number
): string | null {
  if (!Number.isFinite(marks)) return "Score must be a number.";
  if (marks < 0) return "Score cannot be negative.";
  const max = COMPONENT_MAX[component];
  if (marks > max) return `Score cannot exceed ${max} for ${component.replace("_", " ")}.`;
  return null;
}

/** Total of the three assessment components. */
export function totalScore(
  firstCa: number,
  secondCa: number,
  exam: number
): number {
  return Math.round((firstCa + secondCa + exam) * 100) / 100;
}

/** Attendance rate as a percentage (0–100). */
export function attendanceRate(present: number, total: number): number {
  if (total <= 0) return 0;
  return Math.round((present / total) * 1000) / 10;
}

/**
 * Next class in the VAT progression. Returns "ALUMNI" after SS3.
 * Progression: JS1 → JS2 → JS3 → SS1 → SS2 → SS3 → ALUMNI.
 */
export function nextClass(levelOrder: number): number | "ALUMNI" {
  if (levelOrder < 1 || levelOrder > 6) {
    throw new Error(`Invalid class level: ${levelOrder}`);
  }
  return levelOrder >= 6 ? "ALUMNI" : levelOrder + 1;
}

/**
 * Build a registration number from the configurable format stored in
 * system_config.registration_number_format. Placeholders: {year} {pdr}
 * {gdc} {serial}. The format itself is NOT hardcoded here beyond the
 * documented placeholder contract — the official format is supplied by the
 * authorized media/system administrator via configuration.
 */
export function buildRegistrationNumber(
  format: string,
  parts: { year: number | string; pdr?: string; gdc?: string; serial: number }
): string {
  return format
    .replace("{year}", String(parts.year))
    .replace("{pdr}", parts.pdr ?? "")
    .replace("{gdc}", parts.gdc ?? "")
    .replace("{serial}", String(parts.serial).padStart(4, "0"));
}

/**
 * PDR group identifier validation:
 * male = single letter (A, B, …), female = double letter (AA, AB, …).
 */
export function validatePdrIdentifier(
  identifier: string,
  gender: "male" | "female"
): string | null {
  if (gender === "male") {
    return /^[A-Z]$/.test(identifier)
      ? null
      : "Male PDR identifiers are a single capital letter (e.g. A, B, C).";
  }
  return /^[A-Z]{2}$/.test(identifier)
    ? null
    : "Female PDR identifiers are two capital letters (e.g. AA, AB).";
}

/** Derive the sign-in email from a phone number (credential provisioning). */
export function phoneToEmail(phone: string): string {
  const digits = phone.replace(/[^\d+]/g, "").replace(/\+/g, "");
  return `${digits}@vat.accounts`;
}

/** Generate a readable temporary password for newly provisioned accounts. */
export function generateTempPassword(): string {
  const alphabet = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";
  let out = "";
  for (let i = 0; i < 10; i++) {
    out += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return `Vt-${out}!`;
}
