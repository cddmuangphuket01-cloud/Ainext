/* Ainext user persistence — database profile + safe client identity sync */
(() => {
  const USER_SYNCED = 'ainext_user_synced_v4';
  const WARNING_NEEDLES = [
    'เรียก API ของผู้ให้บริการโดยตรงจากเบราว์เซอร์',
    'คีย์ API จะถูกเก็บไว้ใน Local Storage',
    'หากนำไปใช้งานจริงในวงกว้าง แนะนำให้ทำ Backend Proxy',
    'หลีกเลี่ยงปัญหา CORS จากผู้ให้บริการบางราย'
  ];

  const getClientId = () => localStorage.getItem('ainext_client_id') || '';
  const textValue = selector => (document.querySelector(selector)?.textContent || '').replace(/\s+/g,' ').trim();

  async function uuidFromClientId(clientId) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientId)));
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = [...bytes.slice(0,16)].map(b => b.toString(16).padStart(2,'0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
  }

  function removeLegacyNotice() {
    document.querySelectorAll('body *').forEach(el => {
      if (el.id === 'ainext-history' || el.closest('#ainext-history')) return;
      const text = (el.textContent || '').trim();
      if (!text || !WARNING_NEEDLES.some(n => text.includes(n)) || el.children.length > 0) return;
      const parent = el.parentElement;
      if (parent && parent.children.length <= 2 && (parent.textContent || '').length < 700) parent.remove();
      else el.remove();
    });
  }

  async function syncUser() {
    const api = window.AinextSupabase;
    const clientId = getClientId();
    if (!api?.db || !clientId) return null;

    let authUser = null;
    try { authUser = (await api.db.auth.getUser()).data?.user || null; } catch (_) {}

    const deterministicId = await uuidFromClientId(clientId);
    const preferredId = authUser?.id || deterministicId;
    const displayName = authUser?.user_metadata?.display_name || textValue('.user-name') || textValue('[data-user-name]') || 'ผู้ใช้งาน Ainext';
    const role = textValue('.user-role') || textValue('[data-user-role]') || 'user';
    const email = authUser?.email || document.querySelector('[data-user-email]')?.textContent?.trim() || null;
    const avatarUrl = authUser?.user_metadata?.avatar_url || null;

    // Never rely on PostgREST ON CONFLICT inference here. client_id is a partial
    // unique index and old rows may have been created with a different id.
    let existing = null;
    try {
      const byClient = await api.db.from('ai_users').select('id,client_id').eq('client_id', clientId).maybeSingle();
      if (!byClient.error && byClient.data) existing = byClient.data;
    } catch (_) {}

    // If the browser identity is new but Auth is already signed in, also check
    // the Auth user id before inserting a second profile row.
    if (!existing && authUser?.id) {
      try {
        const byAuth = await api.db.from('ai_users').select('id,client_id').eq('id', authUser.id).maybeSingle();
        if (!byAuth.error && byAuth.data) existing = byAuth.data;
      } catch (_) {}
    }

    const userId = existing?.id || preferredId;
    const payload = {
      id: userId,
      client_id: clientId,
      email,
      display_name: displayName.slice(0,200),
      role: role.slice(0,100),
      avatar_url: avatarUrl,
      updated_at: new Date().toISOString()
    };

    let error = null;
    if (existing) {
      // Update by primary key so a client-id collision can never create a second row.
      ({ error } = await api.db.from('ai_users').update(payload).eq('id', existing.id));
    } else {
      ({ error } = await api.db.from('ai_users').insert(payload));
    }

    if (error) {
      console.warn('Ainext user profile sync failed:', error.message);
      return null;
    }

    // Link legacy records to the resolved profile. Do this after the profile
    // exists so RLS can evaluate user ownership consistently.
    const tables = ['ai_conversations','ai_usage','ai_documents','ai_messages'];
    for (const table of tables) {
      try {
        await api.db.from(table).update({ user_id: userId }).eq('client_id', clientId).is('user_id', null);
      } catch (_) {}
    }

    localStorage.setItem(USER_SYNCED, userId);
    api.userId = userId;
    api.user = { id:userId, displayName, role, email, avatarUrl };
    if (api.state) api.state.userId = userId;
    return userId;
  }

  function hookCallAI() {
    const api = window.AinextSupabase;
    if (!api || typeof window.callAI !== 'function' || window.callAI.__ainextUserHook) return !!api;
    const original = window.callAI;
    const wrapped = async function(...args) {
      try { await syncUser(); } catch (e) { console.warn('Ainext user sync:', e); }
      return original.apply(this,args);
    };
    wrapped.__ainextUserHook = true;
    window.callAI = wrapped;
    return true;
  }

  async function start() {
    removeLegacyNotice();
    let tries = 0;
    const timer = setInterval(async () => {
      removeLegacyNotice();
      if (hookCallAI()) {
        try { await syncUser(); } catch (e) { console.warn('Ainext user sync:', e); }
        if (++tries > 5) clearInterval(timer);
      } else if (++tries > 50) clearInterval(timer);
    }, 500);
    const observer = new MutationObserver(removeLegacyNotice);
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    setTimeout(() => observer.disconnect(), 30000);
  }

  window.AinextSyncUser = syncUser;
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
  else start();
})();
