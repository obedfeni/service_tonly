/** Normalize a Supabase project URL pasted from Settings or the REST endpoint. */
export function getSupabaseProjectUrl(value = process.env.NEXT_PUBLIC_SUPABASE_URL): string {
  if (!value?.trim()) throw new Error("NEXT_PUBLIC_SUPABASE_URL is not configured.");
  const raw = value.trim().replace(/\/+$/, "").replace(/\/rest\/v1$/i, "");
  let parsed: URL;
  try { parsed = new URL(raw); }
  catch { throw new Error("NEXT_PUBLIC_SUPABASE_URL must be a valid Supabase project URL."); }
  if (parsed.protocol !== "https:" && parsed.hostname !== "localhost" && parsed.hostname !== "127.0.0.1") {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must use HTTPS outside local development.");
  }
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("NEXT_PUBLIC_SUPABASE_URL must not contain credentials, query parameters or a fragment.");
  }
  const path = parsed.pathname.replace(/\/+$/, "");
  if (path) throw new Error("Use the Supabase project base URL, not a nested API path.");
  return parsed.origin;
}
