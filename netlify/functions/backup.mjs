// ☁️ Cloud backup for Bowling Tool.
// Each signed-in bowler (Netlify Identity) gets their own space in Netlify Blobs:
//   <userId>/latest          the newest backup
//   <userId>/day/<YYYY-MM-DD> one snapshot per day, the newest 14 kept
// GET  → the latest backup (or ?day=YYYY-MM-DD), plus the list of snapshots
// PUT  → save a backup (the same JSON the app's "Back up my data" file holds)
import { getStore } from '@netlify/blobs';

const MAX_BYTES = 5 * 1024 * 1024; // a backup is about 1 MB today
const KEEP_DAYS = 14;
const json = (body, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

// Who is calling? Ask Netlify Identity with the bowler's own token, so the function never trusts the app.
async function whoIs(req) {
  const auth = req.headers.get('authorization') || '';
  if (!/^Bearer\s+\S+/.test(auth)) return null;
  try {
    const r = await fetch(new URL('/.netlify/identity/user', req.url), { headers: { authorization: auth } });
    if (!r.ok) return null;
    const u = await r.json();
    return u && u.id ? { id: String(u.id), email: u.email || '' } : null;
  } catch (_e) { return null; }
}

export default async (req) => {
  const user = await whoIs(req);
  if (!user) return json({ error: 'Sign in again.' }, 401);
  const store = getStore({ name: 'bowling-backups', consistency: 'strong' });
  const base = `${user.id}/`;

  if (req.method === 'GET') {
    const day = new URL(req.url).searchParams.get('day');
    const key = day && /^\d{4}-\d{2}-\d{2}$/.test(day) ? `${base}day/${day}` : `${base}latest`;
    const [entry, list] = await Promise.all([store.getWithMetadata(key, { type: 'json' }), store.list({ prefix: `${base}day/` })]);
    const days = (list.blobs || []).map(b => b.key.slice(`${base}day/`.length)).sort().reverse();
    if (!entry) return json({ backup: null, days });
    return json({ backup: entry.data, savedAt: entry.metadata && entry.metadata.savedAt, days });
  }

  if (req.method === 'PUT' || req.method === 'POST') {
    const text = await req.text();
    if (text.length > MAX_BYTES) return json({ error: 'That backup is too big to store.' }, 413);
    let b; try { b = JSON.parse(text); } catch (_e) { return json({ error: 'Not a Bowling Tool backup.' }, 400); }
    if (!b || b.app !== 'bowling-tool' || !b.data || typeof b.data !== 'object') return json({ error: 'Not a Bowling Tool backup.' }, 400);
    const savedAt = new Date().toISOString(), day = savedAt.slice(0, 10);
    const meta = { metadata: { savedAt, version: String(b.version || ''), email: user.email } };
    await store.setJSON(`${base}latest`, b, meta);
    await store.setJSON(`${base}day/${day}`, b, meta);
    // Keep the newest KEEP_DAYS daily snapshots.
    const list = await store.list({ prefix: `${base}day/` });
    const old = (list.blobs || []).map(x => x.key).sort().reverse().slice(KEEP_DAYS);
    await Promise.all(old.map(k => store.delete(k)));
    return json({ ok: true, savedAt, bytes: text.length });
  }

  if (req.method === 'DELETE') {
    const list = await store.list({ prefix: base });
    await Promise.all((list.blobs || []).map(x => store.delete(x.key)));
    return json({ ok: true });
  }

  return json({ error: 'Method not allowed' }, 405);
};

export const config = { path: '/api/backup' };
