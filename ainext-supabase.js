/* Ainext Supabase integration — persistent chat, multi-provider DB sync, restore */
(() => {
  const SUPABASE_URL = 'https://yvfrsvqcgmzwgzflywdd.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_tI4p3UZO4In-fhY2vptCWQ_B3idNMJw';
  const FUNCTION_URL = `${SUPABASE_URL}/functions/v1/ainext-chat`;
  const MODEL = 'gemini-3.8-flash';
  const CLIENT_ID_KEY = 'ainext_client_id';
  const CONV_KEY = 'ainext_db_conversation_id';

  const esc = s => String(s ?? '').replace(/[&<>\"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const shortTitle = s => String(s || 'การสนทนาใหม่').replace(/\s+/g,' ').trim().slice(0,70) || 'การสนทนาใหม่';

  const loadSupabase = () => new Promise((resolve,reject) => {
    if (window.supabase?.createClient) return resolve();
    const existing = document.querySelector('script[data-ainext-supabase]');
    if (existing) { existing.addEventListener('load',resolve,{once:true}); existing.addEventListener('error',reject,{once:true}); return; }
    const script = document.createElement('script');
    script.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
    script.async=false; script.dataset.ainextSupabase='1';
    script.onload=resolve; script.onerror=()=>reject(new Error('โหลด Supabase client ไม่สำเร็จ'));
    document.head.appendChild(script);
  });

  function addStyles(){
    if(document.getElementById('ainext-history-style')) return;
    const style=document.createElement('style'); style.id='ainext-history-style';
    style.textContent=`
      #ainext-history{position:fixed;left:0;top:0;bottom:0;width:285px;background:#fff;border-right:1px solid #e6ecf5;z-index:1000;transform:translateX(-100%);transition:.25s;box-shadow:8px 0 30px rgba(20,45,90,.12);display:flex;flex-direction:column;font-family:'Noto Sans Thai',system-ui,sans-serif}
      #ainext-history.open{transform:translateX(0)}
      .ah-head{height:70px;padding:14px 16px;border-bottom:1px solid #edf1f7;display:flex;align-items:center;gap:10px}.ah-title{font-size:16px;font-weight:800;color:#172b4d;flex:1}.ah-close{width:34px;height:34px;border-radius:9px;background:#f3f6fb;color:#64748b;font-size:20px}
      .ah-new{margin:14px;height:42px;border-radius:10px;background:linear-gradient(135deg,#2563d5,#164cae);color:#fff;font-weight:700}.ah-search{margin:0 14px 10px;height:38px;border:1px solid #e1e8f2;border-radius:10px;padding:0 12px;outline:none;width:calc(100% - 28px);font-family:inherit}.ah-list{overflow:auto;padding:4px 9px 18px;flex:1}.ah-empty{padding:30px 18px;text-align:center;color:#94a3b8;font-size:13px}
      .ah-item{padding:11px 12px;border-radius:10px;margin-bottom:3px;cursor:pointer;position:relative}.ah-item:hover{background:#f3f7fd}.ah-item.active{background:#eaf2ff}.ah-item-title{font-size:13px;font-weight:650;color:#24344d;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;padding-right:25px}.ah-item-meta{font-size:10.5px;color:#94a3b8;margin-top:3px}.ah-del{position:absolute;right:8px;top:11px;display:none;color:#94a3b8;font-size:15px}.ah-item:hover .ah-del{display:block}.ah-del:hover{color:#dc2626}
      #ainext-history-mask{position:fixed;inset:0;background:rgba(15,30,55,.32);z-index:999;display:none}.ah-open #ainext-history-mask{display:block}body.ah-open{overflow:hidden}
      @media(max-width:700px){#ainext-history{width:88vw;max-width:330px}}
    `; document.head.appendChild(style);
  }

  function getClientId(){
    let id=localStorage.getItem(CLIENT_ID_KEY);
    if(!id){ id=crypto.randomUUID(); localStorage.setItem(CLIENT_ID_KEY,id); }
    return id;
  }

  function installHistoryUI(db,clientId,state){
    if(document.getElementById('ainext-history')) return;
    addStyles();
    const mask=document.createElement('div'); mask.id='ainext-history-mask';
    const panel=document.createElement('aside'); panel.id='ainext-history'; panel.setAttribute('aria-label','ประวัติการสนทนา');
    panel.innerHTML='<div class="ah-head"><div class="ah-title">ประวัติการแชท</div><button class="ah-close" title="ปิด">×</button></div><button class="ah-new">＋ แชทใหม่</button><input class="ah-search" placeholder="ค้นหาประวัติ..."/><div class="ah-list"><div class="ah-empty">กำลังโหลด...</div></div>';
    document.body.append(mask,panel);
    const open=()=>{panel.classList.add('open');document.body.classList.add('ah-open');loadHistory();};
    const close=()=>{panel.classList.remove('open');document.body.classList.remove('ah-open');};
    mask.onclick=close; panel.querySelector('.ah-close').onclick=close;
    panel.querySelector('.ah-new').onclick=()=>{state.newConversation();close();};
    panel.querySelector('.ah-search').oninput=e=>renderHistory(state.history||[],e.target.value);
    window.AinextSupabase.openHistory=open; window.AinextSupabase.refreshHistory=loadHistory;

    function renderHistory(rows,filter=''){
      const list=panel.querySelector('.ah-list'); const q=filter.trim().toLowerCase();
      const filtered=(rows||[]).filter(r=>!q||String(r.title||'').toLowerCase().includes(q));
      if(!filtered.length){list.innerHTML='<div class="ah-empty">ยังไม่มีประวัติการสนทนา</div>';return;}
      list.innerHTML=filtered.map(r=>`<div class="ah-item ${r.id===state.dbConversationId?'active':''}" data-id="${esc(r.id)}"><div class="ah-item-title">${esc(r.title||'การสนทนาใหม่')}</div><div class="ah-item-meta">${new Date(r.updated_at||r.created_at).toLocaleString('th-TH',{dateStyle:'short',timeStyle:'short'})}</div><button class="ah-del" title="ลบ">×</button></div>`).join('');
      list.querySelectorAll('.ah-item').forEach(item=>{
        item.onclick=async e=>{if(e.target.closest('.ah-del'))return;try{await state.openConversation(item.dataset.id);close();}catch(err){console.error(err);}};
        item.querySelector('.ah-del').onclick=async e=>{e.stopPropagation();if(confirm('ลบประวัติการสนทนานี้หรือไม่?')){await state.deleteConversation(item.dataset.id);await loadHistory();}};
      });
    }
    async function loadHistory(){
      const {data,error}=await db.from('ai_conversations').select('id,title,model,provider,created_at,updated_at').eq('client_id',clientId).order('updated_at',{ascending:false}).limit(100);
      if(error){panel.querySelector('.ah-list').innerHTML='<div class="ah-empty">โหลดประวัติไม่สำเร็จ</div>';console.warn('Ainext history:',error.message);return;}
      state.history=data||[];renderHistory(state.history,panel.querySelector('.ah-search').value||'');
      window.AinextSupabase.history=state.history;
    }
  }

  function findHistoryButton(){
    const candidates=[...document.querySelectorAll('button,.nav-item,[role="button"]')];
    return candidates.find(el=>/ประวัติ|history|conversation/i.test((el.textContent||'')+' '+(el.getAttribute('aria-label')||'')));
  }
  function findComposer(){return document.querySelector('textarea[placeholder*="ถาม"],textarea[placeholder*="พิมพ์"],textarea');}

  async function ensureConversation(state,userMessage,provider,model){
    if(state.dbConversationId) return state.dbConversationId;
    const payload={client_id:state.clientId,title:shortTitle(userMessage),provider:provider||'google',model:model||MODEL};
    if(state.userId) payload.user_id=state.userId;
    const {data,error}=await state.db.from('ai_conversations').insert(payload).select('id').single();
    if(error) throw error;
    state.dbConversationId=data.id; localStorage.setItem(CONV_KEY,data.id); return data.id;
  }

  async function saveUserMessage(state,userMessage,provider,model){
    const id=await ensureConversation(state,userMessage,provider,model);
    const row={conversation_id:id,client_id:state.clientId,role:'user',content:userMessage,model:model||MODEL};
    if(state.userId) row.user_id=state.userId;
    const {error}=await state.db.from('ai_messages').insert(row); if(error) throw error;
    await state.db.from('ai_conversations').update({updated_at:new Date().toISOString(),provider:provider||'google',model:model||MODEL}).eq('id',id).eq('client_id',state.clientId);
    return id;
  }

  async function saveAssistantMessage(state,assistantMessage,provider,model){
    const id=state.dbConversationId; if(!id) return;
    const row={conversation_id:id,client_id:state.clientId,role:'assistant',content:assistantMessage,model:model||MODEL};
    if(state.userId) row.user_id=state.userId;
    const {error}=await state.db.from('ai_messages').insert(row); if(error) throw error;
    await state.db.from('ai_conversations').update({updated_at:new Date().toISOString(),provider:provider||'google',model:model||MODEL}).eq('id',id).eq('client_id',state.clientId);
    await state.db.from('ai_usage').insert({client_id:state.clientId,conversation_id:id,user_id:state.userId||null,provider:provider||'google',model:model||MODEL,request_type:'chat',status:'success'});
  }

  async function loadConversation(state,id){
    const {data,error}=await state.db.from('ai_messages').select('role,content,created_at,model').eq('conversation_id',id).eq('client_id',state.clientId).order('created_at',{ascending:true});
    if(error) throw error;
    state.dbConversationId=id;localStorage.setItem(CONV_KEY,id);
    const messages=data||[];
    try{ currentMessages=messages.map(m=>({role:m.role,content:m.content})); currentChatId=id; }catch(_){ }
    const composer=findComposer();if(composer)composer.value='';
    if(typeof window.renderMessages==='function'){try{window.renderMessages(messages);return messages;}catch(_){} }
    if(typeof window.renderChat==='function'){try{window.renderChat(messages);return messages;}catch(_){} }
    if(typeof window.displayMessages==='function'){try{window.displayMessages(messages);return messages;}catch(_){} }
    const host=document.querySelector('#chatMessages,.chat-messages');
    if(host){host.innerHTML=messages.length?messages.map(m=>`<div class="msg ${m.role==='user'?'user':'assistant'}">${esc(m.content)}</div>`).join(''):'<div class="chat-empty"><div>ยังไม่มีข้อความในบทสนทนานี้</div></div>';host.scrollTop=host.scrollHeight;}
    return messages;
  }

  async function init(){
    try{
      await loadSupabase();
      const clientId=getClientId();
      const db=window.supabase?.createClient(SUPABASE_URL,SUPABASE_KEY,{global:{headers:{'x-ainext-client-id':clientId}}});
      if(!db) throw new Error('สร้าง Supabase client ไม่สำเร็จ');
      const storedId=localStorage.getItem(CONV_KEY)||null;
      const state={db,clientId,dbConversationId:storedId,history:[],userId:null,connected:true};
      window.AinextSupabase={url:SUPABASE_URL,functionUrl:FUNCTION_URL,clientId,db,connected:true,state};

      // User identity module may populate this later; DB still works with client-id ownership.
      try{const {data}=await db.auth.getSession();if(data?.session?.user?.id)state.userId=data.session.user.id;}catch(_){ }
      window.AinextSupabase.userId=state.userId;

      state.newConversation=()=>{state.dbConversationId=null;localStorage.removeItem(CONV_KEY);try{currentChatId=null;currentMessages=[];}catch(_){ }if(typeof window.newChat==='function')window.newChat();};
      state.deleteConversation=async id=>{
        await db.from('ai_messages').delete().eq('conversation_id',id).eq('client_id',clientId);
        await db.from('ai_usage').delete().eq('conversation_id',id).eq('client_id',clientId);
        const {error}=await db.from('ai_conversations').delete().eq('id',id).eq('client_id',clientId);if(error)throw error;
        if(state.dbConversationId===id)state.newConversation();
      };
      state.openConversation=id=>loadConversation(state,id);
      state.ensureConversation=(msg,p,m)=>ensureConversation(state,msg,p,m);
      state.saveUserMessage=(msg,p,m)=>saveUserMessage(state,msg,p,m);
      state.saveAssistantMessage=(msg,p,m)=>saveAssistantMessage(state,msg,p,m);
      installHistoryUI(db,clientId,state);

      const historyButton=findHistoryButton();if(historyButton)historyButton.addEventListener('click',e=>{e.preventDefault();window.AinextSupabase.openHistory();});

      // Restore the last conversation automatically after refresh.
      if(storedId){let tries=0;const restoreTimer=setInterval(async()=>{tries++;try{await loadConversation(state,storedId);clearInterval(restoreTimer);}catch(err){if(tries>=20){clearInterval(restoreTimer);console.warn('Ainext restore:',err.message);}}},500);}

      // Wrap callAI once. Gemini uses the secure Edge Function; other configured providers keep their current behavior.
      const hook=()=>{
        const original=window.callAI;if(typeof original!=='function'||original.__ainextDbWrapped)return false;
        const wrapped=async function(providerKey,userMessage,priorMessages){
          const provider=providerKey||'google';
          const model=(window.PROVIDERS&&window.PROVIDERS[provider]?.model)||MODEL;
          await saveUserMessage(state,userMessage,provider,model).catch(err=>console.warn('Ainext user message save:',err.message));
          try{
            let text;
            const isGemini=providerKey==='gemini'||providerKey==='google'||providerKey==='gemini-3.8-flash';
            if(isGemini){
              const response=await fetch(FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`},body:JSON.stringify({messages:priorMessages||[],prompt:userMessage})});
              let data={};try{data=await response.json();}catch(_){ }
              if(!response.ok)throw new Error(data.error||`AI HTTP ${response.status}`);
              text=data.text||'(ไม่มีคำตอบจากโมเดล)';
            }else{
              text=await original.apply(this,arguments);
            }
            await saveAssistantMessage(state,text,provider,dataModel(providerKey)).catch(err=>console.warn('Ainext assistant save:',err.message));
            window.AinextSupabase.refreshHistory?.();
            return text;
          }catch(err){
            await db.from('ai_usage').insert({client_id:clientId,conversation_id:state.dbConversationId,user_id:state.userId||null,provider,model: dataModel(providerKey),request_type:'chat',status:'error',error_message:String(err?.message||err)}).catch(()=>{});
            throw err;
          }
        };
        wrapped.__ainextDbWrapped=true;window.callAI=wrapped;return true;
      };
      const dataModel=key=>key==='gemini'||key==='google'||key==='gemini-3.8-flash'?MODEL:((window.PROVIDERS&&window.PROVIDERS[key]?.model)||key||MODEL);
      hook();let tries=0;const timer=setInterval(()=>{if(hook()||++tries>40)clearInterval(timer);},400);

      const originalNewChat=window.newChat;
      if(typeof originalNewChat==='function'&&!originalNewChat.__ainextDbWrapped){
        const wrappedNewChat=function(){state.dbConversationId=null;localStorage.removeItem(CONV_KEY);try{currentChatId=null;currentMessages=[];}catch(_){ }return originalNewChat.apply(this,arguments);};
        wrappedNewChat.__ainextDbWrapped=true;window.newChat=wrappedNewChat;
      }
    }catch(e){console.error('Ainext Supabase initialization failed:',e);window.AinextSupabase={connected:false,error:String(e?.message||e)};}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else setTimeout(init,0);
})();
