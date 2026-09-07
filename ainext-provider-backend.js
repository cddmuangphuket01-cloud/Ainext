/* Ainext provider backend compatibility shim — OpenRouter GPT */
(() => {
  'use strict';
  const MODEL='openai/gpt-oss-20b:free';
  function patch(){
    try{
      if(window.PROVIDERS?.openai){
        window.PROVIDERS.openai.label='OpenRouter GPT (ฟรี)';
        window.PROVIDERS.openai.org='OpenRouter';
        window.PROVIDERS.openai.model=MODEL;
        window.PROVIDERS.openai.endpoint='https://openrouter.ai/api/v1/chat/completions';
      }
      document.querySelectorAll('body *').forEach(el=>{
        if(el.children.length===0 && typeof el.textContent==='string'){
          if(el.textContent.includes('OpenAI GPT-4o mini')) el.textContent=el.textContent.replaceAll('OpenAI GPT-4o mini','OpenRouter GPT (ฟรี)');
          if(el.textContent==='OpenAI') el.textContent='OpenRouter';
        }
      });
    }catch(_){}
  }
  window.AinextProviderBackend={version:'2026.09.08.4',provider:'openrouter',model:MODEL,backend:true};
  patch();
  let n=0;const timer=setInterval(()=>{patch();if(++n>40)clearInterval(timer)},250);
})();