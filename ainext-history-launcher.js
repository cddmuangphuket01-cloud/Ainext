(() => {
  function start(){
    const api=window.AinextSupabase;
    if(!api?.openHistory||document.getElementById('ainext-history-launcher'))return !!api?.openHistory;
    const btn=document.createElement('button');
    btn.id='ainext-history-launcher';
    btn.type='button';
    btn.title='ประวัติการสนทนา';
    btn.setAttribute('aria-label','ประวัติการสนทนา');
    btn.textContent='☰ ประวัติ';
    btn.style.cssText='position:fixed;left:14px;bottom:18px;z-index:998;height:38px;padding:0 13px;border:1px solid #dbe5f2;border-radius:11px;background:#fff;color:#234064;font:600 13px system-ui,sans-serif;box-shadow:0 5px 18px rgba(15,40,80,.12);cursor:pointer;';
    btn.onclick=()=>api.openHistory();
    document.body.appendChild(btn);
    return true;
  }
  let tries=0;const timer=setInterval(()=>{if(start()||++tries>50)clearInterval(timer);},400);
})();
