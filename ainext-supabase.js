/* Ainext Supabase integration — persistent chat history + Gemini */
(() => {
  const SUPABASE_URL = 'https://yvfrsvqcgmzwgzflywdd.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_tI4p3UZO4In-fhY2vptCWQ_B3idNMJw';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ainext-chat`;
  const MODEL = 'gemini-3.8-flash';
  const CLIENT_ID_KEY = 'ainext_client_id';
  const CONV_KEY = 'ainext_db_conversation_id';

  const esc = (s) => String(s ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const shortTitle = (s) => String(s || 'การสนทนาใหม่').replace(/\s+/g,' ').trim().slice(0, 55) || 'การสนทนาใหม่';

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

  function addStyles() {
    if (document.getElementById('ainext-history-style')) return;
    const style = document.createElement('style');
    style.id = 'ainext-history-style';
    style.textContent = `
      #ainext-history{position:fixed;left:0;top:0;bottom:0;width:285px;background:#fff;border-right:1px solid #e6ecf5;z-index:1000;transform:translateX(-100%);transition:.25s;box-shadow:8px 0 30px rgba(20,45,90,.12);display:flex;flex-direction:column;font-family:'Noto Sans Thai',system-ui,sans-serif}
      #ainext-history.open{transform:translateX(0)}
      .ah-head{height:70px;padding:14px 16px;border-bottom:1px solid #edf1f7;display:flex;align-items:center;gap:10px}
      .ah-title{font-size:16px;font-weight:800;color:#172b4d;flex:1}.ah-close{width:34px;height:34px;border-radius:9px;background:#f3f6fb;color:#64748b;font-size:20px}
      .ah-new{margin:14px;height:42px;border-radius:10px;background:linear-gradient(135deg,#2563d5,#164cae);color:#fff;font-weight:700;box-shadow:0 5px 14px rgba(37,99,213,.22)}
      .ah-search{margin:0 14px 10px;height:38px;border:1px solid #e1e8f2;border-radius:10px;padding:0 12px;outline:none;width:calc(100% - 28px);font-family:inherit}
      .ah-list{overflow:auto;padding:4px 9px 18px;flex:1}.ah-empty{padding:30px 18px;text-align:center;color:#94a3b8;font-size:13px}
      .ah-item{padding:11px 12px;border-radius:10px;margin-bottom:3px;cursor:pointer;position:relative}.ah-item:hover{background:#f3f7fd}.ah-item.active{background:#eaf2ff}
      .ah-item-title{font-size:13px;font-weight:650;color:#24344d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:25px}.ah-item-meta{font-size:10.5px;color:#94a3b8;margin-top:3px}
      .ah-del{position:absolute;right:8px;top:11px;display:none;color:#94a3b8;font-size:15px}.ah-item:hover .ah-del{display:block}.ah-del:hover{color:#dc2626}
      #ainext-history-mask{position:fixed;inset:0;background:rgba(15,30,55,.32);z-index:999;display:none}.ah-open #ainext-history-mask{display:block}
      body.ah-open{overflow:hidden}
      .ainext-ai-answer{max-width:850px;line-height:1.75;color:#24344d;font-size:15px}.ainext-ai-answer p{margin:.55em 0}.ainext-ai-answer pre{background:#0f172a;color:#e2e8f0;padding:14px;border-radius:10px;overflow:auto}.ainext-ai-answer code{background:#eef2f7;padding:2px 5px;border-radius:5px}
      @media(max-width:700px){#ainext-history{width:88vw;max-width:330px}}
    `;
    document.head.appendChild(style);
  }

  function installHistoryUI(db, clientId, state) {
    if (document.getElementById('ainext-history')) return;
    addStyles();
    const mask = document.createElement('div'); mask.id = 'ainext-history-mask';
    const panel = document.createElement('aside'); panel.id = 'ainext-history'; panel.setAttribute('aria-label','ประวัติการสนทนา');
    panel.innerHTML = `<div class="ah-head"><div class="ah-title">ประวัติการแชท</div><button class="ah-close" title="ปิด">×</button></div><button class="ah-new">＋ แชทใหม่</button><input class="ah-search" placeholder="ค้นหาประวัติ..."/><div class="ah-list"><div class="ah-empty">กำลังโหลด...</div></div>`;
    document.body.append(mask,panel);
    const open = () => { panel.classList.add('open'); document.body.classList.add('ah-open'); loadHistory(); };
    const close = () => { panel.classList.remove('open'); document.body.classList.remove('ah-open'); };
    mask.onclick = close; panel.querySelector('.ah-close').onclick = close;
    panel.querySelector('.ah-new').onclick = () => { state.newConversation(); close(); };
    panel.querySelector('.ah-search').oninput = (e) => renderHistory(state.history || [], e.target.value);
    window.AinextSupabase.openHistory = open;
    window.AinextSupabase.refreshHistory = loadHistory;

    function renderHistory(rows, filter='') {
      const list = panel.querySelector('.ah-list');
      const q = filter.trim().toLowerCase();
      const filtered = rows.filter(r => !q || String(r.title||'').toLowerCase().includes(q));
      if (!filtered.length) { list.innerHTML = '<div class="ah-empty">ยังไม่มีประวัติการสนทนา</div>'; return; }
      list.innerHTML = filtered.map(r => `<div class="ah-item ${r.id===state.dbConversationId?'active':''}" data-id="${esc(r.id)}"><div class="ah-item-title">${esc(r.title || 'การสนทนาใหม่')}</div><div class="ah-item-meta">${new Date(r.updated_at || r.created_at).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})}</div><button class="ah-del" title="ลบ">×</button></div>`).join('');
      list.querySelectorAll('.ah-item').forEach(item => {
        item.onclick = async (e) => { if(e.target.closest('.ah-del')) return; await state.openConversation(item.dataset.id); close(); };
        item.querySelector('.ah-del').onclick = async (e) => { e.stopPropagation(); if(confirm('ลบประวัติการสนทนานี้หรือไม่?')) { await state.deleteConversation(item.dataset.id); await loadHistory(); } };
      });
    }
    async function loadHistory() {
      const {data,error} = await db.from('ai_conversations').select('id,title,model,provider,created_at,updated_at').eq('client_id',clientId).order('updated_at',{ascending:false});
      if(error){ panel.querySelector('.ah-list').innerHTML='<div class="ah-empty">โหลดประวัติไม่สำเร็จ</div>'; return; }
      state.history=data||[]; renderHistory(state.history,panel.querySelector('.ah-search').value||'');
    }
  }

  function findHistoryButton() {
    const candidates = [...document.querySelectorAll('button,.nav-item,[role="button"]')];
    return candidates.find(el => /ประวัติ|history|conversation/i.test((el.textContent||'')+' '+(el.getAttribute('aria-label')||'')));
  }

  function findComposer() {
    return document.querySelector('textarea[placeholder*="ถาม"],textarea[placeholder*="พิมพ์"],textarea');
  }

  async function init() {
    try {
      await loadSupabase();
      const db = window.supabase?.createClient(SUPABASE_URL, SUPABASE_KEY);
      if (!db) throw new Error('สร้าง Supabase client ไม่สำเร็จ');
      const clientId = localStorage.getItem(CLIENT_ID_KEY) || crypto.randomUUID();
      localStorage.setItem(CLIENT_ID_KEY, clientId);
      let dbConversationId = localStorage.getItem(CONV_KEY) || null;
      const {error: healthError} = await db.from('ai_settings').select('key').limit(1);
      const state = { dbConversationId, history: [], db };
      Object.defineProperty(state,'dbConversationId',{get:()=>dbConversationId,set:v=>{dbConversationId=v; if(v)localStorage.setItem(CONV_KEY,v); else localStorage.removeItem(CONV_KEY);}});
      window.AinextSupabase = {url:SUPABASE_URL,functionUrl:FUNCTION_URL,clientId,db,connected:!healthError,error:healthError?.message||null,state};
      if(healthError) console.error('Ainext Supabase connection error:',healthError);

      async function ensureConversation(userMessage) {
        if(dbConversationId) return dbConversationId;
        const {data,error}=await db.from('ai_conversations').insert({client_id:clientId,title:shortTitle(userMessage),provider:'google',model:MODEL}).select('id').single();
        if(error) throw error;
        dbConversationId=data.id; localStorage.setItem(CONV_KEY,dbConversationId); return dbConversationId;
      }

      async function saveTurn(userMessage,assistantMessage,model=MODEL) {
        const id=await ensureConversation(userMessage);
        const {error}=await db.from('ai_messages').insert([
          {conversation_id:id,client_id:clientId,role:'user',content:userMessage,model},
          {conversation_id:id,client_id:clientId,role:'assistant',content:assistantMessage,model}
        ]);
        if(error) throw error;
        await db.from('ai_conversations').update({updated_at:new Date().toISOString(),model}).eq('id',id).eq('client_id',clientId);
        await db.from('ai_usage').insert({client_id:clientId,conversation_id:id,provider:'google',model,request_type:'chat',status:'success'});
      }

      state.newConversation = () => { dbConversationId=null; localStorage.removeItem(CONV_KEY); if(typeof window.newChat==='function') window.newChat(); };
      state.deleteConversation = async (id) => { await db.from('ai_messages').delete().eq('conversation_id',id).eq('client_id',clientId); await db.from('ai_usage').delete().eq('conversation_id',id).eq('client_id',clientId); await db.from('ai_conversations').delete().eq('id',id).eq('client_id',clientId); if(dbConversationId===id) state.newConversation(); };
      state.openConversation = async (id) => {
        const {data,error}=await db.from('ai_messages').select('role,content,created_at,model').eq('conversation_id',id).eq('client_id',clientId).order('created_at',{ascending:true});
        if(error) throw error;
        dbConversationId=id; localStorage.setItem(CONV_KEY,id);
        const composer=findComposer(); if(composer) composer.value='';
        // Reuse the app's existing renderer when it exposes one; otherwise create a clean AI-style transcript.
        const renderer=window.renderMessages||window.renderChat||window.displayMessages;
        if(typeof renderer==='function'){ try{ renderer(data||[]); return; }catch(e){console.warn('Ainext renderer fallback:',e);} }
        const containers=[...document.querySelectorAll('[id*="chat"],[class*="chat"],[id*="message"],[class*="message"]')].filter(el=>el instanceof HTMLElement && el.offsetParent!==null);
        const container=containers.sort((a,b)=>(b.clientHeight*b.clientWidth)-(a.clientHeight*a.clientWidth))[0];
        if(container){ container.innerHTML=(data||[]).map(m=>`<div class="ainext-fallback-msg" style="display:flex;gap:12px;margin:18px auto;max-width:850px;align-items:flex-start"><div style="width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:${m.role==='user'?'#e8f0fd':'#123670'};color:${m.role==='user'?'#1c63d5':'#fff'};font-weight:800;flex:none">${m.role==='user'?'คุณ':'AI'}</div><div style="white-space:pre-wrap;overflow-wrap:anywhere;padding-top:5px">${esc(m.content)}</div></div>`).join(''); container.scrollTop=container.scrollHeight; }
      };

      installHistoryUI(db,clientId,state);
      const historyButton=findHistoryButton(); if(historyButton) historyButton.addEventListener('click',e=>{e.preventDefault();window.AinextSupabase.openHistory();});

      const hook=()=>{
        const originalCallAI=window.callAI;
        if(typeof originalCallAI!=='function') return false;
        if(originalCallAI.__ainextWrapped) return true;
        const wrapped=async function(providerKey,userMessage,priorMessages){
          const isGemini=providerKey==='gemini'||providerKey==='google'||providerKey==='gemini-3.8-flash';
          if(!isGemini) return originalCallAI(providerKey,userMessage,priorMessages);
          const response=await fetch(FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`},body:JSON.stringify({messages:priorMessages||[],prompt:userMessage})});
          let data={}; try{data=await response.json();}catch{}
          if(!response.ok) throw new Error(data.error||`AI HTTP ${response.status}`);
          const text=data.text||'(ไม่มีคำตอบจากโมเดล)';
          try{await saveTurn(userMessage,text,data.model||MODEL); window.AinextSupabase.refreshHistory?.();}catch(e){console.error('Ainext DB save error:',e);}
          return text;
        };
        wrapped.__ainextWrapped=true; window.callAI=wrapped;
        return true;
      };
      hook(); let tries=0; const timer=setInterval(()=>{if(hook()||++tries>30)clearInterval(timer);},500);

      const originalNewChat=window.newChat;
      if(typeof originalNewChat==='function' && !originalNewChat.__ainextWrapped){
        const wrappedNewChat=function(){dbConversationId=null;localStorage.removeItem(CONV_KEY);return originalNewChat.apply(this,arguments);}; wrappedNewChat.__ainextWrapped=true; window.newChat=wrappedNewChat;
      }
    }catch(e){console.error('Ainext Supabase initialization failed:',e);window.AinextSupabase={connected:false,error:String(e?.message||e)};}
  };

  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',init,{once:true}); else setTimeout(init,0);
})();
