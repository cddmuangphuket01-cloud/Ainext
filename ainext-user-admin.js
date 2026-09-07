/* Ainext user admin — use Supabase ai_users instead of browser-only user records */
(() => {
  function api(){ return window.AinextSupabase?.db ? window.AinextSupabase : null; }
  function esc(s){ return String(s ?? '').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])); }
  function initials(name){ return esc(String(name||'?').trim().slice(0,1).toUpperCase()); }

  async function loadUsers(){
    const a=api(); if(!a) return [];
    const {data,error}=await a.db.from('ai_users').select('id,email,display_name,role,client_id,created_at,updated_at').eq('client_id',a.clientId).order('created_at',{ascending:false}).limit(200);
    if(error){ console.warn('Ainext users load:',error.message); return []; }
    return data||[];
  }

  async function renderUsersDb(){
    const tbody=document.getElementById('usersTbody'); if(!tbody) return;
    const rows=await loadUsers();
    window.ainextDbUsers=rows;
    if(!rows.length){tbody.innerHTML='<tr><td colspan="5"><div class="empty-state">ยังไม่มีผู้ใช้ในฐานข้อมูล</div></td></tr>';return;}
    tbody.innerHTML=rows.map(u=>`<tr><td><span class="user-avatar-sm">${initials(u.display_name)}</span>${esc(u.display_name||'-')}</td><td>${esc(u.email||'-')}</td><td>${esc(u.role||'-')}</td><td><span class="role-tag">${esc(u.role||'-')}</span></td><td><button class="btn btn-secondary btn-sm" onclick="openUserModal('${esc(u.id)}')" title="แก้ไข">✎</button> <button class="btn btn-danger btn-sm" onclick="deleteUser('${esc(u.id)}')" title="ลบ">🗑</button></td></tr>`).join('');
  }

  function openUserModalDb(id){
    const rows=window.ainextDbUsers||[]; const u=id?rows.find(x=>x.id===id):null;
    document.getElementById('userId').value=id||'';
    document.getElementById('userModalTitle').textContent=u?'แก้ไขผู้ใช้':'เพิ่มผู้ใช้';
    document.getElementById('userName').value=u?.display_name||'';
    document.getElementById('userEmail').value=u?.email||'';
    document.getElementById('userDept').value='กรมการพัฒนาชุมชน';
    document.getElementById('userRole').value=u?.role||'เจ้าหน้าที่';
    document.getElementById('userModal').classList.remove('hidden');
  }

  async function saveUserDb(){
    const a=api(); if(!a){showToast?.('ฐานข้อมูลยังไม่พร้อม','error');return;}
    const id=document.getElementById('userId').value.trim();
    const name=document.getElementById('userName').value.trim();
    const email=document.getElementById('userEmail').value.trim()||null;
    const role=document.getElementById('userRole').value;
    if(!name){showToast?.('กรุณากรอกชื่อผู้ใช้','error');return;}
    const payload={display_name:name,email,role,client_id:a.clientId,updated_at:new Date().toISOString()};
    let error;
    if(id){({error}=await a.db.from('ai_users').update(payload).eq('id',id).eq('client_id',a.clientId));}
    else {payload.id=crypto.randomUUID();({error}=await a.db.from('ai_users').insert(payload));}
    if(error){showToast?.('บันทึกผู้ใช้ไม่สำเร็จ: '+error.message,'error');return;}
    document.getElementById('userModal').classList.add('hidden');
    await renderUsersDb();
    showToast?.('บันทึกข้อมูลผู้ใช้ลง Supabase แล้ว','success');
  }

  async function deleteUserDb(id){
    const a=api(); if(!a||!confirm('ลบผู้ใช้นี้จากฐานข้อมูลหรือไม่?'))return;
    const {error}=await a.db.from('ai_users').delete().eq('id',id).eq('client_id',a.clientId);
    if(error){showToast?.('ลบผู้ใช้ไม่สำเร็จ: '+error.message,'error');return;}
    await renderUsersDb();
    showToast?.('ลบผู้ใช้แล้ว','success');
  }

  function patch(){
    if(!api()) return false;
    window.renderUsers=renderUsersDb;
    window.openUserModal=openUserModalDb;
    window.saveUser=saveUserDb;
    window.deleteUser=deleteUserDb;
    return true;
  }

  let tries=0;
  const timer=setInterval(async()=>{
    if(patch()){
      if(document.getElementById('page-users')&&!document.getElementById('page-users').classList.contains('hidden')) await renderUsersDb();
      if(++tries>8)clearInterval(timer);
    }else if(++tries>50)clearInterval(timer);
  },500);
})();
