// Admin → Settings → Calendar categories (kiosk "What's on"): name, colour, manager-only, order, active, and
// "Shade the day" (calendar_categories.shade_ranges — tint vs dot for every item in the category; lib/calendar.js dayMarks).
// Categories are switched off (Active), never deleted, so events always keep theirs. The built-in ones keep their
// key: 'closure' (public holidays show under it) and 'staff' (birthdays / anniversaries).
import { useEffect, useState } from "react";
import supabase from "../lib/supabaseClient";
import { loadCategories } from "../lib/calendar";

const BUILT_IN = { closure: "Public holidays show under this one", staff: "Birthdays and work anniversaries show under this one" };

export default function CalendarCategoriesAdmin({ pharmacyId }) {
  const [cats, setCats] = useState(null);
  const [error, setError] = useState("");
  const [savingId, setSavingId] = useState(null);
  const [adding, setAdding] = useState({ name: "", colour: "#2563eb" });

  const load = () => loadCategories(supabase, pharmacyId).then(setCats).catch((e) => setError(e.message));
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [pharmacyId]);

  const save = async (c, patch) => {
    setSavingId(c.id);
    setError("");
    const { error: err } = await supabase.from("calendar_categories").update(patch).eq("id", c.id);
    setSavingId(null);
    if (err) { setError("Couldn't save: " + err.message); return; }
    setCats((cs) => cs.map((x) => (x.id === c.id ? { ...x, ...patch } : x)));
  };
  const move = async (i, dir) => {
    const j = i + dir;
    if (j < 0 || j >= cats.length) return;
    const order = [...cats];
    [order[i], order[j]] = [order[j], order[i]];
    await Promise.all(order.map((c, k) => supabase.from("calendar_categories").update({ sort_order: (k + 1) * 10 }).eq("id", c.id)));
    load();
  };
  const add = async () => {
    if (!adding.name.trim()) return;
    const { error: err } = await supabase.from("calendar_categories").insert([{
      pharmacy_id: pharmacyId, name: adding.name.trim(), colour: adding.colour, sort_order: ((cats?.length || 0) + 1) * 10,
    }]);
    if (err) { setError("Couldn't add: " + err.message); return; }
    setAdding({ name: "", colour: "#2563eb" });
    load();
  };

  return (
    <div>
      <h3 className="text-sm font-semibold text-gray-700 mb-1">Calendar categories</h3>
      <p className="text-xs text-gray-400 mb-3">The colours on the kiosk "What's on" calendar. Switch a category off instead of deleting it — its events keep showing (in grey). Manager-only categories need the admin PIN to use.</p>
      {error && <p className="text-xs text-red-500 mb-2">{error}</p>}
      {cats === null ? <p className="text-xs text-gray-400">Loading…</p> : (
        <div className="border rounded-lg divide-y">
          {cats.map((c, i) => (
            <div key={c.id} className={`flex items-center gap-2 px-3 py-2 ${c.active === false ? "opacity-50" : ""}`}>
              <div className="flex flex-col">
                <button onClick={() => move(i, -1)} className="text-[10px] text-gray-400 hover:text-gray-700">▲</button>
                <button onClick={() => move(i, 1)} className="text-[10px] text-gray-400 hover:text-gray-700">▼</button>
              </div>
              {/* colour shown as you pick, saved when the picker closes */}
              <input type="color" value={c.colour}
                onChange={(e) => { const v = e.target.value; setCats((cs) => cs.map((x) => (x.id === c.id ? { ...x, colour: v } : x))); }}
                onBlur={(e) => save(c, { colour: e.target.value })}
                className="w-8 h-8 rounded border" title="Colour" />
              <div className="flex-1 min-w-0">
                <input
                  defaultValue={c.name}
                  onBlur={(e) => { const v = e.target.value.trim(); if (v && v !== c.name) save(c, { name: v }); else e.target.value = c.name; }}
                  className="w-full border rounded px-2 py-1 text-sm"
                />
                {BUILT_IN[c.key] && <div className="text-[10px] text-gray-400 mt-0.5">{BUILT_IN[c.key]}</div>}
                <label className="mt-1 flex items-start gap-1.5 text-xs text-gray-600">
                  <input type="checkbox" className="mt-0.5" checked={c.shade_ranges !== false} onChange={(e) => save(c, { shade_ranges: e.target.checked })} />
                  <span>
                    Shade the day
                    <span className="block text-[10px] text-gray-400">On: days with this category are shaded on the calendar. Off: they show as a dot. If two shaded categories fall on the same day, the one higher in this list is shaded and the other shows as a dot.</span>
                  </span>
                </label>
              </div>
              <label className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                <input type="checkbox" checked={!!c.manager_only} onChange={(e) => save(c, { manager_only: e.target.checked })} /> Manager only
              </label>
              <label className="flex items-center gap-1 text-xs text-gray-600 shrink-0">
                <input type="checkbox" checked={c.active !== false} onChange={(e) => save(c, { active: e.target.checked })} /> Active
              </label>
              {savingId === c.id && <span className="text-[10px] text-gray-400">…</span>}
            </div>
          ))}
          <div className="flex items-center gap-2 px-3 py-2 bg-gray-50">
            <input type="color" value={adding.colour} onChange={(e) => setAdding((a) => ({ ...a, colour: e.target.value }))} className="w-8 h-8 rounded border" />
            <input value={adding.name} onChange={(e) => setAdding((a) => ({ ...a, name: e.target.value }))} placeholder="New category, e.g. Training" className="flex-1 border rounded px-2 py-1 text-sm" />
            <button onClick={add} disabled={!adding.name.trim()} className="px-3 py-1.5 text-xs bg-blue-600 text-white rounded disabled:opacity-40">+ Add</button>
          </div>
        </div>
      )}
    </div>
  );
}
