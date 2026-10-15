import "server-only";
import { createClient as createSupabaseClient, SupabaseClient } from "@supabase/supabase-js";

/**
 * SERVER-ONLY client using the service-role key.
 *
 * Never import this module from a client component ("use client") or any
 * code included in the browser bundle — the "server-only" import guard
 * makes such usage fail the build. The service-role key bypasses RLS, so
 * every call through this client must re-verify the caller's permissions
 * inside the server action before performing privileged work.
 */
export function createAdminClient(): SupabaseClient {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Set it in .env.local (server-only)."
    );
  }

  return createSupabaseClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}
