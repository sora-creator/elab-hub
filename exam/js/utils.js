/* =====================================================================
   공통 유틸 (VocaTest 관습 재사용)
   exam/index.html 리팩터링 1단계 — 의존성 없는 순수 헬퍼만 모음
===================================================================== */
function uid(n){ n=n||10; const c='abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789'; let s=''; for(let i=0;i<n;i++) s+=c[Math.floor(Math.random()*c.length)]; return s; }
function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g, m=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[m])); }

// 지문 도표·그림 업로드용 -- 원본을 그대로 base64로 넣으면 localStorage(약 5~10MB 한도)가
// 금방 찰 수 있어 캔버스로 리사이즈(가로 최대 900px) + JPEG 압축(0.75) 후 dataURL로 저장.
function readImageCompressed(file){
  return new Promise((resolve, reject)=>{
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = ()=>{
      const img = new Image();
      img.onerror = reject;
      img.onload = ()=>{
        const scale = Math.min(1, 900 / img.width);
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(img.width * scale);
        canvas.height = Math.round(img.height * scale);
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL('image/jpeg', 0.75));
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// 모듈 간 이동 바 -- 6개 하위 페이지(단어암기/문법학습/끊어읽기/시험보기/학생관리/대시보드) 공통,
// 마크업+클래스(shared/theme.css의 .eb-nav)를 그대로 써서 위치·글자크기를 통일함(학생 화면에는 안 씀)
function elabNav(current){
  return `<div data-elab-nav="${current}"></div>`;
}
function $(sel, root){ return (root||document).querySelector(sel); }
function $all(sel, root){ return Array.from((root||document).querySelectorAll(sel)); }

let toastTimer=null;
function toast(msg){
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.style.opacity = '1';
  clearTimeout(toastTimer);
  toastTimer = setTimeout(()=>{ el.style.opacity='0'; }, 2200);
}

// 확인창 (native confirm 대신 — 미리보기/임베드 환경에서 차단될 수 있어 자체 구현)
function askConfirm(msg){
  return new Promise(resolve=>{
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        <p class="mb-4 whitespace-pre-line text-sm font-bold text-slate-700">${esc(msg)}</p>
        <div class="flex gap-2">
          <button data-a="0" class="btn3d flex-1 bg-slate-100 py-2.5 text-sm text-slate-600" style="--btn-edge:#cbd5e1">취소</button>
          <button data-a="1" class="btn3d flex-1 bg-brand-500 py-2.5 text-sm text-white">확인</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e=>{
      const b = e.target.closest('button');
      if(!b && e.target!==wrap) return;
      const ok = b ? b.dataset.a==='1' : false;
      wrap.remove();
      resolve(ok);
    });
  });
}

function askPrompt(msg, def){
  return new Promise(resolve=>{
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="w-full max-w-sm rounded-3xl bg-white p-5 shadow-2xl">
        <p class="mb-3 whitespace-pre-line text-sm font-bold text-slate-700">${esc(msg)}</p>
        <input id="ap-input" value="${esc(def||'')}" class="mb-4 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
        <div class="flex gap-2">
          <button data-a="0" class="btn3d flex-1 bg-slate-100 py-2.5 text-sm text-slate-600" style="--btn-edge:#cbd5e1">취소</button>
          <button data-a="1" class="btn3d flex-1 bg-brand-500 py-2.5 text-sm text-white">확인</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    const input = wrap.querySelector('#ap-input');
    input.focus(); input.select();
    const submit = ok=>{ const v = input.value; wrap.remove(); resolve(ok? v : null); };
    wrap.addEventListener('click', e=>{
      const b = e.target.closest('button');
      if(!b && e.target!==wrap) return;
      submit(b ? b.dataset.a==='1' : false);
    });
    input.addEventListener('keydown', e=>{ if(e.key==='Enter') submit(true); });
  });
}

// JSONP GET (Apps Script 응답을 CORS 없이 읽기 위함)
function jsonpFetch(url, timeoutMs){
  return ELABAppsScript.read(url,{timeoutMs:timeoutMs||12000}).catch(error=>{
    console.error('[ELAB READ]',{code:error.code||'NETWORK_ERROR',message:error.message||String(error)});
    return null;
  });
}

// POST (no-cors — 응답 확인 불가, 전송 시도만)
async function hookPost(url, body){
  const controller=typeof AbortController!=='undefined'?new AbortController():null;
  const timer=setTimeout(()=>{if(controller)controller.abort()},30000);
  try{
    await fetch(url, { method:'POST', mode:'no-cors', signal:controller?controller.signal:undefined, headers:{'Content-Type':'text/plain;charset=utf-8'}, body: JSON.stringify(body) });
    return true;
  }catch(e){return false;}
  finally{clearTimeout(timer)}
}

async function verifyAttemptCompletion(url, context){
  if(!context||!context.attempt_id)return {ok:false,complete:false,reason:'MISSING_CONTEXT'};
  let last=null;
  for(let i=0;i<4;i++){
    if(i)await sleep(700);
    try{last=await ELABAppsScript.verifyCompletion(url,context,{timeoutMs:20000});if(last&&last.complete)return last}catch(error){last={ok:false,complete:false,reason:error.code||'NETWORK_ERROR'}}
  }
  return last||{ok:false,complete:false,reason:'VERIFY_FAILED'};
}

async function sleep(ms){ return new Promise(r=>setTimeout(r, ms)); }
