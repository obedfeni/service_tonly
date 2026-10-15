import { createBrowserClient } from "@supabase/ssr";
import { getSupabaseProjectUrl } from "@/lib/supabase/url";

export function createSupabaseBrowserClient() {
  const url = getSupabaseProjectUrl();
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!anonKey) throw new Error("Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_ANON_KEY.");
  return createBrowserClient(url, anonKey);
}
