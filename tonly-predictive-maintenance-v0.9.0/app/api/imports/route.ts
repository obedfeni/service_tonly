import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { authorizePlanner } from "@/lib/supabase/authorize-planner";

export const runtime = "nodejs";
const MAX_ROWS = 10000;
const CHUNK_SIZE = 100;
type SourceRow = Record<string, unknown>;

function getColumn(headers: string[], regex: RegExp) { return headers.find((h) => regex.test(h)); }
function parseDate(value: unknown): Date | null {
  if (value instanceof Date && Number.isFinite(value.getTime())) return value;
  if (typeof value === "number" && value > 20000 && value < 80000) {
    const date = new Date(Date.UTC(1899, 11, 30) + value * 86400000);
    return Number.isFinite(date.getTime()) ? date : null;
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  const dmy = raw.match(/^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/);
  let date: Date;
  if (dmy) {
    const day = Number(dmy[1]), month = Number(dmy[2]), year = Number(dmy[3]);
    date = new Date(Date.UTC(year, month - 1, day));
    if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) return null;
  } else {
    const iso = raw.match(/^(\d{4})-(\d{2})-(\d{2})(?:$|T)/);
    if (iso) {
      const year = Number(iso[1]), month = Number(iso[2]), day = Number(iso[3]);
      const check = new Date(Date.UTC(year, month - 1, day));
      if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) return null;
    }
    date = new Date(raw);
  }
  return Number.isFinite(date.getTime()) ? date : null;
}
function parseOdometer(value: unknown): number | null {
  const raw = String(value ?? "").replace(/,/g, "").trim();
  if (!raw) return null;
  const number = typeof value === "number" ? value : Number(raw);
  return Number.isFinite(number) && number >= 0 ? number : null;
}

export async function GET() {
  try {
    const auth = await authorizePlanner();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    const { data, error } = await auth.db.from("import_batches").select("id,source_name,source_range,started_at,finished_at,row_count,accepted_count,flagged_count,rejected_count,status,error_summary,initiated_by").order("started_at", { ascending: false }).limit(20);
    if (error) return NextResponse.json({ error: `Could not load import history: ${error.message}` }, { status: 500 });
    return NextResponse.json({ batches: data ?? [] });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Import history request failed." }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  let batchId: string | null = null;
  let db: SupabaseClient | null = null;
  try {
    const auth = await authorizePlanner();
    if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });
    db = auth.db;
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (contentLength > 12 * 1024 * 1024) return NextResponse.json({ error: "Import request exceeds the 12 MB request limit. Split the file into smaller batches." }, { status: 413 });
    const rawBody = await request.text();
    if (Buffer.byteLength(rawBody, "utf8") > 12 * 1024 * 1024) return NextResponse.json({ error: "Import request exceeds the 12 MB request limit. Split the file into smaller batches." }, { status: 413 });
    let body: { sourceName?: string; sourceRange?: string; sourceRowOffset?: number; headers?: unknown; rows?: unknown };
    try { body = JSON.parse(rawBody) as typeof body; }
    catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }
    const sourceName = String(body.sourceName ?? "manual-upload").trim().slice(0, 180);
    const sourceRange = String(body.sourceRange ?? "").trim().slice(0, 300);
    const headers = Array.isArray(body.headers) ? body.headers.map((h) => String(h).slice(0, 180)) : [];
    const rows = Array.isArray(body.rows) ? body.rows as SourceRow[] : [];
    if (!headers.length || !rows.length) return NextResponse.json({ error: "A header row and at least one data row are required." }, { status: 400 });
    if (headers.length > 100 || rows.length > MAX_ROWS) return NextResponse.json({ error: `Import limits are 100 columns and ${MAX_ROWS.toLocaleString()} rows per batch.` }, { status: 413 });
    if (headers.some((header) => !header.trim()) || new Set(headers.map((header) => header.trim().toLowerCase())).size !== headers.length) {
      return NextResponse.json({ error: "Column headers must be non-empty and unique (case-insensitive). Rename duplicate or blank columns before importing." }, { status: 400 });
    }
    if (rows.some((row) => !row || typeof row !== "object" || Array.isArray(row))) return NextResponse.json({ error: "Every data row must be an object keyed by its source column names." }, { status: 400 });

    const idCol = getColumn(headers, /vehicle number|vehicle|truck.?id|truck|车辆编号/i);
    const dateCol = getColumn(headers, /^date$|date.?time|observed.?at|日期/i);
    const odoCol = getColumn(headers, /kilomet|odometer|公里数|里程/i);
    const timeCol = getColumn(headers, /start.?charging.?time|start time|开始充电时间/i);
    const parsed = rows.map((raw, index) => {
      const truckCode = String(idCol ? raw[idCol] ?? "" : "").trim();
      const date = dateCol ? parseDate(raw[dateCol]) : null;
      const odo = odoCol ? parseOdometer(raw[odoCol]) : null;
      const flags: string[] = [];
      if (!idCol || !truckCode) flags.push("missing_truck_id");
      if (!date) flags.push("invalid_date");
      else if (date.getTime() > Date.now() + 86400000) flags.push("future_date");
      if (odo === null) flags.push("invalid_odometer");
      if (truckCode && !/^ET\d{3}$/i.test(truckCode.replace(/\s+/g, ""))) flags.push("non_canonical_truck_id");
      const rawJson = JSON.stringify(raw) ?? "{}";
      const fingerprint = createHash("sha256").update(rawJson).digest("hex");
      return { index, raw, truckCode, date, odo, flags, fingerprint };
    });
    const latest = new Map<string, { time: number; odo: number }>();
    for (const item of [...parsed].sort((a, b) => (a.date?.getTime() ?? Infinity) - (b.date?.getTime() ?? Infinity))) {
      if (!item.truckCode || !item.date || item.odo === null) continue;
      const key = item.truckCode.toUpperCase().replace(/\s+/g, "");
      const prev = latest.get(key);
      if (prev && item.odo < prev.odo) item.flags.push("odometer_decrease");
      if (!prev || item.date.getTime() >= prev.time) latest.set(key, { time: item.date.getTime(), odo: item.odo });
    }
    const seen = new Set<string>();
    for (const item of parsed) {
      const startTime = String(timeCol ? item.raw[timeCol] ?? "" : "").trim().toLowerCase();
      const normalizedId = item.truckCode.toUpperCase().replace(/\s+/g, "");
      const key = `${normalizedId}|${item.date?.toISOString().slice(0, 10) ?? "bad-date"}|${item.odo ?? "bad-odo"}|${startTime}`;
      if (seen.has(key)) item.flags.push("duplicate_candidate");
      else seen.add(key);
      if (!idCol || !dateCol || !odoCol) item.flags.push("required_column_not_detected");
    }

    const rejectedCount = parsed.filter((r) => r.flags.includes("invalid_date") || r.flags.includes("invalid_odometer") || r.flags.includes("missing_truck_id")).length;
    const flaggedCount = parsed.filter((r) => r.flags.length > 0).length;
    const { data: batch, error: batchError } = await db.from("import_batches").insert({
      source_name: sourceName || "manual-upload", source_range: sourceRange || null, row_count: rows.length,
      accepted_count: 0, flagged_count: flaggedCount, rejected_count: rejectedCount,
      status: "saved_for_review", initiated_by: auth.user.email ?? auth.user.id,
    }).select("id").single();
    if (batchError || !batch) return NextResponse.json({ error: `Could not create import batch: ${batchError?.message ?? "No batch returned"}` }, { status: 500 });
    batchId = batch.id;

    for (let start = 0; start < parsed.length; start += CHUNK_SIZE) {
      const chunk = parsed.slice(start, start + CHUNK_SIZE).map((item) => ({
        import_batch_id: batchId,
        source_row_number: Math.max(0, Number.isInteger(body.sourceRowOffset) ? Number(body.sourceRowOffset) : 0) + item.index + 2,
        source_fingerprint: item.fingerprint,
        raw_source_row: item.raw,
        mapped_truck_code: item.truckCode || null,
        resolved_truck_id: null,
        observed_at: item.date?.toISOString() ?? null,
        odometer_km: item.odo,
        quality_status: item.flags.length === 0 ? "good" : (item.flags.includes("invalid_date") || item.flags.includes("invalid_odometer") || item.flags.includes("missing_truck_id") ? "rejected" : "review"),
        quality_flags: item.flags,
        review_status: "pending",
      }));
      const { error } = await db.from("import_rows").insert(chunk);
      if (error) throw new Error(`Batch ${batchId} was created, but row persistence failed near source row ${start + 2}: ${error.message}`);
    }
    await db.from("import_batches").update({ finished_at: new Date().toISOString(), status: "saved_for_review" }).eq("id", batchId);
    await db.from("audit_log").insert({ actor: auth.user.email ?? auth.user.id, action: "import_batch_saved_for_review", entity_type: "import_batch", entity_id: batchId, after_state: { source_name: sourceName, row_count: rows.length, flagged_count: flaggedCount, rejected_count: rejectedCount } });
    return NextResponse.json({ batchId, rowCount: rows.length, flaggedCount, rejectedCount, status: "saved_for_review", message: "Original source rows saved for review. No odometer readings were accepted into the operational history." }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Import persistence failed.";
    if (batchId && db) await db.from("import_batches").update({ finished_at: new Date().toISOString(), status: "partial_failure", error_summary: message.slice(0, 1000) }).eq("id", batchId);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
