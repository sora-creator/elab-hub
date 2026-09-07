/* =====================================================================
   학생 앱
   exam/index.html 리팩터링 6단계 — utils.js/passageBank.js(createPassageMarker/numberSentencesHtml)에 의존
===================================================================== */
const StudentApp = {
  key: null, hookUrl: null, nums: '', exam: null, idx: 0, name: '', answers: [], times: [], started: [], tStart: 0,

  async init(key, hookUrl, nums){
    this.key = key;
    this.hookUrl = hookUrl;
    this.nums = nums || '';
    const app = document.getElementById('app');
    if(!hookUrl){
      app.innerHTML = `<div class="p-6 text-center text-sm text-coral-500">잘못된 링크예요(hook 누락). 선생님께 다시 문의해주세요.</div>`;
      return;
    }
    app.innerHTML = `<div class="p-6 text-center text-sm text-slate-600">불러오는 중...</div>`;
    let fetchUrl = hookUrl + '?action=fetchExam&key=' + encodeURIComponent(key) + this.assignmentQuery();
    if(this.nums) fetchUrl += '&nums=' + encodeURIComponent(this.nums);
    const r = await jsonpFetch(fetchUrl);
    if(!r || !r.found){
      app.innerHTML = `<div class="p-6 text-center text-sm text-coral-500">${r&&r.expired?'시험이 만료됐어요.':'시험을 찾을 수 없어요.'}</div>`;
      return;
    }
    this.exam = r;
    this.renderGate();
  },
  assignmentQuery(){
    const p=new URLSearchParams(location.search), keys=['assignment_target_id','student_id','assignmentCapability'];
    return keys.map(k=>p.get(k)?'&'+k+'='+encodeURIComponent(p.get(k)):'').join('');
  },
  attemptFields(){
    const p=new URLSearchParams(location.search);
    return {assignment_target_id:p.get('assignment_target_id')||'',student_id:p.get('student_id')||'',attempt_id:(this.exam&&this.exam.attempt_id)||'',attemptCapability:(this.exam&&this.exam.attemptCapability)||''};
  },
  submitAttemptItem(idx){
    const f=this.attemptFields(),questionId=this.exam.questionIds&&this.exam.questionIds[idx];
    if(!f.attempt_id||!questionId)return Promise.resolve();
    return hookPost(this.hookUrl,{action:'submitAttemptQuestionV2',...f,studentCapability:f.attemptCapability,question_id:questionId,sequence:idx+1,answer:this.answers[idx],elapsed_ms:this.times[idx]});
  },

  renderGate(){
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div class="mb-2 text-2xl font-extrabold text-slate-800">📝 ${esc(this.exam.title)}</div>
        <div class="mb-6 text-sm text-slate-600">${esc(this.exam.range||'')} · ${this.exam.questionCount}문항</div>
        <input id="sg-name" placeholder="이름을 입력하세요" class="mb-4 w-full max-w-xs rounded-xl border-2 border-slate-100 bg-slate-50 px-4 py-3 text-center text-sm outline-none focus:border-brand-400" />
        <button id="sg-start" class="btn3d w-full max-w-xs bg-brand-500 py-3.5 text-sm text-white">시작하기</button>
      </div>`;
    document.getElementById('sg-start').addEventListener('click', ()=>{
      const name = document.getElementById('sg-name').value.trim();
      if(!name) return toast('이름을 입력해주세요');
      this.name = name;
      this.renderNotice();
    });
  },

  // 문제 풀기 전에 문항별 시간이 측정된다는 걸 미리 안내(부담 없이, 그냥 평소처럼 풀면 된다는 톤으로).
  renderNotice(){
    const app = document.getElementById('app');
    app.innerHTML = `
      <div class="flex min-h-screen flex-col items-center justify-center px-6 text-center">
        <div class="mb-3 text-3xl">⏱️</div>
        <div class="mb-2 text-lg font-extrabold text-slate-800">문항마다 걸린 시간이 측정돼요</div>
        <p class="mb-6 max-w-xs text-sm leading-relaxed text-slate-600">각 문항을 푸는 데 걸린 시간이 기록돼요. 부담 갖지 말고 평소처럼 풀어보세요.</p>
        <button id="nt-start" class="btn3d w-full max-w-xs bg-brand-500 py-3.5 text-sm text-white">시작하기 🚀</button>
      </div>`;
    document.getElementById('nt-start').addEventListener('click', ()=>{
      this.idx = 0;
      this.answers = new Array(this.exam.questionCount).fill(null);
      this.times = new Array(this.exam.questionCount).fill(0);
      this.started = new Array(this.exam.questionCount).fill(false);
      this.renderQuestion();
    });
  },

  // 학생도 이전/다음으로 자유롭게 오가며 답을 고치거나 건너뛴 문항으로 돌아갈 수 있게 함
  // (기존엔 한 번 고르면 바로 다음으로만 넘어가는 방식이었음).
  renderQuestion(){
    const app = document.getElementById('app');
    const total = this.exam.questionCount;
    const current = this.answers[this.idx];
    const isLast = this.idx === total-1;
    const isText = this.exam.contentType === 'text';
    const content = isText ? this.exam.questionsContent[this.idx] : null;

    if(this._timerInterval){ clearInterval(this._timerInterval); this._timerInterval = null; }

    // 문항마다 "⏱ 타이머 시작" 버튼을 눌러야 그때부터 문제·보기가 드러나며 시간 측정이
    // 시작됨(기존엔 렌더 직후 자동으로 시간이 재졌음 — 문제를 읽는 시간까지 재지 않도록,
    // 학생이 준비됐을 때 스스로 시작하는 방식으로 변경). 한 번 시작한 문항은 다시 오갈 때
    // 또 숨기지 않음(재읽기 시간을 다시 재지는 않음).
    if(!this.started[this.idx]){
      app.innerHTML = `
        <div class="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <div class="mb-3 text-xs font-bold text-slate-500">${this.idx+1} / ${total}</div>
          <div class="mb-3 text-3xl">⏱️</div>
          <div class="mb-6 max-w-xs text-sm leading-relaxed text-slate-600">준비되면 버튼을 눌러 문제를 확인하세요.<br/>누르는 순간부터 이 문항의 시간이 측정돼요.</div>
          <button id="sq-timer-start" class="btn3d w-full max-w-xs bg-brand-500 py-3.5 text-sm text-white">⏱ 타이머 시작</button>
          ${this.idx>0 ? `<button id="sq-timer-prev" class="mt-4 text-xs font-bold text-slate-400">← 이전 문항으로</button>` : ''}
        </div>`;
      document.getElementById('sq-timer-start').addEventListener('click', ()=>{
        this.started[this.idx] = true;
        this.tStart = performance.now();
        this.renderQuestion();
      });
      const prevGateBtn = document.getElementById('sq-timer-prev');
      if(prevGateBtn) prevGateBtn.addEventListener('click', ()=> this.goTo(this.idx-1));
      return;
    }

    const bodyHtml = isText ? `
      <div class="rounded-2xl bg-slate-50 p-4">
        ${content.promptKo ? `<p class="mb-2 text-sm font-extrabold text-slate-700">${esc(content.promptKo)}</p>` : ''}
        ${content.html ? `
          <div class="fx-passage">${renderFormattedPassage_(content.html, content.promptKo, content.choices)}</div>
          ${content.footnote ? `<p class="mt-2 text-right text-xs italic text-slate-500">${esc(content.footnote)}</p>` : ''}
        ` : `<p class="whitespace-pre-line text-justify text-sm leading-relaxed text-slate-700">${numberSentencesHtml(content.text)}</p>`}
        ${content.image ? `<img class="qimg mt-3" src="${esc(content.image)}" />` : ''}
      </div>` : `<img class="qimg" src="${this.exam.imageUrls[this.idx]}" />`;

    const answersHtml = isText ? `
      <div class="mb-3 flex flex-col gap-2">
        ${content.choices.map((c,i)=>{
          const n=i+1;
          return `<button data-n="${n}" class="sq-ans btn3d py-3 text-left text-sm shadow ${current===n?'bg-brand-500 text-white':'bg-white text-slate-700'}" style="--btn-edge:${current===n?'#155e75':'#e2e8f0'}">${esc(c)}</button>`;
        }).join('')}
      </div>` : `
      <div class="mb-3 grid grid-cols-5 gap-2">
        ${[1,2,3,4,5].map(n=>`<button data-n="${n}" class="sq-ans btn3d rounded-xl border-2 py-4 text-lg font-extrabold shadow ${current===n?'border-brand-600 bg-brand-500 text-white':'border-slate-300 bg-white text-slate-700'}" style="--btn-edge:${current===n?'#155e75':'#cbd5e1'}">${'①②③④⑤'[n-1]}</button>`).join('')}
      </div>`;

    app.innerHTML = `
      <div class="flex min-h-screen flex-col px-4 py-5">
        <div class="mb-3 flex items-center justify-center gap-2 text-center text-xs font-bold text-slate-600">
          <span>${this.idx+1} / ${total}</span>
          <span class="rounded-full bg-brand-50 px-2 py-0.5 text-brand-600">⏱ <span id="sq-timer-elapsed">0:00</span></span>
        </div>
        <div class="mb-4 flex-1 overflow-y-auto">${bodyHtml}</div>
        ${answersHtml}
        <div class="flex gap-2">
          <button id="sq-prev" class="btn3d flex-1 bg-slate-100 py-3 text-sm text-slate-600" style="--btn-edge:#cbd5e1" ${this.idx===0?'disabled':''}>← 이전</button>
          ${isLast
            ? `<button id="sq-submit" class="btn3d flex-1 bg-grass-500 py-3 text-sm text-white">✅ 제출하기</button>`
            : `<button id="sq-next" class="btn3d flex-1 bg-brand-500 py-3 text-sm text-white">다음 →</button>`}
        </div>
      </div>`;
    const accumulatedMs = this.times[this.idx] || 0;
    this.tStart = performance.now();
    // 화면 표시 전용 실시간 카운터 -- this.times[] 누적 로직/submitResult 전송값과는 무관,
    // 학생이 지금 얼마나 걸리고 있는지 보여주는 용도라 여기서만 setInterval로 갱신.
    const elapsedEl = document.getElementById('sq-timer-elapsed');
    const paintElapsed=ms=>{const sec=Math.floor(ms/1000);elapsedEl.textContent=Math.floor(sec/60)+':'+String(sec%60).padStart(2,'0')};
    paintElapsed(accumulatedMs);
    this._timerInterval = setInterval(()=>{
      paintElapsed(accumulatedMs+performance.now()-this.tStart);
    }, 1000);
    $all('.sq-ans', app).forEach(b=>b.addEventListener('click', ()=> this.selectAnswer(+b.dataset.n)));
    const prevBtn = document.getElementById('sq-prev');
    if(prevBtn) prevBtn.addEventListener('click', ()=> this.goTo(this.idx-1));
    const nextBtn = document.getElementById('sq-next');
    if(nextBtn) nextBtn.addEventListener('click', ()=> this.goTo(this.idx+1));
    const submitBtn = document.getElementById('sq-submit');
    if(submitBtn) submitBtn.addEventListener('click', ()=> this.finish());

    // 키보드 ←/→로도 이전/다음 이동 — document에 붙는 리스너라 렌더마다 이전 것을 반드시
    // 해제하고 새로 등록해야 중복으로 쌓이지 않음(버튼은 매번 새 DOM이라 자동으로 안 쌓이지만
    // keydown은 document 자체에 붙기 때문에 명시적으로 관리해야 함).
    if(this._keyHandler) document.removeEventListener('keydown', this._keyHandler);
    this._keyHandler = (e)=>{
      if(e.key==='ArrowLeft') this.goTo(this.idx-1);
      else if(e.key==='ArrowRight' && !isLast) this.goTo(this.idx+1);
    };
    document.addEventListener('keydown', this._keyHandler);
  },

  selectAnswer(n){
    this.times[this.idx] += Math.round(performance.now()-this.tStart);
    this.answers[this.idx] = n;
    this.submitAttemptItem(this.idx);
    this.renderQuestion(); // 하이라이트 갱신 (안 넘어가고 같은 문항에 머무름)
  },

  goTo(newIdx){
    if(newIdx<0 || newIdx>=this.exam.questionCount) return;
    this.times[this.idx] += Math.round(performance.now()-this.tStart);
    this.idx = newIdx;
    this.renderQuestion();
  },

  async finish(){
    this.times[this.idx] += Math.round(performance.now()-this.tStart);
    if(this._keyHandler){ document.removeEventListener('keydown', this._keyHandler); this._keyHandler = null; }
    if(this._timerInterval){ clearInterval(this._timerInterval); this._timerInterval = null; }
    const missing = this.answers.filter(a=>a==null).length;
    if(missing>0){
      const ok = await askConfirm(`아직 답을 고르지 않은 문항이 ${missing}개 있어요. 그래도 제출할까요?`);
      if(!ok) return;
    }
    const app = document.getElementById('app');
    app.innerHTML = `<div class="p-6 text-center text-sm text-slate-600">채점 중...</div>`;
    const resultKey = uid(24);
    const studentAuth = this.exam.studentCapability
      ? { studentCapability:this.exam.studentCapability }
      : { studentSubmitToken:this.exam.studentSubmitToken||'' };
    await hookPost(this.hookUrl, {
      action:'submitResult', ...studentAuth,
      examKey: this.key, name: this.name, answers: this.answers, times: this.times,
      nums: this.nums || '', resultKey, ...this.attemptFields()
    });

    // no-cors POST 응답은 못 읽으므로, 채점 결과는 별도 GET(fetchMyResult)으로 재조회
    // (약간의 지연을 대비해 최대 3회, 800ms 간격으로 재시도).
    let fetchUrl = this.hookUrl + '?action=fetchMyResult&key=' + encodeURIComponent(this.key)
      + '&name=' + encodeURIComponent(this.name) + '&resultKey=' + encodeURIComponent(resultKey);
    if(this.exam.studentCapability) fetchUrl += '&studentCapability=' + encodeURIComponent(this.exam.studentCapability);
    else fetchUrl += '&studentSubmitToken=' + encodeURIComponent(this.exam.studentSubmitToken||'');
    if(this.nums) fetchUrl += '&nums=' + encodeURIComponent(this.nums);
    let result = null;
    for(let attempt=0; attempt<3 && !result; attempt++){
      await sleep(800);
      const r = await jsonpFetch(fetchUrl);
      if(r && r.found) result = r;
    }

    if(!result){
      app.innerHTML = `
        <div class="flex min-h-screen flex-col items-center justify-center px-6 text-center">
          <div class="mb-2 text-3xl">🎉</div>
          <div class="mb-2 text-lg font-extrabold text-slate-800">제출 완료!</div>
          <div class="text-sm text-slate-600">${esc(this.name)}님, 수고했어요.<br/>선생님이 결과를 확인할 거예요.</div>
        </div>`;
      return;
    }

    if(this.exam.attempt_id){
      const completion=await verifyAttemptCompletion(this.hookUrl,this.attemptFields());
      if(!completion.complete){
        app.innerHTML='<div class="flex min-h-screen flex-col items-center justify-center px-6 text-center"><div class="mb-2 text-lg font-extrabold text-coral-600">일부 결과가 저장되지 않았습니다.</div><div class="text-sm text-slate-600">다시 시도해주세요. ('+esc(completion.reason||'VERIFY_FAILED')+')</div></div>';
        return;
      }
    }

    const symbols = ['①','②','③','④','⑤'];
    app.innerHTML = `
      <div class="flex min-h-screen flex-col items-center px-6 py-10">
        <div class="mb-2 text-3xl">🎉</div>
        <div class="mb-1 text-lg font-extrabold text-slate-800">${esc(this.name)}님, 수고했어요!</div>
        <div class="mb-6 text-sm text-slate-600">${result.score} / ${result.total}개 정답</div>
        <div class="w-full max-w-md space-y-1.5">
          ${this.exam.questionNums.map((n,i)=>{
            const mine = result.studentAnswers[i], correct = result.correctAnswers[i];
            const ok = mine!=null && Number(mine)===Number(correct);
            const mineLabel = mine ? (symbols[mine-1]||mine) : '-';
            const correctLabel = correct ? (symbols[correct-1]||correct) : '-';
            return `<div class="flex items-center justify-between rounded-xl px-3 py-2 text-xs ${ok?'bg-grass-50 text-grass-700':'bg-coral-50 text-coral-600'}">
              <span class="font-bold">${n}번</span>
              <span>${ok?'✓ 정답':`✗ 내 답 ${mineLabel} · 정답 ${correctLabel}`}</span>
            </div>`;
          }).join('')}
        </div>
      </div>`;
  }
};

/* =====================================================================
   학생 끊어읽기 숙제 모드 (?study=SETKEY&hook=...) -- 원래 끊어읽기 모듈의 학생 화면을
   그대로 옮겨온 것. 답을 고르는 StudentApp(MC 퀴즈)과 별개의 학생 활동이라 독립 모듈로 둠.
===================================================================== */
const SentenceStudentApp = {
  async init(setKey, hook){
    const app = document.getElementById('app');
    if(!hook){
      app.innerHTML = `<div class="p-6 text-center text-sm text-coral-500">잘못된 링크예요(hook 누락). 선생님께 다시 문의해주세요.</div>`;
      return;
    }
    app.innerHTML = `<div class="p-6 text-center text-sm text-slate-600">불러오는 중...</div>`;
    const r = await jsonpFetch(hook + '?action=fetchSentenceSet&key=' + encodeURIComponent(setKey) + StudentApp.assignmentQuery());
    if(!r || !r.found){
      app.innerHTML = `<div class="p-6 text-center text-sm text-coral-500">공유된 자료를 찾을 수 없어요. 링크가 만료됐거나 잘못됐을 수 있어요.</div>`;
      return;
    }
    document.title = 'ELAB · 학생용';
    const passages = r.passages || [];
    if(passages.length===0){
      app.innerHTML = `<div class="p-6 text-center text-sm text-slate-600">지문이 없어요.</div>`;
      return;
    }
    const markers = passages.map(p=>createPassageMarker(p.text, p.html, p.promptKo, p.choices, [], []));
    let curIdx = 0;

    app.innerHTML = `
      <div class="mx-auto max-w-2xl px-5 py-6">
        <div class="mb-4 text-center">
          <p class="text-xs font-black tracking-widest text-brand-400">끊어읽기 숙제</p>
          <h1 class="text-xl font-extrabold text-slate-800">🧩 ${esc(r.label || '끊어읽기 숙제')}</h1>
        </div>
        <div class="mb-3 rounded-2xl bg-white p-3 shadow">
          <input id="st-name" placeholder="이름을 입력하세요" value="${esc(localStorage.getItem('elab.studentName')||'')}" class="w-full rounded-xl border-2 border-slate-100 bg-white px-3 py-2.5 text-center text-sm font-bold outline-none focus:border-brand-400" />
        </div>
        <div class="mb-3 flex flex-wrap gap-1.5" id="st-nums"></div>
        <section class="rounded-3xl bg-white p-4 shadow">
          <h2 id="st-num-title" class="mb-2 text-sm font-extrabold text-slate-700"></h2>
          <div class="mb-3 flex flex-wrap items-center gap-2" id="st-pens">
            <span class="text-xs font-bold text-slate-500">표시</span>
            <button data-pen="subj" class="pen-btn rounded-xl border-2 px-3 py-2 text-xs font-bold">🟡 주어</button>
            <button data-pen="verb" class="pen-btn rounded-xl border-2 px-3 py-2 text-xs font-bold">🟩 동사</button>
            <button data-pen="unknown" class="pen-btn rounded-xl border-2 px-3 py-2 text-xs font-bold">🔴 모르는 단어</button>
          </div>
          <div id="st-passage-view" class="passage-mark-view rounded-2xl bg-slate-50 p-4"></div>
        </section>
        <button id="st-submit" class="btn3d mt-4 w-full rounded-xl bg-grass-500 py-3.5 text-sm font-bold text-white">제출하기 ✅</button>
        <p id="st-submit-status" class="mt-2 text-center text-xs font-bold text-grass-600"></p>
      </div>
    `;

    const renderNums = ()=>{
      document.getElementById('st-nums').innerHTML = passages.map((p,i)=>
        `<button data-st-num="${i}" class="h-10 min-w-10 rounded-xl px-2 text-sm font-bold ${i===curIdx?'bg-brand-500 text-white':'bg-slate-100 text-slate-600'}">${p.num||(i+1)}</button>`
      ).join('');
      app.querySelectorAll('[data-st-num]').forEach(btn=>{
        btn.addEventListener('click', ()=>{ curIdx = +btn.dataset.stNum; renderCurrent(); });
      });
    };
    const renderCurrent = ()=>{
      renderNums();
      document.getElementById('st-num-title').textContent = (passages[curIdx].num || (curIdx+1)) + '번';
      const view = document.getElementById('st-passage-view');
      view.className = 'passage-mark-view rounded-2xl bg-slate-50 p-4' + (passages[curIdx].html ? ' fx-passage' : '');
      markers[curIdx].mount(view, document.getElementById('st-pens'));
    };
    renderCurrent();

    document.getElementById('st-submit').addEventListener('click', async ()=>{
      const name = document.getElementById('st-name').value.trim();
      if(!name){ toast('이름을 먼저 입력해주세요'); return; }
      localStorage.setItem('elab.studentName', name);
      const ok = await askConfirm('끊어읽기 · 주어 · 동사 · 모르는 단어를 모두 표시했나요?');
      if(!ok) return;
      const btn = document.getElementById('st-submit');
      btn.disabled = true;
      btn.textContent = '제출 중...';
      await hookPost(hook, {
        action: 'submitSentenceHomework',
        ...(r.studentCapability ? { studentCapability:r.studentCapability } : { studentSubmitToken:r.studentSubmitToken||'' }),
        setKey, name,
        assignment_target_id:new URLSearchParams(location.search).get('assignment_target_id')||'',
        student_id:new URLSearchParams(location.search).get('student_id')||'',
        attempt_id:r.attempt_id||'',attemptCapability:r.attemptCapability||'',
        passages: passages.map((p,i)=>{
          const s = markers[i].getState();
          return { id: p.id, question_id:p.question_id||'', num: p.num || (i+1), text: p.text, chunkGaps: s.chunkGaps, sv: s.sv };
        })
      });
      btn.textContent = '제출 완료 ✅';
      document.getElementById('st-submit-status').textContent = '제출됐어요. 감사합니다!';
    });
  }
};

/* 학생용 문장구조 연습 — 공백 기준 token index를 정답/학생 선택의 단일 기준으로 사용한다. */
function normalizeSentenceTokenIndexes(values){
  return [...new Set(Array.from(values||[]).filter(value=>value!==null&&value!==''&&value!==false).map(Number).filter(Number.isInteger))].sort((a,b)=>a-b);
}
function gradeSentenceTokenSelection(subject,verb,correctSubject,correctVerb){
  const same=(left,right)=>{
    const a=normalizeSentenceTokenIndexes(left),b=normalizeSentenceTokenIndexes(right);
    return a.length===b.length&&a.every((value,index)=>value===b[index]);
  };
  return {subjectCorrect:same(subject,correctSubject),verbCorrect:same(verb,correctVerb)};
}
const SentenceStructureTokenApp = {
  async init(setKey, hook){
    const app=document.getElementById('app');
    if(!hook){app.innerHTML='<div class="p-6 text-center text-sm text-coral-500">잘못된 링크입니다.</div>';return}
    app.innerHTML='<div class="p-6 text-center text-sm text-slate-600">불러오는 중...</div>';
    const r=await jsonpFetch(hook+'?action=fetchSentenceSet&key='+encodeURIComponent(setKey)+StudentApp.assignmentQuery());
    if(!r||!r.found){app.innerHTML='<div class="p-6 text-center text-sm text-coral-500">공유된 자료를 찾을 수 없습니다.</div>';return}
    const passages=r.passages||[];
    if(!passages.length){app.innerHTML='<div class="p-6 text-center text-sm text-slate-600">문장이 없습니다.</div>';return}
    const indexes=(p,type)=>{
      const explicit=p[type==='subject'?'correct_subject_token_indexes':'correct_main_verb_token_indexes'];
      if(Array.isArray(explicit))return [...new Set(explicit.map(Number).filter(Number.isInteger))].sort((a,b)=>a-b);
      return (p.correct_sv||p.sv||[]).reduce((out,value,index)=>{if(value===(type==='subject'?'subj':'verb'))out.push(index);return out},[]);
    };
    const states=passages.map(p=>({tokens:(p.overlayWords&&p.overlayWords.length?p.overlayWords.map(w=>w.text):buildTokens(p.text||'').tokens),gaps:new Set(),subject:new Set(),verb:new Set(),unknown:new Set(),annotations:[],correctSubject:indexes(p,'subject'),correctVerb:indexes(p,'verb'),mode:'subject',graded:false,subjectCorrect:false,verbCorrect:false,startedAt:performance.now(),elapsedMs:0}));
    let current=0,name=localStorage.getItem('elab.studentName')||'';
    const snapshot=(tokens,selected)=>[...selected].sort((a,b)=>a-b).map(index=>({index,original_text:tokens[index]||''}));
    const selectedText=(tokens,selected)=>[...selected].sort((a,b)=>a-b).map(i=>tokens[i]).join(' ')||'선택 없음';
    const render=()=>{
      const p=passages[current],s=states[current],isLast=current===passages.length-1;
      app.innerHTML=`<main class="mx-auto min-h-screen max-w-3xl px-4 py-6 sm:px-6">
        <header class="mb-5 text-center"><p class="text-xs font-black tracking-widest text-brand-500">문장구조 연습</p><h1 class="mt-1 text-xl font-extrabold text-slate-800">${esc(r.label||'문장구조 연습')}</h1><p class="mt-2 text-sm font-bold text-slate-500">${current+1} / ${passages.length}</p></header>
        <section class="rounded-2xl bg-white p-4 shadow sm:p-6">
          <h2 class="mb-3 text-sm font-extrabold text-slate-700">${esc(p.numLabel||p.num)}번</h2>
          <div id="student-pens" class="sticky top-2 z-40 mb-4 flex flex-wrap gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-lg backdrop-blur" role="group" aria-label="선택 모드">${p.image?`<button type="button" class="pen-btn flex-1 rounded-xl border-2 px-3 py-3 text-sm font-extrabold" data-pen="subj">주어</button><button type="button" class="pen-btn flex-1 rounded-xl border-2 px-3 py-3 text-sm font-extrabold" data-pen="verb">본동사</button><button type="button" class="pen-btn flex-1 rounded-xl border-2 px-3 py-3 text-sm font-extrabold" data-pen="unknown">모르는 단어</button><button type="button" class="pen-btn flex-1 rounded-xl border-2 px-3 py-3 text-sm font-extrabold" data-pen="slash">／ 끊어읽기</button>`:`<button type="button" class="ss-mode flex-1 rounded-xl border-2 px-3 py-3 text-sm font-extrabold" data-mode="subject" aria-pressed="${s.mode==='subject'}">주어</button><button type="button" class="ss-mode flex-1 rounded-xl border-2 px-3 py-3 text-sm font-extrabold" data-mode="verb" aria-pressed="${s.mode==='verb'}">본동사</button><button type="button" class="ss-mode flex-1 rounded-xl border-2 px-3 py-3 text-sm font-extrabold" data-mode="unknown" aria-pressed="${s.mode==='unknown'}">모르는 단어</button>`}</div>
          <p class="mb-3 text-center text-xs font-bold text-slate-500">표시 모드를 고른 뒤 단어를 클릭하세요. 다시 클릭하면 선택이 해제됩니다.</p>
          ${p.image?`<div id="student-pdf-mark" role="group" aria-label="PDF 문항 이미지"></div>`:`<div class="ss-token-grid" role="group" aria-label="영어 문장 token">${s.tokens.map((token,index)=>{const chosenSubject=s.subject.has(index),chosenVerb=s.verb.has(index),chosenUnknown=s.unknown.has(index),wrong=s.graded&&(chosenSubject&&!s.correctSubject.includes(index)||chosenVerb&&!s.correctVerb.includes(index)),correct=s.graded&&(s.correctSubject.includes(index)||s.correctVerb.includes(index));return`${index?`<button type="button" class="chunk-gap${s.gaps.has(index)?' active':''}" data-gap-index="${index}" aria-label="${index}번째 단어 앞 끊어읽기" ${s.graded?'disabled':''}>${s.gaps.has(index)?'/':'·'}</button>`:''}<button type="button" class="ss-token${chosenSubject?' subject':''}${chosenVerb?' verb':''}${chosenUnknown?' unknown':''}${wrong?' wrong':''}${correct?' correct':''}" data-token-index="${index}" aria-pressed="${chosenSubject||chosenVerb||chosenUnknown}" ${s.graded?'disabled':''}>${esc(token)}</button>`}).join('')}</div>`}
          <div class="mt-4 grid gap-2 text-xs sm:grid-cols-2"><div class="rounded-xl bg-blue-50 p-3"><b>주어 선택</b><div class="mt-1" id="ss-subject-text">${esc(selectedText(s.tokens,s.subject))}</div></div><div class="rounded-xl bg-emerald-50 p-3"><b>본동사 선택</b><div class="mt-1" id="ss-verb-text">${esc(selectedText(s.tokens,s.verb))}</div></div></div>
          <div class="ss-feedback mt-4" ${s.graded&&!p.image?'':'hidden'}><div class="grid gap-2 sm:grid-cols-2"><div><b>주어 ${s.subjectCorrect?'✓ 정답':'✕ 오답'}</b><p class="mt-1 text-xs">학생 선택: ${esc(selectedText(s.tokens,s.subject))}</p><p class="text-xs">정답: ${esc(selectedText(s.tokens,new Set(s.correctSubject)))}</p></div><div><b>본동사 ${s.verbCorrect?'✓ 정답':'✕ 오답'}</b><p class="mt-1 text-xs">학생 선택: ${esc(selectedText(s.tokens,s.verb))}</p><p class="text-xs">정답: ${esc(selectedText(s.tokens,new Set(s.correctVerb)))}</p></div></div><p class="mt-3 text-[11px] text-slate-500">초록 밑줄은 정답 위치, 붉은 표시는 틀리게 선택한 위치입니다.</p></div>
          <p id="ss-message" class="mt-3 min-h-5 text-center text-xs font-bold text-coral-500" aria-live="polite"></p>
          ${s.graded?`<button id="ss-next" class="btn3d mt-2 w-full bg-brand-500 py-3.5 text-sm text-white">${isLast?'결과 저장하기':'다음 문장 →'}</button>`:`<button id="ss-grade" class="btn3d mt-2 w-full bg-grass-500 py-3.5 text-sm text-white">제출하고 채점하기</button>`}
        </section></main>`;
      app.querySelectorAll('.ss-mode').forEach(button=>button.onclick=()=>{if(s.graded)return;s.mode=button.dataset.mode;render()});
      if(p.image){
        const pdfMarker=createPdfImageMarker(p.image,p.overlayWords||[],[],[],s.annotations,state=>{s.annotations=state.annotations;s.gaps=new Set(state.chunkGaps);s.subject.clear();s.verb.clear();s.unknown.clear();state.sv.forEach((type,index)=>{if(type==='subj')s.subject.add(index);else if(type==='verb')s.verb.add(index);else if(type==='unknown')s.unknown.add(index)})},s.graded);
        pdfMarker.mount(document.getElementById('student-pdf-mark'),document.getElementById('student-pens'));
      }
      app.querySelectorAll('[data-token-index]').forEach(button=>button.onclick=()=>{if(s.graded)return;const index=Number(button.dataset.tokenIndex),mine=s[s.mode];if(mine.has(index))mine.delete(index);else{s.subject.delete(index);s.verb.delete(index);s.unknown.delete(index);mine.add(index)}render()});
      app.querySelectorAll('[data-gap-index]').forEach(button=>button.onclick=()=>{if(s.graded)return;const index=Number(button.dataset.gapIndex);if(s.gaps.has(index))s.gaps.delete(index);else s.gaps.add(index);render()});
      const grade=document.getElementById('ss-grade');if(grade)grade.onclick=()=>{const message=document.getElementById('ss-message');if(!s.subject.size||!s.verb.size){message.textContent='핵심 주어와 본동사를 모두 선택해주세요.';return}if(!s.correctSubject.length||!s.correctVerb.length){message.textContent='이 문장의 정답 token이 등록되지 않았습니다. 선생님께 문의해주세요.';return}s.elapsedMs=Math.max(0,Math.round(performance.now()-s.startedAt));const result=gradeSentenceTokenSelection(s.subject,s.verb,s.correctSubject,s.correctVerb);s.subjectCorrect=result.subjectCorrect;s.verbCorrect=result.verbCorrect;s.graded=true;render()};
      const next=document.getElementById('ss-next');if(next)next.onclick=async()=>{
        if(!isLast){current++;states[current].startedAt=performance.now();render();return}
        next.disabled=true;next.textContent='결과 저장 확인 중...';name=name||'학생';localStorage.setItem('elab.studentName',name);
        const query=new URLSearchParams(location.search),completionContext={assignment_target_id:query.get('assignment_target_id')||'',student_id:query.get('student_id')||'',attempt_id:r.attempt_id||'',attemptCapability:r.attemptCapability||''},payload={action:'submitSentenceHomework',...(r.studentCapability?{studentCapability:r.studentCapability}:{studentSubmitToken:r.studentSubmitToken||''}),setKey,name,...completionContext,passages:passages.map((passage,index)=>{const x=states[index],sv=new Array(x.tokens.length).fill(null);x.subject.forEach(i=>sv[i]='subj');x.verb.forEach(i=>sv[i]='verb');x.unknown.forEach(i=>sv[i]='unknown');return{id:passage.id,question_id:passage.question_id||'',num:passage.num||(index+1),text:passage.text,chunkGaps:[...x.gaps].sort((a,b)=>a-b),sv,annotations:x.annotations,selected_subject_token_indexes:[...x.subject],selected_main_verb_token_indexes:[...x.verb],correct_subject_token_indexes:x.correctSubject,correct_main_verb_token_indexes:x.correctVerb,subject_token_snapshot:snapshot(x.tokens,x.subject),main_verb_token_snapshot:snapshot(x.tokens,x.verb),elapsed_ms:x.elapsedMs,metadata:passage.metadata||passage.category_keys||[]}})};
        console.info('SENTENCE_SUBMIT_START',{attempt_id_present:!!completionContext.attempt_id,target_id_present:!!completionContext.assignment_target_id,passage_count:payload.passages.length});
        try{
          const submitted=await hookPost(hook,payload);console.info('SENTENCE_SUBMIT_RETURNED',{dispatched:submitted});
          if(!submitted)throw new Error('SUBMIT_FAILED');
          console.info('SENTENCE_VERIFY_START',{attempt_id_present:!!completionContext.attempt_id,target_id_present:!!completionContext.assignment_target_id});
          const completion=await verifyAttemptCompletion(hook,completionContext),confirmed=!!completion&&completion.attempt_found===true&&completion.target_found===true&&completion.attempt_status==='COMPLETED'&&completion.target_status==='COMPLETED'&&completion.complete===true;
          console.info('SENTENCE_VERIFY_RESPONSE',{attempt_found:!!(completion&&completion.attempt_found),target_found:!!(completion&&completion.target_found),attempt_status:completion&&completion.attempt_status||'',target_status:completion&&completion.target_status||'',complete:!!(completion&&completion.complete),reason:completion&&completion.reason||''});
          if(!confirmed)throw new Error(completion&&completion.reason||'VERIFY_FAILED');
          console.info('SENTENCE_COMPLETE_CONFIRMED',{complete:true});
          const subjectCorrect=states.filter(x=>x.subjectCorrect).length,verbCorrect=states.filter(x=>x.verbCorrect).length;app.innerHTML=`<div class="flex min-h-screen flex-col items-center justify-center px-6 text-center"><div class="mb-3 text-3xl">✅</div><h1 class="text-xl font-extrabold">학습을 완료했습니다.</h1><div class="mt-5 grid w-full max-w-sm grid-cols-2 gap-3"><div class="rounded-xl bg-blue-50 p-4"><span class="text-xs">주어 정답</span><b class="mt-1 block text-xl">${subjectCorrect} / ${states.length}</b></div><div class="rounded-xl bg-emerald-50 p-4"><span class="text-xs">본동사 정답</span><b class="mt-1 block text-xl">${verbCorrect} / ${states.length}</b></div></div></div>`;
        }catch(error){
          console.error('SENTENCE_COMPLETE_NOT_CONFIRMED',{reason:error&&error.message||'VERIFY_FAILED'});next.disabled=false;next.textContent='결과 저장 다시 시도';const message=document.getElementById('ss-message');if(message)message.textContent='일부 결과가 저장되지 않았습니다. 다시 시도해주세요.';
        }
      };
    };
    render();
  }
};
