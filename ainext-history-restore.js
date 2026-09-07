(() => {
  const CONV_KEY = 'ainext_db_conversation_id';
  let restoring = false;

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;').replace(/'/g,'&#039;');
  }

  function findTranscriptHost() {
    const selectors=['#chat-messages','.chat-messages','#messages','.messages','#conversation-messages','.conversation-messages','#chat-container','.chat-container','[data-chat-messages]'];
    for(const selector of selectors){const el=document.querySelector(selector);if(el&&!el.closest('#ainext-history'))return el;}
    let host=document.getElementById('ainext-restored-transcript');
    if(host)return host;
    host=document.createElement('div');host.id='ainext-restored-transcript';host.style.cssText='width:100%;max-width:900px;margin:0 auto;padding:20px 16px 120px;box-sizing:border-box;';
    const composer=document.querySelector('textarea,input[type="text"]');
    const anchor=composer?.closest('form,.composer,.prompt-wrap,.input-area')||composer?.parentElement;
    if(anchor?.parentNode)anchor.parentNode.insertBefore(host,anchor);else document.body.appendChild(host);
    return host;
  }

  function renderMessages(messages){
    const host=findTranscriptHost();if(!host)return;
    host.innerHTML=(messages||[]).map(m=>{
      const isUser=m.role==='user';
      return `<div data-ainext-restored-message="${isUser?'user':'assistant'}" style="display:flex;justify-content:${isUser?'flex-end':'flex-start'};margin:0 0 18px;width:100%;"><div style="display:flex;gap:10px;align-items:flex-start;max-width:min(86%,820px);flex-direction:${isUser?'row-reverse':'row'};"><div style="width:32px;height:32px;min-width:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;font-weight:700;background:${isUser?'#111827':'#10a37f'};color:#fff;">${isUser?'คุณ':'AI'}</div><div style="padding:11px 14px;border-radius:16px;line-height:1.65;white-space:pre-wrap;overflow-wrap:anywhere;background:${isUser?'#111827':'#f3f4f6'};color:${isUser?'#fff':'#111827'};border-top-${isUser?'right':'left'}-radius:4px;">${escapeHtml(m.content)}</div></div></div>`;
    }).join('');
    requestAnimationFrame(()=>{host.scrollTop=host.scrollHeight;window.scrollTo({top:document.documentElement.scrollHeight,behavior:'auto'});});
  }

  async function restore(){
    if(restoring)return false;
    const api=window.AinextSupabase;const id=localStorage.getItem(CONV_KEY);
    if(!api?.db||!api?.clientId||!id)return false;
    restoring=true;
    try{
      let data;
      if(api.state?.openConversation) data=await api.state.openConversation(id);
      else {
        const result=await api.db.from('ai_messages').select('role,content,created_at,model').eq('conversation_id',id).eq('client_id',api.clientId).order('created_at',{ascending:true});
        if(result.error)throw result.error; data=result.data||[];
      }
      data=Array.isArray(data)?data:[];
      try{currentMessages=data.map(m=>({role:m.role,content:m.content}));currentChatId=id;}catch(_){ }
      if(!api.state)api.state={};api.state.dbConversationId=id;
      if(typeof window.renderMessages==='function'){try{window.renderMessages(data);return true;}catch(_){}}
      if(typeof window.renderChat==='function'){try{window.renderChat(data);return true;}catch(_){}}
      if(typeof window.displayMessages==='function'){try{window.displayMessages(data);return true;}catch(_){}}
      renderMessages(data);return true;
    }catch(err){console.warn('[Ainext] restore conversation failed:',err);return false;}
    finally{restoring=false;}
  }

  window.AinextRestoreHistory=restore;
  function start(){let attempts=0;const timer=setInterval(async()=>{attempts++;const restored=await restore();if(restored||attempts>=40)clearInterval(timer);},500);}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();
})();
