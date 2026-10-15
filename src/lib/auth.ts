import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import type { Profile, SystemRole } from "@/lib/types";

/** Load the signed-in user's profile (or null). */
export async function getProfile(): Promise<Profile | null> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const { data } = await supabase
    .from("profiles")
    .select("*")
    .eq("id", user.id)
    .single();

  return (data as Profile) ?? null;
}

/**
 * Require an authenticated profile. When `roles` is provided, the profile's
 * system_role must be included — otherwise the user is redirected.
 * This is server-side enforcement; the database RLS policies enforce the
 * same boundaries independently.
 */
export async function requireProfile(roles?: SystemRole[]): Promise<Profile> {
  const profile = await getProfile();
  if (!profile || !profile.is_active) redirect("/login");

  if (roles && roles.length > 0 && !roles.includes(profile.system_role)) {
    redirect("/dashboard");
  }
  return profile;
}
