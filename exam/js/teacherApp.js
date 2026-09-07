/* =====================================================================
   교사 앱
   exam/index.html 리팩터링 7단계 — utils.js/sheetService.js/questionTypes.js/pdfService.js/
   passageBank.js에 의존. TeacherApp 셸 + 탭 6개(SentenceSubmissions/BoundaryEditor/
   Preview/Answer/Publish/Settings/Results)를 탭 간 공유 상태(draft 등)가 많아 한 파일로 둠.
===================================================================== */
const TeacherApp = {
  get tab(){ return appState.teacher.tab; },
  set tab(v){ appState.teacher.tab = v; },
  get draft(){ return appState.teacher.draft; },
  set draft(v){ appState.teacher.draft = v; },

  init(){
    if(appState.teacher.tool === 'sentence-structure'){
      FolderBank.selectMode = true;
      FolderBank.selectedIds = new Set();
      FolderBank.selectAnchor = null;
      this.tab = 'make';
      const db=loadPassageDB(),pendingIds=db.folders.filter(folder=>folder.pendingRender&&!db.passages.some(p=>p.folderId===folder.id)).map(folder=>folder.id);
      if(pendingIds.length){db.folders=db.folders.filter(folder=>!pendingIds.includes(folder.id));savePassageDB(db)}
    }
    this.pdfSelection=this.pdfSelection||new Set();
    if(!this.pdfLibrarySubscribed){this.pdfLibrarySubscribed=true;ElabPdfLibrary.subscribe(()=>this.syncPdfLibraryToFolders())}
    this.render();
  },

  render(){
    const app = document.getElementById('app');
    app.innerHTML = `
      <div>
        ${elabNav(appState.teacher.tool === 'sentence-structure' ? 'sentence' : 'exam')}
        <div class="eb-page-header">
          <h1>${appState.teacher.tool === 'sentence-structure' ? '문장구조 연습' : '개별문제'}</h1>
        </div>
      </div>
      <main class="px-5 pt-3" id="tab-root"></main>
    `;
    $all('[data-tab]', app).forEach(b=>b.addEventListener('click', ()=>{ this.tab=b.dataset.tab; this.render(); }));
    const root = document.getElementById('tab-root');
    this.renderMake(root);
  },

  renderMake(root){
    // 폴더(끊어읽기와 연동 가능)에 저장한 지문+보기로만 문제를 만듦 — PDF 업로드/자르기는
    // "실전연습" 페이지로 옮겨감(문항별로 자르지 않고 OMR 방식으로 따로 다룸).
    if(!this.draft){
      FolderBank.render(root);
      const sentenceMode=appState.teacher.tool==='sentence-structure',targetLabel=sentenceMode?'문장구조 연습':'개별문제';
      const savedProgress=this.pdfAutoProgress,progressText=savedProgress?`전체 ${savedProgress.percent}% (${savedProgress.done}/${savedProgress.total}) · ${savedProgress.message}`:`전체 0% (0/0) · 검수 완료 PDF를 확인하고 있습니다.`;
      root.insertAdjacentHTML('afterbegin',`<section class="mb-4 rounded-3xl bg-white p-4 shadow"><div class="flex items-center justify-between gap-3"><div class="min-w-0 flex-1"><h2 class="text-sm font-extrabold text-slate-700">PDF 자료 자동 반영</h2><p id="teacher-pdf-auto-status" class="mt-1 truncate text-xs text-slate-500">${esc(progressText)}</p><div class="mt-2 h-2 overflow-hidden rounded-full bg-slate-100"><div id="teacher-pdf-auto-bar" class="h-full rounded-full bg-brand-500 transition-all" style="width:${savedProgress?savedProgress.percent:0}%"></div></div></div><a href="../pdf/index.html" class="shrink-0 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-bold text-slate-600">PDF 자료관리</a></div></section>`);
      if(this.skipNextPdfAutoSync)this.skipNextPdfAutoSync=false;else this.syncPdfLibraryToFolders();
      return;
    }
    if(this.draft.step==='preview') return BoundaryEditor.render(root, this.draft, ()=>this.render());
    if(this.draft.step==='answers') return AnswerStep.render(root, this.draft, ()=>this.render());
    if(this.draft.step==='publish') return PublishStep.render(root, this.draft, ()=>{ this.draft=null; this.render(); });
  }
  ,

  async syncPdfLibraryToFolders(){
    if(this.pdfAutoSyncRunning)return;
    this.pdfAutoSyncRunning=true;
    const status=()=>document.getElementById('teacher-pdf-auto-status');
    const paint=(percent,done,total,message)=>{const value=Math.max(0,Math.min(100,Math.round(percent))),el=status(),bar=document.getElementById('teacher-pdf-auto-bar');this.pdfAutoProgress={percent:value,done,total,message};if(el)el.textContent=`전체 ${value}% (${done}/${total}) · ${message}`;if(bar)bar.style.width=value+'%'};
    const targetLabel=appState.teacher.tool==='sentence-structure'?'문장구조 연습':'개별문제';
    try{
      const allRecords=await ElabPdfLibrary.list(),db=loadPassageDB(),pending=[],knownFailures=[],renderVersion='question-crop-v20-inline-choice-five',sentenceMode=appState.teacher.tool==='sentence-structure';
      const libraryIds=new Set(allRecords.map(record=>record.id)),staleFolderIds=new Set(db.folders.filter(folder=>folder.sourcePdfId&&!libraryIds.has(folder.sourcePdfId)).map(folder=>folder.id));
      if(staleFolderIds.size){db.passages=db.passages.filter(passage=>!staleFolderIds.has(passage.folderId));db.folders=db.folders.filter(folder=>!staleFolderIds.has(folder.id));let removed=true;while(removed){const before=db.folders.length,parents=new Set(db.folders.map(folder=>folder.parentId).filter(Boolean));db.folders=db.folders.filter(folder=>!folder.autoGroup||parents.has(folder.id));removed=db.folders.length!==before}await savePassageDB(db)}
      const isApproved=record=>ElabPdfLibrary.isReviewed(record),waitingCount=allRecords.filter(record=>!isApproved(record)).length;
      let metadataChanged=false,reviewVisibilityChanged=false;
      allRecords.forEach(record=>{const title=this.pdfTitle(record),folder=db.folders.find(f=>f.sourcePdfId===record.id)||db.folders.find(f=>f.name===title);if(folder&&folder.reviewPending===isApproved(record)){folder.reviewPending=!isApproved(record);metadataChanged=true;reviewVisibilityChanged=true}});
      const records=allRecords.filter(isApproved);
      const failedVersions=this.pdfAutoFailedVersions||(this.pdfAutoFailedVersions={});
      records.forEach(record=>{
        const title=this.pdfTitle(record),folder=db.folders.find(f=>f.sourcePdfId===record.id)||db.folders.find(f=>f.name===title);
        const failed=failedVersions[record.id],version=Number(record.updatedAt||0)+'|'+renderVersion;
        if(!folder){if(failed&&failed.version===version)knownFailures.push(failed);else pending.push(record);return}
        if(folder.sourcePdfId!==record.id||folder.sourcePdfName!==record.name){folder.sourcePdfId=record.id;folder.sourcePdfName=record.name;metadataChanged=true}
        if(folder.pendingRender){pending.push(record);return}
        const approvedRenderVersion=record.renderReviewVersion||folder.renderVersion||renderVersion;
        if(folder.renderVersion!==approvedRenderVersion){
          // 이미 문항이 있고 PDF 자료관리에서 검수 완료된 폴더는 새 규칙만으로
          // 자동 재렌더링하지 않는다. 명시적으로 "다시 렌더링"한 경우에는
          // pendingRender가 위 분기에서 처리한다.
          if(db.passages.some(passage=>passage.folderId===folder.id)){folder.renderVersion=approvedRenderVersion;metadataChanged=true}
          else{pending.push(record);return}
        }
        delete failedVersions[record.id];
        db.passages.filter(p=>p.folderId===folder.id).forEach(p=>{const answer=Number((record.answers||{})[p.num])||null;if(!p.choices||p.choices.length!==5){p.choices=['①','②','③','④','⑤'];p.autoOmrChoices=true;metadataChanged=true}if(p.answer!==answer){p.answer=answer;metadataChanged=true}});
      });
      if(metadataChanged)await savePassageDB(db);
      // 오래 걸리는 검수용 렌더링이 끝날 때까지 기다리지 않고, 검수 대기 폴더를
      // 일반 폴더트리에서 즉시 감춘다. 검수 화면에서는 계속 선택할 수 있다.
      if(reviewVisibilityChanged&&document.getElementById('tab-root')){this.skipNextPdfAutoSync=true;this.render()}
      if(!pending.length){
        if(knownFailures.length){const first=knownFailures[0],successCount=records.length-knownFailures.length,more=knownFailures.length>1?` 외 ${knownFailures.length-1}개`:'';paint(100,records.length,records.length,`처리 완료 · 성공 ${successCount}개 · 실패 ${knownFailures.length}개: ${first.name}${more} (${first.reason})`)}
        else paint(100,records.length,records.length,waitingCount?`검수 완료 PDF는 ${targetLabel}에 반영되어 있습니다. · 검수 대기 ${waitingCount}개`:`PDF 자료가 ${targetLabel} 폴더에 반영되어 있습니다.`);
        return
      }
      const totalFiles=records.length,alreadyDone=totalFiles-pending.length;
      const failedFiles=[];
      for(let i=0;i<pending.length;i++){
        const done=alreadyDone+i;
        const workLabel=sentenceMode&&!isApproved(pending[i])?'검수용 렌더링 중 · 자동 반영 전':`${targetLabel} 자동 반영 중`;
        paint(done/totalFiles*100,done,totalFiles,workLabel);
        const imported=await this.importPdf(ElabPdfLibrary.asFile(pending[i]),pending[i],{background:true,toFolder:true,onProgress:(cur,pageTotal)=>{const fileFraction=Math.max(0,Math.min(1,cur/Math.max(1,pageTotal)));paint((done+fileFraction*.9)/totalFiles*100,done,totalFiles,workLabel)}});
        if(!imported){const failure={name:pending[i].name||this.pdfTitle(pending[i]),reason:this.lastPdfImportError||'PDF를 분석하지 못했습니다.',version:Number(pending[i].updatedAt||0)+'|'+renderVersion};failedFiles.push(failure);failedVersions[pending[i].id]=failure}else delete failedVersions[pending[i].id];
        paint((done+1)/totalFiles*100,done+1,totalFiles,workLabel);
        await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(knownFailures.length||failedFiles.length){
        const allFailures=knownFailures.concat(failedFiles),successCount=totalFiles-allFailures.length,first=allFailures[0],more=allFailures.length>1?` 외 ${allFailures.length-1}개`:'';
        paint(100,totalFiles,totalFiles,`처리 완료 · 성공 ${successCount}개 · 실패 ${allFailures.length}개: ${first.name}${more} (${first.reason})`);
      }else paint(100,totalFiles,totalFiles,sentenceMode&&waitingCount?`검수용 렌더링 완료 · 검수 대기 ${waitingCount}개`:`새 PDF를 ${targetLabel} 폴더에 반영했습니다.`);
      if(document.getElementById('tab-root')){this.skipNextPdfAutoSync=true;setTimeout(()=>this.render(),400)}
    }catch(error){const el=status();if(el)el.textContent='PDF 자동 반영 중 문제가 생겼습니다. PDF 자료를 확인해주세요.';console.error(error)}finally{this.pdfAutoSyncRunning=false}
  }
  ,

  pdfTitle(record){
    const name=String(record.name||''),guessed=guessFromFilename(name),isSuneung=name.includes('수능'),inferred=isSuneung?(guessed.year?`${guessed.year}년 수능`:'수능'):(guessed.year&&guessed.month&&guessed.grade)?`${guessed.year}년 ${guessed.month}월 ${guessed.grade} 모의고사`:name.replace(/\.pdf$/i,'');
    return record.title&&record.title!==record.name?record.title:inferred;
  }
  ,

  async renderSelectedPdfs(){
    const records=this.selectedPdfRecords||[];if(!records.length)return;
    if(appState.teacher.tool==='sentence-structure'){
      const ids=records.map(record=>record.id),worker=window.open('render-worker.html?ids='+encodeURIComponent(ids.join(',')),'elab-pdf-render-worker','width=440,height=560');
      if(worker){
        const button=document.getElementById('teacher-pdf-render'),stop=document.getElementById('teacher-pdf-stop'),progress=document.getElementById('teacher-pdf-progress');button.disabled=true;stop.hidden=false;progress.classList.remove('hidden');progress.textContent='별도 작업 창에서 렌더링을 시작합니다. 이 페이지는 이동해도 됩니다.';
        if(this.renderChannel)this.renderChannel.close();this.renderChannel=new BroadcastChannel('elab-pdf-render');
        this.renderChannel.onmessage=event=>{const data=event.data||{};if(data.type==='progress')progress.textContent=data.message||'';if(data.type==='done'||data.type==='stopped'){stop.hidden=true;button.disabled=false;progress.textContent=data.message||'';this.pdfSelection.clear();if(data.type==='done')setTimeout(()=>this.render(),500)}};
        return;
      }
    }
    const button=document.getElementById('teacher-pdf-render'),stop=document.getElementById('teacher-pdf-stop'),progress=document.getElementById('teacher-pdf-progress');this.renderStopRequested=false;button.disabled=true;stop.hidden=false;progress.classList.remove('hidden');
    const drafts=[];let done=0,failed=0;
    for(const record of records){if(this.renderStopRequested)break;progress.textContent=`PDF 렌더링 ${done+failed+1}/${records.length} · ${record.name}`;const result=await this.importPdf(ElabPdfLibrary.asFile(record),record,{background:appState.teacher.tool==='sentence-structure',collect:appState.teacher.tool!=='sentence-structure',shouldStop:()=>this.renderStopRequested});if(this.renderStopRequested)break;if(result){done++;if(result!==true)drafts.push(result)}else failed++;await new Promise(resolve=>setTimeout(resolve,0))}
    stop.hidden=true;
    this.pdfSelection.clear();
    if(appState.teacher.tool==='sentence-structure'){this.render();toast(failed?`${done}개 완료 · ${failed}개 실패`:`${done}개 PDF 렌더링 완료`);return}
    if(drafts.length){this.pdfReviewQueue=drafts.slice(1);this.draft=drafts[0];this.render()}else{button.disabled=false;progress.textContent='렌더링된 PDF가 없습니다.'}
  }
  ,

  async importPdf(file,sharedRecord,options={}){
    this.lastPdfImportError='';
    if(!file){this.lastPdfImportError='PDF 파일 데이터를 불러오지 못했습니다.';return false}
    const progress=document.getElementById('teacher-pdf-progress');
    if(progress){progress.classList.remove('hidden');progress.textContent='PDF 분석을 시작합니다.'}
    try{
      const libraryRecord=sharedRecord||await ElabPdfLibrary.saveFile(file);
      const analyzed=await analyzePdf(await file.arrayBuffer(),(cur,total)=>{if(progress)progress.textContent=`문항을 찾는 중 (${cur}/${total})`;if(options.onProgress)options.onProgress(cur,total);},options.shouldStop);
      if(!analyzed.markers.length)throw new Error('문항번호를 찾지 못했습니다.');
      const title=this.pdfTitle(libraryRecord);
      const questionImages=buildQuestionImages(analyzed.pageCanvases,analyzed.markers,analyzed.optionFives,analyzed.groupRanges,analyzed.pageWordBoxes,appState.teacher.tool==='sentence-structure').filter(q=>q.num>=18&&q.num<=45);
      questionImages.forEach(q=>{q.answer=Number((libraryRecord.answers||{})[q.num])||null});
      if(appState.teacher.tool==='sentence-structure'||options.toFolder){
        const passages=questionImages.map(q=>{const overlayWords=(q.overlayWords||[]).filter(w=>/[A-Za-z]/.test(w.text||''));return{question_id:q.question_id,id:uid(10),num:q.num,endNum:q.endNum||null,numLabel:q.endNum&&q.endNum!==q.num?`${q.num}~${q.endNum}`:String(q.num),text:overlayWords.map(w=>w.text).join(' '),image:q.dataUrl,overlayWords,type:classifyQuestionTypeByNum(q.num),choices:options.toFolder?['①','②','③','④','⑤']:null,autoOmrChoices:!!options.toFolder,answer:options.toFolder?q.answer:null,source_question_no:q.num,category_keys:[options.toFolder?'READING_UNCLASSIFIED':'SENTENCE_STRUCTURE_SV']}});
        if(!passages.length)throw new Error('표시할 문항 이미지를 만들지 못했습니다.');
        const db=loadPassageDB(),existingFolder=db.folders.find(f=>f.name===title),folder=existingFolder||{id:uid(8),name:title,createdAt:Date.now()};
        if(existingFolder)db.passages=db.passages.filter(p=>p.folderId!==folder.id);else db.folders.push(folder);
        // PDF 자료관리에서 검수 완료된 정확한 버전을 기록해야 다음 접속 때
        // 같은 파일을 다시 자동반영 대상으로 오인하지 않는다.
        folder.renderVersion=libraryRecord.renderReviewVersion||'question-crop-v20-inline-choice-five';
        folder.sourcePdfId=libraryRecord.id;
        folder.sourcePdfName=libraryRecord.name;
        folder.sourcePdfUpdatedAt=libraryRecord.updatedAt||Date.now();
        folder.pendingRender=false;
        folder.reviewPending=libraryRecord.renderReviewStatus!=='approved';
        passages.forEach(p=>db.passages.push({...p,folderId:folder.id,createdAt:Date.now(),sv:new Array(buildTokens(p.text).tokens.length).fill(null)}));
        organizePassageFolderTree(db);
        await savePassageDB(db);
        if(!options.background){FolderBank.curFolderId=folder.id;FolderBank.curPassageId=passages[0].id;FolderBank.selectMode=true;FolderBank.selectedIds=new Set();toast(`${passages.length}개 문항을 불러왔어요. 문장을 확인하고 주어·본동사를 표시해주세요.`);this.render()}
        return true;
      }
      const nums=questionImages.map(q=>q.num).filter(Number.isFinite);
      const startNum=libraryRecord.startNum||Math.min(...nums);
      const endNum=libraryRecord.endNum||Math.max(...nums);
      const draft={...analyzed,questions:questionImages,title,range:(startNum&&endNum)?`${startNum}~${endNum}번`:'',sourceFile:file.name,contentType:'image',step:'preview'};
      if(options.collect)return draft;
      this.draft=draft;this.render();return true;
    }catch(err){
      this.lastPdfImportError=err&&err.message?err.message:'PDF를 분석하지 못했습니다.';
      if(progress){progress.textContent=this.lastPdfImportError;progress.className='text-xs font-bold text-coral-500'}
      console.error(err);return false;
    }
  }
};

/* --------- 1단계: 문항 미리보기 + 경계선 보정 --------- */
const BoundaryEditor = {
  render(root, draft, rerender){
    root.innerHTML = `
      <section class="rounded-3xl bg-white p-4 shadow">
        <div class="mb-3 flex items-center justify-between">
          <h2 class="text-base font-extrabold">문항 확인 (${draft.questions.length}개 감지)</h2>
          <div class="flex gap-1.5">
            ${TeacherApp.pdfReviewQueue&&TeacherApp.pdfReviewQueue.length?`<button id="be-next-pdf" class="btn3d bg-slate-100 px-3 py-1.5 text-xs text-slate-600" style="--btn-edge:#cbd5e1">다음 PDF 검수 (${TeacherApp.pdfReviewQueue.length})</button>`:''}
            <button id="be-preview" class="btn3d bg-brand-500 px-3 py-1.5 text-xs text-white">학생 화면 미리보기 · 1~5 선택 테스트</button>
            <button id="be-rebuild" class="btn3d bg-slate-100 px-3 py-1.5 text-xs text-slate-600" style="--btn-edge:#cbd5e1">🔄 다시 자르기</button>
          </div>
        </div>
        <p class="mb-3 text-xs leading-relaxed text-slate-600">각 문항 이미지가 올바른지 확인하세요. 잘못 잘렸으면 이미지 위 <b class="text-coral-500">빨간 점선</b>을 드래그해서 경계를 옮기거나, 아래 목록에서 경계를 추가/삭제할 수 있어요. "학생 화면으로 보기"를 누르면 학생이 문제 풀 때 보게 될 화면 그대로(한 문제씩, 답 고르는 버튼까지) 미리 볼 수 있어요.</p>
        <div id="be-pages" class="space-y-4"></div>
        <div class="mt-4 flex gap-2">
          <button id="be-cancel" class="btn3d flex-1 bg-slate-100 py-3 text-sm text-slate-600" style="--btn-edge:#cbd5e1">처음부터</button>
          <button id="be-next" class="btn3d flex-1 bg-brand-500 py-3 text-sm text-white">다음: 정답 입력 →</button>
        </div>
      </section>`;
    this.renderPages(root, draft);
    const nextPdf=document.getElementById('be-next-pdf');if(nextPdf)nextPdf.onclick=()=>{TeacherApp.draft=TeacherApp.pdfReviewQueue.shift();TeacherApp.render()};
    document.getElementById('be-preview').addEventListener('click', ()=>{
      PreviewStudentView.render(root, draft, ()=> this.render(root, draft, rerender));
    });
    document.getElementById('be-cancel').addEventListener('click', async ()=>{
      if(await askConfirm('처음부터 다시 만들까요? 지금까지의 작업이 사라져요.')){ draft.step=null; TeacherApp.draft=null; rerender(); }
    });
    document.getElementById('be-next').addEventListener('click', ()=>{
      draft.step = 'answers';
      rerender();
    });
    document.getElementById('be-rebuild').addEventListener('click', ()=>{
      draft.questions = buildQuestionImages(draft.pageCanvases, draft.markers, draft.optionFives, draft.groupRanges, draft.pageWordBoxes);
      rerender();
    });
  },

  renderPages(root, draft){
    const wrap = document.getElementById('be-pages');
    wrap.innerHTML = '';
    const DISPLAY_W = 340;
    draft.pageCanvases.forEach((canvas, pageIdx)=>{
      const scale = DISPLAY_W / canvas.width;
      const holder = document.createElement('div');
      holder.className = 'relative overflow-hidden rounded-xl border border-slate-100';
      holder.style.width = DISPLAY_W+'px';
      holder.style.height = Math.round(canvas.height*scale)+'px';
      const img = document.createElement('img');
      img.src = canvas.toDataURL('image/jpeg', 0.6);
      img.style.width = '100%';
      img.style.display = 'block';
      holder.appendChild(img);
      holder.dataset.pageIdx = pageIdx;

      draft.markers.filter(m=>m.pageIdx===pageIdx).forEach(marker=>{
        const line = document.createElement('div');
        line.className = 'boundary-line';
        line.style.top = Math.round(marker.y*scale)+'px';
        line.innerHTML = `<span class="boundary-tag">${marker.num}번 ✕</span>`;
        line.dataset.num = marker.num;
        this.bindDrag(line, holder, marker, scale, canvas.height);
        holder.appendChild(line);
      });

      holder.addEventListener('dblclick', async e=>{
        if(e.target.closest('.boundary-line')) return;
        const rect = holder.getBoundingClientRect();
        const yInDisplay = e.clientY - rect.top;
        const realY = yInDisplay/scale;
        const numStr = await askPrompt('새 경계의 문항번호를 입력하세요 (예: 21)');
        if(!numStr) return;
        const num = parseInt(numStr, 10);
        if(!num) return toast('숫자를 입력해주세요');
        draft.markers.push({ pageIdx, y: realY, num });
        draft.markers.sort((a,b)=> a.pageIdx-b.pageIdx || a.y-b.y);
        this.renderPages(root, draft);
      });

      wrap.appendChild(holder);
    });
  },

  bindDrag(line, holder, marker, scale, canvasHeight){
    line.addEventListener('click', async e=>{
      if(e.offsetY!=null && e.target.tagName==='SPAN'){
        if(await askConfirm(marker.num+'번 경계를 삭제할까요? (앞 문항과 합쳐져요)')){
          const idx = TeacherApp.draft.markers.indexOf(marker);
          if(idx>-1) TeacherApp.draft.markers.splice(idx,1);
          this.renderPages(document.getElementById('tab-root'), TeacherApp.draft);
        }
      }
    });
    let dragging = false;
    line.addEventListener('mousedown', e=>{
      if(e.target.tagName==='SPAN') return; // 삭제 버튼 클릭은 드래그로 취급 안 함
      dragging = true;
      e.preventDefault();
    });
    const onMove = e=>{
      if(!dragging) return;
      const rect = holder.getBoundingClientRect();
      let y = (e.clientY - rect.top);
      y = Math.max(0, Math.min(rect.height, y));
      line.style.top = y+'px';
      marker.y = y/scale;
    };
    const onUp = ()=>{ dragging=false; };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }
};

/* --------- 문항 확인 화면에서: 학생이 실제로 풀 때 보는 화면 그대로 미리보기 ---------
   StudentApp.renderQuestion()과 같은 레이아웃(문항 이미지 + ①~⑤ 버튼, 한 문항씩)을 쓰되,
   서버에 올리기 전(로컬 dataUrl)에도 볼 수 있고, 실제 제출/채점 없이 이전/다음으로 자유롭게
   넘나들 수 있게 한 것. 여기서 누르는 답은 미리보기 전용이라 실제 draft.questions[i].answer에는
   저장 안 됨(나중에 "정답 입력" 단계에서 입력하는 정답과 안 섞이게). */
const PreviewStudentView = {
  render(root, draft, onClose){
    this.draft = draft;
    this.onClose = onClose;
    this.idx = 0;
    this.previewAnswers = draft.questions.map(()=>null);
    this.paint(root);
  },

  paint(root){
    const q = this.draft.questions[this.idx];
    const total = this.draft.questions.length;
    const isText = !q.dataUrl;
    const bodyHtml = isText ? `
      <div class="rounded-2xl bg-slate-50 p-4">
        ${q.promptKo ? `<p class="mb-2 text-sm font-extrabold text-slate-700">${esc(q.promptKo)}</p>` : ''}
        ${q.html ? `
          <div class="fx-passage">${renderFormattedPassage_(q.html, q.promptKo, q.choices)}</div>
          ${q.footnote ? `<p class="mt-2 text-right text-xs italic text-slate-500">${esc(q.footnote)}</p>` : ''}
        ` : `<p class="whitespace-pre-line text-justify text-sm leading-relaxed text-slate-700">${numberSentencesHtml(q.text||'')}</p>`}
      </div>` : `<img class="qimg" src="${q.dataUrl}" />`;
    const answersHtml = isText ? `
      <div class="mb-3 flex flex-col gap-1.5">
        ${(q.choices||[]).map((c,i)=>{
          const n=i+1;
          return `<button data-n="${n}" class="pv-ans btn3d py-2.5 text-left text-sm shadow ${this.previewAnswers[this.idx]===n?'bg-brand-500 text-white':'bg-white text-slate-700'}" style="--btn-edge:${this.previewAnswers[this.idx]===n?'#155e75':'#e2e8f0'}">${esc(c)}</button>`;
        }).join('')}
      </div>` : `
      <div class="mb-3 grid grid-cols-5 gap-2">
        ${[1,2,3,4,5].map(n=>`<button data-n="${n}" class="pv-ans btn3d rounded-xl border-2 py-4 text-lg font-extrabold shadow ${this.previewAnswers[this.idx]===n?'border-brand-600 bg-brand-500 text-white':'border-slate-300 bg-white text-slate-700'}" style="--btn-edge:${this.previewAnswers[this.idx]===n?'#155e75':'#cbd5e1'}">${'①②③④⑤'[n-1]}</button>`).join('')}
      </div>`;
    root.innerHTML = `
      <section class="rounded-3xl bg-slate-800 p-4 shadow">
        <div class="mb-3 flex items-center justify-between">
          <button id="pv-close" class="text-xs font-bold text-white/80">✕ 미리보기 닫기</button>
          <span class="text-xs font-bold text-white/60">학생 화면 미리보기 (실제 제출 안 됨)</span>
        </div>
        <div class="rounded-3xl bg-white p-4">
          <div class="mb-3 text-center text-xs font-bold text-slate-600">${this.idx+1} / ${total} · ${q.num}번</div>
          <div class="mb-4 max-h-[55vh] overflow-y-auto rounded-2xl border border-slate-100">
            ${bodyHtml}
          </div>
          ${answersHtml}
          <div class="flex gap-2">
            <button id="pv-prev" class="btn3d flex-1 bg-slate-100 py-2.5 text-xs text-slate-600" style="--btn-edge:#cbd5e1" ${this.idx===0?'disabled':''}>← 이전</button>
            ${this.idx===total-1?'<button id="pv-submit" class="btn3d flex-1 bg-grass-500 py-2.5 text-xs text-white">선택답안 제출</button>':'<button id="pv-next" class="btn3d flex-1 bg-brand-500 py-2.5 text-xs text-white">다음 →</button>'}
          </div>
        </div>
      </section>`;
    document.getElementById('pv-close').addEventListener('click', ()=> this.onClose());
    document.getElementById('pv-prev').addEventListener('click', ()=>{ if(this.idx>0){ this.idx--; this.paint(root); } });
    document.getElementById('pv-next')?.addEventListener('click', ()=>{ if(this.idx<total-1){ this.idx++; this.paint(root); } });
    document.getElementById('pv-submit')?.addEventListener('click', ()=>{
      const missing=this.previewAnswers.filter(answer=>answer==null).length;
      if(missing)return toast(`답을 선택하지 않은 문항이 ${missing}개 있습니다.`);
      toast(`${total}문항 선택 완료 · 제출 기능 정상`);
    });
    $all('.pv-ans', root).forEach(b=>b.addEventListener('click', ()=>{
      this.previewAnswers[this.idx] = +b.dataset.n;
      this.paint(root);
    }));
  }
};

/* 개별문제 시험 정보 + 학생 화면 확인. 정답은 PDF 자료관리의 검수값을 그대로 사용한다. */
const IndividualExamSetup = {
  sourceLabel(question,draft){
    const source=String(question.folderName||(question.source&&question.source.exam_name)||(question.source&&question.source.source_file)||draft.title||'');
    const grade=(source.match(/고\s*([123])/)||[])[1],year=(source.match(/(20\d{2})\s*년?/)||[])[1],month=(source.match(/(1[0-2]|[1-9])\s*월/)||[])[1];
    return [grade?'고'+grade:'',year?year+'년':'',month?Number(month)+'월':''].filter(Boolean).join(' ')||source.replace(/[_-]+/g,' ').trim();
  },
  render(root,draft,rerender){
    if(!draft.previewAnswers)draft.previewAnswers=draft.questions.map(()=>null);
    draft.questions.forEach(q=>{if(!q.type)q.type=classifyQuestionTypeByNum(q.num,q.promptKo)||''});
    root.innerHTML=`<section class="rounded-3xl bg-white p-5 shadow">
      <h2 class="mb-1 text-xl font-extrabold text-slate-800">시험 정보와 학생 화면 확인</h2>
      <p class="mb-5 text-sm text-slate-500">정답은 PDF 자료관리에서 검수한 값을 사용합니다.</p>
      <div id="ies-list" class="space-y-10"></div>
      <div class="mt-7 flex gap-3"><button id="ies-back" class="btn3d flex-1 bg-slate-100 py-3 text-sm text-slate-600" style="--btn-edge:#cbd5e1">← 문항 선택으로</button><button id="ies-next" class="btn3d flex-1 bg-brand-500 py-3 text-sm text-white">과제자료 저장 →</button></div>
    </section>`;
    const list=document.getElementById('ies-list');
    draft.questions.forEach((q,index)=>{
      const row=document.createElement('article');row.className='border-b-4 border-slate-200 pb-10 last:border-b-0 last:pb-0';
      row.innerHTML=`<h3 class="mb-2 text-lg font-extrabold text-slate-800">${index+1}) ${esc(this.sourceLabel(q,draft))} ${esc(q.num)}번</h3>
        <label class="mx-auto mb-4 block max-w-2xl text-xs font-bold text-slate-500">문제유형
          <select data-question-type="${index}" class="mt-1 w-full rounded-xl border-2 border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700 outline-none focus:border-brand-400">
            <option value="">미분류</option>${QUESTION_TYPE_GROUPS.map(group=>`<optgroup label="${esc(group.group)}">${group.types.map(type=>`<option value="${esc(type.key)}" ${q.type===type.key?'selected':''}>${esc(type.label)}</option>`).join('')}</optgroup>`).join('')}
          </select>
        </label>
        ${q.dataUrl?`<img class="mx-auto mb-5 block w-full max-w-2xl rounded-xl border border-slate-200 object-contain shadow-sm" src="${q.dataUrl}" alt="${esc(q.num)}번 문제">`:`<div class="mx-auto mb-5 max-w-2xl rounded-xl border border-slate-200 p-4">${q.html?renderFormattedPassage_(q.html,q.promptKo,q.choices):numberSentencesHtml(q.text||'')}</div>`}
        <div class="mx-auto grid max-w-2xl grid-cols-5 gap-3" aria-label="${esc(q.num)}번 보기 선택">${[1,2,3,4,5].map(n=>`<button type="button" data-preview-index="${index}" data-preview-answer="${n}" class="rounded-xl border-2 px-2 py-3 text-lg font-extrabold shadow-sm ${draft.previewAnswers[index]===n?'border-brand-600 bg-brand-500 text-white':'border-slate-300 bg-white text-slate-700 hover:border-brand-400 hover:bg-brand-50'}">${'①②③④⑤'[n-1]}</button>`).join('')}</div>`;
      list.appendChild(row);
    });
    list.onclick=event=>{const button=event.target.closest('[data-preview-answer]');if(!button)return;draft.previewAnswers[Number(button.dataset.previewIndex)]=Number(button.dataset.previewAnswer);this.render(root,draft,rerender)};
    list.onchange=event=>{const select=event.target.closest('[data-question-type]');if(!select)return;draft.questions[Number(select.dataset.questionType)].type=select.value};
    document.getElementById('ies-back').onclick=()=>{TeacherApp.draft=null;rerender()};
    document.getElementById('ies-next').onclick=()=>{draft.step='publish';rerender()};
  }
};

/* 이전 정답 입력 코드는 기존 저장 데이터 호환용으로 남기되 개별문제 화면에서는 사용하지 않는다. */
const AnswerStep = {
  syncLibrary(draft){
    const entered={};
    draft.questions.forEach(q=>{if(q.answer)entered[q.num]=q.answer});
    const nums=draft.questions.map(q=>q.num).filter(Number.isFinite);
    ElabPdfLibrary.current().then(record=>ElabPdfLibrary.update({
      title:draft.title||'',
      startNum:nums.length?Math.min(...nums):'',
      endNum:nums.length?Math.max(...nums):'',
      answers:{...((record&&record.answers)||{}),...entered}
    }));
  },
  // 정답이 없는 문항 중 번호가 가장 빠른 것 (빠른 입력창에 다음 번호를 자동으로 채우는 데 씀)
  firstUnanswered(draft){
    const sorted = draft.questions.slice().sort((a,b)=>a.num-b.num);
    const u = sorted.find(q=>!q.answer);
    return u ? u.num : null;
  },

  render(root, draft, rerender){
    if(appState.teacher.tool!=='sentence-structure')return IndividualExamSetup.render(root,draft,rerender);
    const nextNum = this.firstUnanswered(draft);
    const answeredCount = draft.questions.filter(q=>q.answer).length;
    root.innerHTML = `
      <section class="rounded-3xl bg-white p-4 shadow">
        <h2 class="mb-3 text-base font-extrabold">정답 입력</h2>
        <label class="mb-1 block text-xs font-bold text-slate-500">시험 이름표 ${draft.title?'<span class="font-normal text-slate-400">(파일명에서 자동으로 채웠어요, 필요하면 고치세요)</span>':''}</label>
        <input id="as-title" value="${esc(draft.title||'')}" placeholder="예: 2025년 9월 고2 모의고사" class="mb-3 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
        <label class="mb-1 block text-xs font-bold text-slate-500">범위 표시(선택)</label>
        <input id="as-range" value="${esc(draft.range||'')}" placeholder="예: 18~45번" class="mb-4 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />

        <div class="mb-4 rounded-2xl border-2 border-dashed border-brand-200 bg-brand-50 p-3">
          <label class="mb-1 block text-xs font-bold text-brand-600">⚡ 빠른 입력 (문항번호,정답 입력 후 Enter) — ${answeredCount}/${draft.questions.length}개 입력됨</label>
          <textarea id="as-quick" rows="1" autocomplete="off" placeholder="예: 18,3" class="w-full resize-none rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-sm font-mono outline-none focus:border-brand-400">${esc(nextNum?nextNum+',':'')}</textarea>
          <p class="mt-1 text-[11px] leading-relaxed text-slate-500">Enter를 누르면 자동으로 다음 문항번호가 채워져요. 여러 줄을 한 번에 붙여넣어도 돼요(줄마다 "번호,정답", Shift+Enter로 줄바꿈).
            아래에서 각 문항 이미지를 보고 버튼으로 눌러 입력할 수도 있어요.</p>
        </div>

        <div id="as-list" class="space-y-3"></div>
        <div class="mt-4 flex gap-2">
          <button id="as-back" class="btn3d flex-1 bg-slate-100 py-3 text-sm text-slate-600" style="--btn-edge:#cbd5e1">← 뒤로</button>
          <button id="as-next" class="btn3d flex-1 bg-brand-500 py-3 text-sm text-white">다음: 게시 →</button>
        </div>
      </section>`;
    document.getElementById('as-title').addEventListener('input', e=>{ draft.title = e.target.value; });
    document.getElementById('as-range').addEventListener('input', e=>{ draft.range = e.target.value; });

    const list = document.getElementById('as-list');
    draft.questions.forEach((q, idx)=>{
      const row = document.createElement('div');
      row.className = 'rounded-2xl border border-slate-100 p-3';
      row.innerHTML = `
        <div class="mb-2 flex items-center justify-between">
          <span class="text-xs font-extrabold text-slate-700">${idx+1}. ${q.num}번</span>
        </div>
        ${q.dataUrl ? `<img class="qimg mb-2" src="${q.dataUrl}" />` : `
        <div class="mb-2 rounded-xl bg-slate-50 p-3">
          ${q.promptKo ? `<p class="mb-1 text-xs font-extrabold text-slate-700">${esc(q.promptKo)}</p>` : ''}
          ${q.html ? `
            <div class="fx-passage">${renderFormattedPassage_(q.html, q.promptKo, q.choices)}</div>
            ${q.footnote ? `<p class="mt-1 mb-2 text-right text-xs italic text-slate-500">${esc(q.footnote)}</p>` : ''}
          ` : `<p class="mb-2 whitespace-pre-line text-sm leading-relaxed text-slate-700">${numberSentencesHtml(q.text)}</p>`}
          <ul class="space-y-0.5 text-xs text-slate-600">${(q.choices||[]).map(c=>`<li>${esc(c)}</li>`).join('')}</ul>
        </div>`}
        <div class="flex gap-1.5">
          ${[1,2,3,4,5].map(n=>`<button data-idx="${idx}" data-n="${n}" class="ans-btn flex-1 rounded-xl border-2 py-2 text-sm font-bold ${q.answer===n?'border-brand-500 bg-brand-50 text-brand-600':'border-slate-100 text-slate-600'}">${'①②③④⑤'[n-1]}</button>`).join('')}
        </div>`;
      list.appendChild(row);
    });
    list.addEventListener('click', e=>{
      const b = e.target.closest('.ans-btn');
      if(!b) return;
      draft.questions[+b.dataset.idx].answer = +b.dataset.n;
      this.syncLibrary(draft);
      this.render(root, draft, rerender);
    });

    // ⚡ 빠른 입력: "18,3" 형식(줄마다 여러 개 붙여넣기도 가능) → Enter로 한 번에 적용,
    // 적용 뒤엔 다음 미입력 문항번호를 자동으로 채워서 계속 이어 입력할 수 있게 함.
    const quick = document.getElementById('as-quick');
    quick.focus();
    quick.setSelectionRange(quick.value.length, quick.value.length);
    quick.addEventListener('keydown', e=>{
      if(e.key!=='Enter' || e.shiftKey) return; // Shift+Enter는 줄바꿈(여러 줄 직접 입력용)으로 남겨둠
      e.preventDefault();
      const raw = quick.value.trim();
      if(!raw) return;
      const lines = raw.split(/\n+/).map(s=>s.trim()).filter(Boolean);
      let applied = 0, unknown = [];
      lines.forEach(line=>{
        const m = line.match(/^(\d{1,2})\s*[,.\s]\s*([1-5])$/);
        if(!m){ unknown.push(line); return; }
        const num = parseInt(m[1], 10);
        const q = draft.questions.find(q=>q.num===num);
        if(!q){ unknown.push(line); return; }
        q.answer = parseInt(m[2], 10);
        applied++;
      });
      if(applied===0) return toast('형식을 확인해주세요 (예: 18,3)');
      if(unknown.length) toast(`${unknown.length}개는 문항번호를 못 찾았어요: ${unknown.join(', ')}`);
      this.syncLibrary(draft);
      this.render(root, draft, rerender);
    });

    document.getElementById('as-back').addEventListener('click', ()=>{
      if(draft.contentType==='text'){ TeacherApp.draft=null; }
      else{ draft.step='preview'; }
      rerender();
    });
    document.getElementById('as-next').addEventListener('click', ()=>{
      draft.title = document.getElementById('as-title').value.trim();
      draft.range = document.getElementById('as-range').value.trim();
      if(!draft.title) return toast('시험 이름표를 입력해주세요');
      this.syncLibrary(draft);
      // 정답 없이도 게시할 수 있게 함 -- 나중에 "결과" 탭에서 채점 전에 언제든 정답을 추가/수정할 수 있음.
      const missing = draft.questions.filter(q=>!q.answer).length;
      if(missing>0) toast(`정답 없는 문항 ${missing}개는 나중에 "결과" 탭에서 입력할 수 있어요`);
      draft.step = 'publish';
      rerender();
    });
  }
};

/* --------- 3단계: 게시 ---------
   게시 작업 상태(draft.publish)를 draft 자체에 저장해두고 진행한다 -- 교사가 게시 도중에
   "결과"/"설정" 등 다른 탭으로 갔다가 "시험 만들기" 탭으로 돌아와도(TeacherApp.render()가
   화면을 통째로 새로 그리므로 예전 DOM 참조는 끊김) 실제 업로드/저장 네트워크 작업 자체는
   draft 객체에 매달린 채 백그라운드에서 계속 진행되고, 돌아왔을 때 진행 상황을 그대로
   이어서 보여줄 수 있다. render()를 다시 부를 때마다 draft.publish.status를 보고 화면만
   새로 그리고, 진행 중인 작업을 절대 새로 또 시작하지 않는다(중복 게시 방지).
*/
const PublishStep = {
  // 지금 화면에 게시 단계가 떠 있으면 진행 상황을 반영하고, 다른 탭을 보는 중이면 DOM이
  // 없으니 조용히 무시한다(작업 자체는 아래 runJob이 계속 이어서 함).
  paintProgress(draft){
    const progress = document.getElementById('ps-progress');
    const btn = document.getElementById('ps-go');
    if(!progress || !btn) return;
    if(draft.publish && draft.publish.status==='running'){
      progress.classList.remove('hidden');
      progress.textContent = draft.publish.message;
      btn.disabled = true;
    }
  },

  async runJob(draft){
    const cfg = deliveryCfg();
    draft.publish = { status:'running', message:'시작하는 중...', link:null, error:null };
    this.paintProgress(draft);
    try{
      const examKey = draft.publish.examKey = uid(14);
      const isText = draft.contentType === 'text';
      let imageKeys = [];

      if(!isText){
        imageKeys = draft.questions.map((_, i)=> examKey+'-'+i);
        for(let i=0;i<draft.questions.length;i++){
          draft.publish.message = `이미지 업로드 중... (${i+1}/${draft.questions.length})`;
          this.paintProgress(draft);
          await hookPost(cfg.url, { action:'uploadImage', token: cfg.token, imageKey: imageKeys[i], dataUrl: draft.questions[i].dataUrl });
          await sleep(150); // Apps Script 동시 실행 제한 여유
        }

        draft.publish.message = '업로드 확인 중...';
        this.paintProgress(draft);
        let allOk = true;
        for(let i=0;i<imageKeys.length;i++){
          let found = false;
          for(let attempt=0; attempt<6 && !found; attempt++){
            const r = await jsonpFetch(cfg.url + '?action=imageStatus&key=' + encodeURIComponent(imageKeys[i]));
            if(r && r.found) found = true;
            else await sleep(700);
          }
          if(!found) allOk = false;
        }
        if(!allOk){
          draft.publish = { status:'error', message:'', link:null, error:'일부 이미지 업로드 확인에 실패했어요. 다시 시도해주세요.' };
          this.repaint(draft);
          return;
        }
      }

      draft.publish.message = '시험 정보 저장 중...';
      this.paintProgress(draft);
      const questionNums = draft.questions.map(q=>q.num);
      const answers = draft.questions.map(q=>q.answer);
      draft.questions.forEach(ensureQuestionId);
      const payload = {
        action: 'saveExam', token: cfg.token, examKey,
        title: draft.title, range: draft.range,
        questionCount: draft.questions.length,
        answers, questionNums, expiresAt: 0,
        questions: draft.questions.map(q=>({
          question_id:q.question_id, legacy_question_id:q.legacy_question_id||q.id||'',
          content_type:'READING', answer_type:'MULTIPLE_CHOICE', source_question_no:q.num,
          promptKo:q.promptKo||null, text:q.text||'', choices:q.choices||null,
          image:q.image||null, html:q.html||null, footnote:q.footnote||null,
          source:q.source||{exam_type:'CUSTOM', exam_name:draft.title||'', source_file:draft.sourceFile||''},
          category_keys:readingCategoryKey(q.type)?[readingCategoryKey(q.type)]:[]
        }))
      };
      if(isText){
        payload.contentType = 'text';
      }else{
        payload.imageKeys = imageKeys;
      }
      await hookPost(cfg.url, payload);
      await sleep(1000);

      const link = location.origin + location.pathname + '?session=' + examKey + '&hook=' + encodeURIComponent(cfg.url);
      const answersComplete = answers.every(a=>a!=null);
      saveMyExam({ examKey, title: draft.title, range: draft.range, count: draft.questions.length,
        link, createdAt: Date.now(), questionNums, answers, answersComplete, contentType: draft.contentType||'image' });

      draft.publish = { status:'done', message:'', link, examKey, error:null };
      this.repaint(draft);
    }catch(e){
      draft.publish = { status:'error', message:'', link:null, error:(e&&e.message)||String(e) };
      this.repaint(draft);
    }
  },

  // 지금 화면이 게시 단계면 draft.publish.status에 맞춰 다시 그림 (다른 탭이면 무시)
  repaint(draft){
    const root = document.getElementById('tab-root');
    if(!root || TeacherApp.tab!=='make' || !TeacherApp.draft || TeacherApp.draft.step!=='publish') return;
    this.render(root, draft, this._onDone);
  },

  render(root, draft, onDone){
    this._onDone = onDone; // repaint()에서 재사용
    const cfg = deliveryCfg();
    if(!cfg.url || !cfg.token){
      root.innerHTML = `
        <section class="rounded-3xl bg-white p-5 shadow">
          <h2 class="mb-2 text-base font-extrabold">먼저 백엔드 설정이 필요해요</h2>
          <p class="mb-3 text-xs text-slate-600">설정 탭에서 구글시트 웹훅 URL과 토큰을 먼저 등록해주세요.</p>
          <button id="ps-goto" class="btn3d w-full bg-brand-500 py-3 text-sm text-white">설정으로 이동</button>
        </section>`;
      document.getElementById('ps-goto').addEventListener('click', ()=>{ TeacherApp.tab='settings'; TeacherApp.render(); });
      return;
    }

    const status = draft.publish ? draft.publish.status : 'idle';

    if(status==='done'){
      const link = draft.publish.link;
      if(new URLSearchParams(location.search).get('assignment_pick')==='1'){
        location.href='../teacher/assignments.html?content_type=READING&content_ref_id='+encodeURIComponent(draft.publish.examKey||'');
        return;
      }
      root.innerHTML = `
        <section class="rounded-3xl bg-white p-5 shadow">
          <h2 class="mb-2 text-base font-extrabold text-grass-500">✅ 게시 완료!</h2>
          <p class="mb-2 text-xs text-slate-600">시험 저장이 완료되었습니다. 과제배정에서 학생 또는 그룹을 선택하세요.</p>
          <div class="mb-3 break-all rounded-xl bg-slate-50 p-3 text-xs text-slate-600">${esc(link)}</div>
          <a href="../teacher/assignments.html?content_type=READING&content_ref_id=${encodeURIComponent(draft.publish.examKey||'')}" class="btn3d mb-2 grid w-full place-items-center bg-brand-500 py-3 text-sm text-white">학생·그룹 선택하고 배정하기</a>
          <button id="ps-copy" class="btn3d mb-2 w-full bg-slate-100 py-3 text-sm text-slate-600" style="--btn-edge:#cbd5e1">🔗 링크 복사</button>
          <button id="ps-done" class="btn3d w-full bg-slate-100 py-3 text-sm text-slate-600" style="--btn-edge:#cbd5e1">폴더로 돌아가기</button>
        </section>`;
      document.getElementById('ps-copy').addEventListener('click', ()=>{
        navigator.clipboard.writeText(link).then(()=>toast('복사했어요')).catch(()=>toast('복사 실패'));
      });
      document.getElementById('ps-done').addEventListener('click', onDone);
      return;
    }

    root.innerHTML = `
      <section class="rounded-3xl bg-white p-5 shadow">
        <h2 class="mb-2 text-base font-extrabold">게시하기</h2>
        <p class="mb-4 text-xs text-slate-600">문항 ${draft.questions.length}개를 서버에 올리고 시험을 만들어요. 문항 수에 따라 시간이 좀 걸릴 수 있어요.
          다른 탭으로 이동해도 게시는 백그라운드에서 계속 진행돼요.</p>
        ${status==='error' ? `<p class="mb-3 text-xs font-bold text-coral-500">${esc(draft.publish.error)}</p>` : ''}
        <div id="ps-progress" class="mb-4 ${status==='running'?'':'hidden'} text-xs font-bold text-brand-500">${status==='running'?esc(draft.publish.message):''}</div>
        <button id="ps-go" class="btn3d w-full bg-brand-500 py-3 text-sm text-white" ${status==='running'?'disabled':''}>${status==='error'?'🔁 다시 게시하기':'🚀 게시하기'}</button>
      </section>`;

    document.getElementById('ps-go').addEventListener('click', ()=>{
      if(draft.publish && draft.publish.status==='running') return; // 중복 실행 방지
      this.runJob(draft); // await 안 함 -- 화면을 벗어나도 이 Promise는 계속 진행됨
      this.render(root, draft, onDone); // 즉시 진행 중 화면으로 갱신
    });
  }
};

/* --------- 설정 탭 --------- */
const SettingsTab = {
  render(root){
    const cfg = deliveryCfg();
    root.innerHTML = `
      <section class="rounded-3xl bg-white p-5 shadow">
        <h2 class="mb-1 text-base font-extrabold">백엔드 설정</h2>
        <p class="mb-3 text-xs leading-relaxed text-slate-600"><b>sheet_backend.gs</b>를 구글시트 Apps Script에 배포한 뒤, 그 웹앱 주소와 스크립트 속성에 등록한 TOKEN을 여기 입력하세요.</p>
        <label class="mb-1 block text-xs font-bold text-slate-500">웹훅 URL</label>
        <input id="st-url" value="${esc(cfg.url)}" placeholder="https://script.google.com/macros/s/.../exec" class="mb-3 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-2.5 text-sm outline-none focus:border-brand-400" />
        <label class="mb-1 block text-xs font-bold text-slate-500">토큰</label>
        <input id="st-token" value="${esc(cfg.token)}" class="mb-4 w-full rounded-xl border-2 border-slate-100 bg-slate-50 px-3 py-2.5 font-mono text-xs outline-none focus:border-brand-400" />
        <button id="st-save" class="btn3d w-full bg-brand-500 py-3 text-sm text-white">저장</button>
      </section>`;
    document.getElementById('st-save').addEventListener('click', ()=>{
      saveDelivery({ url: document.getElementById('st-url').value.trim(), token: document.getElementById('st-token').value.trim() });
      toast('저장했어요');
    });
  }
};

/* --------- 정답입력 탭 -- "시험 만들기"와 같은 폴더 트리로 폴더를 고르면, 그 폴더 안 모든
   지문의 정답을 한 화면에서 한눈에 보고 바로 고칠 수 있다. 학생 응시 결과(점수)는 대시보드에서
   따로 관리하므로(listAllExamResults), 여기는 FolderBank의 지문 데이터(p.answer)를 직접
   편집하는 화면 — 폴더 구조 자체(생성/이름변경/이동/삭제)는 "시험 만들기" 탭에서 관리한다. --------- */
const AnswerBoardTab = {
  db: null,
  curFolderId: null,
  treeExpanded: new Set(),

  render(root){
    this.db = loadPassageDB();
    root.innerHTML = `
      <section class="mb-4 rounded-3xl bg-white p-4 shadow">
        <h2 class="mb-2 text-sm font-extrabold text-slate-700">📁 폴더</h2>
        <div id="ab-folder-list" class="space-y-1"></div>
        <div id="ab-folder-empty" class="hidden rounded-xl border-2 border-dashed border-slate-200 py-6 text-center text-xs text-slate-500">
          아직 폴더가 없어요. "시험 만들기" 탭에서 먼저 폴더를 만들어주세요.
        </div>
      </section>
      <section id="ab-answers-section" class="hidden rounded-3xl bg-white p-4 shadow">
        <div class="mb-3 flex items-center justify-between gap-2">
          <h2 id="ab-answers-title" class="text-sm font-extrabold text-slate-700">📝 정답</h2>
          <div class="flex items-center gap-2">
            <span id="ab-answers-progress" class="text-xs font-bold text-brand-600"></span>
            <button id="ab-ocr-paste" class="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">📋 붙여넣기</button>
            <label class="cursor-pointer rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-600">
              📷 이미지로 인식
              <input id="ab-ocr-file" type="file" accept="image/*" class="hidden" />
            </label>
          </div>
        </div>
        <p class="mb-2 text-[11px] text-slate-400">정답표 이미지를 여기 붙여넣기(Ctrl+V)해도 인식돼요.</p>
        <div id="ab-answers-list" class="space-y-2"></div>
      </section>
    `;
    document.getElementById('ab-ocr-file').addEventListener('change', e=>{
      const file = e.target.files[0];
      e.target.value = '';
      if(file) this.recognizeAnswersFromImage(file);
    });
    // "붙여넣기" 버튼 -- 가능하면 클립보드를 바로 읽어오고(navigator.clipboard.read는
    // https/localhost 같은 보안 컨텍스트에서만 되고 file://에선 막힐 수 있음), 안 되면
    // 기존 document paste 리스너가 잡을 수 있게 Ctrl+V를 눌러달라고 안내만 한다.
    document.getElementById('ab-ocr-paste').addEventListener('click', async ()=>{
      try{
        const items = await navigator.clipboard.read();
        for(const item of items){
          const imgType = item.types.find(t=>t.startsWith('image/'));
          if(imgType){
            const blob = await item.getType(imgType);
            this.recognizeAnswersFromImage(blob);
            return;
          }
        }
        toast('클립보드에 이미지가 없어요');
      }catch(err){
        toast('⌨️ 지금 Ctrl+V를 눌러 이미지를 붙여넣어주세요');
      }
    });
    // 이미지 붙여넣기(Ctrl+V) 지원 -- 탭을 나갔다 다시 들어올 때마다 render()가 다시 불리므로,
    // 이전에 등록해둔 핸들러를 먼저 떼어내야 document에 리스너가 중복으로 쌓이지 않는다.
    if(this._pasteHandler) document.removeEventListener('paste', this._pasteHandler);
    this._pasteHandler = e=>{
      const section = document.getElementById('ab-answers-section');
      if(!section || section.classList.contains('hidden')) return;
      const items = (e.clipboardData && e.clipboardData.items) || [];
      for(const item of items){
        if(item.type && item.type.startsWith('image/')){
          const file = item.getAsFile();
          if(file){ e.preventDefault(); this.recognizeAnswersFromImage(file); }
          break;
        }
      }
    };
    document.addEventListener('paste', this._pasteHandler);
    this.renderFolderTree();
    this.renderAnswers();
  },

  renderFolderTree(){
    const wrap = document.getElementById('ab-folder-list');
    const empty = document.getElementById('ab-folder-empty');
    const folders = this.db.folders;
    if(folders.length===0){
      wrap.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');
    // 펼쳐진 폴더의 하위만 보이는 트리 목록(depth 포함) -- "시험 만들기" 탭의 FolderBank
    // 트리와 같은 구조지만, 여기는 정답 편집만 할 뿐 폴더 이동/삭제는 다루지 않아 읽기전용 선택만.
    const rows = [];
    const walk = (parentId, depth)=>{
      folderChildren(folders, parentId).forEach(f=>{
        rows.push({ ...f, depth });
        if(this.treeExpanded.has(f.id)) walk(f.id, depth+1);
      });
    };
    walk(null, 0);

    wrap.innerHTML = rows.map(f=>{
      const hasKids = folderChildren(folders, f.id).length>0;
      const isOpen = this.treeExpanded.has(f.id);
      const sel = f.id===this.curFolderId;
      const list = passagesInFolder(this.db, f.id);
      const doneCount = list.filter(p=>p.answer).length;
      return `<div style="padding-left:${f.depth*18}px" class="flex items-center gap-1.5 rounded-xl px-2 py-2 ${sel?'bg-brand-50':'bg-slate-50'}">
        <button data-ab-toggle="${f.id}" class="grid h-5 w-5 shrink-0 place-items-center text-slate-500 ${hasKids?'':'invisible'}">${isOpen?'▾':'▸'}</button>
        <span data-ab-select="${f.id}" class="min-w-0 flex-1 cursor-pointer truncate text-sm font-bold ${sel?'text-brand-600':'text-slate-700'}">📁 ${esc(f.name)}
          <span class="font-normal text-slate-400">(${list.length}개${list.length?` · 정답 ${doneCount}/${list.length}`:''})</span>
        </span>
      </div>`;
    }).join('');

    wrap.querySelectorAll('[data-ab-toggle]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.stopPropagation();
        const id = btn.dataset.abToggle;
        if(this.treeExpanded.has(id)) this.treeExpanded.delete(id); else this.treeExpanded.add(id);
        this.renderFolderTree();
      });
    });
    wrap.querySelectorAll('[data-ab-select]').forEach(el=>{
      el.addEventListener('click', ()=>{
        this.curFolderId = el.dataset.abSelect;
        this.renderFolderTree();
        this.renderAnswers();
      });
    });
  },

  updateProgress(){
    if(!this.curFolderId) return;
    const list = passagesInFolder(this.db, this.curFolderId);
    const doneCount = list.filter(p=>p.answer).length;
    document.getElementById('ab-answers-progress').textContent = list.length ? `${doneCount}/${list.length}개 입력됨` : '';
  },

  renderAnswers(){
    const section = document.getElementById('ab-answers-section');
    if(!this.curFolderId){ section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    const folder = this.db.folders.find(f=>f.id===this.curFolderId);
    const list = passagesInFolder(this.db, this.curFolderId);
    document.getElementById('ab-answers-title').textContent = '📝 ' + (folder?folder.name:'') + ' · 정답';
    const doneCount = list.filter(p=>p.answer).length;
    document.getElementById('ab-answers-progress').textContent = list.length ? `${doneCount}/${list.length}개 입력됨` : '';
    const wrap = document.getElementById('ab-answers-list');
    if(list.length===0){
      wrap.innerHTML = `<p class="rounded-xl border-2 border-dashed border-slate-200 py-6 text-center text-xs text-slate-500">이 폴더에 지문이 없어요.</p>`;
      return;
    }
    wrap.innerHTML = list.map(p=>{
      const hasChoices = p.choices && p.choices.length;
      return `<div class="rounded-2xl border border-slate-100 p-3">
        <div class="mb-1.5 flex items-center justify-between gap-2">
          <span class="shrink-0 text-xs font-extrabold text-slate-700">${p.num}번</span>
          ${p.promptKo ? `<span class="min-w-0 flex-1 truncate text-right text-[11px] text-slate-500">${esc(p.promptKo)}</span>` : ''}
        </div>
        ${hasChoices ? `
          <div class="flex items-center gap-2">
            <input type="text" inputmode="numeric" maxlength="1" data-ab-ans-input="${p.id}" data-max="${p.choices.length}" value="${p.answer||''}" placeholder="1~${p.choices.length}" class="ab-ans-input w-16 rounded-xl border-2 border-slate-200 px-3 py-2 text-center text-sm font-bold outline-none focus:border-brand-400" />
            <span class="text-xs text-slate-400">번 (①~${'①②③④⑤'[p.choices.length-1]} 중 숫자로 입력)</span>
          </div>` : `<p class="rounded-xl bg-amber-50 px-3 py-2 text-xs font-bold text-amber-600">⚠️ 보기가 없어서 정답을 고를 수 없어요 — "시험 만들기"에서 보기를 먼저 추가해주세요.</p>`}
      </div>`;
    }).join('');
    const inputList = Array.from(wrap.querySelectorAll('.ab-ans-input'));
    inputList.forEach((inp, idx)=>{
      // 이미 답이 채워진 칸을 직접 클릭해서 고칠 때도(자동 넘어가기를 안 거치고 온 경우)
      // 기존 값이 선택돼 있어야 바로 새 숫자로 덮어쓸 수 있다.
      inp.addEventListener('focus', ()=>inp.select());
      inp.addEventListener('input', ()=>{
        const p = this.db.passages.find(x=>x.id===inp.dataset.abAnsInput);
        const max = +inp.dataset.max;
        const v = inp.value.replace(/[^0-9]/g,'').slice(0,1);
        if(v !== inp.value) inp.value = v;
        const n = v ? +v : null;
        p.answer = (n>=1 && n<=max) ? n : null;
        savePassageDB(this.db);
        // 숫자 한 글자가 입력되면(정답 확정) 바로 다음 문항 칸으로 이동 -- 손 안 떼고
        // 쭉 타이핑만으로 전체 정답을 입력할 수 있게(요청사항).
        if(v.length===1 && idx < inputList.length-1){
          const next = inputList[idx+1];
          next.focus();
          next.select();
        }
      });
      inp.addEventListener('blur', ()=>{
        // renderAnswers()를 통째로 다시 부르면 input 목록 DOM이 전부 교체돼서, 다음 칸으로
        // 옮겨둔 포커스가 그 순간 날아가버린다(자동 넘어가기 기능과 충돌) -- 그래서 blur에서는
        // 폴더 트리(별도 DOM)와 진행률 숫자만 갱신하고 답 입력 칸 자체는 다시 그리지 않는다.
        this.renderFolderTree();
        this.updateProgress();
      });
      inp.addEventListener('keydown', e=>{
        if(e.key==='Enter') inp.blur();
      });
    });
  },

  // 정답표 이미지(예: "1 ⑤ 2 ① 3 ① ..." 형태의 격자표 캡처)를 업로드하면 Tesseract.js로
  // 숫자만 인식해서 읽기 순서(위→아래, 왼쪽→오른쪽)로 나열한 뒤, 짝수 번째(번호 칸) 다음에
  // 오는 홀수 번째 토큰을 정답 칸으로 간주해 현재 폴더의 지문 순서에 그대로 매칭한다.
  // 원문자(①~⑤) 글꼴은 일반 OCR이 100% 못 읽을 수 있어서, 결과를 바로 저장하지 않고
  // 검토 모달에 채워넣어 교사가 눈으로 확인·수정한 뒤 저장하게 한다.
  async recognizeAnswersFromImage(file){
    if(!this.curFolderId){ toast('먼저 폴더를 선택하세요'); return; }
    const passages = passagesInFolder(this.db, this.curFolderId);
    if(passages.length===0){ toast('이 폴더에 지문이 없어요'); return; }
    toast('📷 이미지 인식 중... 표 크기에 따라 시간이 걸릴 수 있어요');
    try{
      const dataUrl = await new Promise((resolve, reject)=>{
        const reader = new FileReader();
        reader.onerror = reject;
        reader.onload = ()=>resolve(reader.result);
        reader.readAsDataURL(file);
      });
      const worker = await Tesseract.createWorker('eng');
      await worker.setParameters({ tessedit_char_whitelist: '0123456789', tessedit_pageseg_mode: '11' });
      const { data } = await worker.recognize(dataUrl);
      await worker.terminate();
      const words = (data.words||[]).filter(w=>w.text && w.text.trim());
      if(words.length===0){ toast('이미지에서 숫자를 못 찾았어요'); return; }
      const ordered = this.clusterWordsReadingOrder(words);
      const recognized = ordered.filter((_,i)=>i%2===1).map(w=>w.text.trim());
      this.showOcrReviewModal(passages, recognized);
    }catch(err){
      console.error(err);
      toast('이미지 인식에 실패했어요');
    }
  },

  // Tesseract 단어 bbox들을 y좌표로 행 클러스터링한 뒤 각 행 안에서 x좌표순으로 정렬 --
  // 표 격자선을 직접 분석하지 않고도 "왼쪽→오른쪽, 위→아래" 읽기 순서를 근사한다.
  clusterWordsReadingOrder(words){
    const sorted = words.slice().sort((a,b)=>a.bbox.y0-b.bbox.y0);
    const avgH = sorted.reduce((s,w)=>s+(w.bbox.y1-w.bbox.y0), 0) / sorted.length || 20;
    const rows = [];
    sorted.forEach(w=>{
      const cy = (w.bbox.y0+w.bbox.y1)/2;
      let row = rows.find(r=>Math.abs(r.cy-cy) < avgH*0.6);
      if(!row){ row = { cy, words:[] }; rows.push(row); }
      row.words.push(w);
      row.cy = row.words.reduce((s,x)=>s+(x.bbox.y0+x.bbox.y1)/2, 0) / row.words.length;
    });
    rows.sort((a,b)=>a.cy-b.cy);
    rows.forEach(r=>r.words.sort((a,b)=>a.bbox.x0-b.bbox.x0));
    return rows.flatMap(r=>r.words);
  },

  showOcrReviewModal(passages, recognized){
    const wrap = document.createElement('div');
    wrap.className = 'modal-backdrop';
    wrap.innerHTML = `
      <div class="flex max-h-[80vh] w-full max-w-sm flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div class="shrink-0 border-b border-slate-100 p-4">
          <h3 class="text-sm font-extrabold text-slate-700">📷 인식된 정답 확인</h3>
          <p class="mt-1 text-xs text-slate-500">원문자(①②③④⑤) 인식은 100% 정확하지 않을 수 있어요 — 틀린 칸은 직접 고친 뒤 적용하세요.</p>
        </div>
        <div class="flex-1 space-y-1.5 overflow-y-auto p-4">
          ${passages.map((p,i)=>{
            const guess = recognized[i]!=null ? recognized[i] : '';
            const valid = /^[1-5]$/.test(guess);
            return `<div class="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 ${valid?'bg-slate-50':'bg-amber-50'}">
              <span class="text-xs font-extrabold text-slate-700">${p.num}번</span>
              <input data-ocr-ans="${p.id}" type="text" inputmode="numeric" maxlength="1" value="${valid?esc(guess):''}" class="w-14 rounded-lg border-2 border-slate-200 px-2 py-1 text-center text-sm font-bold outline-none focus:border-brand-400" />
            </div>`;
          }).join('')}
        </div>
        <div class="flex shrink-0 gap-2 border-t border-slate-100 p-4">
          <button data-ocr-cancel class="btn3d flex-1 bg-slate-100 py-2.5 text-sm text-slate-600" style="--btn-edge:#cbd5e1">취소</button>
          <button data-ocr-apply class="btn3d flex-1 bg-brand-500 py-2.5 text-sm text-white">적용</button>
        </div>
      </div>`;
    document.body.appendChild(wrap);
    wrap.addEventListener('click', e=>{ if(e.target===wrap) wrap.remove(); });
    const inputList = Array.from(wrap.querySelectorAll('[data-ocr-ans]'));
    inputList.forEach((inp, idx)=>{
      // 인식된 값이 이미 채워져 있어도 포커스가 오면 전체 선택 -- 바로 숫자를 치면
      // 기존 값이 덮어써지게(따로 지우지 않아도 되게) 함.
      inp.addEventListener('focus', ()=>inp.select());
      inp.addEventListener('input', ()=>{
        const v = inp.value.replace(/[^0-9]/g,'').slice(0,1);
        if(v!==inp.value) inp.value = v;
        if(v.length===1 && idx < inputList.length-1){
          const next = inputList[idx+1];
          next.focus();
          next.select();
        }
      });
    });
    wrap.querySelector('[data-ocr-cancel]').addEventListener('click', ()=>wrap.remove());
    wrap.querySelector('[data-ocr-apply]').addEventListener('click', ()=>{
      let applied = 0;
      wrap.querySelectorAll('[data-ocr-ans]').forEach(inp=>{
        const v = inp.value.trim();
        if(/^[1-5]$/.test(v)){
          const p = this.db.passages.find(x=>x.id===inp.dataset.ocrAns);
          if(p){ p.answer = +v; applied++; }
        }
      });
      savePassageDB(this.db);
      wrap.remove();
      toast(`✅ ${applied}개 정답을 적용했어요`);
      this.renderFolderTree();
      this.renderAnswers();
    });
  }
};
