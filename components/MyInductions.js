// Inductions on /me (To do tab) — for staff with "Can sign off inductions" (Stage 2).
// Lists other people's in-progress inductions; tap one to tick lines, signed as the logged-in staff member.
// Everything goes through pages/api/inductions/* (Supabase access token); the server checks every rule —
// this screen only mirrors them (the "blocked" reason comes back with each line). No files are opened here.
// Not counted in the To do badge (an induction runs for 3 months).
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { fmtDateShort, perthDateOf } from "../lib/performanceReview";
import { SECTIONS, answerLabel, inductionProgress } from "../lib/induction";

const ME_SECTIONS = SECTIONS.filter((s) => s.key !== "office");

// "2026-11-02" -> "2 Nov"
const dayMonth = (s) => fmtDateShort(s).replace(/ \d{4}$/, "");

// -> { status, body }; status 0 = no Auth session (legacy ?token= link)
const api = async (path, body) => {
  const { data } = await supabase.auth.getSession();
  const token = data?.session?.access_token;
  if (!token) return { status: 0, body: null };
  const headers = { Authorization: `Bearer ${token}` };
  const res = await fetch(path, body
    ? { method: "POST", headers: { ...headers, "Content-Type": "application/json" }, body: JSON.stringify(body) }
    : { headers });
  return { status: res.status, body: await res.json().catch(() => ({})) };
};

const ANSWER_STYLE = {
  done: "bg-green-600 text-white border-green-600",
  na: "bg-gray-500 text-white border-gray-500",
  declined: "bg-amber-500 text-white border-amber-500",
};

// List for the To do card -> array, false (no flag / no Auth session — hide the card) or null (couldn't load).
// pages/me.js calls this when /me first loads, so the card is ready before To do is opened. No auto-checks here.
export const fetchMyInductions = async () => {
  try {
    const { status, body } = await api("/api/inductions/list");
    if (status === 0 || status === 401 || status === 403) return false;
    if (status !== 200) throw new Error(body?.error || "Couldn't load inductions");
    return body.inductions || [];
  } catch (err) {
    console.error("[my-inductions]", err);
    return null;
  }
};

// initial: the list preloaded by pages/me.js (shown at once; refreshed quietly on mount and on Back)
export function MyInductionsSection({ initial }) {
  const [list, setList] = useState(initial ?? null); // null = loading, false = hidden (no flag / not available)
  const [error, setError] = useState("");
  const [open, setOpenRow] = useState(null); // the list row tapped (its header shows while the detail loads)

  const loadList = async () => {
    const l = await fetchMyInductions();
    if (l === null) { setError("Couldn't load inductions"); setList((x) => x || []); return; }
    setList(l);
    setError("");
  };

  useEffect(() => { if (initial !== undefined && initial !== null) setList(initial); }, [initial]);
  useEffect(() => { loadList(); }, []);

  if (list === false || list === null) return null;

  if (open) {
    return <InductionDetail id={open.id} preview={open} onBack={() => { setOpenRow(null); loadList(); }} />;
  }

  return (
    <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-2">
      <div className="text-base font-semibold text-gray-800">Inductions</div>
      {error && <p className="text-sm text-red-500">{error}</p>}
      {list.length === 0 ? (
        <p className="text-sm text-gray-500">No one is being inducted right now.</p>
      ) : (
        <div className="divide-y">
          {list.map((i) => (
            <button
              key={i.id}
              type="button"
              onClick={() => setOpenRow(i)}
              style={{ touchAction: "manipulation" }}
              className="w-full flex items-center justify-between gap-2 py-3 text-left"
            >
              <span className="text-sm text-gray-700">
                <span className="font-medium text-gray-800">{i.name}</span>
                {i.role ? ` · ${i.role}` : ""} · {i.done} of {i.total} · due {dayMonth(i.due_date)}
              </span>
              <span className="text-gray-400">›</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

function InductionDetail({ id, preview, onBack }) {
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");          // "signoff" while signing off
  const [saving, setSaving] = useState(new Set()); // line ids with a save in flight (their buttons are disabled)
  const [loadingFull, setLoadingFull] = useState(false);
  const [checking, setChecking] = useState(false); // background auto-checks running
  const [open, setOpen] = useState({});

  // Saved lines first (fast), then the auto-checks in the background — only when opened and on Refresh, never after a tap
  const load = async () => {
    setLoadingFull(true);
    let ok = false;
    try {
      const { status, body } = await api(`/api/inductions/detail?id=${encodeURIComponent(id)}`);
      if (status !== 200) throw new Error(body?.error || "Couldn't load this induction");
      setData(body);
      setError("");
      ok = true;
    } catch (err) {
      setError(err?.message || String(err));
    }
    setLoadingFull(false);
    if (ok) runAutoChecks();
  };

  const runAutoChecks = async () => {
    setChecking(true);
    try {
      const { status, body } = await api("/api/inductions/auto-check", { id });
      if (status === 200) {
        if (body.changed?.length) replaceItems(body.changed);
        setData((d) => (d ? { ...d, induction: { ...d.induction, done: body.done } } : d));
      }
    } catch (err) {
      console.error("[induction auto-check]", err); // lines already shown from saved data
    }
    setChecking(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [id]);

  // Swap lines in state; the header count moves with them (it also covers Office use lines /me doesn't get)
  const replaceItems = (updated) => setData((d) => {
    if (!d) return d;
    const byId = new Map(updated.map((u) => [u.id, u]));
    const items = d.items.map((i) => (byId.has(i.id) ? { ...i, ...byId.get(i.id) } : i));
    const delta = items.filter((i) => i.result).length - d.items.filter((i) => i.result).length;
    return { ...d, items, induction: { ...d.induction, done: d.induction.done + delta } };
  });
  const setSavingIds = (ids, on) => setSaving((s) => {
    const n = new Set(s);
    ids.forEach((x) => (on ? n.add(x) : n.delete(x)));
    return n;
  });

  // Optimistic save: show the change now, save in the background, put the line(s) back if it fails
  const saveOptimistic = async (before, guess, path, payload, pickSaved) => {
    const ids = before.map((i) => i.id);
    setError("");
    setSavingIds(ids, true);
    replaceItems(guess);
    try {
      const { status, body } = await api(path, payload);
      if (status !== 200) throw new Error(body?.error || "Couldn't save");
      replaceItems(pickSaved(body));
    } catch (err) {
      replaceItems(before);
      setError(err?.message || String(err));
    }
    setSavingIds(ids, false);
  };

  const signedByMe = (item, result) => (result
    ? { ...item, result, signed_via: "me", signer: data?.me?.name || "", signed_at: new Date().toISOString() }
    : { ...item, result: null, signed_via: null, signer: null, signed_at: null });

  const answer = (item, a) => {
    if (saving.has(item.id)) return; // no double saves
    const result = item.result === a ? null : a;
    saveOptimistic([item], [signedByMe(item, result)], "/api/inductions/answer", { itemId: item.id, result }, (b) => [b.item]);
  };
  const saveNote = (item, note) => {
    if (saving.has(item.id)) return;
    saveOptimistic([item], [{ ...item, note: note || null }], "/api/inductions/answer", { itemId: item.id, result: item.result, note }, (b) => [b.item]);
  };
  const markSection = () => {
    const rows = (data?.items || []).filter((i) => i.section === "start" && !i.result && !i.blocked && !saving.has(i.id)
      && (i.allowed_answers || ["done"]).includes("done"));
    if (!rows.length) return;
    saveOptimistic(rows, rows.map((i) => signedByMe(i, "done")), "/api/inductions/mark-section",
      { inductionId: id, section: "start" }, (b) => b.items || []);
  };
  const signOff = async () => {
    if (!window.confirm("Sign off this induction as supervisor? It will be closed and filed.")) return;
    setBusy("signoff");
    setError("");
    try {
      const { status, body } = await api("/api/inductions/sign-off", { id, as: "me" });
      if (status !== 200) throw new Error(body?.error || "Couldn't sign off");
      onBack(); // signed off — no longer in the list
      return;
    } catch (err) {
      setError(err?.message || String(err));
    }
    setBusy("");
  };

  const back = (
    <button type="button" onClick={onBack} style={{ touchAction: "manipulation" }} className="text-sm font-medium text-blue-600 min-h-[44px]">
      ‹ Inductions
    </button>
  );

  if (!data) {
    // Shown the moment the row is tapped: the header from the list, grey placeholders for the sections
    return (
      <div className="space-y-3">
        <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-1">
          {back}
          {preview && <div className="text-base font-semibold text-gray-800">{preview.name}</div>}
          {preview && <div className="text-sm text-gray-600">{preview.role} · {preview.done} of {preview.total} · due {dayMonth(preview.due_date)}</div>}
          {error ? <p className="text-sm text-red-500 pt-1">{error}</p> : <p className="text-sm text-gray-400 pt-1">Loading…</p>}
        </div>
        {!error && [0, 1, 2, 3].map((k) => (
          <div key={k} className="bg-white rounded-2xl shadow-sm border px-5 py-4 animate-pulse">
            <div className="h-3.5 w-1/2 bg-gray-200 rounded" />
          </div>
        ))}
      </div>
    );
  }

  const { induction: ind, items } = data;

  return (
    <div className="space-y-3">
      <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-1">
        {back}
        <div className="text-base font-semibold text-gray-800">{ind.name}</div>
        <div className="text-sm text-gray-600">{ind.role}{ind.is_student ? " (student)" : ""}</div>
        <div className="text-sm text-gray-600">Started {fmtDateShort(ind.start_date)} · complete by {fmtDateShort(ind.due_date)}</div>
        <div className="text-sm text-gray-600">Supervisor: {ind.supervisor || "—"}</div>
        <div className="flex items-center justify-between gap-2 pt-1">
          <span className="text-sm font-medium text-gray-800">{ind.done} of {ind.total} done</span>
          <span className="flex items-center gap-2">
            {checking && <span className="text-xs text-gray-400">checking…</span>}
            <button type="button" onClick={load} disabled={loadingFull || checking || saving.size > 0} style={{ touchAction: "manipulation" }} className="text-sm text-blue-600 min-h-[36px] disabled:opacity-40">
              {loadingFull ? "Refreshing…" : "Refresh"}
            </button>
          </span>
        </div>
        {error && <p className="text-sm text-red-500 pt-1">{error}</p>}
      </div>

      {data.signOff && (
        <div className="bg-white rounded-2xl shadow-sm border p-5 space-y-2">
          <div className="text-sm font-semibold text-gray-800">Supervisor sign-off</div>
          {!data.signOff.ready ? (
            <ul className="text-sm text-gray-500 list-disc pl-5">
              {data.signOff.missing.map((m) => <li key={m}>{m}</li>)}
            </ul>
          ) : !data.signOff.employee_confirmed_at ? (
            <p className="text-sm text-gray-500">Ready — waiting for {ind.name} to confirm their induction on the kiosk.</p>
          ) : (
            <p className="text-sm text-green-700">{ind.name} confirmed on the kiosk {fmtDateShort(perthDateOf(data.signOff.employee_confirmed_at))}.</p>
          )}
          <button
            type="button"
            onClick={signOff}
            disabled={!data.signOff.ready || !data.signOff.employee_confirmed_at || !!busy}
            style={{ touchAction: "manipulation" }}
            className="w-full min-h-[48px] rounded-xl bg-blue-600 text-white text-sm font-semibold disabled:opacity-40"
          >
            {busy === "signoff" ? "Signing off…" : "Sign off as supervisor"}
          </button>
        </div>
      )}

      {ME_SECTIONS.map((section) => {
        const rows = items.filter((i) => i.section === section.key);
        if (!rows.length) return null;
        const p = inductionProgress(rows);
        const isOpen = !!open[section.key];
        const readOnly = section.key === "3";
        const canMark = section.markAll && rows.some((i) => !i.result && !i.blocked);
        const groups = [];
        for (const r of rows) {
          const last = groups[groups.length - 1];
          if (last && last.heading === (r.group_heading || "")) last.rows.push(r);
          else groups.push({ heading: r.group_heading || "", rows: [r] });
        }
        return (
          <div key={section.key} className="bg-white rounded-2xl shadow-sm border">
            <button
              type="button"
              onClick={() => setOpen((o) => ({ ...o, [section.key]: !o[section.key] }))}
              style={{ touchAction: "manipulation" }}
              className="w-full flex items-center justify-between gap-2 px-5 py-4 text-left"
            >
              <span>
                <span className="block text-sm font-semibold text-gray-800">{section.title}</span>
                {section.sub && <span className="block text-xs text-gray-400">{section.sub}</span>}
              </span>
              <span className="flex items-center gap-2 shrink-0">
                <span className={`text-xs ${p.done === p.total ? "text-green-700 font-medium" : "text-gray-500"}`}>{p.done} of {p.total}</span>
                <span className="text-gray-400 text-xs">{isOpen ? "▲" : "▼"}</span>
              </span>
            </button>
            {isOpen && (
              <div className="border-t px-5 py-3 space-y-4">
                {readOnly ? (
                  <p className="text-sm text-gray-500">Policies are read by the new starter — {p.done} of {p.total} done.</p>
                ) : (
                  <>
                    {groups.map((g) => (
                      <div key={g.heading || "_"} className="space-y-1">
                        {g.heading && <div className="text-[11px] font-semibold text-gray-500 uppercase">{g.heading}</div>}
                        <div className="divide-y">
                          {g.rows.map((item) => (
                            <MeItemRow key={item.id} item={item} busy={saving.has(item.id)} onAnswer={answer} onNote={saveNote} />
                          ))}
                        </div>
                      </div>
                    ))}
                    {canMark && (
                      <button
                        type="button"
                        onClick={markSection}
                        disabled={rows.some((i) => saving.has(i.id))}
                        style={{ touchAction: "manipulation" }}
                        className="w-full min-h-[44px] rounded-xl border border-green-300 text-sm font-medium text-green-700 disabled:opacity-40"
                      >
                        Mark section done
                      </button>
                    )}
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function MeItemRow({ item, busy, onAnswer, onNote }) {
  const [editing, setEditing] = useState(false);
  const [note, setNote] = useState(item.note || "");
  useEffect(() => { setNote(item.note || ""); }, [item.note]);

  const needsPharmacist = item.blocked && item.pharmacist_only && !item.result;
  const lockedAnswer = item.blocked && item.result; // answered by someone else (or Admin)
  const canEdit = !item.blocked;
  const who = item.signed_via === "me" ? item.signer || "Staff" : item.signed_via === "admin" ? "Admin" : item.signed_via || "";
  const status = item.result
    ? `${answerLabel(item.result, item.section)} · ${who}${item.signed_at && item.signed_via !== "auto" ? ` · ${dayMonth(perthDateOf(item.signed_at))}` : ""}`
    : "";
  const answers = item.allowed_answers?.length ? item.allowed_answers : ["done", "na"];

  const saveNote = () => {
    setEditing(false);
    const v = note.trim();
    if (v !== (item.note || "")) onNote(item, v);
  };

  return (
    <div className={`py-3 ${needsPharmacist ? "opacity-60" : ""}`}>
      <div className="text-sm text-gray-700">
        {item.wording}
        {item.pharmacist_only && <span className="ml-1.5 text-[10px] px-1.5 py-0.5 rounded bg-blue-50 text-blue-700 border border-blue-100 align-middle">Pharmacist</span>}
      </div>
      {needsPharmacist && <div className="text-xs text-gray-500 mt-1">Needs a pharmacist</div>}
      {lockedAnswer && <div className="text-xs text-gray-500 mt-1">{status}</div>}
      {canEdit && (
        <>
          <div className="flex gap-2 mt-2">
            {answers.map((a) => (
              <button
                key={a}
                type="button"
                disabled={busy}
                onClick={() => onAnswer(item, a)}
                style={{ touchAction: "manipulation" }}
                className={`flex-1 min-h-[40px] rounded-xl border text-sm font-medium ${item.result === a ? ANSWER_STYLE[a] : "bg-white text-gray-600 border-gray-300 disabled:opacity-50"}`}
              >
                {answerLabel(a, item.section)}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-xs">
            {item.result && <div className="text-gray-500">{status} · tap again to undo</div>}
            {editing ? (
              <input
                autoFocus
                value={note}
                onChange={(e) => setNote(e.target.value)}
                onBlur={saveNote}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                placeholder={item.note_hint || "Note"}
                className="mt-1 w-full border rounded-lg px-3 py-2 text-base"
              />
            ) : item.note ? (
              <button type="button" onClick={() => setEditing(true)} className="mt-1 text-gray-600 italic text-left">“{item.note}”</button>
            ) : (
              <button type="button" onClick={() => setEditing(true)} className="mt-1 text-gray-400 min-h-[32px]">+ {item.note_hint ? item.note_hint.toLowerCase() : "note"}</button>
            )}
          </div>
        </>
      )}
      {!canEdit && item.note && <div className="text-xs text-gray-600 italic mt-1">“{item.note}”</div>}
    </div>
  );
}
