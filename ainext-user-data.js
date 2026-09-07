/* Ainext user persistence — save profile through a protected Supabase RPC */
(() => {
  const USER_SYNCED = 'ainext_user_synced_v5';
  const WARNING_NEEDLES = [
    'เรียก API ของผู้ให้บริการโดยตรงจากเบราว์เซอร์',
    'คีย์ API จะถูกเก็บไว้ใน Local Storage',
    'หากนำไปใช้งานจริงในวงกว้าง แนะนำให้ทำ Backend Proxy',
    'หลีกเลี่ยงปัญหา CORS จากผู้ให้บริการบางราย'
  ];

  const getClientId = () => localStorage.getItem('ainext_client_id') || '';
  const textValue = selector => (document.querySelector(selector)?.textContent || '').replace(/\s+/g,' ').trim();

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

    const displayName = authUser?.user_metadata?.display_name || textValue('.user-name') || textValue('[data-user-name]') || 'ผู้ใช้งาน Ainext';
    const role = textValue('.user-role') || textValue('[data-user-role]') || 'user';
    const email = authUser?.email || document.querySelector('[data-user-email]')?.textContent?.trim() || null;
    const avatarUrl = authUser?.user_metadata?.avatar_url || null;
    const id = authUser?.id || null;

    const { data, error } = await api.db.rpc('ainext_save_user_profile', {
      p_id: id,
      p_client_id: clientId,
      p_email: email,
      p_display_name: displayName,
      p_role: role,
      p_avatar_url: avatarUrl
    });

    if (error) {
      console.warn('Ainext user profile sync failed:', error.message);
      return null;
    }

    const user = Array.isArray(data) ? data[0] : data;
    if (!user?.id) return null;

    localStorage.setItem(USER_SYNCED, user.id);
    api.userId = user.id;
    api.user = { id:user.id, displayName:user.display_name, role:user.role, email:user.email, avatarUrl:user.avatar_url };
    if (api.state) api.state.userId = user.id;
    return user.id;
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