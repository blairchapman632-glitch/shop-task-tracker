// Daily Banking — weekly summary email (Vercel cron, Mondays 7am Perth = Sun 23:00 UTC; see vercel.json).
// Covers last week (Mon–Sun): Till and customers vs the same week last year, each day's Till, over/unders past the
// limit (with reasons), days not confirmed or missing, and cash waiting to be banked.
// Sent with Resend's API (RESEND_API_KEY; from RESEND_FROM, default "Chalkboard <banking@chalkboard.au>") to
// pharmacy_settings.banking_summary_email — skipped when that's empty.
// Protected by CRON_SECRET (Authorization: Bearer …), as the other crons. Test by hand:
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://chalkboard.au/api/cron/banking-summary?preview=1"  (HTML, no send)
//   curl -H "Authorization: Bearer $CRON_SECRET" "https://chalkboard.au/api/cron/banking-summary"            (sends it)
import { createClient } from "@supabase/supabase-js";
import { round2, fmtVariance } from "../../../lib/banking";
import { addDaysStr } from "../../../lib/performanceReview";
import { loadPeriod, loadPaymentTypes, dayFigures, countsInTotals, mondayOf, perthNow, dayLabel, datesBetween, openOnWeekday, weekdayOf, bankingStartDate, unbankedQuery } from "../../../lib/bankingData";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";
const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

const money = (n) => `$${round2(n).toLocaleString("en-AU", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const esc = (s) => String(s ?? "").replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));
const pct = (now, then) => (then ? `${now >= then ? "▲" : "▼"} ${Math.abs(((now - then) / then) * 100).toFixed(1)}% vs same week last year` : "no figures for the same week last year");

export async function buildSummary() {
  const today = perthNow().date;
  const from = addDaysStr(mondayOf(today), -7);
  const to = addDaysStr(from, 6);
  const [{ data: settings }, types, cur, prev, { data: hols }, { data: waiting }] = await Promise.all([
    supabase.from("pharmacy_settings").select("*").eq("pharmacy_id", PHARMACY_ID).maybeSingle(),
    loadPaymentTypes(supabase, PHARMACY_ID),
    loadPeriod(supabase, PHARMACY_ID, from, to, { deposits: false }),
    loadPeriod(supabase, PHARMACY_ID, addDaysStr(from, -364), addDaysStr(to, -364), { deposits: false }),
    supabase.from("public_holidays").select("date, name").eq("pharmacy_id", PHARMACY_ID).gte("date", from).lte("date", to),
    bankingStartDate(supabase, PHARMACY_ID).then((start) => unbankedQuery(supabase, PHARMACY_ID, "cash_takings", start)),
  ]);
  const limit = Number(settings?.banking_variance_limit ?? 5);
  const holiday = Object.fromEntries((hols || []).map((h) => [String(h.date).slice(0, 10), h.name]));
  const byDate = Object.fromEntries(cur.days.map((d) => [d.takings_date, d]));
  const sum = (days) => days.filter(countsInTotals).map((d) => dayFigures(d, types)).filter((f) => f.hasFigures)
    .reduce((s, f) => ({ till: s.till + f.till, customers: s.customers + (f.customers || 0) }), { till: 0, customers: 0 });
  const now = sum(cur.days);
  const then = sum(prev.days);
  const waitingTotal = round2((waiting || []).reduce((s, r) => s + Number(r.cash_takings || 0), 0));

  const dayRows = datesBetween(from, to).map((d) => {
    const day = byDate[d];
    const f = day && countsInTotals(day) ? dayFigures(day, types) : null;
    const trading = !holiday[d] && openOnWeekday(settings, weekdayOf(d));
    const note = holiday[d] ? `Public holiday (${holiday[d]})`
      : !day ? (trading ? "No count" : "Closed")
      : day.status === "closed" ? "Closed" : day.status === "missing" ? "Missing — no figures" : day.status === "open" ? "Not confirmed" : "";
    return { d, till: f?.hasFigures ? f.till : null, customers: f?.customers ?? null, note, problem: note === "No count" || note === "Not confirmed" || note.startsWith("Missing") };
  });
  const flagged = cur.days.filter((d) => d.source === "app" && (Math.abs(Number(d.cash_variance || 0)) > limit || Math.abs(Number(d.eftpos_variance || 0)) > limit));
  const problems = dayRows.filter((r) => r.problem);

  const td = "padding:4px 10px;border-bottom:1px solid #eee;";
  const html = `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;color:#111;max-width:620px">
<h2 style="margin:0 0 4px">Daily Banking — week of ${esc(dayLabel(from))} to ${esc(dayLabel(to))}</h2>
<p style="margin:0 0 16px;color:#555">${esc(settings?.name || "")}</p>
<p style="font-size:16px;margin:0 0 4px"><b>Takings (Till): ${money(now.till)}</b> — ${esc(pct(now.till, then.till))}</p>
<p style="font-size:16px;margin:0 0 16px"><b>Customers: ${now.customers.toLocaleString("en-AU")}</b> — ${esc(pct(now.customers, then.customers))}</p>
<h3 style="margin:16px 0 6px">Each day</h3>
<table style="border-collapse:collapse;font-size:14px">
<tr><th style="${td}text-align:left">Day</th><th style="${td}text-align:right">Till</th><th style="${td}text-align:right">Customers</th><th style="${td}text-align:left"></th></tr>
${dayRows.map((r) => `<tr><td style="${td}">${esc(dayLabel(r.d))}</td><td style="${td}text-align:right">${r.till === null ? "" : money(r.till)}</td><td style="${td}text-align:right">${r.customers ?? ""}</td><td style="${td}color:${r.problem ? "#b91c1c" : "#666"}">${esc(r.note)}</td></tr>`).join("\n")}
</table>
<h3 style="margin:16px 0 6px">Over / under past ${money(limit)}</h3>
${flagged.length ? `<ul>${flagged.map((d) => `<li>${esc(dayLabel(d.takings_date))}: cash ${esc(fmtVariance(d.cash_variance))}, EFTPOS ${esc(fmtVariance(d.eftpos_variance))}${d.variance_reason ? ` — “${esc(d.variance_reason)}”` : ""}</li>`).join("")}</ul>` : "<p>None.</p>"}
<h3 style="margin:16px 0 6px">Not confirmed or missing</h3>
${problems.length ? `<ul>${problems.map((r) => `<li>${esc(dayLabel(r.d))}: ${esc(r.note)}</li>`).join("")}</ul>` : "<p>None — every trading day was counted.</p>"}
<h3 style="margin:16px 0 6px">Cash waiting to be banked</h3>
<p style="font-size:16px"><b>${money(waitingTotal)}</b></p>
<p style="color:#888;font-size:12px;margin-top:24px">Sent by Chalkboard every Monday. Change or turn off in Admin → Settings → Daily Banking.</p>
</body></html>`;
  return { html, subject: `Daily Banking — week of ${dayLabel(from)}: ${money(now.till)}`, to: String(settings?.banking_summary_email || "").trim() };
}

export default async function handler(req, res) {
  if (req.headers.authorization !== `Bearer ${process.env.CRON_SECRET}`) return res.status(401).json({ error: "Unauthorized" });
  try {
    const { html, subject, to } = await buildSummary();
    if (req.query.preview) { res.setHeader("Content-Type", "text/html; charset=utf-8"); return res.status(200).send(html); }
    if (!to) return res.status(200).json({ skipped: "no banking summary email set" });
    if (!process.env.RESEND_API_KEY) return res.status(500).json({ error: "RESEND_API_KEY is not set" });
    const r = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
      body: JSON.stringify({ from: process.env.RESEND_FROM || "Chalkboard <banking@chalkboard.au>", to: [to], subject, html }),
    });
    const body = await r.json().catch(() => ({}));
    if (!r.ok) return res.status(502).json({ error: "Resend refused the email", detail: body });
    return res.status(200).json({ sent: true, to, id: body.id });
  } catch (err) {
    return res.status(500).json({ error: err?.message || String(err) });
  }
}
