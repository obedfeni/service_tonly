import { NextResponse } from "next/server";
import { getSupabaseProjectUrl } from "@/lib/supabase/url";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  let supabaseUrlValid = false;
  try { getSupabaseProjectUrl(); supabaseUrlValid = true; } catch { /* Report configuration status without returning secret values. */ }
  const publicKeyConfigured = Boolean(process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
  const serverKeyConfigured = Boolean(process.env.SUPABASE_SERVICE_ROLE_KEY);
  const plannerConfigured = Boolean(process.env.PLANNER_EMAIL?.trim());
  const googleConfigured = Boolean(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL && process.env.GOOGLE_PRIVATE_KEY);
  const mlServiceConfigured = Boolean(process.env.ML_API_URL?.trim() && process.env.ML_API_SECRET?.trim());
  const readyForImports = supabaseUrlValid && publicKeyConfigured && serverKeyConfigured && plannerConfigured;
  return NextResponse.json({
    application: "TONLY Predictive Maintenance Intelligence",
    version: "0.9.0",
    status: readyForImports ? "configured" : "configuration_required",
    checks: {
      supabaseProjectUrl: supabaseUrlValid,
      supabasePublicKey: publicKeyConfigured,
      serverSideDatabaseKey: serverKeyConfigured,
      plannerAllowlist: plannerConfigured,
      googleSheets: googleConfigured,
      randomForestXgboostServiceConfigured: mlServiceConfigured,
    },
    note: "This endpoint reports configuration presence only; it does not verify credentials, database connectivity or ML service reachability.",
  }, { headers: { "Cache-Control": "no-store" } });
}
