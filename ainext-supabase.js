/* Ainext Supabase bridge — stable persistence */
(() => {
  'use strict';
  const VERSION='2026.09.07.3';
  const SUPABASE_URL='https://yvfrsvqcgmzwgzflywdd.supabase.co';
  const SUPABASE_KEY='sb_publishable_tI4p3UZO4In-fhY2vptCWQ_B3idNMJw';
  const FUNCTION_URL=`${SUPABASE_URL}/functions/v1/ainext-chat`;
  const CLIENT_KEY='ainext_client_id', CONV_KEY='ainext_db_conversation_id';
  const DEFAULT_MODEL='gemini-3.8-flash';
  const S={db:null,clientId:null,userId:null,conversationId:null,messages:[],history:[]};
  const esc=s=>String(s??'').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
  const getClientId=()=>{let id=localStorage.getItem(CLIENT_KEY);if(!id){id=crypto.randomUUID();localStorage.setItem(CLIENT_KEY,id)}return id};
  const getModel=p=>window.PROVIDERS?.[p]?.model||DEFAULT_MODEL;

  async function loadClient(){
    if(window.supabase?.createClient)return;
    await new Promise((resolve,reject)=>{
      const s=document.createElement('script');
      s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.min.js';
      s.async=true;
      s.onload=resolve;
      s.onerror=()=>reject(new Error('โหลด Supabase Client ไม่สำเร็จ'));
      document.head.appendChild(s)
    });
  }

  async function saveUser(message,provider,model){
    let id=S.conversationId;
    if(!id){
      const row={client_id:S.clientId,title:String(message||'การสนทนาใหม่').trim().slice(0,70)||'การสนทนาใหม่',provider,model};
      if(S.userId)row.user_id=S.userId;
      const r=await S.db.from('ai_conversations').insert(row).select('id').single();
      if(r.error)throw r.error;
      id=r.data.id;S.conversationId=id;localStorage.setItem(CONV_KEY,id)
    }
    const row={conversation_id:id,client_id:S.clientId,role:'user',content:String(message),model};
    if(S.userId)row.user_id=S.userId;
    const r=await S.db.from('ai_messages').insert(row);if(r.error)throw r.error;
    const u=await S.db.from('ai_conversations').update({updated_at:new Date().toISOString(),provider,model}).eq('id',id).eq('client_id',S.clientId);if(u.error)throw u.error;
  }

  async function saveAssistant(message,provider,model){
    if(!S.conversationId)return;
    const row={conversation_id:S.conversationId,client_id:S.clientId,role:'assistant',content:String(message),model};
    if(S.userId)row.user_id=S.userId;
    const r=await S.db.from('ai_messages').insert(row);if(r.error)throw r.error;
    const u=await S.db.from('ai_conversations').update({updated_at:new Date().toISOString(),provider,model}).eq('id',S.conversationId).eq('client_id',S.clientId);if(u.error)throw u.error;
    const usage=await S.db.from('ai_usage').insert({client_id:S.clientId,conversation_id:S.conversationId,user_id:S.userId||null,provider,model,request_type:'chat',status:'success'});
    if(usage.error)console.warn('Ainext usage save:',usage.error.message);
  }

  async function recordError(provider,model,error){
    if(!S.db)return;
    try{
      const r=await S.db.from('ai_usage').insert({client_id:S.clientId,conversation_id:S.conversationId,user_id:S.userId||null,provider,model,request_type:'chat',status:'error',error_message:String(error?.message||error)});
      if(r.error)console.warn('Ainext error usage save:',r.error.message);
    }catch(_){ }
  }

  async function loadConversation(id){
    const r=await S.db.from('ai_messages').select('role,content,created_at,model').eq('conversation_id',id).eq('client_id',S.clientId).order('created_at',{ascending:true});
    if(r.error)throw r.error;
    S.conversationId=id;S.messages=r.data||[];localStorage.setItem(CONV_KEY,id);window.currentMessages=S.messages.map(m=>({role:m.role,content:m.content}));
    const host=document.querySelector('#chatMessages,.chat-messages,.messages');
    if(host){
      host.innerHTML=S.messages.map(m=>`<div class="msg ${m.role==='user'?'user':'assistant'}"><div class="msg-content">${esc(m.content).replace(/\n/g,'<br>')}</div></div>`).join('');
      host.scrollTop=host.scrollHeight;
    }
    return S.messages;
  }

  async function loadHistory(){
    const r=await S.db.from('ai_conversations').select('id,title,provider,model,created_at,updated_at').eq('client_id',S.clientId).order('updated_at',{ascending:false}).limit(100);
    if(r.error)throw r.error;S.history=r.data||[];return S.history;
  }

  function clearRenderedChat(){
    const selectors=['#chatMessages','.chat-messages','.messages'];
    for(const selector of selectors){const host=document.querySelector(selector);if(host){host.innerHTML='';host.scrollTop=0;break;}}
  }

  async function newConversation(){
    S.conversationId=null;S.messages=[];localStorage.removeItem(CONV_KEY);window.currentMessages=[];clearRenderedChat();
    if(typeof window.newChat==='function'&&!window.newChat.__ainextStableManaged)window.newChat();
  }

  async function gemini(message,prior){
    const r=await fetch(FUNCTION_URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':SUPABASE_KEY,'Authorization':`Bearer ${SUPABASE_KEY}`},body:JSON.stringify({prompt:message,messages:Array.isArray(prior)?prior:[]})});
    let d={};try{d=await r.json()}catch(_){ }
    if(!r.ok)throw new Error(d.error||`Gemini HTTP ${r.status}`);
    return d.text||'';
  }

  function install(){
    window.AinextSupabase={
      version:VERSION,url:SUPABASE_URL,functionUrl:FUNCTION_URL,db:S.db,clientId:S.clientId,state:S,
      get userId(){return S.userId},set userId(v){S.userId=v},
      get conversationId(){return S.conversationId},
      loadConversation,loadHistory,newConversation,saveUser,saveAssistant,recordError,
    };

    const original=window.callAI;
    if(typeof original==='function'&&!original.__ainextStable){
      const wrapped=async function(provider,message,prior){
        const p=provider||'gemini',m=getModel(p);
        try{
          await saveUser(message,p,m);
          const answer=(p==='gemini'||p==='google')?await gemini(message,prior):await original.apply(this,arguments);
          await saveAssistant(answer,p,m);
          await loadHistory();
          return answer;
        }catch(e){await recordError(p,m,e);throw e;}
      };
      wrapped.__ainextStable=true;window.callAI=wrapped;
    }
  }

  async function init(){
    try{
      await loadClient();
      S.clientId=getClientId();
      // RLS for browser/anon sessions is scoped by this identity header.
      S.db=window.supabase.createClient(SUPABASE_URL,SUPABASE_KEY,{global:{headers:{'x-ainext-client-id':S.clientId}}});
      try{const x=await S.db.auth.getSession();S.userId=x.data?.session?.user?.id||null}catch(_){ }
      install();
      const id=localStorage.getItem(CONV_KEY);
      if(id)await loadConversation(id).catch(()=>{localStorage.removeItem(CONV_KEY);S.conversationId=null;S.messages=[];window.currentMessages=[]});
      window.dispatchEvent(new CustomEvent('ainext-ready',{detail:{version:VERSION}}));
    }catch(e){console.error('Ainext Supabase:',e)}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
