/* Ainext user admin — database-backed user management */
(() => {
  'use strict';
  function api(){return window.AinextSupabase?.db?window.AinextSupabase:null;}
  function esc(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
  function initials(name){return esc(String(name||'?').trim().slice(0,1).toUpperCase());}
  const el=id=>document.getElementById(id);

  async function loadUsers(){
    const a=api();if(!a)return [];
    const {data,error}=await a.db.from('ai_users').select('id,email,display_name,department,role,client_id,created_at,updated_at').eq('client_id',a.clientId).order('created_at',{ascending:false}).limit(200);
    if(error){console.warn('Ainext users load:',error.message);return [];}return data||[];
  }

  async function renderUsersDb(){
    const tbody=el('usersTbody');if(!tbody)return;
    const rows=await loadUsers();window.ainextDbUsers=rows;
    if(!rows.length){tbody.innerHTML='<tr><td colspan="5"><div class="empty-state">ยังไม่มีผู้ใช้ในฐานข้อมูล</div></td></tr>';return;}
    tbody.innerHTML=rows.map(u=>`<tr><td><span class="user-avatar-sm">${initials(u.display_name)}</span>${esc(u.display_name||'-')}</td><td>${esc(u.email||'-')}</td><td>${esc(u.department||'-')}</td><td><span class="role-tag">${esc(u.role||'-')}</span></td><td><button class="btn btn-secondary btn-sm" onclick="openUserModal('${esc(u.id)}')" title="แก้ไข">✎</button> <button class="btn btn-danger btn-sm" onclick="deleteUser('${esc(u.id)}')" title="ลบ">🗑</button></td></tr>`).join('');
  }

  function openUserModalDb(id){
    const rows=window.ainextDbUsers||[];const u=id?rows.find(x=>x.id===id):null;
    if(!el('userId')||!el('userModal'))return;
    el('userId').value=id||'';if(el('userModalTitle'))el('userModalTitle').textContent=u?'แก้ไขผู้ใช้':'เพิ่มผู้ใช้';
    if(el('userName'))el('userName').value=u?.display_name||'';
    if(el('userEmail'))el('userEmail').value=u?.email||'';
    if(el('userDept'))el('userDept').value=u?.department||'กรมการพัฒนาชุมชน';
    if(el('userRole'))el('userRole').value=u?.role||'เจ้าหน้าที่';
    el('userModal').classList.remove('hidden');
  }

  async function saveUserDb(){
    const a=api();if(!a){showToast?.('ฐานข้อมูลยังไม่พร้อม','error');return;}
    const id=(el('userId')?.value||'').trim();const name=(el('userName')?.value||'').trim();const email=(el('userEmail')?.value||'').trim()||null;const department=(el('userDept')?.value||'กรมการพัฒนาชุมชน').trim();const role=(el('userRole')?.value||'ผู้ใช้ทั่วไป').trim();
    if(!name){showToast?.('กรุณากรอกชื่อผู้ใช้','error');return;}
    const payload={display_name:name,email,department,role,client_id:a.clientId,updated_at:new Date().toISOString()};
    try{
      let result;
      if(id){
        result=await a.db.from('ai_users').update(payload).eq('id',id).eq('client_id',a.clientId).select('id').maybeSingle();
      }else{
        // A client_id identifies the browser/tenant, not an individual person.
        // Always INSERT a new row for a new user; do not merge it into the current user.
        const authUser=(await a.db.auth.getUser()).data?.user||null;
        const row={...payload,id:authUser?.id&&false?authUser.id:crypto.randomUUID()};
        result=await a.db.from('ai_users').insert(row).select('id').single();
      }
      if(result.error)throw result.error;
      el('userModal')?.classList.add('hidden');await renderUsersDb();showToast?.(id?'แก้ไขข้อมูลผู้ใช้แล้ว':'เพิ่มผู้ใช้แล้ว','success');
    }catch(error){showToast?.('บันทึกผู้ใช้ไม่สำเร็จ: '+(error?.message||error),'error');}
  }

  async function deleteUserDb(id){
    const a=api();if(!a||!id||!confirm('ลบผู้ใช้นี้จากฐานข้อมูลหรือไม่?'))return;
    const {error}=await a.db.from('ai_users').delete().eq('id',id).eq('client_id',a.clientId);
    if(error){showToast?.('ลบผู้ใช้ไม่สำเร็จ: '+error.message,'error');return;}
    await renderUsersDb();showToast?.('ลบผู้ใช้แล้ว','success');
  }

  function patch(){
    if(!api())return false;
    window.renderUsers=renderUsersDb;window.openUserModal=openUserModalDb;window.saveUser=saveUserDb;window.deleteUser=deleteUserDb;return true;
  }
  let tries=0;const timer=setInterval(async()=>{if(patch()){if(el('page-users')&&!el('page-users').classList.contains('hidden'))await renderUsersDb();if(++tries>8)clearInterval(timer);}else if(++tries>50)clearInterval(timer);},500);
})();