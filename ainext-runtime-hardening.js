/* Ainext runtime hardening — never persist server secrets in browser */
(() => {
  function hideSecretSettings(){
    ['supabase-secret','supabase-db-pass'].forEach(id=>{
      const el=document.getElementById(id);
      if(!el) return;
      const group=el.closest('.form-group');
      if(group) group.remove(); else el.remove();
    });
  }

  function fixCopy(){
    const replacements=[
      ['รายชื่อผู้ใช้ในระบบนี้เก็บไว้บนเครื่อง (Local Storage) สำหรับสาธิตการจัดการสิทธิ์ ยังไม่เชื่อมต่อระบบสมาชิกส่วนกลาง (SSO)','ข้อมูลผู้ใช้จัดเก็บในฐานข้อมูล Supabase ของระบบนี้ และแยกข้อมูลตามผู้ใช้งาน'],
      ['ข้อมูลการตั้งค่า, ประวัติการสนทนา และผู้ใช้ทั้งหมดถูกเก็บไว้ใน Local Storage ของเบราว์เซอร์นี้เท่านั้น (ไม่มีการส่งขึ้นเซิร์ฟเวอร์ส่วนกลาง)','ประวัติการสนทนาและข้อมูลผู้ใช้จัดเก็บในฐานข้อมูล Supabase ส่วนการตั้งค่าที่เป็นข้อมูลส่วนตัวของเครื่องยังคงอยู่ในเบราว์เซอร์'],
      ['พื้นที่จัดเก็บ (Local Storage)','พื้นที่จัดเก็บในเบราว์เซอร์']
    ];
    document.querySelectorAll('body *').forEach(el=>{
      if(el.children.length) return;
      const t=(el.textContent||'');
      for(const [from,to] of replacements) if(t.includes(from)) el.textContent=t.replace(from,to);
    });
  }

  function hardenConfig(){
    if(typeof window.saveSupabaseConfig!=='function'||window.saveSupabaseConfig.__ainextHardened)return;
    const hardened=async function(){
      const url=document.getElementById('supabase-url')?.value.trim()||'';
      const anonKey=document.getElementById('supabase-key')?.value.trim()||'';
      if(!url||!anonKey){showAlert?.('กรุณากรอก Supabase URL และ Publishable Key','error');return;}
      if(!url.includes('supabase.co')){showAlert?.('URL Supabase ไม่ถูกต้อง','error');return;}
      try{
        const ok=await testSupabaseConnection(url,anonKey);
        if(!ok){showAlert?.('เชื่อมต่อ Supabase ไม่สำเร็จ','error');return;}
        config.supabase={url,anonKey,secretKey:'',dbPassword:''};
        saveConfig();
        const keyEl=document.getElementById('supabase-key');if(keyEl)keyEl.value='';
        showAlert?.('บันทึกการเชื่อมต่อ Supabase แล้ว (ไม่เก็บ Secret/Database Password ในเบราว์เซอร์)','success');
      }catch(e){showAlert?.('ทดสอบ Supabase ไม่สำเร็จ: '+(e?.message||e),'error');}
    };
    hardened.__ainextHardened=true;window.saveSupabaseConfig=hardened;
  }

  function start(){hideSecretSettings();fixCopy();hardenConfig();}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else setTimeout(start,250);
  const observer=new MutationObserver(()=>{hideSecretSettings();fixCopy();hardenConfig();});
  const boot=()=>observer.observe(document.body,{childList:true,subtree:true});
  if(document.body)boot();else document.addEventListener('DOMContentLoaded',boot,{once:true});
  setTimeout(()=>observer.disconnect(),30000);
})();
