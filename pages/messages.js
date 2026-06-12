import { useEffect, useRef, useState } from "react";
import supabase from "../lib/supabaseClient";

const PHARMACY_ID = "81ab394f-d642-4246-b896-e71938b25671";

const fmtWhen = (d) =>
  new Date(d).toLocaleString("en-AU", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

export default function MessagesPage() {
  // ── Identity ──
  const [staffList, setStaffList] = useState([]);
  const [step, setStep] = useState("select"); // select → pin → inbox
  const [me, setMe] = useState(null);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState("");
  const [checking, setChecking] = useState(false);

  // ── Messages ──
  const [messages, setMessages] = useState([]); // all messages involving me
  const [loading, setLoading] = useState(false);
  const [activeStaffId, setActiveStaffId] = useState(null); // who I'm viewing a thread with
  const [composeText, setComposeText] = useState("");
  const [sending, setSending] = useState(false);
  const [showNewChat, setShowNewChat] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef(null);
  const threadEndRef = useRef(null);

  // Upload an image, then send it as a message
  const handleImagePick = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-picking the same file
    if (!file || !activeStaffId) return;
    if (!file.type.startsWith("image/")) { alert("Please choose an image."); return; }
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "jpg";
      const path = `${me.id}/${Date.now()}.${ext}`;
      const { error: upErr } = await supabase.storage.from("message-images").upload(path, file, { upsert: false });
      if (upErr) throw upErr;
      const { data: pub } = supabase.storage.from("message-images").getPublicUrl(path);
      const { data, error } = await supabase.from("messages").insert({
        pharmacy_id: PHARMACY_ID,
        sender_staff_id: me.id,
        recipient_staff_id: activeStaffId,
        type: "dm",
        body: null,
        image_url: pub.publicUrl,
      }).select("*").single();
      if (error) throw error;
      setMessages((prev) => [...prev, data]);
    } catch (err) {
      alert("Couldn't send image: " + (err?.message || String(err)));
    } finally {
      setUploading(false);
    }
  };

  // Load active staff
  useEffect(() => {
    supabase.from("staff").select("id, name, photo_url, pin, role").eq("pharmacy_id", PHARMACY_ID).eq("active", true).order("name")
      .then(({ data }) => setStaffList(data || []));
  }, []);

  const handleSelectStaff = (s) => {
    setMe(s);
    setPin("");
    setPinError("");
    setStep("pin");
  };

  const handlePin = async () => {
    if (pin.length !== 4) { setPinError("Enter your 4-digit PIN."); return; }
    setChecking(true);
    const { data, error } = await supabase
      .from("staff").select("id").eq("id", me.id).eq("pin", pin).single();
    setChecking(false);
    if (error || !data) { setPinError("Incorrect PIN."); setPin(""); return; }
    await loadMessages(me.id);
    setStep("inbox");
  };

  const loadMessages = async (myId) => {
    setLoading(true);
    const { data } = await supabase
      .from("messages")
      .select("*")
      .or(`recipient_staff_id.eq.${myId},sender_staff_id.eq.${myId}`)
      .order("created_at", { ascending: true });
    // Hide ones I've soft-deleted on my side
    const visible = (data || []).filter((m) => {
      if (m.recipient_staff_id === myId && m.deleted_by_recipient) return false;
      if (m.sender_staff_id === myId && m.deleted_by_sender) return false;
      return true;
    });
    setMessages(visible);
    setLoading(false);
  };

  // Mark unread messages in a thread as read
  const markThreadRead = async (otherId) => {
    const unreadIds = messages
      .filter((m) => m.recipient_staff_id === me.id && m.sender_staff_id === otherId && !m.read_at)
      .map((m) => m.id);
    if (!unreadIds.length) return;
    await supabase.from("messages").update({ read_at: new Date().toISOString() }).in("id", unreadIds);
    setMessages((prev) => prev.map((m) => unreadIds.includes(m.id) ? { ...m, read_at: new Date().toISOString() } : m));
  };

  const openThread = (otherId) => {
    setActiveStaffId(otherId);
    markThreadRead(otherId);
  };

  const sendMessage = async () => {
    const body = composeText.trim();
    if (!body || !activeStaffId) return;
    setSending(true);
    try {
      const { data, error } = await supabase.from("messages").insert({
        pharmacy_id: PHARMACY_ID,
        sender_staff_id: me.id,
        recipient_staff_id: activeStaffId,
        type: "dm",
        body,
      }).select("*").single();
      if (error) throw error;
      setMessages((prev) => [...prev, data]);
      setComposeText("");
    } catch (err) {
      alert("Couldn't send: " + (err?.message || String(err)));
    } finally {
      setSending(false);
    }
  };

  // Scroll to bottom of thread when it changes
  useEffect(() => {
    if (activeStaffId && threadEndRef.current) {
      threadEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [activeStaffId, messages]);

  const staffById = Object.fromEntries(staffList.map((s) => [s.id, s]));

  // Build conversation list: group by the "other" person
  const conversations = (() => {
    if (!me) return [];
    const byOther = {};
    for (const m of messages) {
      const otherId = m.sender_staff_id === me.id ? m.recipient_staff_id : m.sender_staff_id;
      if (!otherId) continue; // skip system messages here (no sender) handled separately
      if (!byOther[otherId]) byOther[otherId] = { otherId, last: m, unread: 0 };
      if (new Date(m.created_at) >= new Date(byOther[otherId].last.created_at)) byOther[otherId].last = m;
      if (m.recipient_staff_id === me.id && !m.read_at) byOther[otherId].unread += 1;
    }
    return Object.values(byOther).sort((a, b) => new Date(b.last.created_at) - new Date(a.last.created_at));
  })();

  // System notifications (sender is null, recipient is me)
  const systemNotes = me
    ? messages.filter((m) => m.type === "system" && m.recipient_staff_id === me.id).sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
    : [];

  const activeThread = activeStaffId
    ? messages.filter((m) =>
        (m.sender_staff_id === activeStaffId && m.recipient_staff_id === me.id) ||
        (m.sender_staff_id === me.id && m.recipient_staff_id === activeStaffId)
      ).sort((a, b) => new Date(a.created_at) - new Date(b.created_at))
    : [];

  // ── Render ──
  return (
    <div className="min-h-screen bg-gray-100 flex flex-col items-center py-8 px-4">
      <div className="w-full max-w-lg">
        <div className="mb-2">
          <a href="/" className="text-sm text-blue-600 hover:underline">← Back to home</a>
        </div>
        <div className="text-center mb-6">
          <div className="text-3xl mb-1">💬</div>
          <h1 className="text-xl font-bold text-gray-800">Byford Pharmacy</h1>
          <p className="text-sm text-gray-500">Messages</p>
        </div>

        {/* Step: select staff */}
        {step === "select" && (
          <div className="bg-white rounded-2xl shadow-sm border p-5">
            <p className="text-sm text-gray-500 mb-3">Select your name:</p>
            <div className="space-y-1 max-h-[60vh] overflow-y-auto">
              {staffList.map((s) => (
                <button key={s.id} onClick={() => handleSelectStaff(s)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left border border-transparent hover:border-gray-200">
                  <img src={s.photo_url || "/placeholder.png"} alt={s.name} className="w-10 h-10 rounded-full object-cover" />
                  <span className="text-sm font-medium text-gray-800">{s.name}</span>
                </button>
              ))}
              {staffList.length === 0 && <div className="text-sm text-gray-400">Loading staff…</div>}
            </div>
          </div>
        )}

        {/* Step: PIN */}
        {step === "pin" && me && (
          <div className="bg-white rounded-2xl shadow-sm border p-6 text-center">
            <img src={me.photo_url || "/placeholder.png"} alt={me.name} className="w-14 h-14 rounded-full object-cover mx-auto mb-2" />
            <div className="font-medium text-gray-800 mb-4">{me.name}</div>
            <input
              type="password" inputMode="numeric" maxLength={4} value={pin}
              onChange={(e) => { setPin(e.target.value.replace(/\D/g, "")); setPinError(""); }}
              onKeyDown={(e) => e.key === "Enter" && handlePin()}
              placeholder="••••" autoFocus
              className="w-full border rounded-lg px-4 py-3 text-center text-2xl tracking-widest mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            {pinError && <p className="text-sm text-red-500 mb-3">{pinError}</p>}
            <div className="flex gap-2">
              <button onClick={() => { setStep("select"); setMe(null); }} className="flex-1 border border-gray-300 rounded-lg py-2.5 text-sm text-gray-600 hover:bg-gray-50">Back</button>
              <button onClick={handlePin} disabled={checking} className="flex-1 bg-blue-600 text-white rounded-lg py-2.5 text-sm font-medium disabled:opacity-40">{checking ? "Checking…" : "Continue"}</button>
            </div>
          </div>
        )}

        {/* Step: inbox */}
        {step === "inbox" && me && (
          <div className="space-y-4">
            {/* Header */}
            <div className="bg-white rounded-2xl shadow-sm border p-4 flex items-center gap-3">
              <img src={me.photo_url || "/placeholder.png"} alt={me.name} className="w-10 h-10 rounded-full object-cover" />
              <div className="flex-1">
                <div className="font-medium text-gray-800">{me.name}</div>
                <button onClick={() => { setStep("select"); setMe(null); setActiveStaffId(null); setMessages([]); }} className="text-xs text-blue-600 hover:underline">Not you?</button>
              </div>
              {!activeStaffId && (
                <button onClick={() => setShowNewChat((v) => !v)} className="text-sm bg-blue-600 text-white rounded-lg px-3 py-2 font-medium">✏️ New</button>
              )}
              {activeStaffId && (
                <button onClick={() => setActiveStaffId(null)} className="text-sm text-blue-600 hover:underline">← Inbox</button>
              )}
            </div>

            {/* New chat — pick recipient */}
            {!activeStaffId && showNewChat && (
              <div className="bg-white rounded-2xl shadow-sm border p-4">
                <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Message someone</div>
                <div className="space-y-1 max-h-[40vh] overflow-y-auto">
                  {staffList.filter((s) => s.id !== me.id).map((s) => (
                    <button key={s.id} onClick={() => { setShowNewChat(false); openThread(s.id); }} className="w-full flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-50 text-left">
                      <img src={s.photo_url || "/placeholder.png"} alt={s.name} className="w-8 h-8 rounded-full object-cover" />
                      <span className="text-sm font-medium text-gray-800">{s.name}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Inbox list */}
            {!activeStaffId && !showNewChat && (
              <>
                {/* System notifications */}
                {systemNotes.length > 0 && (
                  <div className="bg-white rounded-2xl shadow-sm border p-4">
                    <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">🔔 Notifications</div>
                    <div className="space-y-2">
                      {systemNotes.map((n) => (
                        <div key={n.id} className={`rounded-lg border px-3 py-2 ${n.read_at ? "border-gray-100 bg-gray-50" : "border-blue-200 bg-blue-50"}`}>
                          <div className="text-sm text-gray-800 whitespace-pre-wrap break-words">{n.body}</div>
                          <div className="text-[11px] text-gray-400 mt-0.5">{fmtWhen(n.created_at)}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Conversations */}
                <div className="bg-white rounded-2xl shadow-sm border p-4">
                  <div className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">Conversations</div>
                  {loading ? (
                    <div className="text-sm text-gray-400">Loading…</div>
                  ) : conversations.length === 0 ? (
                    <p className="text-sm text-gray-400">No messages yet. Tap “New” to message someone.</p>
                  ) : (
                    <div className="space-y-1">
                      {conversations.map((c) => {
                        const other = staffById[c.otherId];
                        const preview = c.last.body || (c.last.image_url ? "📷 Photo" : "");
                        return (
                          <button key={c.otherId} onClick={() => openThread(c.otherId)} className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-gray-50 text-left">
                            <img src={other?.photo_url || "/placeholder.png"} alt={other?.name} className="w-10 h-10 rounded-full object-cover" />
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center justify-between gap-2">
                                <span className="text-sm font-medium text-gray-800 truncate">{other?.name || "Unknown"}</span>
                                <span className="text-[11px] text-gray-400 shrink-0">{fmtWhen(c.last.created_at)}</span>
                              </div>
                              <div className="text-xs text-gray-500 truncate">{c.last.sender_staff_id === me.id ? "You: " : ""}{preview}</div>
                            </div>
                            {c.unread > 0 && <span className="shrink-0 inline-flex items-center justify-center min-w-[20px] h-5 px-1.5 rounded-full bg-blue-600 text-white text-[11px] font-semibold">{c.unread}</span>}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Thread view */}
            {activeStaffId && (
              <div className="bg-white rounded-2xl shadow-sm border flex flex-col" style={{ height: "65vh" }}>
                <div className="flex items-center gap-3 px-4 py-3 border-b shrink-0">
                  <img src={staffById[activeStaffId]?.photo_url || "/placeholder.png"} alt="" className="w-9 h-9 rounded-full object-cover" />
                  <span className="font-medium text-gray-800">{staffById[activeStaffId]?.name || "Unknown"}</span>
                </div>

                <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
                  {activeThread.length === 0 && <p className="text-sm text-gray-400 text-center mt-4">No messages yet. Say hello 👋</p>}
                  {activeThread.map((m) => {
                    const mine = m.sender_staff_id === me.id;
                    return (
                      <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
                        <div className={`max-w-[75%] rounded-2xl px-3 py-2 ${mine ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-800"}`}>
                          {m.image_url && (
                            <a href={m.image_url} target="_blank" rel="noopener noreferrer">
                              <img src={m.image_url} alt="" className="rounded-lg max-w-full max-h-64 object-cover mb-1" />
                            </a>
                          )}
                          {m.body && <div className="text-sm whitespace-pre-wrap break-words">{m.body}</div>}
                          <div className={`text-[10px] mt-0.5 ${mine ? "text-blue-100" : "text-gray-400"}`}>
                            {fmtWhen(m.created_at)}{mine && m.read_at ? " · Seen" : ""}
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={threadEndRef} />
                </div>

                <div className="flex gap-2 px-3 py-3 border-t shrink-0 items-end">
                  <input ref={fileInputRef} type="file" accept="image/*" onChange={handleImagePick} className="hidden" />
                  <button onClick={() => fileInputRef.current?.click()} disabled={uploading} className="rounded-lg px-3 py-2 text-lg border border-gray-200 hover:bg-gray-50 disabled:opacity-40" title="Send photo">
                    {uploading ? "…" : "📷"}
                  </button>
                  <textarea
                    value={composeText}
                    onChange={(e) => setComposeText(e.target.value)}
                    rows={1}
                    placeholder="Message…"
                    className="flex-1 rounded-lg border border-gray-200 px-3 py-2 text-sm resize-none focus:outline-none focus:ring-1 focus:ring-blue-300"
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                  />
                  <button onClick={sendMessage} disabled={!composeText.trim() || sending} className="rounded-lg px-4 py-2 text-sm font-medium bg-blue-600 text-white disabled:opacity-40">
                    {sending ? "…" : "Send"}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}