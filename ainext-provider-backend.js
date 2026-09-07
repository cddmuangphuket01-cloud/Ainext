/* Ainext provider backend enforcement */
(() => {
  'use strict';
  const URL='https://yvfrsvqcgmzwgzflywdd.supabase.co/functions/v1/ainext-chat';
  const KEY='sb_publishable_tI4p3UZO4In-fhY2vptCWQ_B3idNMJw';
  const mark='__ainextProviderBackend';
  function install(){
    const base=window.callAI;
    if(typeof base!=='function' || base[mark]) return false;
    const wrapped=async function(provider,message,prior){
      const p=provider||'gemini';
      if(p!=='openai') return base.apply(this,arguments);
      const clientId=localStorage.getItem('ainext_client_id')||crypto.randomUUID();
      localStorage.setItem('ainext_client_id',clientId);
      const r=await fetch(URL,{method:'POST',headers:{'Content-Type':'application/json','apikey':KEY,'Authorization':'Bearer '+KEY,'x-ainext-client-id':clientId},body:JSON.stringify({provider:'openai',model:'gpt-4o-mini',prompt:String(message||''),messages:Array.isArray(prior)?prior:[]})});
      let d={};try{d=await r.json()}catch(_){}
      if(!r.ok) throw new Error(d.error||`OpenAI HTTP ${r.status}`);
      return d.text||'';
    };
    wrapped[mark]=true;
    window.callAI=wrapped;
    return true;
  }
  let tries=0;
  const t=setInterval(()=>{if(install()||++tries>60)clearInterval(t)},300);
})();