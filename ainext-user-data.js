/* Ainext user persistence + remove browser API-key notice */
(() => {
  const USER_SYNCED = 'ainext_user_synced_v1';
  const WARNING_TEXT = 'เรียก API ของผู้ให้บริการโดยตรงจากเบราว์เซอร์';

  function getClientId() {
    return localStorage.getItem('ainext_client_id') || '';
  }

  async function uuidFromClientId(clientId) {
    const bytes = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(clientId)));
    bytes[6] = (bytes[6] & 0x0f) | 0x50;
    bytes[8] = (bytes[8] & 0x3f) | 0x80;
    const h = [...bytes.slice(0,16)].map(b => b.toString(16).padStart(2,'0')).join('');
    return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20,32)}`;
  }

  function textValue(selector) {
    const el = document.querySelector(selector);
    return (el?.textContent || '').replace(/\s+/g,' ').trim();
  }

  function removeBrowserApiNotice() {
    const needles = [
      WARNING_TEXT,
      'คีย์ API จะถูกเก็บไว้ใน Local Storage',
      'หากนำไปใช้งานจริงในวงกว้าง แนะนำให้ทำ Backend Proxy',
      'หลีกเลี่ยงปัญหา CORS จากผู้ให้บริการบางราย'
    ];
    const all = document.querySelectorAll('body *');
    all.forEach(el => {
      if (el.id === 'ainext-history' || el.closest('#ainext-history')) return;
      const text = (el.textContent || '').trim();
      if (text && needles.some(n => text.includes(n)) && el.children.length === 0) {
        const parent = el.parentElement;
        if (parent && parent.children.length <= 2 && (parent.textContent || '').length < 600) parent.remove();
        else el.remove();
      }
    });
  }

  async function syncUser() {
    const api = window.AinextSupabase;
    const clientId = getClientId();
    if (!api?.db || !clientId) return;
    const userId = await uuidFromClientId(clientId);
    const displayName = textValue('.user-name') || textValue('[data-user-name]') || 'ผู้ใช้งาน Ainext';
    const role = textValue('.user-role') || textValue('[data-user-role]') || 'user';

    const { error: userError } = await api.db.from('ai_users').upsert({
      id: userId,
      display_name: displayName.slice(0,200),
      role: role.slice(0,100),
      updated_at: new Date().toISOString()
    }, { onConflict: 'id' });
    if (userError) {
      console.warn('Ainext user profile sync failed:', userError.message);
      return;
    }

    await Promise.all([
      api.db.from('ai_conversations').update({ user_id: userId }).eq('client_id', clientId).is('user_id', null),
      api.db.from('ai_messages').update({}).eq('client_id', clientId),
      api.db.from('ai_usage').update({ user_id: userId }).eq('client_id', clientId).is('user_id', null)
    ]);

    // Messages table has no user_id column in the current schema; ownership is linked through conversation_id/client_id.
    localStorage.setItem(USER_SYNCED, userId);
    api.user = { id: userId, displayName, role };
  }

  function hookCallAI() {
    const api = window.AinextSupabase;
    if (!api || typeof window.callAI !== 'function' || window.callAI.__ainextUserHook) return !!api;
    const original = window.callAI;
    const wrapped = async function(...args) {
      const result = await original.apply(this, args);
      try { await syncUser(); } catch (e) { console.warn('Ainext user sync:', e); }
      return result;
    };
    wrapped.__ainextUserHook = true;
    window.callAI = wrapped;
    return true;
  }

  function start() {
    removeBrowserApiNotice();
    let tries = 0;
    const timer = setInterval(async () => {
      removeBrowserApiNotice();
      if (hookCallAI()) {
        try { await syncUser(); } catch (e) { console.warn('Ainext user sync:', e); }
        if (++tries > 5) clearInterval(timer);
      } else if (++tries > 40) clearInterval(timer);
    }, 500);

    const observer = new MutationObserver(() => removeBrowserApiNotice());
    observer.observe(document.body, { childList:true, subtree:true, characterData:true });
    setTimeout(() => observer.disconnect(), 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once:true });
  else start();
})();
