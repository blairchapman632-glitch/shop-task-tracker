// Browser side of /api/qspp/register (incidents & feedback saves). manager = { id, name, pin } while QSPP manager mode
// is unlocked (the PIN is only ever held in memory) — manager requests send the PIN so the server can re-check it.
export async function qsppCall(body) {
  const res = await fetch("/api/qspp/register", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const out = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(out.error || `Something went wrong (${res.status})`);
  return out;
}
