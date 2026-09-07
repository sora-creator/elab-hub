/* =====================================================================
   설정 저장소 (교사 웹훅 URL/토큰, 만든 시험 목록 — localStorage)
   exam/index.html 리팩터링 2단계 — utils.js(hookPost/jsonpFetch)에 의존
===================================================================== */
function deliveryCfg(){
  let c=null;
  try{ c=JSON.parse(localStorage.getItem('mockexam.delivery')||'null'); }catch(e){}
  if(!c) c = { url:'', token:'' };
  console.info('[ELAB delivery]',{page:'exam',source_key:'mockexam.delivery',url:c.url||''});
  return c;
}
function saveDelivery(c){ localStorage.setItem('mockexam.delivery', JSON.stringify(c)); }

function myExams(){
  try{ return JSON.parse(localStorage.getItem('mockexam.myExams')||'[]'); }catch(e){ return []; }
}
function saveMyExam(entry){
  const list = myExams();
  const idx = list.findIndex(x=>x.examKey===entry.examKey);
  if(idx===-1) list.unshift(entry); else list[idx]=entry;
  localStorage.setItem('mockexam.myExams', JSON.stringify(list));
}
