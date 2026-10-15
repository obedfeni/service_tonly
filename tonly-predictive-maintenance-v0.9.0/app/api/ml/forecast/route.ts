import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { authorizePlanner } from "@/lib/supabase/authorize-planner";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 10;
const MAX_BODY_BYTES = 2 * 1024 * 1024;
const MAX_ROWS = 10000;
const MAX_COLUMNS = 100;

function isoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return d.getUTCFullYear() === year && d.getUTCMonth() === month - 1 && d.getUTCDate() === day;
}

export async function POST(request: NextRequest) {
  const auth = await authorizePlanner();
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  const serviceUrl = process.env.ML_API_URL?.trim().replace(/\/+$/, "");
  const serviceSecret = process.env.ML_API_SECRET?.trim();
  if (!serviceUrl || !serviceSecret) {
    return NextResponse.json({ error: "The Random Forest/XGBoost service is not configured. Deploy the Python service and set ML_API_URL and ML_API_SECRET in the Vercel environment." }, { status: 503 });
  }

  try {
    const raw = await request.text();
    if (Buffer.byteLength(raw, "utf8") > MAX_BODY_BYTES) return NextResponse.json({ error: "The data request is too large. Reduce the import to fewer rows." }, { status: 413 });
    let body: Record<string, unknown>;
    try { body = JSON.parse(raw) as Record<string, unknown>; }
    catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

    const rows = body.rows;
    const headers = body.headers;
    const truckCode = String(body.truckId ?? "").trim().toUpperCase();
    const pmType = String(body.pmType ?? "").trim().toUpperCase();
    const pmMatch = /^PM(\d{1,2})$/.exec(pmType);
    const sequence = pmMatch ? Number(pmMatch[1]) : NaN;
    const thresholdKm = Number(body.thresholdKm);
    const serviceDate = String(body.serviceDate ?? "");
    const serviceOdometer = Number(body.serviceOdometer);
    const calendarIntervalDays = Number(body.calendarIntervalDays);
    const latestOdometer = Number(body.latestOdometer);
    const latestDate = String(body.latestDate ?? "");
    const sourceName = String(body.sourceName ?? "current import preview").trim().slice(0, 180);

    if (!Array.isArray(headers) || headers.length < 3 || headers.length > MAX_COLUMNS || headers.some(h => typeof h !== "string" || !h.trim())) {
      return NextResponse.json({ error: `Provide 3–${MAX_COLUMNS} non-empty column headers.` }, { status: 400 });
    }
    if (!Array.isArray(rows) || rows.length < 1 || rows.length > MAX_ROWS || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
      return NextResponse.json({ error: `Provide 1–${MAX_ROWS} source rows.` }, { status: 400 });
    }
    if (!/^ET\d{3}$/.test(truckCode) || !Number.isInteger(sequence) || sequence < 1 || sequence > 10 || thresholdKm !== 5000 + (sequence - 1) * 10000) {
      return NextResponse.json({ error: "Choose a canonical truck ID and a valid PM1–PM10 kilometre threshold." }, { status: 400 });
    }
    if (!isoDate(serviceDate) || !isoDate(latestDate) || !Number.isFinite(serviceOdometer) || serviceOdometer < 0 || !Number.isInteger(calendarIntervalDays) || calendarIntervalDays < 1 || calendarIntervalDays > 3650) {
      return NextResponse.json({ error: "Enter a valid verified service date, service odometer and approved calendar interval before running model comparison." }, { status: 400 });
    }
    if (!Number.isFinite(latestOdometer) || latestOdometer < serviceOdometer) {
      return NextResponse.json({ error: "The latest odometer and service odometer are inconsistent." }, { status: 400 });
    }
    if (serviceDate > latestDate) return NextResponse.json({ error: "The last-service date must not be later than the latest charging-log reading." }, { status: 400 });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 8_000);
    let serviceResponse: Response;
    try {
      serviceResponse = await fetch(`${serviceUrl}/forecast`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${serviceSecret}` },
        body: JSON.stringify({ rows, headers, truckId: truckCode, pmType, thresholdKm, serviceDate, serviceOdometer, calendarIntervalDays, latestOdometer, latestDate, sourceName, today: new Date().toISOString().slice(0, 10) }),
        cache: "no-store",
        signal: controller.signal,
      });
    } finally { clearTimeout(timeout); }

    const result = await serviceResponse.json().catch(() => ({})) as Record<string, unknown>;
    if (!serviceResponse.ok) {
      const detail = typeof result.detail === "string" ? result.detail : `ML service returned HTTP ${serviceResponse.status}.`;
      return NextResponse.json({ error: detail }, { status: serviceResponse.status === 401 ? 502 : serviceResponse.status >= 500 ? 502 : 422 });
    }

    // Resolve a canonical truck record so every comparison is auditable.
    let { data: truck, error: truckError } = await auth.db.from("trucks").select("id,truck_code").eq("truck_code", truckCode).maybeSingle();
    if (truckError) return NextResponse.json({ error: `ML result was calculated, but the truck record could not be checked: ${truckError.message}` }, { status: 500 });
    if (!truck) {
      const inserted = await auth.db.from("trucks").insert({ truck_code: truckCode, make: "TONLY", status: "unknown", active: true }).select("id,truck_code").single();
      if (inserted.error || !inserted.data) {
        const retry = await auth.db.from("trucks").select("id,truck_code").eq("truck_code", truckCode).maybeSingle();
        if (retry.error || !retry.data) return NextResponse.json({ error: `ML result calculated, but the truck record could not be created: ${inserted.error?.message ?? "No row returned"}` }, { status: 500 });
        truck = retry.data;
      } else truck = inserted.data;
    }

    const snapshot = {
      truckCode, pmType, thresholdKm, latestOdometer: Number(result.latestOdometer), latestDate: String(result.latestDate ?? ""), serviceDate,
      serviceOdometer, calendarIntervalDays, sourceName, rowCount: rows.length,
      headers, requestFingerprint: String(result.requestFingerprint ?? createHash("sha256").update(`${truckCode}|${pmType}|${rows.length}|${latestDate}|${latestOdometer}`).digest("hex")),
    };
    const training = (result.training ?? {}) as Record<string, unknown>;
    const runInsert = await auth.db.from("ml_model_runs").insert({
      truck_id: truck.id,
      truck_code: truckCode,
      pm_type: pmType,
      source_name: sourceName,
      model_version: String(result.modelVersion ?? "tonly-usage-ml-unknown"),
      status: String(result.status ?? "unknown"),
      training_examples: Number(training.trainingExamples ?? 0),
      validation_metrics: { training, models: result.models ?? {} },
      result,
      input_snapshot: snapshot,
      created_by: auth.user.email ?? auth.user.id,
    }).select("id,created_at").single();
    if (runInsert.error || !runInsert.data) {
      return NextResponse.json({ error: `Model comparison completed, but could not be saved to Supabase. Apply migration 20261015_005_ml_model_runs.sql and retry. Database message: ${runInsert.error?.message ?? "No row returned"}` }, { status: 500 });
    }

    return NextResponse.json({ ...result, modelRunId: runInsert.data.id, modelRunCreatedAt: runInsert.data.created_at }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    const message = error instanceof Error && error.name === "AbortError"
      ? "The ML service timed out. Ensure it is running and has enough request time, then retry."
      : error instanceof Error ? error.message : "ML comparison failed.";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
