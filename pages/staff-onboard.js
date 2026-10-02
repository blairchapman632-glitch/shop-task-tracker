import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

export default function StaffOnboardingPage() {
  const router = useRouter();
  const { token } = router.query;

  const [step, setStep] = useState("loading"); // loading → form → notfound
  const [staff, setStaff] = useState(null);
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    date_of_birth: "", address: "", tfn: "", ahpra_number: "",
    emergency_contact_name: "", emergency_contact_phone: "",
    bank_account_name: "", bsb: "", account_number: "",
    super_fund_name: "", super_fund_usi: "", super_fund_abn: "", super_member_number: "",
  });
  const [documents, setDocuments] = useState([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  // Offer of employment (null = no contract issued, page behaves as before)
  const [contract, setContract] = useState(null);
  const [agreed, setAgreed] = useState(false);
  const [typedName, setTypedName] = useState("");
  const [accepting, setAccepting] = useState(false);
  const [acceptError, setAcceptError] = useState("");
  // Address entered at acceptance when the issued contract has none
  const [addr, setAddr] = useState({ street: "", suburb: "", state: "WA", postcode: "" });

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  const isPharmacist = staff?.role === "Pharmacist" || staff?.role === "Intern Pharmacist";

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const { data, error: err } = await supabase
        .from("staff")
        .select("id, name, email, phone, ahpra_number, date_of_birth, address, tfn, emergency_contact_name, emergency_contact_phone, bank_account_name, bsb, account_number, super_fund_name, super_fund_usi, super_fund_abn, super_member_number, onboarding_token, role")
        .eq("onboarding_token", token)
        .or("role.is.null,role.neq.Locum")
        .single();
      if (err || !data) { setStep("notfound"); return; }
      setStaff(data);
      setForm({
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        ahpra_number: data.ahpra_number || "",
        date_of_birth: data.date_of_birth || "",
        address: data.address || "",
        tfn: data.tfn || "",
        emergency_contact_name: data.emergency_contact_name || "",
        emergency_contact_phone: data.emergency_contact_phone || "",
        bank_account_name: data.bank_account_name || "",
        bsb: data.bsb || "",
        account_number: data.account_number || "",
        super_fund_name: data.super_fund_name || "",
        super_fund_usi: data.super_fund_usi || "",
        super_fund_abn: data.super_fund_abn || "",
        super_member_number: data.super_member_number || "",
      });
      // Load existing documents
      const { data: docs } = await supabase.from("locum_documents").select("*").eq("staff_id", data.id).order("uploaded_at", { ascending: false });
      setDocuments(docs || []);
      // Any issued/accepted offer of employment (server route — the contracts bucket is private)
      try {
        const res = await fetch(`/api/contracts/onboard?token=${encodeURIComponent(token)}`);
        if (res.ok) setContract((await res.json()).contract || null);
      } catch (e) { /* no contract step — onboarding still works */ }
      setStep("form");
    };
    load();
  }, [token]);

  const handleDocUpload = async (file, type) => {
    if (!file || !staff?.id) return;
    setUploadingDoc(true);
    setError("");
    try {
      const ext = file.name.split(".").pop();
      const filename = `${staff.id}_${type}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("locum-documents").upload(filename, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("locum-documents").getPublicUrl(filename);
      const { data: doc, error: insErr } = await supabase.from("locum_documents").insert([{
        staff_id: staff.id, type, url: urlData.publicUrl, filename: file.name, pharmacy_id: PHARMACY_ID,
      }]).select().single();
      if (insErr) throw insErr;
      setDocuments((prev) => [doc, ...prev]);
    } catch (err) {
      setError("Upload failed: " + (err?.message || String(err)));
    } finally {
      setUploadingDoc(false);
    }
  };

  const storagePathFromUrl = (url) => {
    if (!url) return null;
    const marker = "/locum-documents/";
    const i = url.indexOf(marker);
    return i === -1 ? null : url.slice(i + marker.length).split("?")[0];
  };

  const handleDocDelete = async (doc) => {
    setError("");
    try {
      const path = storagePathFromUrl(doc.url);
      if (path) await supabase.storage.from("locum-documents").remove([path]);
      await supabase.from("locum_documents").delete().eq("id", doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError("Couldn't remove document: " + (err?.message || String(err)));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const { error: upErr } = await supabase.from("staff").update({
        name: form.name.trim() || staff.name,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        ahpra_number: isPharmacist ? (form.ahpra_number.trim() || null) : undefined,
        date_of_birth: form.date_of_birth || null,
        address: form.address.trim() || null,
        tfn: form.tfn.trim() || null,
        emergency_contact_name: form.emergency_contact_name.trim() || null,
        emergency_contact_phone: form.emergency_contact_phone.trim() || null,
        bank_account_name: form.bank_account_name.trim() || null,
        bsb: form.bsb.trim() || null,
        account_number: form.account_number.trim() || null,
        super_fund_name: form.super_fund_name.trim() || null,
        super_fund_usi: form.super_fund_usi.trim() || null,
        super_fund_abn: form.super_fund_abn.trim() || null,
        super_member_number: form.super_member_number.trim() || null,
        onboarding_completed_at: new Date().toISOString(), // shows "Onboarding complete" in Admin
      }).eq("id", staff.id);
      if (upErr) throw upErr;
      setSaved(true);
      setTimeout(() => { try { window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); } catch (e) {} }, 50);
    } catch (err) {
      setError("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

  const needsAddress = contract?.status === "issued" && contract?.needs_address;
  const addressDone = !needsAddress || (addr.street.trim() && addr.suburb.trim() && addr.state.trim() && addr.postcode.trim());

  const handleAccept = async () => {
    if (!agreed || !typedName.trim() || !contract || !addressDone) return;
    setAccepting(true);
    setAcceptError("");
    try {
      const res = await fetch("/api/contracts/accept", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, contract_id: contract.id, typed_name: typedName, agreed: true, address: needsAddress ? addr : undefined }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Couldn't accept — please try again.");
      setContract((c) => ({ ...c, status: "accepted", needs_address: false, accepted_at: body.accepted_at, accepted_name: body.accepted_name, accepted_url: body.accepted_url }));
      // Saved to their staff record too — prefill the payroll form so they don't type it twice
      if (body.address) setForm((f) => ({ ...f, address: body.address }));
    } catch (err) {
      setAcceptError(err?.message || String(err));
    } finally {
      setAccepting(false);
    }
  };

  // Signed links expire after 10 minutes — fetch a fresh one when they tap Download
  const downloadAccepted = async () => {
    const win = window.open("", "_blank");
    try {
      const res = await fetch(`/api/contracts/onboard?token=${encodeURIComponent(token)}`);
      const url = res.ok ? (await res.json()).contract?.accepted_url : null;
      if (!url) throw new Error("Couldn't get your copy — please try again.");
      if (win) win.location.href = url; else window.location.href = url;
    } catch (err) {
      if (win) win.close();
      setAcceptError(err?.message || String(err));
    }
  };

  const openIssued = async () => {
    const win = window.open("", "_blank");
    try {
      const res = await fetch(`/api/contracts/onboard?token=${encodeURIComponent(token)}`);
      const url = res.ok ? (await res.json()).contract?.issued_url : null;
      if (!url) throw new Error("Couldn't open the contract — please try again.");
      if (win) win.location.href = url; else window.location.href = url;
    } catch (err) {
      if (win) win.close();
      setAcceptError(err?.message || String(err));
    }
  };

  const fmtStamp = (iso) => iso
    ? new Date(iso).toLocaleString("en-AU", { day: "numeric", month: "long", year: "numeric", hour: "numeric", minute: "2-digit", timeZone: "Australia/Perth" })
    : "";

  const contractPending = contract?.status === "issued";
  const isCasualContract = contract?.employment_category === "casual";

  // ── Render ──
  if (step === "loading") return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center">
      <div className="text-sm text-gray-400">Loading…</div>
    </div>
  );

  if (step === "notfound") return (
    <div className="min-h-screen bg-gray-100 flex items-center justify-center px-4">
      <div className="bg-white rounded-2xl shadow-sm border p-8 text-center max-w-sm">
        <div className="text-3xl mb-2">❌</div>
        <div className="font-semibold text-gray-800 mb-1">Link not found</div>
        <div className="text-sm text-gray-500">This onboarding link is invalid or has expired. Please contact Byford Pharmacy.</div>
      </div>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-lg">
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">👋</div>
          <h1 className="text-xl font-bold text-gray-800">Byford Pharmacy</h1>
          <p className="text-sm text-gray-500">New Staff Onboarding</p>
        </div>

        <div className="space-y-4">
          {/* Offer of employment — must be accepted before the rest of onboarding */}
          {contract && (
            <div className="bg-white rounded-2xl shadow-sm border p-5">
              <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-1">Your offer of employment</div>
              <div className="text-sm text-gray-700 mb-3">{contract.label}</div>

              {contractPending ? (
                <div className="space-y-3">
                  <button type="button" onClick={openIssued} className="w-full border border-blue-200 text-blue-700 rounded-xl py-2.5 text-sm font-medium hover:bg-blue-50">
                    📄 View contract
                  </button>
                  {(contract.info_links || []).length > 0 && (
                    <div className="space-y-1">
                      {contract.info_links.map((l) => (
                        <a key={l.url} href={l.url} target="_blank" rel="noopener noreferrer" className="block text-sm text-blue-600 hover:underline">
                          {l.label} ↗
                        </a>
                      ))}
                    </div>
                  )}
                  {needsAddress && (
                    <div className="space-y-3 rounded-xl border border-gray-200 p-3">
                      <div className="text-xs font-semibold text-gray-600">Your home address</div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Street address</label>
                        <input value={addr.street} onChange={(e) => setAddr((a) => ({ ...a, street: e.target.value }))} placeholder="e.g. 12 Example Street" autoComplete="address-line1" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-gray-600 mb-1">Suburb</label>
                        <input value={addr.suburb} onChange={(e) => setAddr((a) => ({ ...a, suburb: e.target.value }))} placeholder="e.g. Byford" autoComplete="address-level2" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                      </div>
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">State</label>
                          <select value={addr.state} onChange={(e) => setAddr((a) => ({ ...a, state: e.target.value }))} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400">
                            {["WA", "NSW", "VIC", "QLD", "SA", "TAS", "ACT", "NT"].map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        <div>
                          <label className="block text-xs font-medium text-gray-600 mb-1">Postcode</label>
                          <input value={addr.postcode} onChange={(e) => setAddr((a) => ({ ...a, postcode: e.target.value.replace(/\D/g, "").slice(0, 4) }))} inputMode="numeric" placeholder="e.g. 6122" autoComplete="postal-code" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                        </div>
                      </div>
                    </div>
                  )}
                  <label className="flex items-start gap-2 text-sm text-gray-700">
                    <input type="checkbox" checked={agreed} onChange={(e) => setAgreed(e.target.checked)} className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      I have read the offer of employment, its attachments and the Fair Work Information Statement
                      {isCasualContract ? " and the Casual Employment Information Statement" : ""}, and I agree to accept this offer electronically.
                    </span>
                  </label>
                  <div>
                    <label className="block text-xs font-medium text-gray-600 mb-1">Type your full name</label>
                    <input value={typedName} onChange={(e) => setTypedName(e.target.value)} placeholder="Full legal name" autoComplete="name" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                  </div>
                  {acceptError && <p className="text-sm text-red-500">{acceptError}</p>}
                  <button type="button" onClick={handleAccept} disabled={!agreed || !typedName.trim() || !addressDone || accepting} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
                    {accepting ? "Accepting…" : "Accept offer"}
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-3">
                    <div className="text-sm font-semibold text-green-700">✅ Accepted {fmtStamp(contract.accepted_at)}</div>
                    {contract.accepted_name && <div className="text-xs text-green-600 mt-0.5">by {contract.accepted_name}</div>}
                  </div>
                  <button type="button" onClick={downloadAccepted} className="w-full border border-green-300 text-green-700 rounded-xl py-2.5 text-sm font-medium hover:bg-green-50">
                    ↓ Download your copy
                  </button>
                  {acceptError && <p className="text-sm text-red-500">{acceptError}</p>}
                </div>
              )}
            </div>
          )}

          {!contractPending && (<>
          {/* Personal */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Personal Details</div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Full Name</label>
                <input value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Full legal name" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Email</label>
                  <input type="email" value={form.email} onChange={(e) => set("email", e.target.value)} placeholder="email@example.com" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Phone</label>
                  <input value={form.phone} onChange={(e) => set("phone", e.target.value)} placeholder="04xx xxx xxx" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              </div>
              {isPharmacist && (
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">AHPRA Number</label>
                  <input value={form.ahpra_number} onChange={(e) => set("ahpra_number", e.target.value)} placeholder="PHA0000000000" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              )}
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Date of Birth</label>
                <input type="date" value={form.date_of_birth} onChange={(e) => set("date_of_birth", e.target.value)} className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Home Address</label>
                <input value={form.address} onChange={(e) => set("address", e.target.value)} placeholder="Street, Suburb, State, Postcode" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Tax File Number (TFN)</label>
                <input value={form.tfn} onChange={(e) => set("tfn", e.target.value)} placeholder="xxx xxx xxx" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
          </div>

          {/* Emergency Contact */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Emergency Contact</div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contact Name</label>
                <input value={form.emergency_contact_name} onChange={(e) => set("emergency_contact_name", e.target.value)} placeholder="Full name" autoComplete="off" name="emergency_contact_name_field" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Contact Phone</label>
                <input value={form.emergency_contact_phone} onChange={(e) => set("emergency_contact_phone", e.target.value)} placeholder="04xx xxx xxx" autoComplete="off" name="emergency_contact_phone_field" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
          </div>

          {/* Bank */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Bank Account</div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Account Name</label>
                <input value={form.bank_account_name} onChange={(e) => set("bank_account_name", e.target.value)} placeholder="Full name as on account" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">BSB</label>
                  <input value={form.bsb} onChange={(e) => set("bsb", e.target.value)} placeholder="xxx-xxx" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Account Number</label>
                  <input value={form.account_number} onChange={(e) => set("account_number", e.target.value)} placeholder="xxxxxxxx" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              </div>
            </div>
          </div>

          {/* Super */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Superannuation</div>
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Fund Name</label>
                <input value={form.super_fund_name} onChange={(e) => set("super_fund_name", e.target.value)} placeholder="e.g. GuildSuper" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">USI / SPIN</label>
                  <input value={form.super_fund_usi} onChange={(e) => set("super_fund_usi", e.target.value)} placeholder="e.g. RES0103AU" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
                <div>
                  <label className="block text-xs font-medium text-gray-600 mb-1">Fund ABN</label>
                  <input value={form.super_fund_abn} onChange={(e) => set("super_fund_abn", e.target.value)} placeholder="xx xxx xxx xxx" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">Member Number</label>
                <input value={form.super_member_number} onChange={(e) => set("super_member_number", e.target.value)} placeholder="xxxxxxxxx" className="w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400" />
              </div>
            </div>
          </div>

          {/* Documents */}
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-3">Documents</div>
            <div className="space-y-4">
              {[
                { type: "resume", label: "Resume", multi: false },
                ...(isPharmacist
                  ? [
                      { type: "ahpra_cert", label: "AHPRA Certificate", multi: false },
                      { type: "indemnity_cert", label: "Professional Indemnity Certificate", multi: false },
                      { type: "first_aid_cert", label: "First Aid Certificate", multi: false },
                      { type: "cpr_cert", label: "CPR Certificate", multi: false },
                      { type: "vaccination_accreditation", label: "Vaccination Accreditation", multi: true },
                    ]
                  : [{ type: "s2_s3_cert", label: "S2/S3 Certificate (if applicable)", multi: false }]),
                { type: "other", label: "Other Documents", multi: true },
              ].map(({ type, label, multi }) => {
                const slotDocs = documents.filter((d) => d.type === type);
                const showUploader = multi || slotDocs.length === 0;
                return (
                  <div key={type}>
                    <div className="text-xs font-medium text-gray-600 mb-1.5">{label}</div>

                    {slotDocs.length > 0 && (
                      <div className="space-y-1.5 mb-2">
                        {slotDocs.map((doc) => (
                          <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                            <span>📄</span>
                            <div className="min-w-0 flex-1">
                              <div className="text-xs text-gray-700 truncate">{doc.filename || doc.type}</div>
                              <div className="text-[11px] text-green-600">✅ Uploaded</div>
                            </div>
                            <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline shrink-0">View</a>
                            {!multi && (
                              <label className="text-xs text-blue-600 hover:underline shrink-0 cursor-pointer">
                                Replace
                                <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploadingDoc}
                                  onChange={async (e) => { const f = e.target.files?.[0]; if (!f) return; await handleDocDelete(doc); await handleDocUpload(f, type); }} />
                              </label>
                            )}
                            <button onClick={() => handleDocDelete(doc)} className="text-xs text-red-500 hover:text-red-700 shrink-0">Remove</button>
                          </div>
                        ))}
                      </div>
                    )}

                    {showUploader && (
                      <label className={`flex items-center gap-2 w-full border-2 border-dashed rounded-lg px-3 py-3 cursor-pointer transition-colors ${uploadingDoc ? "border-blue-200 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"}`}>
                        <span className="text-gray-400">📎</span>
                        <span className="text-xs text-gray-500">{uploadingDoc ? "Uploading…" : multi && slotDocs.length > 0 ? "Add another" : `Upload ${label}`}</span>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploadingDoc} onChange={(e) => handleDocUpload(e.target.files?.[0], type)} />
                      </label>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button onClick={handleSave} disabled={saving} className="w-full bg-blue-600 text-white rounded-xl py-3 text-sm font-medium disabled:opacity-40">
            {saving ? "Saving…" : "Submit my details"}
          </button>

          {saved && (
            <div className="rounded-xl bg-green-50 border border-green-200 px-4 py-4 text-center">
              <div className="text-2xl mb-1">✅</div>
              <div className="text-sm font-semibold text-green-700">All done — your details have been submitted.</div>
              <div className="text-xs text-green-600 mt-0.5">Byford Pharmacy has your information. You can safely close this page.</div>
            </div>
          )}
          </>)}
        </div>
      </div>
    </div>
  );
}