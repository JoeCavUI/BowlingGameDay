/* ☁️ Bowling Tool cloud backup (Netlify Identity + the /api/backup function).
   - Your data still lives on this phone and the app works offline exactly as before.
   - Signed in, the app can copy your backup to the cloud (after each saved night, or when you tap Back up now)
     and bring it back on a new phone.
   - The sign-in session is kept under a non-"bt_" key, so it is never written into a backup file. */
(function (root) {
  const ID = '/.netlify/identity', API = '/api/backup';
  const SKEY = 'btc_session_v1', MKEY = 'btc_meta_v1';
  const BT = () => root.BT;
  const get = (k, d) => { try { const v = JSON.parse(localStorage.getItem(k) || 'null'); return v == null ? d : v; } catch (_e) { return d; } };
  const set = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, JSON.stringify(v)); } catch (_e) {} };
  const session = () => get(SKEY, null);
  const meta = () => get(MKEY, {}) || {};
  const setMeta = (p) => set(MKEY, Object.assign(meta(), p));

  function friendly(e, fallback) {
    const m = String((e && (e.msg || e.error_description || e.error || e.message)) || '');
    if (/Failed to fetch|NetworkError|Load failed/i.test(m)) return 'No connection. Try again when you have Wi-Fi or signal.';
    if (/invalid_grant|Invalid Password|No user found/i.test(m)) return 'That email and password don\'t match.';
    if (/Email not confirmed/i.test(m)) return 'Confirm your email first: tap the link we sent you.';
    if (/already.*registered|exists/i.test(m)) return 'That email already has an account. Sign in instead.';
    if (/Signups not allowed|disabled/i.test(m)) return 'Sign-ups are turned off for this app. Ask whoever gave you the app for an invite.';
    if (/Identity.*not.*enabled|404/i.test(m)) return 'Cloud backup isn\'t switched on for this site yet.';
    return m || fallback || 'Something went wrong.';
  }
  async function call(path, opts) {
    const r = await fetch(path, opts);
    let body = null; try { body = await r.json(); } catch (_e) {}
    if (!r.ok) { const e = new Error(friendly(body || { message: String(r.status) })); e.status = r.status; throw e; }
    return body;
  }
  function saveTokens(t, email) {
    if (!t || !t.access_token) throw new Error('Sign-in failed.');
    set(SKEY, { access: t.access_token, refresh: t.refresh_token || '', exp: Date.now() + (Number(t.expires_in) || 3600) * 1000 - 60000, email: email || (session() || {}).email || '' });
  }
  async function token() {
    const s = session(); if (!s) return null;
    if (Date.now() < s.exp) return s.access;
    if (!s.refresh) return null;
    try {
      const t = await call(`${ID}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'refresh_token', refresh_token: s.refresh }).toString() });
      saveTokens(t, s.email); return session().access;
    } catch (e) { if (e.status === 400 || e.status === 401) set(SKEY, null); throw e; }
  }
  async function whoami() { const t = await token(); if (!t) return null; const u = await call(`${ID}/user`, { headers: { authorization: `Bearer ${t}` } }); const s = session(); if (s && u && u.email) { s.email = u.email; set(SKEY, s); } return u; }

  async function signUp(email, password) {
    email = String(email || '').trim();
    if (!/^\S+@\S+\.\S+$/.test(email)) throw new Error('Enter a real email address.');
    if (String(password || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    const u = await call(`${ID}/signup`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
    // Autoconfirm sites sign you straight in; otherwise an email link confirms the account.
    if (u && u.confirmed_at) { await signIn(email, password); return { signedIn: true }; }
    return { confirm: true };
  }
  async function signIn(email, password) {
    email = String(email || '').trim();
    const t = await call(`${ID}/token`, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams({ grant_type: 'password', username: email, password: String(password || '') }).toString() });
    saveTokens(t, email); return true;
  }
  async function signOut() {
    const s = session();
    if (s) { try { await fetch(`${ID}/logout`, { method: 'POST', headers: { authorization: `Bearer ${s.access}` } }); } catch (_e) {} }
    set(SKEY, null); set(MKEY, null);
  }
  async function forgot(email) { await call(`${ID}/recover`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: String(email || '').trim() }) }); return true; }
  async function setPassword(password) {
    if (String(password || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    const t = await token(); if (!t) throw new Error('Sign in again.');
    await call(`${ID}/user`, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify({ password }) });
    return true;
  }
  // Email links land on Home as #confirmation_token=… or #recovery_token=…
  async function handleLink() {
    const h = new URLSearchParams(String(location.hash || '').replace(/^#/, ''));
    const type = h.has('confirmation_token') ? 'signup' : h.has('recovery_token') ? 'recovery' : h.has('invite_token') ? 'invite' : '';
    if (!type) return null;
    const tok = h.get('confirmation_token') || h.get('recovery_token') || h.get('invite_token');
    history.replaceState(null, '', location.pathname + '#data');
    if (type === 'invite') return { type, token: tok }; // needs a password first
    const t = await call(`${ID}/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok, type }) });
    saveTokens(t, ''); try { await whoami(); } catch (_e) {}
    return { type };
  }
  async function acceptInvite(tok, password) {
    if (String(password || '').length < 8) throw new Error('Use a password of at least 8 characters.');
    const t = await call(`${ID}/verify`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token: tok, type: 'signup', password }) });
    saveTokens(t, ''); try { await whoami(); } catch (_e) {}
    return true;
  }

  async function backupNow() {
    if (BT().isTestMode && BT().isTestMode()) throw new Error('Test mode data isn\'t backed up to the cloud.');
    const t = await token(); if (!t) throw new Error('Sign in to back up to the cloud.');
    const b = BT().buildBackup();
    const r = await call(API, { method: 'PUT', headers: { 'content-type': 'application/json', authorization: `Bearer ${t}` }, body: JSON.stringify(b) });
    setMeta({ lastUp: Date.parse(r.savedAt) || Date.now(), lastBytes: r.bytes || 0, lastErr: '' });
    return r;
  }
  async function cloudInfo(day) {
    const t = await token(); if (!t) throw new Error('Sign in first.');
    return call(API + (day ? `?day=${encodeURIComponent(day)}` : ''), { headers: { authorization: `Bearer ${t}` } });
  }
  // Replace this phone's data with the cloud copy (same rules as Restore from a backup file).
  async function restore(day) {
    const r = await cloudInfo(day); const b = r && r.backup;
    if (!b || b.app !== 'bowling-tool' || !b.data) throw new Error('No cloud backup yet.');
    const keys = Object.keys(b.data).filter(k => k.startsWith('bt_'));
    if (!keys.length) throw new Error('That cloud backup is empty.');
    BT().appDataKeys().forEach(k => localStorage.removeItem(k));
    keys.forEach(k => { const v = b.data[k]; localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); });
    setMeta({ lastDown: Date.now() });
    return { keys: keys.length, savedAt: r.savedAt || b.exportedAt || '' };
  }
  // After saving a night: back up quietly if signed in and auto is on. Never throws.
  async function autoBackup() {
    const m = meta(); if (!session() || m.auto === false) return { skipped: true };
    try { const r = await backupNow(); return { ok: true, r }; }
    catch (e) { setMeta({ lastErr: e.message || String(e), lastErrAt: Date.now() }); return { ok: false, error: e.message || String(e) }; }
  }
  function status() { const s = session(), m = meta(); return { signedIn: !!s, email: s ? s.email : '', auto: m.auto !== false, lastUp: m.lastUp || 0, lastErr: m.lastErr || '', lastErrAt: m.lastErrAt || 0 }; }
  function setAuto(on) { setMeta({ auto: !!on }); }

  root.BTCloud = { status, signUp, signIn, signOut, forgot, setPassword, handleLink, acceptInvite, backupNow, restore, cloudInfo, autoBackup, setAuto, whoami };
})(typeof window !== 'undefined' ? window : globalThis);
