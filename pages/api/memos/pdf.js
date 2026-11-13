// "Download PDF" for a sent memo. POST { id, pin? } -> application/pdf.
// Anyone can download a sent memo (sent memos are readable by all staff). With a QSPP manager PIN (manager mode) the
// PDF gets a last page: who has seen it, when, and where. Drafts can't be downloaded. POST so the PIN never sits in a URL.
import { checkQsppManagerPin } from "../../../lib/adminPin";
import { sectionShown } from "../../../lib/memos";
import { buildMemoPdf } from "../../../lib/memoPdf";
import {
  supabaseAdmin, PHARMACY_ID, httpError, sendError, loadMemo, loadSections, memoOnly, seenByFor, loadMemoPolicies, loadMemoDates,
  isPrivateMemo, canStaffRead, loadMemoUpdates,
} from "../../../lib/memosServer";
import { staffFromRequest } from "../../../lib/reviewServer";
import { requireDashboard, assertSamePharmacy } from "../../../lib/adminAuth";

const MAX_IMAGE_BYTES = 8 * 1024 * 1024;

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  try {
    const db = supabaseAdmin();
    const b = req.body || {};
    const memo = await loadMemo(db, b.id);
    if (memo.status !== "sent") throw httpError(404, "Only sent memos can be downloaded.");
    let manager = null;
    if (b.pin) {
      manager = await checkQsppManagerPin(db, PHARMACY_ID, b.pin);
      if (!manager) throw httpError(403, "QSPP manager PIN needed — unlock 🔒 Manager again.");
    }
    // A private memo (sent to roles / people): a manager, or one of its recipients — on /me their own login, on the
    // kiosk the kiosk login + their staff id
    if (isPrivateMemo(memo) && !manager) {
      let reader = null;
      if (b.via === "kiosk") {
        const auth = await requireDashboard(req);
        assertSamePharmacy(auth, PHARMACY_ID);
        reader = b.staff_id ? Number(b.staff_id) : null;
      } else {
        reader = Number((await staffFromRequest(req).catch(() => null))?.id) || null;
      }
      if (!reader || !(await canStaffRead(db, memo, reader))) throw httpError(404, "That memo wasn't found.");
    }

    const sections = (await loadSections(db, [memo.id])).filter(sectionShown).map(memoOnly);
    const [{ data: sender }, { data: settings }] = await Promise.all([
      memo.sent_by_staff_id ? db.from("staff").select("name").eq("id", Number(memo.sent_by_staff_id)).maybeSingle() : { data: null },
      db.from("pharmacy_settings").select("name").eq("pharmacy_id", PHARMACY_ID).maybeSingle(),
    ]);
    // Imported memos have no seen tracking — no seen-by page
    const seenBy = manager && !memo.imported ? ((await seenByFor(db, [memo.id]))[memo.id] || []) : null;

    // Section images live in the public staff-memos bucket — only fetch our own storage URLs
    const base = String(process.env.NEXT_PUBLIC_SUPABASE_URL || "").replace(/\/$/, "");
    const fetchImage = async (url) => {
      if (!base || !String(url).startsWith(`${base}/storage/`)) throw new Error("Not a memo image");
      const r = await fetch(url);
      if (!r.ok) throw new Error(`Image ${r.status}`);
      const buf = Buffer.from(await r.arrayBuffer());
      if (buf.length > MAX_IMAGE_BYTES) throw new Error("Image too big");
      return buf;
    };

    // Updates are part of the memo; replies are private and never in the PDF
    const [policies, dates, updates] = await Promise.all([loadMemoPolicies(db, [memo.id]), loadMemoDates(db, [memo.id]), loadMemoUpdates(db, [memo.id])]);
    const bytes = await buildMemoPdf({
      memo, sections, sentByName: sender?.name || "", pharmacyName: settings?.name || "", seenBy, fetchImage, policies, dates, updates,
    });
    const safe = String(memo.title).replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-") || "staff-memo";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safe}.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    res.status(200).send(Buffer.from(bytes));
  } catch (err) {
    return sendError(res, "[api/memos/pdf]", err);
  }
}
