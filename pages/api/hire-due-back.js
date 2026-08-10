export default async function handler(req, res) {
  try {
    const baseUrl = process.env.HIRE_BOOK_URL;
    const secret = process.env.HIRE_BOOK_SECRET;

    if (!baseUrl || !secret) {
      return res.status(500).json({ error: 'Missing Hire Book config', hires: [] });
    }

    const url = `${baseUrl}/api/due-back?secret=${encodeURIComponent(secret)}`;
    const r = await fetch(url);

    if (!r.ok) {
      return res.status(200).json({ error: `Hire Book returned ${r.status}`, hires: [] });
    }

    const data = await r.json();
    return res.status(200).json({ hires: data.hires || [] });
  } catch (e) {
    return res.status(200).json({ error: e?.message || 'Fetch failed', hires: [] });
  }
}