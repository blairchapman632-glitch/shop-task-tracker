import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import supabase from "../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

export default function LocumOnboardingPage() {
  const router = useRouter();
  const { token } = router.query;

  const [step, setStep] = useState("loading"); // loading → form → notfound
  const [locum, setLocum] = useState(null);
  const [form, setForm] = useState({
    name: "", email: "", phone: "",
    date_of_birth: "", address: "", tfn: "",
    bank_account_name: "", bsb: "", account_number: "",
    super_fund_name: "", super_fund_usi: "", super_fund_abn: "", super_member_number: "",
  });
  const [documents, setDocuments] = useState([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  const set = (field, value) => setForm((f) => ({ ...f, [field]: value }));

  useEffect(() => {
    if (!token) return;
    const load = async () => {
      const { data, error: err } = await supabase
        .from("staff")
        .select("id, name, email, phone, ahpra_number, date_of_birth, address, tfn, bank_account_name, bsb, account_number, super_fund_name, super_fund_usi, super_fund_abn, super_member_number, onboarding_token")
        .eq("onboarding_token", token)
        .eq("role", "Locum")
        .single();
      if (err || !data) { setStep("notfound"); return; }
      setLocum(data);
      setForm({
        name: data.name || "",
        email: data.email || "",
        phone: data.phone || "",
        date_of_birth: data.date_of_birth || "",
        address: data.address || "",
        tfn: data.tfn || "",
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
      setStep("form");
    };
    load();
  }, [token]);

  const handleDocUpload = async (file, type) => {
    if (!file || !locum?.id) return;
    setUploadingDoc(true);
    setError("");
    try {
      const ext = file.name.split(".").pop();
      const filename = `${locum.id}_${type}_${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("locum-documents").upload(filename, file, { upsert: true });
      if (upErr) throw upErr;
      const { data: urlData } = supabase.storage.from("locum-documents").getPublicUrl(filename);
      const { data: doc, error: insErr } = await supabase.from("locum_documents").insert([{
        staff_id: locum.id, type, url: urlData.publicUrl, filename: file.name, pharmacy_id: PHARMACY_ID,
      }]).select().single();
      if (insErr) throw insErr;
      setDocuments((prev) => [doc, ...prev]);
    } catch (err) {
      setError("Upload failed: " + (err?.message || String(err)));
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError("");
    try {
      const { error: upErr } = await supabase.from("staff").update({
        name: form.name.trim() || locum.name,
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        date_of_birth: form.date_of_birth || null,
        address: form.address.trim() || null,
        tfn: form.tfn.trim() || null,
        bank_account_name: form.bank_account_name.trim() || null,
        bsb: form.bsb.trim() || null,
        account_number: form.account_number.trim() || null,
        super_fund_name: form.super_fund_name.trim() || null,
        super_fund_usi: form.super_fund_usi.trim() || null,
        super_fund_abn: form.super_fund_abn.trim() || null,
        super_member_number: form.super_member_number.trim() || null,
      }).eq("id", locum.id);
      if (upErr) throw upErr;
      setSaved(true);
      setTimeout(() => { try { window.scrollTo({ top: document.body.scrollHeight, behavior: "smooth" }); } catch (e) {} }, 50);
    } catch (err) {
      setError("Couldn't save: " + (err?.message || String(err)));
    } finally {
      setSaving(false);
    }
  };

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
          <div className="text-3xl mb-1">💊</div>
          <h1 className="text-xl font-bold text-gray-800">Byford Pharmacy</h1>
          <p className="text-sm text-gray-500">Locum Onboarding</p>
        </div>

        <div className="space-y-4">
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
              <div>
                <label className="block text-xs font-medium text-gray-600 mb-1">AHPRA Number</label>
                <input value={locum.ahpra_number || ""} readOnly className="w-full border rounded-lg px-3 py-2 text-sm bg-gray-50 text-gray-500" />
              </div>
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
            {documents.length > 0 && (
              <div className="space-y-1.5 mb-3">
                {documents.map((doc) => (
                  <div key={doc.id} className="flex items-center gap-2 rounded-lg border border-gray-100 bg-gray-50 px-3 py-2">
                    <span>📄</span>
                    <div className="min-w-0 flex-1">
                      <div className="text-xs text-gray-700 truncate">{doc.filename || doc.type}</div>
                      <div className="text-[11px] text-green-600">✅ Uploaded</div>
                    </div>
                    <a href={doc.url} target="_blank" rel="noopener noreferrer" className="text-xs text-blue-600 hover:underline">View</a>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2">
              {[
                { type: "indemnity_cert", label: "Professional Indemnity Certificate" },
                { type: "locum_agreement", label: "Signed Locum Agreement" },
                { type: "other", label: "Other Document" },
              ].map(({ type, label }) => (
                <label key={type} className={`flex items-center gap-2 w-full border-2 border-dashed rounded-lg px-3 py-3 cursor-pointer transition-colors ${uploadingDoc ? "border-blue-200 bg-blue-50" : "border-gray-200 hover:border-blue-300 hover:bg-blue-50"}`}>
                  <span className="text-gray-400">📎</span>
                  <span className="text-xs text-gray-500">{uploadingDoc ? "Uploading…" : `Upload ${label}`}</span>
                  <input type="file" accept=".pdf,.jpg,.jpeg,.png" className="hidden" disabled={uploadingDoc} onChange={(e) => handleDocUpload(e.target.files?.[0], type)} />
                </label>
              ))}
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
        </div>
      </div>
    </div>
  );
}