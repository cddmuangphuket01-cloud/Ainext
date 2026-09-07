/* Ainext Supabase integration — database + Gemini Edge Function */
(() => {
  const SUPABASE_URL = 'https://yvfrsvqcgmzwgzflywdd.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_tI4p3UZO4In-fhY2vptCWQ_B3idNMJw';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ainext-chat`;

  const loadSupabase = () => new Promise((resolve, reject) => {
    if (window.supabase?.createClient) return resolve();
    const existing = document.querySelector('script[data-ainext-supabase]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', reject, { once: true });
      return;
    }
    const script = document.createElement('script');
    script.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    script.async = false;
    script.dataset.ainextSupabase = '1';
    script.onload = () => resolve();
    script.onerror = () => reject(new Error('โหลด Supabase client ไม่สำเร็จ'));
    document.head.appendChild(script);
  });

  const init = async () => {
    try {
      await loadSupabase();
      const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
      if (!db) throw new Error('สร้าง Supabase client ไม่สำเร็จ');

      const CLIENT_ID = localStorage.getItem('ainext_client_id') || crypto.randomUUID();
      localStorage.setItem('ainext_client_id', CLIENT_ID);
      const CONV_KEY = 'ainext_db_conversation_id';
      let dbConversationId = localStorage.getItem(CONV_KEY) || null;

      // Verify the database connection and expose its status for debugging/UI.
      const { error: healthError } = await db.from('ai_settings').select('key').limit(1);
      window.AinextSupabase = {
        url: SUPABASE_URL,
        functionUrl: FUNCTION_URL,
        clientId: CLIENT_ID,
        db,
        connected: !healthError,
        error: healthError?.message || null
      };
      if (healthError) console.error('Ainext Supabase connection error:', healthError);

      async function saveTurn(userMessage, assistantMessage) {
        try {
          if (!dbConversationId) {
            const { data, error } = await db.from('ai_conversations').insert({
              client_id: CLIENT_ID,
              title: String(userMessage).slice(0, 80) || 'การสนทนาใหม่',
              provider: 'google',
              model: 'gemini-2.0-flash'
            }).select('id').single();
            if (error) throw error;
            dbConversationId = data.id;
            localStorage.setItem(CONV_KEY, dbConversationId);
          }

          const { error } = await db.from('ai_messages').insert([
            { conversation_id: dbConversationId, client_id: CLIENT_ID, role: 'user', content: userMessage },
            { conversation_id: dbConversationId, client_id: CLIENT_ID, role: 'assistant', content: assistantMessage, model: 'gemini-2.0-flash' }
          ]);
          if (error) throw error;

          await db.from('ai_usage').insert({
            client_id: CLIENT_ID,
            conversation_id: dbConversationId,
            provider: 'google',
            model: 'gemini-2.0-flash',
            request_type: 'chat',
            status: 'success'
          });
        } catch (e) {
          console.error('Ainext DB save error:', e);
        }
      }

      const originalCallAI = window.callAI;
      if (typeof originalCallAI === 'function') {
        window.callAI = async function(providerKey, userMessage, priorMessages) {
          if (providerKey !== 'gemini') return originalCallAI(providerKey, userMessage, priorMessages);

          const response = await fetch(FUNCTION_URL, {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'apikey': SUPABASE_KEY,
              'Authorization': `Bearer ${SUPABASE_KEY}`
            },
            body: JSON.stringify({ messages: priorMessages || [], prompt: userMessage })
          });

          let data;
          try { data = await response.json(); } catch { data = {}; }
          if (!response.ok) throw new Error(data.error || `AI HTTP ${response.status}`);

          const text = data.text || '(ไม่มีคำตอบจากโมเดล)';
          await saveTurn(userMessage, text);
          return text;
        };
      } else {
        console.warn('Ainext: window.callAI not found when Supabase integration initialized.');
      }

      const originalNewChat = window.newChat;
      if (typeof originalNewChat === 'function') {
        window.newChat = function() {
          localStorage.removeItem(CONV_KEY);
          dbConversationId = null;
          return originalNewChat.apply(this, arguments);
        };
      }
    } catch (e) {
      console.error('Ainext Supabase initialization failed:', e);
      window.AinextSupabase = { url: SUPABASE_URL, functionUrl: FUNCTION_URL, connected: false, error: String(e?.message || e) };
    }
  };

  // Run after the page's original scripts have initialized.
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true });
  else setTimeout(init, 0);
})();
