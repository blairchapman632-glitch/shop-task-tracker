// Other training (QSPP Stage 3): courses, in-house sessions and drills beyond S2/S3 hours and policy reads — they do NOT
// count towards S2/S3 hours (separate from training_records). Tables: training_topics (manager-editable list),
// other_training (one row per course / session / drill), other_training_attendees.
// Used by /qspp → Training overview (manager mode), Admin → Staff → Training, and /training (staff add their own).
// Attachments: private training-certificates bucket via /api/other-training (dashboard login) or
// /api/other-training/kiosk (the person's PIN) — server side in lib/otherTrainingServer.js.
import { adminFetch } from "./adminFetch";
import { putFile, openSignedUrl, CERT_BUCKET } from "./staffFiles";

export const KINDS = [
  { key: "course", label: "Course" },
  { key: "inhouse", label: "In-house session" },
  { key: "drill", label: "Drill" },
];
export const kindLabel = (k) => KINDS.find((x) => x.key === k)?.label || k || "";
export const OTHER_TOPIC = "Other";

export async function loadTopics(supabase, pharmacyId, { includeInactive = false } = {}) {
  let q = supabase.from("training_topics").select("*").eq("pharmacy_id", pharmacyId);
  if (!includeInactive) q = q.eq("active", true);
  const { data, error } = await q.order("sort_order").order("name");
  if (error) throw error;
  return data || [];
}

// -> records newest first, each with attendee_ids: [staff ids]. staffId: only records that person attended.
export async function loadOtherTraining(supabase, pharmacyId, { staffId = null } = {}) {
  let ids = null;
  if (staffId) {
    const { data, error } = await supabase.from("other_training_attendees").select("training_id").eq("staff_id", Number(staffId));
    if (error) throw error;
    ids = (data || []).map((a) => a.training_id);
    if (!ids.length) return [];
  }
  let q = supabase.from("other_training").select("*, other_training_attendees(staff_id)").eq("pharmacy_id", pharmacyId);
  if (ids) q = q.in("id", ids);
  const { data, error } = await q.order("training_date", { ascending: false }).order("created_at", { ascending: false });
  if (error) throw error;
  return (data || []).map(({ other_training_attendees: att, ...r }) => ({ ...r, attendee_ids: (att || []).map((a) => Number(a.staff_id)) }));
}

// Insert or update a record and set its attendees. values: { topic_id, topic, kind, training_date, provider,
// duration_hours, outcome, attendee_ids }. -> the saved row (with attendee_ids)
export async function saveOtherTraining(supabase, pharmacyId, { id = null, values, staffId = null }) {
  const row = {
    topic_id: values.topic_id || null,
    topic: String(values.topic || "").trim(),
    kind: values.kind,
    training_date: values.training_date,
    provider: String(values.provider || "").trim() || null,
    duration_hours: values.duration_hours === "" || values.duration_hours == null ? null : Number(values.duration_hours),
    outcome: String(values.outcome || "").trim() || null,
    updated_at: new Date().toISOString(),
  };
  let saved;
  if (id) {
    const { data, error } = await supabase.from("other_training").update(row).eq("id", id).select("*").single();
    if (error) throw error;
    saved = data;
    const { error: dErr } = await supabase.from("other_training_attendees").delete().eq("training_id", id);
    if (dErr) throw dErr;
  } else {
    const { data, error } = await supabase.from("other_training")
      .insert([{ ...row, pharmacy_id: pharmacyId, created_by_staff_id: staffId ? Number(staffId) : null }]).select("*").single();
    if (error) throw error;
    saved = data;
  }
  const attendees = [...new Set((values.attendee_ids || []).map(Number))];
  if (attendees.length) {
    const { error: aErr } = await supabase.from("other_training_attendees")
      .insert(attendees.map((sid) => ({ training_id: saved.id, staff_id: sid, pharmacy_id: pharmacyId })));
    if (aErr) throw aErr;
  }
  return { ...saved, attendee_ids: attendees };
}

// ── Attachments ── kiosk = { staffId, pin } on /training; omit for /qspp manager mode and Admin (dashboard login)
async function call(url, { method = "GET", body, kiosk = false } = {}) {
  const opts = body ? { method, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) } : { method };
  const res = await (kiosk ? fetch(url, opts) : adminFetch(url, opts));
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Something went wrong (${res.status})`);
  return out;
}
const extOf = (file) => (String(file?.name || "").split(".").pop() || "").toLowerCase();

export async function attachOtherTrainingFile(record, file, kiosk = null) {
  const ext = extOf(file);
  if (kiosk) {
    const base = { staff_id: kiosk.staffId, pin: kiosk.pin, id: record.id };
    const t = await call("/api/other-training/kiosk", { method: "POST", kiosk: true, body: { ...base, action: "upload-url", ext } });
    await putFile(CERT_BUCKET, t.path, t.token, file);
    return (await call("/api/other-training/kiosk", { method: "POST", kiosk: true, body: { ...base, action: "attach", path: t.path, filename: file.name } })).record;
  }
  const t = await call("/api/other-training", { method: "POST", body: { action: "upload-url", id: record.id, ext } });
  await putFile(CERT_BUCKET, t.path, t.token, file);
  return (await call("/api/other-training", { method: "POST", body: { action: "attach", id: record.id, path: t.path, filename: file.name } })).record;
}

export const openOtherTrainingFile = (record, kiosk = null) => openSignedUrl(async () => (kiosk
  ? await call("/api/other-training/kiosk", { method: "POST", kiosk: true, body: { action: "url", staff_id: kiosk.staffId, pin: kiosk.pin, id: record.id } })
  : await call(`/api/other-training?id=${encodeURIComponent(record.id)}`)).url);

export const removeOtherTrainingFile = async (record) =>
  (await call("/api/other-training", { method: "POST", body: { action: "remove-file", id: record.id } })).record;

export const deleteOtherTraining = (record) => call(`/api/other-training?id=${encodeURIComponent(record.id)}`, { method: "DELETE" });
