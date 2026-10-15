import "server-only";
import { createClient } from "@supabase/supabase-js";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { getSupabaseProjectUrl } from "@/lib/supabase/url";

export async function authorizePlanner() {
  const plannerEmail = process.env.PLANNER_EMAIL?.trim().toLowerCase();
  if (!plannerEmail) return { ok: false as const, status: 503, error: "Planner access is disabled until PLANNER_EMAIL is configured." };
  let url: string;
  try { url = getSupabaseProjectUrl(); } catch { return { ok: false as const, status: 503, error: "Supabase project URL is missing or invalid." }; }
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!anonKey || !serviceKey) return { ok: false as const, status: 503, error: "Supabase server configuration is incomplete." };
  const authClient = await createSupabaseServerClient();
  const { data: { user }, error } = await authClient.auth.getUser();
  if (error || !user) return { ok: false as const, status: 401, error: "Sign in with the authorized planner account to continue." };
  if ((user.email ?? "").toLowerCase() !== plannerEmail) return { ok: false as const, status: 403, error: "This account is not authorized to manage maintenance data." };
  return { ok: true as const, user, db: createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } }) };
}
