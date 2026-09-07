/* =====================================================================
   끊어읽기 마킹 위젯 + 폴더 문제은행(FolderBank)
   exam/index.html 리팩터링 5단계 — utils.js/sheetService.js/questionTypes.js에 의존
===================================================================== */
// 문장 번호(❶❷❸...) 켜기/끄기 -- 이 브라우저 전용 설정(localStorage)이라, 학생이 이 시험을
// 다른 기기에서 열면 그 학생 브라우저의 기본값(꺼짐)을 따름 -- 교사가 미리보기/제작 화면에서
// 참고용으로 켜보는 용도가 우선.
// 원문 텍스트(토큰화 안 된 순수 문자열)를 문장 단위로 나눠 각 문장 앞에 번호를 붙인 HTML로 변환.
// 껐을 때는 esc()만 적용한 기존 동작 그대로. 번호는 유니코드 원문자(❶❷❸...)를 그대로 쓰지 않고
// 직접 그린 원(.sent-num) 안에 일반 숫자를 넣음 -- 유니코드 원문자는 폰트에 따라 안의 숫자가
// 너무 작게 그려져 가독성이 떨어진다는 피드백 반영(원 크기는 고정, 숫자 글자 크기만 키움).
function numberSentencesHtml(text){
  return text ? esc(text) : '';
}

/* ---------------- 끊어읽기 · 주어/동사/모르는 단어 마킹 위젯 ----------------
   원래 별도 모듈(끊어읽기)에 있던 기능을 개별문제로 통합하면서 그대로 옮겨온 코드.
   지문 하나를 토큰화해서 끊어읽기(단어 사이 클릭)와 주어/동사/모르는단어 칠하기(단어 자체
   클릭/드래그)를 캡슐화한 마운트형 위젯 -- FolderBank의 지문 미리보기(교사용 마킹),
   제출현황 검토(학생 제출 불러와 다시 마킹), 학생 숙제 모드(?study=) 세 곳에서 공용으로 씀. */
function buildTokens(text){
  const lines = text.split('\n').map(l=>l.trim()).filter(l=>l.length>0);
  const tokens = [];
  const lineStarts = new Set();
  lines.forEach(line=>{
    const words = line.split(/\s+/).filter(Boolean);
    if(words.length===0) return;
    lineStarts.add(tokens.length);
    words.forEach(w=>tokens.push(w));
  });
  return { tokens, lineStarts };
}
function computeSentenceStarts(tokens){
  const starts = new Set([0]);
  for(let i=0;i<tokens.length-1;i++){
    if(/[.!?]["')\]]*$/.test(tokens[i])) starts.add(i+1);
  }
  return starts;
}
const PEN_COLORS = { subj:{border:'#f59e0b',bg:'#fde68a'}, verb:{border:'#10b981',bg:'#a7f3d0'}, unknown:{border:'#ef4444',bg:'#fecaca'}, slash:{border:'#ef4444',bg:'#fff1f2'} };

function isFxLineEl_(el){ return el.classList && el.classList.contains('fx-line'); }

// promptKo/보기 중복 판정용 정규화 -- 공백을 하나로 합치는 것 말고도, PDF 추출본은 어퍼스트로피/
// 따옴표를 타이핑 문자(스마트 따옴표 ’ ‘ “ ”)로 바꿔놓는 경우가 많은데 교사가 답 입력칸에 직접
// 타이핑할 땐 보통 일반 따옴표(' ")를 쓰기 때문에, 이 차이 때문에 중복 판정이 실패하지 않도록
// 전부 일반 따옴표로 통일해서 비교한다.
function normFxText_(s){
  return (s||'').replace(/[‘’]/g,"'").replace(/[“”]/g,'"').replace(/\s+/g,' ').trim();
}

// 가져오기(JSON)할 때 이미지 파일(번호_imgN.png)을 같이 안 고르면 <img src="18_img1.png">
// 같은 상대경로가 그대로 남아서 못 불러온다 -- 로드 실패 시 아예 숨겨서 깨진 아이콘이 레이아웃을
// 무너뜨리지 않게 한다. onerror를 JS 프로퍼티(img.onerror=fn)가 아니라 속성으로 심는 이유는
// renderFormattedPassage_가 innerHTML 문자열로 직렬화해서 반환하기 때문 -- JS 프로퍼티는
// 문자열화되면서 사라지지만 onerror="..." 속성은 그대로 남아 다시 붙였을 때도 동작한다.
// 이미지가 "거의 백지"(하양/거의 하양 픽셀이 대부분)인지 캔버스에 그려서 검사한다 --
// 박스 테두리 장식처럼 실제 내용이 거의 없는 이미지를 가져오기 단계에서 자동으로 걸러내는 데 씀.
function isBlankishImage_(dataUrl){
  return new Promise(resolve=>{
    const img = new Image();
    img.onerror = () => resolve(false); // 못 읽으면 판단 보류하고 그대로 둔다
    img.onload = () => {
      try{
        const SZ = 48;
        const canvas = document.createElement('canvas');
        canvas.width = SZ; canvas.height = SZ;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, SZ, SZ);
        const data = ctx.getImageData(0, 0, SZ, SZ).data;
        let nonWhite = 0;
        for(let i=0; i<data.length; i+=4){
          if(data[i]<235 || data[i+1]<235 || data[i+2]<235) nonWhite++;
        }
        // 색 있는 픽셀 비율로 판단 -- 실측: 박스 테두리 장식류는 2~4%, 실제 사진/도표는
        // 19% 이상이었어서 그 사이인 8%를 기준으로 잡음(양쪽에 충분한 여유를 둠).
        resolve((nonWhite / (SZ*SZ)) < 0.08);
      }catch(e){ resolve(false); }
    };
    img.src = dataUrl;
  });
}

function safeguardFxImg_(img){
  img.setAttribute('onerror', "this.style.display='none'");
  // 세로로 긴 도표/그래프 하나가 PDF 줄 경계에 걸려 위/아래 두 장(또는 그 이상)으로 쪼개져
  // 저장되는 경우가 있다(예: 25번 그래프) -- 이렇게 바로 이어붙는 이미지끼리는 사이 여백을
  // 없애서 원래 하나였던 것처럼 붙여 보이게 한다(안 그러면 가운데 흰 줄처럼 벌어져 보임).
  const prev = img.previousElementSibling;
  if(prev && prev.tagName === 'IMG' && prev.classList.contains('fx-img')){
    img.style.marginTop = '0';
    prev.style.marginBottom = '0';
  }
}

// exam_pdf_extractor는 PDF의 컬럼 폭에 맞춰 원문을 8~10단어마다 줄바꿈해 .fx-line 하나하나로
// 쪼개놓는다(문단 단위가 아니라 "원본 PDF 한 줄" 단위) -- 그래서 fx-line 각각을 별도 블록으로
// 그리면 문장이 하나도 안 남고 전부 그 줄에서 끝나버려 양쪽정렬이 절대 안 먹는다. 게다가 이
// 도구는 문항번호("21.")·한글 지시문(promptKo)·배점("[3점]")·보기(①~⑤)까지도 지문과 구분
// 없이 전부 fx-line으로 뭉쳐서 넣기 때문에, 화면에 이미 따로 표시되는 것들이 지문 안에 또
// 나타난다. classifyFxLines_로 fx-line 전체를 순서대로 훑어 역할을 미리 분류해서
// (hidden/footnote/choice/passage) 이 문제를 푼다.
//
// 개별 줄 하나만 보고는 못 잡는 경우가 있어서(아래) 순서를 보며 판정해야 한다:
// - promptKo가 길면 fx-line 여러 개에 걸쳐 나뉜다(예: "21." 한 줄 + "밑줄 친 ... [3점]"
//   다음 줄) -- 그래서 맨 앞부터 몇 줄을 이어 붙여봐야 promptKo 전체가 들어있는지 알 수 있다.
// - 보기가 짧으면 한 fx-line에 여러 개(①...②...)가 같이 들어간다 -- 그래서 줄 전체가
//   보기 하나와 정확히 같은지가 아니라 p.choices의 항목을 "포함"하는지로 판정해야 한다.
// - "8"처럼 낱개 문항번호/쪽번호 조각이나 "[3점]" 배점 표시가 지문 중간·끝에 뜬금없이
//   끼어있기도 하다.
function classifyFxLines_(fxLineEls, promptKo, choices){
  const promptKoNorm = normFxText_(promptKo);
  // 보기 앞의 원문자(①~⑩)는 지운다 -- PDF 추출본은 원문자 뒤에 공백이 있기도/없기도 하고,
  // 교사가 답 입력칸에 직접 타이핑할 땐 그 공백 유무가 또 다를 수 있어서(예: "①word" vs
  // "① word") 있으나 없으나 포함 여부만 비교하면 이 차이에 안 흔들린다.
  const choiceNorms = (choices||[]).map(c=>normFxText_((c||'').replace(/^[①②③④⑤⑥⑦⑧⑨⑩]\s*/,''))).filter(Boolean);
  const norms = fxLineEls.map(el => normFxText_(el.textContent));
  const cls = new Array(fxLineEls.length).fill(null);

  if(promptKoNorm){
    let acc = '';
    for(let i=0; i<norms.length && i<5; i++){
      acc = acc ? (acc + ' ' + norms[i]) : norms[i];
      if(acc.includes(promptKoNorm)){
        for(let j=0;j<=i;j++) cls[j] = 'hidden';
        break;
      }
    }
  }

  // 도표/지문 일치 문제("다음 도표의 내용과 일치하지 않는 것은?" 류)는 원문자(①~⑤)를 진짜
  // 보기가 아니라 지문 문단 안 문장 구분용으로 쓴다 -- 이런 원문자가 하필 PDF 줄바꿈 경계와
  // 겹치면("③Switzerland was...") 그 fx-line이 줄 맨 앞부터 원문자로 시작하게 되어, 진짜
  // 보기와 구분이 안 된다. 그래서 "맨 뒤에서부터 훑어 올라가며 보기/각주/배점처럼 보이는
  // 줄이 계속되는 구간"만 진짜 보기 구간으로 보고, 그 밖(문단 중간)의 원문자 시작 줄은 그냥
  // 지문 문장으로 취급해 흐름이 안 끊기게 한다.
  let choiceRegionStart = fxLineEls.length;
  for(let i=fxLineEls.length-1; i>=0; i--){
    const norm = norms[i];
    const looksTrailing = !norm || /^\d{1,3}\.?$/.test(norm) || /^\[\s*\d+\s*점\s*\]$/.test(norm) ||
      /^\*/.test(norm) || /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(norm) || choiceNorms.some(c => norm.includes(c));
    if(!looksTrailing) break;
    choiceRegionStart = i;
  }

  for(let i=0;i<fxLineEls.length;i++){
    if(cls[i]) continue;
    const norm = norms[i];
    if(!norm){ cls[i] = 'passage'; continue; }
    if(/^\d{1,3}\.?$/.test(norm)){ cls[i] = 'hidden'; continue; } // 낱개 문항번호/쪽번호 조각
    if(/^\[\s*\d+\s*점\s*\]$/.test(norm)){ cls[i] = 'hidden'; continue; } // [3점] 배점 표시
    if(choiceNorms.some(c => norm.includes(c))){ cls[i] = 'hidden'; continue; } // 보기 중복(한 줄에 여러 보기 포함돼도 잡힘)
    if(/^\*/.test(norm)){ cls[i] = 'footnote'; continue; } // *word: 뜻
    if(i >= choiceRegionStart && /^[①②③④⑤⑥⑦⑧⑨⑩]/.test(norm)){ cls[i] = 'choice'; continue; } // 보기 구간 안에서만 보기로 취급
    cls[i] = 'passage';
  }
  const map = new Map();
  fxLineEls.forEach((el,i)=> map.set(el, cls[i]));
  return map;
}

// html 지문 안의 텍스트 노드만 문서 순서대로 공백 기준 토큰화한다(1차 패스 -- DOM은 안
// 건드리고 단어 개수/줄 시작 위치만 셈). 연속된 'passage' 줄끼리는 lineStarts 경계를 안
// 두어서(아래 buildMarkedHtmlDom_에서 display:inline으로 이어붙임) 원래 PDF 줄바꿈과 무관하게
// 한 문단처럼 흐르게 만든다.
function tokenizeHtmlDry_(html, promptKo, choices){
  const root = document.createElement('div');
  root.innerHTML = html || '';
  const clsMap = classifyFxLines_(Array.from(root.querySelectorAll('.fx-line')), promptKo, choices);
  const tokens = [];
  const lineStarts = new Set();
  const noNumberIdxs = new Set();
  let prevWasPassage = false;
  function walk(node){
    if(node.nodeType === 3){
      node.textContent.split(/\s+/).filter(Boolean).forEach(w=>tokens.push(w));
      return;
    }
    if(node.nodeType !== 1 || node.tagName === 'IMG') return;
    if(isFxLineEl_(node)){
      const cls = clsMap.get(node) || 'passage';
      const startIdx = tokens.length;
      if(!(cls==='passage' && prevWasPassage)) lineStarts.add(startIdx);
      Array.from(node.childNodes).forEach(walk);
      if(cls!=='passage'){
        for(let i=startIdx; i<tokens.length; i++) noNumberIdxs.add(i);
      }
      prevWasPassage = (cls==='passage');
      return;
    }
    // .fx-box 등은 자기 고유 텍스트가 없는 순수 그룹핑 컨테이너라 자식만 그대로 통과시킨다.
    Array.from(node.childNodes).forEach(walk);
  }
  Array.from(root.childNodes).forEach(walk);
  return { tokens, lineStarts, noNumberIdxs };
}

// 2차 패스 -- 같은 html을 다시 파싱해서 이번엔 단어를 sv-word 스팬으로, 필요한 자리엔
// chunk-gap/sent-num 스팬을 끼워 넣은 실제 DOM을 만든다. <b>/<u> 서식은 그 자식(텍스트
// 노드)만 스팬으로 치환하므로 그대로 보존된다. mk.tokens/mk.lineStarts/mk.noNumberIdxs/
// mk.sv/mk.chunkGaps/mk.promptKo/mk.choices는 1차 패스 기준으로 이미 준비돼 있어야 함.
function buildMarkedHtmlDom_(html, mk){
  const root = document.createElement('div');
  root.innerHTML = html || '';
  const clsMap = classifyFxLines_(Array.from(root.querySelectorAll('.fx-line')), mk.promptKo, mk.choices);
  let idx = 0;
  const wantNumbering = false;
  let sentNum = 0;
  function wordClass(i){
    const mark = mk.sv[i];
    return 'sv-word' + (mark==='subj'?' subj':mark==='verb'?' verb':mark==='unknown'?' unknown':'');
  }
  function walkWords(node){
    if(node.nodeType === 3){
      const words = node.textContent.split(/\s+/).filter(Boolean);
      if(words.length===0) return;
      const frag = document.createDocumentFragment();
      words.forEach(w=>{
        const isLineStart = mk.lineStarts.has(idx);
        if(idx>0 && !isLineStart){
          const gapIdx = idx-1;
          const active = mk.chunkGaps.has(gapIdx);
          const gap = document.createElement('span');
          gap.className = 'chunk-gap' + (active?' active':'');
          gap.dataset.gap = gapIdx;
          gap.textContent = active ? '/​' : ' ';
          frag.appendChild(gap);
        }
        if(wantNumbering && !mk.noNumberIdxs.has(idx) && (idx===0 || /[.!?]["')\]]*$/.test(mk.tokens[idx-1]))){
          sentNum++;
          const sn = document.createElement('span');
          sn.className = 'sent-num';
          sn.textContent = sentNum;
          frag.appendChild(sn);
        }
        const span = document.createElement('span');
        span.className = wordClass(idx);
        span.dataset.idx = idx;
        span.textContent = w;
        frag.appendChild(span);
        idx++;
      });
      node.parentNode.replaceChild(frag, node);
      return;
    }
    if(node.nodeType !== 1) return;
    if(node.tagName === 'IMG'){ safeguardFxImg_(node); return; }
    Array.from(node.childNodes).forEach(walkWords);
  }
  function walk(node){
    if(node.nodeType !== 1) return;
    if(node.tagName === 'IMG'){ safeguardFxImg_(node); return; }
    if(isFxLineEl_(node)){
      applyFxLineStyle_(node, clsMap.get(node) || 'passage');
      walkWords(node);
      return;
    }
    Array.from(node.childNodes).forEach(walk);
  }
  Array.from(root.childNodes).forEach(walk);
  hideEmptyFxBoxes_(root, clsMap);
  return root;
}

// classifyFxLines_ 결과에 따라 그 줄의 표시 방식을 정한다 -- 태깅 위젯(buildMarkedHtmlDom_)과
// 정답입력/미리보기/학생 시험 화면의 정적 렌더(renderFormattedPassage_)가 공용으로 쓴다.
function applyFxLineStyle_(el, cls){
  // text-align-last:justify가 .fx-passage/.fx-box에서 상속돼 내려오기 때문에, 한 줄짜리
  // 블록(각주/보기)은 text-align만 바꿔서는 안 먹는다(마지막 줄 전용 속성이 우선 적용돼
  // 계속 늘어나 보임) -- text-align-last도 같이 덮어써야 한다.
  if(cls === 'hidden'){
    el.style.display = 'none';
  }else if(cls === 'footnote'){
    el.style.display = 'block';
    el.style.textAlign = 'right';
    el.style.textAlignLast = 'right';
    el.style.fontStyle = 'italic';
    el.style.fontSize = '0.95em';
    el.style.margin = '8px 0 4px';
  }else if(cls === 'choice'){
    el.style.display = 'block';
    el.style.textAlign = 'left';
    el.style.textAlignLast = 'left';
    el.style.margin = '0 0 2px';
  }else{ // passage -- 연속된 줄끼리 한 문단으로 흐르게 인라인으로 이어붙인다
    el.style.display = 'inline';
  }
}

// .fx-box 안에 있던 보기(①~⑤)가 전부 p.choices와 겹쳐서(hidden) 안에 남은 fx-line이 하나도
// 안 보이게 되면, .fx-box 자기 자신(테두리+패딩)만 빈 채로 남아 화면에 빈 상자로 뜬다 --
// 그 상자 자체도 같이 숨긴다. classifyFxLines_는 fx-line만 분류하고 fx-box는 그냥 통과시키는
// 순수 컨테이너로 다루기 때문에, 이 정리는 fx-line 스타일을 다 적용한 뒤 별도로 한 번 더 훑는다.
function hideEmptyFxBoxes_(root, clsMap){
  Array.from(root.querySelectorAll('.fx-box')).forEach(box=>{
    const lines = Array.from(box.querySelectorAll('.fx-line'));
    if(lines.length && lines.every(l => clsMap.get(l)==='hidden')) box.style.display = 'none';
  });
}

// 태깅이 필요 없는 화면(정답입력/미리보기/학생 실제 시험)에서 쓰는 정적 버전 -- 단어별 span
// 없이 중복 줄(hidden) 제거 + 각주/보기 스타일 + 지문 줄 병합만 적용한 HTML 문자열을 만든다.
function renderFormattedPassage_(html, promptKo, choices){
  if(!html) return '';
  const root = document.createElement('div');
  root.innerHTML = html;
  const clsMap = classifyFxLines_(Array.from(root.querySelectorAll('.fx-line')), promptKo, choices);
  let prevWasPassage = false;
  function walk(node){
    if(node.nodeType !== 1) return;
    if(node.tagName === 'IMG'){ safeguardFxImg_(node); return; }
    if(isFxLineEl_(node)){
      const cls = clsMap.get(node) || 'passage';
      // 원본 html은 <p class="fx-line">들 사이에 공백이 전혀 없어서(태깅 위젯 쪽은
      // chunk-gap 삽입이 이 역할을 대신 해줌), 여기서도 병합되는 두 줄 사이엔 직접
      // 스페이스 텍스트 노드를 끼워 넣어야 단어가 안 붙는다.
      if(cls==='passage' && prevWasPassage) node.parentNode.insertBefore(document.createTextNode(' '), node);
      applyFxLineStyle_(node, cls);
      prevWasPassage = (cls==='passage');
      return;
    }
    Array.from(node.childNodes).forEach(walk);
  }
  Array.from(root.childNodes).forEach(walk);
  hideEmptyFxBoxes_(root, clsMap);
  return root.innerHTML;
}

// text: 평문(항상 있음, html 없는 지문의 유일한 소스). html: 있으면 서식을 보존한 채 그 위에
// 태깅한다(위쪽지문·아래쪽지문을 하나로 합친 이유 -- CLAUDE.md 참고). html이 없으면 기존
// 문자열 조립 경로(plainHtml) 그대로 씀.
function createPassageMarker(text, html, promptKo, choices, initialChunkGaps, initialSv, onChange){
  const useHtml = !!html;
  const { tokens, lineStarts, noNumberIdxs } = useHtml ? tokenizeHtmlDry_(html, promptKo, choices) : buildTokens(text||'');
  const mk = {
    tokens, lineStarts,
    noNumberIdxs: noNumberIdxs || new Set(),
    promptKo: promptKo || '',
    choices: choices || [],
    chunkGaps: new Set(Array.from(initialChunkGaps || []).filter(i => i < tokens.length)),
    sv: (initialSv && initialSv.length===tokens.length) ? initialSv.slice() : tokens.map(()=>null),
    pen: 'subj'
  };
  let painting = false, paintValue = null;

  function plainHtml(){
    let out = '';
    // 문장 번호(❶❷❸) 토글이 켜져 있으면 마킹 위젯 안에서도 문장 시작 지점마다 원문자를
    // 붙인다 -- computeSentenceStarts로 토큰 인덱스 기준 문장 시작을 구하고, sv-word/chunk-gap
    // 스팬과는 별도의 장식용 스팬이라 data-idx/data-gap 클릭 처리에는 영향 없음.
    const sentenceStarts = null;
    let sentNum = 0;
    mk.tokens.forEach((w,i)=>{
      if(mk.lineStarts.has(i) && i>0) out += '<br>';
      if(sentenceStarts && sentenceStarts.has(i)){
        sentNum++;
        out += `<span class="sent-num">${sentNum}</span>`;
      }
      const mark = mk.sv[i];
      const cls = 'sv-word' + (mark==='subj'?' subj':mark==='verb'?' verb':mark==='unknown'?' unknown':'');
      out += `<span class="${cls}" data-idx="${i}">${esc(w)}</span>`;
      if(i < mk.tokens.length-1 && !mk.lineStarts.has(i+1)){
        const active = mk.chunkGaps.has(i);
        out += `<span class="chunk-gap${active?' active':''}" data-gap="${i}">${active?'/​':' '}</span>`;
      }
    });
    return out || '<span class="text-slate-400">(빈 지문)</span>';
  }

  function mount(viewEl, penEl){
    if(useHtml){
      viewEl.innerHTML = '';
      viewEl.appendChild(buildMarkedHtmlDom_(html, mk));
    }else{
      viewEl.innerHTML = plainHtml();
    }
    const fire = ()=>{ if(onChange) onChange({ chunkGaps: Array.from(mk.chunkGaps), sv: mk.sv.slice() }); };

    viewEl.addEventListener('click', e=>{
      const gap = e.target.closest('.chunk-gap');
      if(!gap) return;
      const idx = +gap.dataset.gap;
      if(mk.chunkGaps.has(idx)){ mk.chunkGaps.delete(idx); gap.classList.remove('active'); gap.textContent=' '; }
      else{ mk.chunkGaps.add(idx); gap.classList.add('active'); gap.textContent='/​'; }
      fire();
    });
    function applyPaintLocal(el, idx, value){
      mk.sv[idx] = value;
      el.className = 'sv-word' + (value==='subj' ? ' subj' : value==='verb' ? ' verb' : value==='unknown' ? ' unknown' : '');
    }
    viewEl.addEventListener('mousedown', e=>{
      const el = e.target.closest('.sv-word');
      if(!el) return;
      e.preventDefault();
      painting = true;
      const idx = +el.dataset.idx;
      paintValue = (mk.sv[idx] === mk.pen) ? null : mk.pen;
      applyPaintLocal(el, idx, paintValue);
    });
    viewEl.addEventListener('mouseover', e=>{
      if(!painting) return;
      const el = e.target.closest('.sv-word');
      if(!el) return;
      applyPaintLocal(el, +el.dataset.idx, paintValue);
    });
    document.addEventListener('mouseup', ()=>{ if(painting){ painting = false; fire(); } });
    viewEl.addEventListener('touchstart', e=>{
      const el = e.target.closest('.sv-word');
      if(!el) return;
      painting = true;
      const idx = +el.dataset.idx;
      paintValue = (mk.sv[idx] === mk.pen) ? null : mk.pen;
      applyPaintLocal(el, idx, paintValue);
    }, { passive:true });
    viewEl.addEventListener('touchmove', e=>{
      if(!painting) return;
      const t = e.touches[0];
      const elAt = document.elementFromPoint(t.clientX, t.clientY);
      const word = elAt && elAt.closest ? elAt.closest('.sv-word') : null;
      if(!word) return;
      applyPaintLocal(word, +word.dataset.idx, paintValue);
    }, { passive:true });
    document.addEventListener('touchend', ()=>{ if(painting){ painting = false; fire(); } });

    if(penEl){
      function refreshPens(){
        penEl.querySelectorAll('.pen-btn').forEach(b=>{
          const on = b.dataset.pen === mk.pen;
          const c = PEN_COLORS[b.dataset.pen];
          b.style.borderColor = on ? c.border : '#e2e8f0';
          b.style.background = on ? c.bg : '#fff';
          b.style.color = on ? '#1e293b' : '#64748b';
        });
      }
      penEl.querySelectorAll('.pen-btn').forEach(btn=>{
        btn.onclick = ()=>{ mk.pen = btn.dataset.pen; refreshPens(); };
      });
      refreshPens();
    }
  }

  return {
    mount,
    getState(){ return { chunkGaps: Array.from(mk.chunkGaps), sv: mk.sv.slice() }; }
  };
}

function createPdfImageMarker(image,words,initialChunkGaps,initialSv,initialAnnotations,onChange,readOnly){
  const mk={words:words||[],annotations:Array.isArray(initialAnnotations)?initialAnnotations.map(x=>({...x})):[],pen:'subj'};
  if(!mk.annotations.length){
    (initialSv||[]).forEach((type,i)=>{const w=mk.words[i];if(type&&w)mk.annotations.push({type,x:w.x,y:w.y,w:w.width,h:w.height})});
    (initialChunkGaps||[]).forEach(i=>{const w=mk.words[i];if(w)mk.annotations.push({type:'slash',x:w.x+w.width,y:w.y,w:.018,h:Math.max(.035,w.height)})});
  }
  function legacyState(){
    const sv=mk.words.map(()=>null),chunkGaps=[];
    mk.annotations.forEach(a=>{
      if(a.type==='slash'){
        let best=-1,dist=Infinity;mk.words.forEach((w,i)=>{const d=Math.hypot((w.x+w.width)-a.x,(w.y+w.height/2)-a.y);if(d<dist){dist=d;best=i}});if(best>=0)chunkGaps.push(best);return;
      }
      mk.words.forEach((w,i)=>{const cx=w.x+w.width/2,cy=w.y+w.height/2;if(cx>=a.x&&cx<=a.x+a.w&&cy>=a.y&&cy<=a.y+a.h)sv[i]=a.type});
    });
    return{annotations:mk.annotations.map(x=>({...x})),chunkGaps:[...new Set(chunkGaps)],sv};
  }
  function mount(viewEl,penEl){
    const paint=()=>{
      viewEl.innerHTML=`<div class="pdf-mark-stage"><img src="${esc(image)}" alt="PDF 문항 이미지"><div class="pdf-draw-layer">${mk.annotations.map((a,i)=>`<button type="button" class="pdf-draw-mark ${a.type}" data-ann="${i}" title="클릭하면 삭제" style="left:${a.x*100}%;top:${a.y*100}%;width:${a.w*100}%;height:${a.h*100}%">${a.type==='slash'?'/':''}</button>`).join('')}<div class="pdf-draw-preview" hidden></div></div></div>`;
      const layer=viewEl.querySelector('.pdf-draw-layer'),preview=layer.querySelector('.pdf-draw-preview');let start=null;
      layer.querySelectorAll('[data-ann]').forEach(btn=>{btn.disabled=!!readOnly;if(!readOnly)btn.addEventListener('pointerdown',e=>{e.stopPropagation();mk.annotations.splice(+btn.dataset.ann,1);fire();paint()})});
      const point=e=>{const r=layer.getBoundingClientRect();return{x:Math.max(0,Math.min(1,(e.clientX-r.left)/r.width)),y:Math.max(0,Math.min(1,(e.clientY-r.top)/r.height))}};
      if(readOnly){layer.style.cursor='default';return}
      layer.addEventListener('pointerdown',e=>{if(e.target.closest('[data-ann]'))return;e.preventDefault();start=point(e);layer.setPointerCapture(e.pointerId);preview.hidden=false;preview.style.cssText=`left:${start.x*100}%;top:${start.y*100}%;width:0;height:0`});
      layer.addEventListener('pointermove',e=>{if(!start)return;const p=point(e),x=Math.min(start.x,p.x),y=Math.min(start.y,p.y),w=Math.abs(p.x-start.x),h=Math.abs(p.y-start.y);preview.style.left=x*100+'%';preview.style.top=y*100+'%';preview.style.width=w*100+'%';preview.style.height=h*100+'%'});
      layer.addEventListener('pointerup',e=>{if(!start)return;const p=point(e),dragDistance=Math.hypot(p.x-start.x,p.y-start.y);if(mk.pen==='slash'){mk.annotations.push({type:'slash',x:Math.max(0,Math.min(.982,p.x-.009)),y:Math.max(0,Math.min(.95,p.y-.025)),w:.018,h:.05})}else if(dragDistance<.012&&mk.words.length){let hit=null,best=.05;mk.words.forEach(word=>{const cx=word.x+word.width/2,cy=word.y+word.height/2,inside=p.x>=word.x-.006&&p.x<=word.x+word.width+.006&&p.y>=word.y-.008&&p.y<=word.y+word.height+.008,d=Math.hypot(p.x-cx,p.y-cy);if((inside||d<.05)&&d<best){hit=word;best=d}});if(hit)mk.annotations.push({type:mk.pen,x:Math.max(0,hit.x-.003),y:Math.max(0,hit.y-.004),w:Math.min(1-hit.x+.003,hit.width+.006),h:Math.min(1-hit.y+.004,hit.height+.008)});else mk.annotations.push({type:mk.pen,x:Math.max(0,p.x-.018),y:Math.max(0,p.y-.015),w:.036,h:.03})}else{let x=Math.min(start.x,p.x),y=Math.min(start.y,p.y),w=Math.abs(p.x-start.x),h=Math.abs(p.y-start.y);if(w<.008)w=.025;if(h<.012){y=Math.max(0,p.y-.015);h=.03}w=Math.min(w,1-x);h=Math.min(h,1-y);mk.annotations.push({type:mk.pen,x,y,w,h})}start=null;fire();paint()});
      layer.addEventListener('pointercancel',()=>{start=null;preview.hidden=true});
    };
    const fire=()=>onChange&&onChange(legacyState());
    if(penEl){penEl.hidden=!!readOnly;const refresh=()=>penEl.querySelectorAll('.pen-btn').forEach(btn=>{const on=btn.dataset.pen===mk.pen,c=PEN_COLORS[btn.dataset.pen];btn.style.borderColor=on?c.border:'#e2e8f0';btn.style.background=on?c.bg:'#fff';btn.style.color=on?'#1e293b':'#64748b'});penEl.querySelectorAll('.pen-btn').forEach(btn=>btn.onclick=()=>{mk.pen=btn.dataset.pen;refresh()});refresh()}
    paint();
  }
  return {mount,getState:legacyState};
}

/* =====================================================================
   폴더 문제은행 — 폴더에 저장해둔 지문+한글문제+보기(+끊어읽기 마킹)로 시험/숙제를
   만드는 경로. 예전엔 별도 끊어읽기 모듈과 데이터를 공유할지 토글로 고를 수 있었지만
   (elab_shared_folders.enabled), 끊어읽기 모듈이 개별문제로 통합되면서 그 토글은
   의미가 없어짐 — 이제 elab_exam.db 하나만 씀. 예전에 끊어읽기 모듈(elab_sentence.db)에
   만들어둔 폴더·지문이 있으면 최초 로드 시 1회 자동으로 옮겨온다(migrateSentenceDb_ 참고).
===================================================================== */
function passageDbKey(){ return 'elab_exam.db'; }
const LAST_PASSAGE_FOLDER_KEY = 'elab_exam.lastFolder';
let passageDbMemory_ = null;
let passageDbLoading_ = false;
function organizePassageFolderTree(db){
  if(!db||!Array.isArray(db.folders)||!Array.isArray(db.passages))return false;
  let changed=false;
  const usedFolderIds=new Set(db.passages.map(p=>p.folderId));
  db.folders.filter(folder=>usedFolderIds.has(folder.id)&&!folder.autoGroup).forEach(folder=>{
    const name=String(folder.name||''),yearMatch=name.match(/(20\d{2})\s*년?/),gradeMatch=name.match(/(중|고)\s*([123])/);
    const year=yearMatch?Number(yearMatch[1]):0,grade=gradeMatch?gradeMatch[1]+gradeMatch[2]:(name.includes('수능')?'고3':'');
    if(!year||!grade)return;
    let gradeFolder=db.folders.find(f=>f.autoGroup==='grade'&&f.name===grade&&f.parentId==null);
    if(!gradeFolder){gradeFolder={id:uid(8),name:grade,parentId:null,autoGroup:'grade',createdAt:Date.now()};db.folders.push(gradeFolder);changed=true}
    let yearFolder=db.folders.find(f=>f.autoGroup==='year'&&Number(f.groupYear)===year&&f.parentId===gradeFolder.id);
    if(!yearFolder){yearFolder={id:uid(8),name:year+'년',parentId:gradeFolder.id,autoGroup:'year',groupYear:year,createdAt:Date.now()};db.folders.push(yearFolder);changed=true}
    if(folder.parentId!==yearFolder.id){folder.parentId=yearFolder.id;changed=true}
  });
  return changed;
}
function loadExternalPassageDb_(){
  if(passageDbLoading_ || !window.ElabExamData) return;
  passageDbLoading_ = true;
  ElabExamData.get().then(async d=>{
    if(!d || !Array.isArray(d.folders) || !Array.isArray(d.passages)) return;
    passageDbMemory_ = d;
    if(organizePassageFolderTree(d))await savePassageDB(d);
    if(window.ElabExamMedia) await ElabExamMedia.hydrate(d);
    if(typeof TeacherApp!=='undefined') setTimeout(()=>TeacherApp.render(),0);
  }).finally(()=>{ passageDbLoading_=false; });
}
// 앱 첫 화면을 그리기 전에 IndexedDB의 폴더·문항을 복원한다. 예전에는 빈 트리를 먼저
// 그린 뒤 비동기로 다시 렌더링해서, 새로고침 시 저장 자료가 사라진 것처럼 보일 수 있었다.
async function preloadPassageDB(){
  if(passageDbMemory_&&passageDbMemory_.folders&&passageDbMemory_.folders.length){
    if(window.ElabExamMedia)await ElabExamMedia.hydrate(passageDbMemory_);
    return passageDbMemory_;
  }
  // 대용량 원본은 IndexedDB를 우선 사용한다. 아래 localStorage 데이터는 IndexedDB를
  // 읽지 못하는 상황에 대비한 경량 목록 백업이다.
  if(window.ElabExamData){
    const stored=await ElabExamData.get();
    if(stored&&Array.isArray(stored.folders)&&Array.isArray(stored.passages)){
      passageDbMemory_=stored;
      if(organizePassageFolderTree(stored))await savePassageDB(stored);
      if(window.ElabExamMedia)await ElabExamMedia.hydrate(stored);
      return stored;
    }
  }
  try{
    const local=JSON.parse(localStorage.getItem(passageDbKey()));
    if(local&&Array.isArray(local.folders)&&Array.isArray(local.passages)){
      passageDbMemory_=local;
      organizePassageFolderTree(local);
      await savePassageDB(local);
      if(window.ElabExamMedia)await ElabExamMedia.hydrate(local);
      return local;
    }
  }catch(e){}
  passageDbMemory_={folders:[],passages:[]};
  return passageDbMemory_;
}
// 통합 이전에 끊어읽기 모듈에서 만든 폴더/지문(elab_sentence.db)이 남아있고, 개별문제 쪽
// (elab_exam.db)이 아직 비어있으면 그대로 옮겨옴 — 스키마가 이미 같아서(양쪽 다
// {folders,passages}, 지문에 chunkGaps/sv/answer 필드를 같이 둠) 변환 없이 복사만 하면 됨.
// 이미 elab_exam.db에 데이터가 있으면(직접 만든 지문이 있는 경우) 건드리지 않음.
function migrateSentenceDb_(){
  try{
    const cur = JSON.parse(localStorage.getItem('elab_exam.db'));
    const curEmpty = !cur || !((cur.folders||[]).length || (cur.passages||[]).length);
    if(!curEmpty) return;
    const legacy = localStorage.getItem('elab_sentence.db');
    if(!legacy) return;
    const parsed = JSON.parse(legacy);
    if(parsed && Array.isArray(parsed.folders) && Array.isArray(parsed.passages) && (parsed.folders.length || parsed.passages.length)){
      localStorage.setItem('elab_exam.db', legacy);
    }
  }catch(e){}
}
migrateSentenceDb_();
function loadPassageDB(){
  if(passageDbMemory_) return passageDbMemory_;
  try{
    const d = JSON.parse(localStorage.getItem(passageDbKey()));
    if(d && Array.isArray(d.folders) && Array.isArray(d.passages)){
      let changed = false;
      d.passages.forEach(p=>{ if(!p.question_id){ ensureQuestionId(p); changed = true; } });
      organizePassageFolderTree(d);
      passageDbMemory_ = d;
      savePassageDB(d);
      if(window.ElabExamMedia) ElabExamMedia.hydrate(d).then(count=>{if(count&&typeof TeacherApp!=='undefined')setTimeout(()=>TeacherApp.render(),0)});
      return passageDbMemory_;
    }
  }catch(e){}
  passageDbMemory_ = { folders: [], passages: [] };
  loadExternalPassageDb_();
  return passageDbMemory_;
}
async function savePassageDB(db){
  passageDbMemory_ = db;
  const mediaWrites=[];
  const lean={folders:db.folders||[],passages:(db.passages||[]).map(p=>{
    const copy={...p};
    if(copy.image&&copy.image.startsWith('data:')){
      copy.imageKey=copy.imageKey||('passage-'+copy.id);
      if(window.ElabExamMedia)mediaWrites.push(ElabExamMedia.put(copy.imageKey,copy.image));
      delete copy.image;
      p.imageKey=copy.imageKey;
    }
    return copy;
  })};
  if(mediaWrites.length)await Promise.all(mediaWrites);
  if(window.ElabExamData){
    await ElabExamData.put(lean);
    const verified=await ElabExamData.get();
    if(!verified||!Array.isArray(verified.folders)||!Array.isArray(verified.passages)||verified.folders.length!==lean.folders.length||verified.passages.length!==lean.passages.length){
      throw new Error('PDF 폴더 저장을 확인하지 못했습니다.');
    }
    // 이미지와 단어 좌표는 IndexedDB에 보관하고, 새로고침 복구에 필요한 폴더·문항 목록은
    // 용량이 작은 백업으로 한 번 더 저장한다. 사용자가 삭제할 때만 이 목록에서 제거된다.
    const backup={version:3,folders:lean.folders,passages:lean.passages.map(p=>{const copy={...p};delete copy.overlayWords;delete copy.html;return copy})};
    try{localStorage.setItem(passageDbKey(),JSON.stringify(backup))}catch(e){console.warn('PDF 폴더 경량 백업 저장 실패',e)}
  }
  return db;
}
function passagesInFolder(db, folderId){
  const ids=new Set(folderDescendantIds(db.folders,folderId));
  return db.passages.filter(p=>ids.has(p.folderId)).sort((a,b)=>a.num-b.num);
}

/* ---------------- 폴더 트리(상위/하위) 유틸 -- vocab 모듈의 폴더 트리와 같은 패턴 -----------------
   folderId가 null이면 최상위. 폴더에 parentId 필드를 추가해 트리로 만들되, exam은 vocab처럼
   폴더 안으로 "들어가는" 화면 전환이 없어서(항상 curFolderId 하나만 선택) 다중선택·복사/잘라내기·
   붙여넣기 클립보드까지는 옮기지 않고, 위치 이동(들여쓰기 버튼 + 드래그)만 지원한다. */
function folderChildren(folders, parentId, includePending){
  const children=folders.filter(f=>(f.parentId||null)===(parentId||null)&&(includePending||f.autoGroup||!f.reviewPending));
  if(!children.length)return children;
  if(children.every(f=>f.autoGroup==='grade')){
    const gradeOrder={'고1':0,'고2':1,'고3':2,'중1':3,'중2':4,'중3':5};
    children.sort((a,b)=>(gradeOrder[a.name]??99)-(gradeOrder[b.name]??99)||a.name.localeCompare(b.name,'ko',{numeric:true}));
  }else if(children.every(f=>f.autoGroup==='year')){
    children.sort((a,b)=>Number(b.groupYear)-Number(a.groupYear));
  }else{
    const monthOf=folder=>{const match=String(folder.name||'').match(/(?:^|\D)(1[0-2]|[1-9])\s*월/);return match?Number(match[1]):99};
    children.sort((a,b)=>monthOf(a)-monthOf(b)||String(a.name||'').localeCompare(String(b.name||''),'ko',{numeric:true}));
  }
  return children;
}
function folderTreeRows(folders,includePending){
  const ordered=[];
  const walk=(parentId,depth)=>folderChildren(folders,parentId,includePending).forEach(folder=>{ordered.push({folder,depth});walk(folder.id,depth+1)});
  walk(null,0);
  return ordered;
}
function folderDescendantIds(folders, id){ // id(자기 자신) + 모든 하위 폴더 id
  const ids=[id]; let frontier=[id];
  while(frontier.length){
    const next = folders.filter(f=>frontier.includes(f.parentId)).map(f=>f.id);
    ids.push(...next); frontier=next;
  }
  return ids;
}
// id를 newParentId 밑으로 옮겨도 사이클(자기 자신의 하위로 들어가기)이 안 생기는지 검사
function canReparent(folders, folderId, newParentId){
  if(newParentId===folderId) return false;
  return !folderDescendantIds(folders, folderId).includes(newParentId);
}

function mountIndividualQuestionViewer(root,strokes){
  const viewport=root.querySelector('[data-iq-viewport]'),documentEl=root.querySelector('[data-iq-document]');
  if(!viewport||!documentEl)return;
  let scale=1,drag=null,tool='',active=null,erasing=false;
  const ink=document.createElement('canvas');ink.className='iq-ink';ink.setAttribute('aria-label','문제지 필기 영역');documentEl.appendChild(ink);
  const eraserCursor=document.createElement('div');eraserCursor.setAttribute('aria-hidden','true');Object.assign(eraserCursor.style,{position:'absolute',zIndex:'3',display:'none',width:'36px',height:'36px',border:'2px solid #d97706',borderRadius:'999px',background:'rgba(255,255,255,.18)',pointerEvents:'none',transform:'translate(-50%,-50%)'});documentEl.appendChild(eraserCursor);
  const render=()=>{const rect=documentEl.getBoundingClientRect(),dpr=Math.min(devicePixelRatio||1,2),w=Math.max(1,Math.round(rect.width*dpr)),h=Math.max(1,Math.round(rect.height*dpr));if(ink.width!==w||ink.height!==h){ink.width=w;ink.height=h}const ctx=ink.getContext('2d');ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,w,h);ctx.setTransform(dpr,0,0,dpr,0,0);ctx.strokeStyle='#185adb';ctx.lineWidth=2.5;ctx.lineCap='round';ctx.lineJoin='round';strokes.forEach(points=>{if(!points.length)return;ctx.beginPath();ctx.moveTo(points[0].x*rect.width,points[0].y*rect.height);points.slice(1).forEach(p=>ctx.lineTo(p.x*rect.width,p.y*rect.height));ctx.stroke()});root.querySelector('[data-iq-clear]').disabled=!strokes.length};
  const point=event=>{const rect=ink.getBoundingClientRect();return{x:(event.clientX-rect.left)/rect.width,y:(event.clientY-rect.top)/rect.height}};
  const distance=(p,a,b)=>{const dx=b.x-a.x,dy=b.y-a.y,l=dx*dx+dy*dy;if(!l)return Math.hypot(p.x-a.x,p.y-a.y);const t=Math.max(0,Math.min(1,((p.x-a.x)*dx+(p.y-a.y)*dy)/l));return Math.hypot(p.x-a.x-t*dx,p.y-a.y-t*dy)};
  const eraseAt=event=>{const rect=ink.getBoundingClientRect(),n=point(event),radius=18,next=[];eraserCursor.style.left=(n.x*rect.width)+'px';eraserCursor.style.top=(n.y*rect.height)+'px';strokes.forEach(stroke=>{let chunk=[];stroke.forEach(v=>{const outside=Math.hypot((v.x-n.x)*rect.width,(v.y-n.y)*rect.height)>radius;if(outside)chunk.push(v);else{if(chunk.length>1)next.push(chunk);chunk=[]}});if(chunk.length>1)next.push(chunk)});if(next.length!==strokes.length||next.some((s,i)=>s!==strokes[i])){strokes.splice(0,strokes.length,...next);render()}};
  const sync=()=>{viewport.classList.toggle('draw-mode',!!tool);eraserCursor.style.display=tool==='eraser'?'block':'none';root.querySelectorAll('[data-iq-tool]').forEach(button=>{const on=button.dataset.iqTool===tool;button.classList.toggle('on',on);button.setAttribute('aria-pressed',String(on));button.textContent=button.dataset.iqTool==='pen'?(on?'펜 끄기':'펜 쓰기'):(on?'지우개 끄기':'지우개')})};
  const apply=()=>{documentEl.style.width=(scale*100)+'%';root.querySelector('[data-iq-scale]').textContent=Math.round(scale*100)+'%'};
  const zoom=delta=>{scale=Math.max(.6,Math.min(2.6,Math.round((scale+delta)*10)/10));apply()};
  root.querySelector('[data-iq-fit]').onclick=()=>{scale=1;apply();viewport.scrollTo(0,0)};root.querySelector('[data-iq-out]').onclick=()=>zoom(-.1);root.querySelector('[data-iq-in]').onclick=()=>zoom(.1);root.querySelectorAll('[data-iq-tool]').forEach(button=>button.onclick=()=>{tool=tool===button.dataset.iqTool?'':button.dataset.iqTool;sync()});root.querySelector('[data-iq-clear]').onclick=()=>{strokes.length=0;render()};
  viewport.addEventListener('wheel',event=>{if(!event.ctrlKey)return;event.preventDefault();zoom(event.deltaY<0?.1:-.1)},{passive:false});viewport.addEventListener('pointerdown',event=>{if(event.button!==0||tool)return;drag={x:event.clientX,y:event.clientY,left:viewport.scrollLeft,top:viewport.scrollTop};viewport.classList.add('dragging');viewport.setPointerCapture(event.pointerId)});viewport.addEventListener('pointermove',event=>{if(!drag)return;viewport.scrollLeft=drag.left-(event.clientX-drag.x);viewport.scrollTop=drag.top-(event.clientY-drag.y)});const endDrag=()=>{drag=null;viewport.classList.remove('dragging')};viewport.addEventListener('pointerup',endDrag);viewport.addEventListener('pointercancel',endDrag);
  ink.addEventListener('pointerdown',event=>{if(event.button!==0||!tool)return;event.preventDefault();ink.setPointerCapture(event.pointerId);if(tool==='eraser'){erasing=true;eraseAt(event)}else{active=[point(event)];strokes.push(active);render()}});ink.addEventListener('pointermove',event=>{if(tool==='eraser'){const n=point(event),rect=ink.getBoundingClientRect();eraserCursor.style.left=(n.x*rect.width)+'px';eraserCursor.style.top=(n.y*rect.height)+'px'}if(erasing)return eraseAt(event);if(active){active.push(point(event));render()}});ink.addEventListener('pointerleave',()=>{if(!erasing)eraserCursor.style.display='none'});ink.addEventListener('pointerenter',()=>{if(tool==='eraser')eraserCursor.style.display='block'});const endInk=()=>{active=null;erasing=false};ink.addEventListener('pointerup',endInk);ink.addEventListener('pointercancel',endInk);
  new ResizeObserver(render).observe(documentEl);const image=documentEl.querySelector('img');if(image&&!image.complete)image.addEventListener('load',render,{once:true});apply();render();
}

function sentenceQuestionSourceLabel(p,db){
  const source=p&&p.source||{},folder=db&&db.folders&&db.folders.find(folder=>folder.id===p.folderId),year=Number(source.year)||'',month=Number(source.month)||'',rawGrade=String(source.grade||''),grade=rawGrade?(/^고/.test(rawGrade)?rawGrade:'고'+rawGrade):'',examType=String(source.exam_type||'').toUpperCase();
  let exam='';
  if(examType==='SUNEUNG'||String(source.exam_name||'').includes('수능'))exam=[year&&year+'년','수능'].filter(Boolean).join(' ');
  else if(year&&month&&grade)exam=`${year}년 ${month}월 ${grade} 모의고사`;
  else exam=String(source.exam_name||folder&&folder.name||source.source_file||'').replace(/\.pdf$/i,'').trim();
  return [exam,(p.numLabel||p.source_question_no||p.num)+'번'].filter(Boolean).join(' ');
}

function printQuestionSourceLabel(p,db){
  const source=p&&p.source||{},folder=db&&db.folders&&db.folders.find(item=>item.id===p.folderId),year=Number(source.year)||'',month=Number(source.month)||'',rawGrade=String(source.grade||'').trim(),grade=rawGrade?(/^고/.test(rawGrade)?rawGrade:'고'+rawGrade):'',examName=String(source.exam_name||'').replace(/\.pdf$/i,'').trim(),examType=String(source.exam_type||'').toUpperCase(),parts=[year&&year+'년',month&&month!==99&&month+'월',grade].filter(Boolean),number=p.source_question_no||p.numLabel||p.num;
  let exam='';
  if(examName&&/(20\d{2}|\d{1,2}월|고[123])/.test(examName))exam=examName;
  else{const suffix=examName||(examType==='MOCK'?'모의고사':examType==='SUNEUNG'?'수능':'');exam=parts.concat(suffix).filter(Boolean).join(' ');if(!exam)exam=String(folder&&folder.name||source.source_file||'').replace(/\.pdf$/i,'').trim()}
  return [exam,number&&number+'번'].filter(Boolean).join(' ');
}

function printQuestionAnswerLabel(p){
  const marks=['①','②','③','④','⑤'];
  const raw=p&&Object.prototype.hasOwnProperty.call(p,'correct_answer')?p.correct_answer:p&&p.answer;
  if(raw==null||String(raw).trim()==='')return '정답 미등록';
  const number=Number(raw);
  if(Number.isInteger(number)&&number>=1&&number<=marks.length)return marks[number-1];
  if(Array.isArray(p.choices)){
    const index=p.choices.findIndex(choice=>String(choice)===String(raw));
    if(index>=0&&index<marks.length)return marks[index];
  }
  return String(raw);
}

const FolderBank = {
  db: null,
  curFolderId: null,
  curPassageId: null,
  formMode: 'add',
  typeFilter: '',
  selectMode: false,
  selectedIds: new Set(),
  selectionId(p){ return String(ensureQuestionId(p)); },
  selectAnchor: null,
  previewAnswers: {},
  previewInk: {},
  formImage: null,
  treeExpanded: new Set(), // 하위 폴더가 펼쳐져 보이는 폴더 id 목록
  selectedFolderIds: new Set(),
  folderSelectAnchor: null,
  treeInitialized: false,

  // 선택한 폴더 안에서 "보기 5개 + 정답"까지 완성된 지문만 모아 시험 draft를 만들고
  // 곧바로 정답 입력(AnswerStep) 단계로 넘어감(정답은 이미 지문에 설정돼 있으니 미리 채워진 채로 시작).
  buildExam(){
    const selected=this.selectedFolderIds.size?this.selectedFolderIds:new Set([this.curFolderId]);
    const folderIds=new Set();selected.forEach(id=>folderDescendantIds(this.db.folders,id).forEach(child=>folderIds.add(child)));
    const list = this.db.passages.filter(p=>folderIds.has(p.folderId)).sort((a,b)=>a.num-b.num);
    const folder = this.db.folders.find(f=>f.id===this.curFolderId);
    this.buildExamFrom(list, folder ? folder.name : '');
  },

  // 체크박스로 임의로 고른 문항(폴더/유형 상관없이)만 모아 시험 draft 생성 -- buildExam()과
  // 같은 완성도 검사(보기 5개+정답)·draft 구조를 공유하되 목록만 "선택한 것"으로 좁힌 버전.
  buildExamFromSelection(){
    const list = this.db.passages.filter(p=>this.selectedIds.has(this.selectionId(p))).sort((a,b)=>a.num-b.num);
    if(list.length===0){ toast('먼저 문항을 골라주세요'); return; }
    const folder = this.db.folders.find(f=>f.id===this.curFolderId);
    this.buildExamFrom(list, folder ? `${folder.name} · 선택 ${list.length}문항` : `선택 ${list.length}문항`);
  },

  printSelection(){
    const byId=new Map(this.db.passages.map(p=>[this.selectionId(p),p]));
    const list=Array.from(this.selectedIds).map(id=>byId.get(String(id))).filter(Boolean);
    if(!list.length){toast('먼저 문항을 골라주세요');return}
    const now=new Date(),pad=n=>String(n).padStart(2,'0'),day=`${now.getFullYear()}${pad(now.getMonth()+1)}${pad(now.getDate())}`,time=`${pad(now.getHours())}${pad(now.getMinutes())}`,displayDay=`${now.getFullYear()}.${pad(now.getMonth()+1)}.${pad(now.getDate())}`,filename=`ELAB_개별문제_${day}_${time}`;
    const marks=['①','②','③','④','⑤'];
    const questions=list.map((p,index)=>{
      const sourceTitle=printQuestionSourceLabel(p,this.db);
      const prompt=p.promptKo?`<p class="prompt">${esc(p.promptKo)}</p>`:'';
      const passage=p.image?`<img class="question-image" src="${esc(p.image)}" alt="${index+1}번 문제 이미지">`:p.html?`<div class="passage fx-passage">${renderFormattedPassage_(p.html,p.promptKo,p.choices)}</div>`:p.text?`<div class="passage text">${esc(p.text)}</div>`:'';
      const choices=Array.isArray(p.choices)&&p.choices.length?`<ol class="choices">${p.choices.map((choice,i)=>`<li><span>${marks[i]||String(i+1)+'.'}</span><span>${esc(choice)}</span></li>`).join('')}</ol>`:'';
      return `<section class="question-page"><header><div><b>ELAB 영어 문제지</b><span>${list.length}문항 · ${index+1} / ${list.length}</span></div><small>${displayDay}</small></header><h1>${esc(sourceTitle||`${index+1}번`)}</h1><div class="question"><h2>${index+1}.</h2><div class="question-body">${passage}${prompt}${choices}</div></div></section>`;
    }).join('');
    const answers=list.map((p,index)=>{const sourceTitle=printQuestionSourceLabel(p,this.db);return `<tr><th>${index+1}.</th><td class="answer-value">${esc(printQuestionAnswerLabel(p))}</td><td class="answer-source">${sourceTitle?`(${esc(sourceTitle)})`:''}</td></tr>`}).join('');
    const answerPage=`<section class="answer-page"><table class="answer-table"><thead><tr><th colspan="3"><h1>정답</h1></th></tr></thead><tbody>${answers}</tbody></table></section>`;
    const html=`<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${filename}</title><style>@page{size:A4 portrait;margin:12mm 15mm}*{box-sizing:border-box}body{margin:0;color:#172033;font-family:"Pretendard","Apple SD Gothic Neo","Noto Sans KR",Arial,sans-serif;font-size:10.8pt;line-height:1.48}.question-page{min-height:273mm;break-after:page;page-break-after:always}.question-page>header{display:flex;align-items:center;justify-content:space-between;margin-bottom:5mm;padding-bottom:3mm;border-bottom:1px solid #94a3b8;color:#64748b;font-size:8.5pt}.question-page>header div{display:flex;gap:3mm;align-items:center}.question-page>header b{color:#172033;font-size:10pt}.question-page>h1{margin:0 0 6mm;font-size:14pt;line-height:1.3;overflow-wrap:anywhere}.question{display:grid;grid-template-columns:8mm minmax(0,1fr);gap:1.5mm;break-inside:avoid-page;page-break-inside:avoid}.question h2{margin:0;font-size:11pt}.question-body{min-width:0}.passage{margin:0 0 3mm;white-space:pre-wrap;overflow-wrap:anywhere}.prompt{margin:0 0 2.5mm;font-weight:700;overflow-wrap:anywhere}.choices{display:grid;gap:1.5mm;margin:0;padding:0;list-style:none}.choices li{display:grid;grid-template-columns:6mm minmax(0,1fr);gap:1mm;overflow-wrap:anywhere}.question-image{display:block;max-width:100%;max-height:205mm;object-fit:contain;height:auto;margin:0 0 3mm}.fx-line{display:inline}.fx-box{margin:2mm 0;padding:2.5mm;border:1px solid #cbd5e1}.answer-page{break-before:page;page-break-before:always}.answer-table{width:100%;border-collapse:collapse}.answer-table thead{display:table-header-group}.answer-table h1{margin:0 0 8mm;text-align:left;font-size:20pt}.answer-table tbody tr{break-inside:avoid;page-break-inside:avoid;border-bottom:1px solid #e2e8f0}.answer-table tbody th,.answer-table tbody td{padding:3mm 2mm;text-align:left;vertical-align:top}.answer-table tbody th{width:12mm}.answer-value{width:18mm;font-size:13pt;font-weight:800}.answer-source{color:#64748b;font-size:8.5pt}@media print{body{-webkit-print-color-adjust:exact;print-color-adjust:exact}}</style></head><body>${questions}${answerPage}<script>window.onload=function(){setTimeout(function(){window.print()},250)};<\/script></body></html>`;
    const popup=window.open('','_blank');
    if(!popup){toast('팝업이 차단되었습니다. 팝업을 허용하고 다시 시도해주세요.');return}
    popup.document.write(html);popup.document.close();
    toast('인쇄 창에서 “PDF로 저장”을 선택해주세요.');
  },

  // 선택한 문항을 과제자료로 저장한다. 학생 링크는 여기서 만들지 않고 과제배정에서 다른
  // 학습자료와 함께 최종배정할 때 생성한다.
  async saveSelectionAsAssignmentContent(){
    const cfg = deliveryCfg();
    const statusEl = document.getElementById('fb-share-status');
    if(!statusEl)throw new Error('저장 상태 표시 영역을 찾지 못했습니다. 페이지를 새로고침해주세요.');
    statusEl.classList.remove('hidden');
    if(!cfg.url || !cfg.token){
      statusEl.className = 'mb-2 rounded-xl bg-coral-50 p-3 text-xs font-bold text-coral-600';
      statusEl.textContent = '환경설정에서 서버 연결을 먼저 확인해주세요.';
      return;
    }
    const list = this.db.passages.filter(p=>this.selectedIds.has(this.selectionId(p))).sort((a,b)=>a.num-b.num);
    if(list.length===0){
      statusEl.className = 'mb-2 rounded-xl bg-coral-50 p-3 text-xs font-bold text-coral-600';
      statusEl.textContent = '먼저 저장할 문항을 골라주세요.';
      return;
    }
    const invalid=list.find(p=>{const sv=p.sv||[];return !p.learning_area||!/^(L1|L2|L3)$/.test(p.difficulty||'')||!sv.some(x=>x==='subj')||!sv.some(x=>x==='verb')});
    if(invalid){statusEl.className='mb-2 rounded-xl bg-coral-50 p-3 text-xs font-bold text-coral-600';statusEl.textContent=`${invalid.numLabel||invalid.num}번: 핵심 주어·본동사 정답, 학습 영역, 난이도를 모두 지정해주세요.`;return;}
    const folder = this.db.folders.find(f=>f.id===this.curFolderId);
    const setKey = uid(12);
    statusEl.className = 'mb-2 rounded-xl bg-brand-50 p-3 text-xs font-bold text-brand-600';
    statusEl.textContent = '과제자료 저장 중...';
    statusEl.scrollIntoView({behavior:'smooth',block:'nearest'});
    await new Promise(resolve=>requestAnimationFrame(()=>resolve()));
    const sharedPassages=new Array(list.length);let nextUpload=0,completedUploads=0;
    const uploadOne=async i=>{
      const p=list[i],sharedImage=p.image&&p.image.startsWith('data:')?null:(p.image||null);let image=sharedImage;
      if(p.image&&p.image.startsWith('data:')){
        const imageKey=setKey+'-sentence-'+i;
        const uploadStarted=await hookPost(cfg.url,{action:'uploadImage',token:cfg.token,imageKey,dataUrl:p.image});
        if(!uploadStarted)throw new Error(`${p.num}번 이미지 업로드 요청을 보내지 못했습니다.`);
        for(let attempt=0;attempt<10&&!image;attempt++){
          await sleep(600);
          const found=await jsonpFetch(cfg.url+'?action=imageStatus&key='+encodeURIComponent(imageKey));
          if(found&&found.found)image=found.url;
        }
        if(!image)throw new Error(`${p.num}번 이미지를 업로드하지 못했습니다.`);
      }
      sharedPassages[i]={question_id:ensureQuestionId(p),legacy_question_id:p.id,id:p.id,num:p.num,endNum:p.endNum||null,numLabel:p.numLabel||String(p.num),text:p.text,image,overlayWords:p.overlayWords||[],html:p.html||null,promptKo:p.promptKo||null,choices:p.choices||null,source:p.source||null,source_question_no:p.num,correct_sv:p.sv||[],correct_annotations:p.annotations||[],chunkGaps:p.chunkGaps||[],learning_area:p.learning_area,difficulty:p.difficulty,category_keys:['SENTENCE_STRUCTURE_SV',p.learning_area]};
      completedUploads++;statusEl.textContent=`PDF 문항 이미지 업로드 중 (${completedUploads}/${list.length})`;
    };
    const worker=async()=>{while(nextUpload<list.length){const index=nextUpload++;await uploadOne(index)}};
    await Promise.all(Array.from({length:Math.min(3,list.length)},()=>worker()));
    const setSaved=await hookPost(cfg.url, {
      action: 'saveSentenceSet', token: cfg.token, setKey,
      label: (folder ? folder.name : '') + ` · 선택 ${list.length}문항`,
      passages: sharedPassages
    });
    if(!setSaved)throw new Error('과제자료 저장 요청을 보내지 못했습니다.');
    statusEl.className = 'mb-2 rounded-xl bg-grass-50 p-3 text-xs';
    statusEl.innerHTML = `<p class="font-bold text-grass-600">${list.length}문항을 과제자료로 저장했습니다.</p><a href="../teacher/assignments.html?content_type=SENTENCE_STRUCTURE&content_ref_id=${encodeURIComponent(setKey)}" class="mt-2 inline-block rounded-lg bg-brand-500 px-3 py-2 font-bold text-white">학생·그룹 선택하고 배정하기</a>`;
    if(new URLSearchParams(location.search).get('assignment_pick')==='1'){
      let assignmentDraft={};try{assignmentDraft=JSON.parse(sessionStorage.getItem('elab.assignment.draft.v2')||'{}')||{}}catch(error){}
      const ref=String(setKey),cart=Array.isArray(assignmentDraft.cart)?assignmentDraft.cart:[],pending=Array.isArray(assignmentDraft.pendingItems)?assignmentDraft.pendingItems:[],label=(folder?folder.name:'')+` · 선택 ${list.length}문항`;
      if(!cart.some(item=>item.content_type==='SENTENCE_STRUCTURE'&&String(item.content_ref_id)===ref))cart.push({content_type:'SENTENCE_STRUCTURE',content_ref_id:ref});
      if(!pending.some(item=>item.content_type==='SENTENCE_STRUCTURE'&&String(item.content_ref_id)===ref))pending.push({content_type:'SENTENCE_STRUCTURE',content_ref_id:ref,title:label,content_link:'',extra:{passageCount:list.length}});
      assignmentDraft.cart=cart;assignmentDraft.pendingItems=pending;
      try{sessionStorage.setItem('elab.assignment.draft.v2',JSON.stringify(assignmentDraft))}catch(error){}
      sessionStorage.removeItem('elab.assignment.workspace.v1');
      statusEl.innerHTML=`<p class="font-bold text-grass-600">${list.length}문항 저장 완료 · 과제배정 화면으로 이동합니다.</p>`;
      location.replace('../teacher/assignments.html');
      return;
    }
    this.selectMode = false;
    this.selectedIds = new Set();
    this.selectAnchor = null;
    this.renderNums();
  },

  buildExamFrom(list, titleLabel){
    const ready = list.filter(p => p.image && p.choices && p.choices.length===5 && p.answer);
    if(ready.length===0){ toast('보기 5개 + 정답까지 설정된 지문이 없어요'); return; }
    const skipped = list.length - ready.length;
    const nums = ready.map(p=>p.num);
    TeacherApp.draft = {
      contentType: 'image',
      questions: ready.map(p=>({ question_id:ensureQuestionId(p), legacy_question_id:p.id, num:p.num, dataUrl:p.image, image:p.image, choices:p.choices, answer:p.answer, type:p.type||null, source:p.source||null, folderName:(this.db.folders.find(folder=>folder.id===p.folderId)||{}).name||'' })),
      title: titleLabel || '',
      range: nums.length ? (Math.min(...nums)===Math.max(...nums) ? `${nums[0]}번` : `${Math.min(...nums)}~${Math.max(...nums)}번`) : '',
      step: 'answers'
    };
    if(skipped>0) toast(`${skipped}개는 원본 이미지·보기·정답이 미완성이라 제외했어요`);
    this.selectMode = false;
    this.selectedIds = new Set();
    this.selectAnchor = null;
    TeacherApp.render();
  },

  render(root){
    this.db = loadPassageDB();
    if(organizePassageFolderTree(this.db))savePassageDB(this.db);
    if(!this.treeInitialized){this.db.folders.filter(f=>f.autoGroup).forEach(f=>this.treeExpanded.add(f.id));this.treeInitialized=true}
    // 새로고침하거나 다른 메뉴를 다녀와도 마지막으로 사용한 PDF 폴더를 복원한다.
    // 마지막 폴더가 삭제된 경우에는 저장된 첫 폴더를 자동으로 연다.
    const availableFolders=this.db.folders.filter(f=>!f.autoGroup&&!f.reviewPending);
    if(!availableFolders.some(f=>f.id===this.curFolderId)){
      const remembered=localStorage.getItem(LAST_PASSAGE_FOLDER_KEY);
      this.curFolderId=availableFolders.some(f=>f.id===remembered)?remembered:(availableFolders[0]?.id||null);
      this.curPassageId=null;
    }
    if(this.curFolderId)localStorage.setItem(LAST_PASSAGE_FOLDER_KEY,this.curFolderId);
    const sentenceMode = appState.teacher.tool === 'sentence-structure';
    if(!sentenceMode)this.selectMode=true;
    root.innerHTML = `
      <section class="mb-4 rounded-3xl bg-white p-4 shadow">
        <div class="mb-2 flex items-center justify-between gap-2">
          <div class="flex items-center gap-2">
            <h2 class="text-sm font-extrabold text-slate-700">📁 폴더</h2>
            ${sentenceMode?'<button id="fb-new-folder" class="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-600">+ 새 폴더</button>':''}
          </div>
          <div class="flex flex-wrap justify-end gap-1.5">
            ${sentenceMode?'<button id="fb-add-passage" class="rounded-lg bg-brand-50 px-3 py-1.5 text-xs font-bold text-brand-600">+ 지문 추가</button>':''}
          </div>
        </div>
        ${sentenceMode?'':'<p class="mb-2 px-1 text-[11px] text-slate-500">클릭: 한 폴더 선택 · Ctrl+클릭: 개별 다중선택 · Shift+클릭: 연속선택 · 드래그/▲▼: 위치 변경</p>'}
        <div id="fb-folder-list" class="space-y-1" style="max-height:${sentenceMode?'min(42vh,380px)':'min(40vh,360px)'};overflow-y:auto;padding-right:4px;overscroll-behavior:contain"></div>
        <div id="fb-folder-empty" class="hidden rounded-xl border-2 border-dashed border-slate-200 py-6 text-center text-xs text-slate-500">
          아직 폴더가 없어요. "+ 새 폴더"로 하나 만들어보세요.
        </div>
      </section>
      <section id="fb-nums-section" class="mb-4 hidden rounded-3xl bg-white p-4 shadow">
        <div class="mb-2 flex items-center justify-between gap-2">
          <h2 id="fb-nums-title" class="text-sm font-extrabold text-slate-700">📑 문항</h2>
          <div class="flex flex-wrap justify-end gap-1.5">
            ${sentenceMode?'':'<button id="fb-bulk-classify" class="rounded-lg bg-teal-50 px-3 py-1.5 text-xs font-bold text-teal-600">🏷️ 전체 자동 분류</button>'}
            ${sentenceMode?`<button id="fb-select-mode" class="rounded-lg px-3 py-1.5 text-xs font-bold ${this.selectMode?'bg-brand-500 text-white':'bg-slate-100 text-slate-600'}">☑️ 골라서 숙제 내기</button>`:''}
          </div>
        </div>
        <div class="mb-2 flex items-center gap-1.5">
          <label class="text-[11px] font-bold text-slate-500">유형 필터</label>
          <select id="fb-type-filter" class="rounded-lg border-2 border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600">
            <option value="">전체 유형</option>
            ${QUESTION_TYPE_GROUPS.map(g=>`<optgroup label="${esc(g.group)}">${g.types.map(t=>`<option value="${t.key}">${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}
            <option value="__none">미지정만</option>
          </select>
        </div>
        <div id="fb-select-bar" class="mb-2 hidden items-center justify-between gap-2 rounded-xl bg-brand-50 px-3 py-2">
          <span id="fb-select-count" class="text-xs font-bold text-brand-600">0개 선택됨</span>
          <div class="flex flex-wrap justify-end gap-1.5">
            <button id="fb-select-clear" class="rounded-lg bg-white px-2.5 py-1.5 text-xs font-bold text-slate-500 shadow-sm">선택 해제</button>
            ${sentenceMode?'<button id="fb-select-save" class="rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-bold text-white">선택 문항 과제자료 저장</button>':'<button id="fb-select-build" class="rounded-lg bg-brand-500 px-2.5 py-1.5 text-xs font-bold text-white">선택한 문항으로 시험 만들기</button><button id="fb-select-pdf" title="인쇄 창에서 PDF로 저장" class="rounded-lg bg-slate-800 px-2.5 py-1.5 text-xs font-bold text-white disabled:opacity-40">선택 문항 PDF 다운로드</button>'}
          </div>
        </div>
        <div id="fb-share-status" class="mb-2 hidden rounded-xl bg-brand-50 p-3 text-xs"></div>
        <div id="fb-nums" class="mb-2 flex flex-wrap gap-1.5"></div>
        <p id="fb-nums-empty" class="hidden rounded-xl border-2 border-dashed border-slate-200 py-6 text-center text-xs text-slate-500">
          아직 지문이 없어요.
        </p>
        <div id="fb-form" class="mt-3 hidden rounded-2xl bg-slate-50 p-3">
          <div class="mb-2 flex items-center gap-2">
            <label class="text-xs font-bold text-slate-500">번호</label>
            <input id="fbf-num" type="number" class="w-24 rounded-lg border-2 border-slate-100 bg-white px-2 py-1.5 text-sm outline-none focus:border-brand-400" />
          </div>
          <input id="fbf-prompt" type="text" placeholder="문제번호 옆 한글 지시문 (선택)"
            class="mb-2 w-full rounded-xl border-2 border-slate-100 bg-white px-3 py-2 text-sm outline-none focus:border-brand-400" />
          <textarea id="fbf-text" rows="4" placeholder="영어 지문을 붙여넣으세요"
            class="w-full rounded-xl border-2 border-slate-100 bg-white p-3 text-sm outline-none focus:border-brand-400"></textarea>
          <p id="fbf-html-hint" class="mb-2 hidden text-[11px] leading-relaxed text-amber-600">이 지문은 서식(굵게/밑줄/박스)이 있는 지문이라 위 칸에 &lt;b&gt;/&lt;u&gt; 같은 HTML 태그가 그대로 보여요 — 태그는 남기고 글자만 고쳐주세요.</p>
          <textarea id="fbf-choices" rows="3" placeholder="보기 5개(①~⑤), 한 줄에 하나씩"
            class="mt-2 w-full rounded-xl border-2 border-slate-100 bg-white p-3 text-sm outline-none focus:border-brand-400"></textarea>
          <div class="mt-2">
            <label class="mb-1 flex items-center gap-1.5 text-xs font-bold text-slate-500">
              🖼️ 도표·그림 (선택 — 텍스트로 옮기기 힘든 도표·네모칸용)
            </label>
            <div id="fbf-image-preview" class="hidden mb-1.5 overflow-x-auto rounded-xl border border-slate-200 bg-white p-2">
              <img id="fbf-image-preview-img" class="mx-auto max-h-40" />
            </div>
            <div class="flex gap-1.5">
              <label class="flex-1 cursor-pointer rounded-xl bg-white px-3 py-2 text-center text-xs font-bold text-slate-600 ring-1 ring-slate-200">
                📤 이미지 선택
                <input id="fbf-image-file" type="file" accept="image/*" class="hidden" />
              </label>
              <button id="fbf-image-clear" class="hidden rounded-xl bg-coral-50 px-3 py-2 text-xs font-bold text-coral-500">이미지 삭제</button>
            </div>
          </div>
          <div class="mt-2 flex gap-2">
            <button id="fbf-cancel" class="flex-1 rounded-xl bg-slate-100 py-2.5 text-xs font-bold text-slate-600">취소</button>
            <button id="fbf-save" class="flex-1 rounded-xl bg-brand-500 py-2.5 text-xs font-bold text-white">저장</button>
          </div>
        </div>
        <div id="fb-passage-view"></div>
      </section>
    `;

    document.getElementById('fb-new-folder')?.addEventListener('click', async ()=>{
      const name = await askPrompt('새 폴더 이름 (예: 고2 25년 9월 모의고사)');
      if(!name) return;
      const f = { id: uid(8), name, createdAt: Date.now() };
      this.db.folders.push(f);
      savePassageDB(this.db);
      this.selectFolder(f.id);
    });
    document.getElementById('fb-import-file')?.addEventListener('change', e=>this.handleImportFiles(e));
    document.getElementById('fb-add-passage')?.addEventListener('click', ()=>{
      if(!this.curFolderId){ toast('먼저 폴더를 선택해주세요'); return; }
      this.openForm('add');
    });
    document.getElementById('fb-build-exam')?.addEventListener('click', ()=>this.buildExam());
    document.getElementById('fb-type-filter').value = this.typeFilter;
    document.getElementById('fb-type-filter').addEventListener('change', e=>{
      this.typeFilter = e.target.value;
      this.renderNums();
    });
    document.getElementById('fb-bulk-classify')?.addEventListener('click', ()=>{
      if(!this.curFolderId){ toast('먼저 폴더를 선택해주세요'); return; }
      const list = passagesInFolder(this.db, this.curFolderId);
      let n = 0;
      list.forEach(p=>{
        if(!p.type){ const t = classifyQuestionType(p.promptKo); if(t){ p.type = t; n++; } }
      });
      if(n>0) savePassageDB(this.db);
      toast(n>0 ? `${n}개 지문을 분류했어요` : '분류할 수 있는 새 지문이 없어요');
      this.renderNums();
    });
    document.getElementById('fb-select-mode')?.addEventListener('click', ()=>{
      this.selectMode = !this.selectMode;
      if(!this.selectMode) this.selectedIds = new Set();
      this.selectAnchor = null;
      this.hideForm();
      this.renderNums();
    });
    document.getElementById('fb-select-clear').addEventListener('click', ()=>{
      this.selectedIds = new Set();
      this.selectAnchor = null;
      this.renderNums();
    });
    document.getElementById('fb-select-build')?.addEventListener('click', ()=>this.buildExamFromSelection());
    document.getElementById('fb-select-pdf')?.addEventListener('click', ()=>this.printSelection());
    document.getElementById('fb-select-save')?.addEventListener('click', async event=>{
      const button=event.currentTarget;
      if(button.disabled)return;
      button.disabled=true;button.textContent='저장 준비 중...';
      const status=document.getElementById('fb-share-status');
      if(status){status.className='mb-2 rounded-xl bg-brand-50 p-3 text-xs font-bold text-brand-600';status.textContent='선택 문항을 확인하고 있습니다.'}
      try{await this.saveSelectionAsAssignmentContent()}
      catch(error){
        const message=error&&error.message?error.message:'과제자료를 저장하지 못했습니다.';
        if(status){status.className='mb-2 rounded-xl bg-coral-50 p-3 text-xs font-bold text-coral-600';status.textContent=message}
        console.error(error);
      }finally{
        if(document.body.contains(button)){button.disabled=false;button.textContent='선택 문항 과제자료 저장'}
      }
    });
    document.getElementById('fbf-cancel').addEventListener('click', ()=>this.hideForm());
    document.getElementById('fbf-save').addEventListener('click', ()=>this.savePassage());
    document.getElementById('fbf-image-file').addEventListener('change', async e=>{
      const file = e.target.files[0];
      e.target.value = '';
      if(!file) return;
      try{
        this.formImage = await readImageCompressed(file);
        this.updateImagePreview();
      }catch(err){ toast('이미지를 읽지 못했어요'); }
    });
    document.getElementById('fbf-image-clear').addEventListener('click', ()=>{
      this.formImage = null;
      this.updateImagePreview();
    });

    this.renderFolders();
    this.renderNums();
  },

  async openRenderReviewPicker(){
    document.getElementById('render-review-modal')?.remove();
    if(window.ElabExamMedia)await ElabExamMedia.hydrate(this.db);
    const reviewRows=folderTreeRows(this.db.folders,true),folders=reviewRows.map(row=>({folder:row.folder,depth:row.depth,items:passagesInFolder(this.db,row.folder.id).filter(p=>p.image&&Number(p.num)>=18&&Number(p.num)<=45)})).filter(x=>x.items.length);
    if(!folders.length){toast('검수할 PDF 문항이 없습니다.');return}
    const selectableById=new Map(folders.map(x=>[x.folder.id,x]));
    const reviewTreeHtml=reviewRows.map(row=>{const folder=row.folder,item=selectableById.get(folder.id),indent=row.depth*18;if(folder.autoGroup){const count=this.db.passages.filter(p=>folderDescendantIds(this.db.folders,folder.id).includes(p.folderId)&&p.image&&Number(p.num)>=18&&Number(p.num)<=45).length;return count?`<div style="margin-left:${indent}px" class="flex items-center justify-between rounded-xl bg-slate-100 px-4 py-2.5 text-sm font-extrabold text-slate-700"><span>📁 ${esc(folder.name)}</span><span class="text-xs font-bold text-slate-400">${count}개</span></div>`:''}if(!item)return'';return`<button style="margin-left:${indent}px;width:calc(100% - ${indent}px)" type="button" data-review-folder="${folder.id}" aria-pressed="false" class="flex items-center justify-between rounded-xl border-2 border-slate-200 bg-white px-4 py-3 text-left text-sm font-bold text-slate-700 focus:outline-none focus:ring-2 focus:ring-brand-400"><span>📄 ${esc(folder.name)}</span><span class="text-xs ${folder.reviewPending?'text-amber-600':'text-green-600'}">${folder.reviewPending?'검수 대기':'검수 완료'} · ${item.items.length}개</span></button>`}).join('');
    document.body.insertAdjacentHTML('beforeend',`<div id="render-review-modal" class="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/55 p-4" role="dialog" aria-modal="true" aria-labelledby="render-review-title">
      <section class="w-full max-w-xl rounded-2xl bg-white p-5 shadow-2xl">
        <div class="mb-4 flex items-center justify-between gap-2"><h2 id="render-review-title" class="text-lg font-extrabold text-slate-800">검수할 폴더 선택</h2><div class="flex gap-2"><button id="render-review-all" type="button" class="rounded-lg bg-brand-50 px-3 py-2 text-sm font-bold text-brand-600">전체 폴더 선택</button><button id="render-review-close" type="button" class="rounded-lg bg-slate-100 px-3 py-2 text-sm font-bold text-slate-600">닫기</button></div></div>
        <div id="render-review-folders" class="grid max-h-[55vh] gap-2 overflow-auto" role="group" aria-label="검수할 폴더">${reviewTreeHtml}</div>
        <div class="mt-4 flex items-center justify-between gap-3"><span id="render-review-selected" class="text-sm font-bold text-slate-500">0개 폴더 선택</span><div class="flex gap-2"><button id="render-review-rerender" type="button" disabled class="rounded-xl bg-slate-800 px-4 py-3 text-sm font-extrabold text-white disabled:opacity-40">선택 폴더 다시 렌더링</button><button id="render-review-start" type="button" disabled class="rounded-xl bg-brand-500 px-5 py-3 text-sm font-extrabold text-white disabled:opacity-40">검수 시작</button></div></div>
      </section></div>`);
    const modal=document.getElementById('render-review-modal'),buttons=[...modal.querySelectorAll('[data-review-folder]')],selected=new Set(),start=modal.querySelector('#render-review-start'),rerender=modal.querySelector('#render-review-rerender');
    const close=()=>modal.remove();
    const update=()=>{buttons.forEach(button=>{const on=selected.has(button.dataset.reviewFolder);button.setAttribute('aria-pressed',String(on));button.classList.toggle('border-brand-500',on);button.classList.toggle('bg-brand-50',on);button.classList.toggle('border-slate-200',!on);button.classList.toggle('bg-white',!on)});modal.querySelector('#render-review-selected').textContent=`${selected.size}개 폴더 선택`;start.disabled=!selected.size;rerender.disabled=!selected.size};
    buttons.forEach(button=>button.onclick=()=>{const id=button.dataset.reviewFolder;if(selected.has(id))selected.delete(id);else selected.add(id);update()});
    modal.querySelector('#render-review-all').onclick=()=>{const allSelected=selected.size===buttons.length;selected.clear();if(!allSelected)buttons.forEach(button=>selected.add(button.dataset.reviewFolder));modal.querySelector('#render-review-all').textContent=allSelected?'전체 폴더 선택':'전체 선택 해제';update()};
    modal.onkeydown=e=>{const index=buttons.indexOf(document.activeElement);if((e.key==='ArrowDown'||e.key==='ArrowRight')&&index>=0){e.preventDefault();buttons[(index+1)%buttons.length].focus()}else if((e.key==='ArrowUp'||e.key==='ArrowLeft')&&index>=0){e.preventDefault();buttons[(index-1+buttons.length)%buttons.length].focus()}else if(e.key==='Escape'){e.preventDefault();close()}};
    modal.querySelector('#render-review-close').onclick=close;
    rerender.onclick=async()=>{const targets=this.db.folders.filter(folder=>selected.has(folder.id)&&folder.sourcePdfId);if(!targets.length){toast('PDF 자료에서 자동 반영된 폴더를 선택해주세요.');return}const records=await ElabPdfLibrary.list();for(const folder of targets){folder.pendingRender=true;folder.reviewPending=true;if(records.some(record=>record.id===folder.sourcePdfId))await ElabPdfLibrary.updateById(folder.sourcePdfId,{renderReviewStatus:'pending',renderReviewedAt:0})}await savePassageDB(this.db);modal.remove();if(typeof TeacherApp!=='undefined'){TeacherApp.pdfAutoFailedVersions={};TeacherApp.pdfAutoProgress=null;TeacherApp.syncPdfLibraryToFolders()}toast(`${targets.length}개 PDF의 검수 완료를 취소하고 다시 렌더링합니다.`)};
    start.onclick=()=>{const items=[];folders.forEach(x=>{if(selected.has(x.folder.id))x.items.forEach(p=>items.push({folder:x.folder,passage:p}))});close();this.openRenderReview(items)};
    buttons[0].focus();
  },

  openRenderReview(items){
    if(!items.length)return;
    let index=0;
    document.body.insertAdjacentHTML('beforeend',`<div id="render-review-modal" class="fixed inset-0 z-[100] flex flex-col bg-slate-950 text-white" role="dialog" aria-modal="true" aria-label="PDF 렌더링 검수">
      <header class="flex shrink-0 items-center justify-between gap-3 border-b border-white/15 px-4 py-3"><div class="min-w-0 flex-1"><b id="render-review-name" class="block truncate text-sm"></b><span id="render-review-count" class="text-xs text-slate-300"></span></div><form id="render-review-jump" class="flex shrink-0 items-center gap-2"><label for="render-review-number" class="text-xs font-bold text-slate-300">문제번호</label><input id="render-review-number" type="number" min="18" max="45" inputmode="numeric" placeholder="예: 38" class="w-24 rounded-lg border border-white/20 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none focus:ring-2 focus:ring-brand-400"><button type="submit" class="rounded-lg bg-brand-500 px-3 py-2 text-sm font-bold">이동</button></form><button id="render-review-approve" type="button" class="shrink-0 rounded-lg bg-grass-500 px-3 py-2 text-sm font-extrabold text-white">선택 PDF 검수 완료</button><button id="render-review-close" type="button" class="shrink-0 rounded-lg bg-white/10 px-3 py-2 text-sm font-bold">검수 종료</button></header>
      <main class="flex min-h-0 flex-1 items-center justify-center overflow-auto p-4"><button id="render-review-image-button" type="button" class="flex max-h-full max-w-full items-center justify-center bg-transparent" aria-label="다음 문항"><img id="render-review-image" class="max-h-[calc(100vh-140px)] max-w-full object-contain" alt="PDF 문항"></button></main>
      <footer class="flex shrink-0 items-center justify-center gap-3 border-t border-white/15 px-4 py-3"><button id="render-review-prev" type="button" class="rounded-xl bg-white/10 px-6 py-3 text-sm font-bold">← 이전</button><span class="text-xs text-slate-300">← → · Enter · Space · 이미지 클릭</span><button id="render-review-next" type="button" class="rounded-xl bg-brand-500 px-6 py-3 text-sm font-bold">다음 →</button></footer>
    </div>`);
    const modal=document.getElementById('render-review-modal'),image=modal.querySelector('#render-review-image');
    const close=()=>{window.removeEventListener('keydown',onKey,true);modal.remove()};
    const show=()=>{const item=items[index],p=item.passage,linked=Number(p.endNum)-Number(p.num)>=2,main=modal.querySelector('main'),imageButton=modal.querySelector('#render-review-image-button');modal.querySelector('#render-review-name').textContent=`${item.folder.name} · ${p.numLabel||p.num}번`;modal.querySelector('#render-review-count').textContent=`${index+1} / ${items.length}`;image.src=p.image;image.className=linked?'w-full max-w-[1100px] object-contain':'max-h-[calc(100vh-140px)] max-w-full object-contain';main.style.alignItems=linked?'flex-start':'center';imageButton.className=linked?'flex w-full max-w-[1100px] items-start justify-center bg-transparent':'flex max-h-full max-w-full items-center justify-center bg-transparent';modal.querySelector('#render-review-prev').disabled=index===0;modal.querySelector('#render-review-next').textContent=index===items.length-1?'처음으로 →':'다음 →';const next=items[(index+1)%items.length];if(next&&next.passage.image){const preload=new Image();preload.src=next.passage.image}};
    const move=delta=>{index=(index+delta+items.length)%items.length;show()};
    const includesNumber=(passage,num)=>{const start=Number(passage.num),end=Number(passage.endNum)||start;return num>=start&&num<=end};
    const jumpTo=num=>{if(!Number.isFinite(num))return;const folderId=items[index].folder.id;let found=items.findIndex(item=>item.folder.id===folderId&&includesNumber(item.passage,num));if(found<0)found=items.findIndex(item=>includesNumber(item.passage,num));if(found<0){toast(`${num}번 문항을 찾지 못했습니다.`);return}index=found;show();modal.querySelector('#render-review-image-button').focus()};
    const onKey=e=>{if(e.target.closest('#render-review-jump'))return;if(e.key==='ArrowRight'||e.key==='Enter'||e.key===' '){e.preventDefault();move(1)}else if(e.key==='ArrowLeft'){e.preventDefault();move(-1)}else if(e.key==='Escape'){e.preventDefault();close()}};
    modal.querySelector('#render-review-jump').onsubmit=e=>{e.preventDefault();jumpTo(Number(modal.querySelector('#render-review-number').value))};modal.querySelector('#render-review-approve').onclick=async()=>{const selectedFolders=[...new Map(items.map(item=>[item.folder.id,item.folder])).values()],sourceIds=[...new Set(selectedFolders.map(folder=>folder.sourcePdfId).filter(Boolean))];if(!sourceIds.length){toast('PDF 자료와 연결된 폴더가 없습니다.');return}const records=await ElabPdfLibrary.list();for(const id of sourceIds){const record=records.find(row=>row.id===id);if(record)await ElabPdfLibrary.updateById(id,{renderReviewStatus:'approved',renderReviewedAt:Date.now()})}selectedFolders.forEach(folder=>folder.reviewPending=false);await savePassageDB(this.db);toast(`${sourceIds.length}개 PDF 검수를 완료했습니다. 모든 메뉴에 자동 반영합니다.`);close();if(typeof TeacherApp!=='undefined'){TeacherApp.pdfAutoProgress=null;TeacherApp.syncPdfLibraryToFolders()}};modal.querySelector('#render-review-close').onclick=close;modal.querySelector('#render-review-prev').onclick=()=>move(-1);modal.querySelector('#render-review-next').onclick=()=>move(1);modal.querySelector('#render-review-image-button').onclick=()=>move(1);window.addEventListener('keydown',onKey,true);show();modal.querySelector('#render-review-image-button').focus();
  },

  renderFolders(){
    const wrap = document.getElementById('fb-folder-list');
    const empty = document.getElementById('fb-folder-empty');
    const folders = this.db.folders;
    if(folders.length===0){
      wrap.innerHTML = '';
      empty.classList.remove('hidden');
      return;
    }
    empty.classList.add('hidden');

    // 펼쳐진 폴더의 하위만 보이는 "현재 보이는" 트리 목록(depth 포함) -- 접힌 폴더의 하위는 안 그림
    const rows = [];
    const walk = (parentId, depth)=>{
      folderChildren(folders, parentId).forEach(f=>{
        rows.push({ ...f, depth });
        if(this.treeExpanded.has(f.id)) walk(f.id, depth+1);
      });
    };
    walk(null, 0);

    wrap.innerHTML = `
      <div id="fb-folder-root-drop" class="rounded-xl border-2 border-dashed border-slate-200 px-3 py-1.5 text-center text-[11px] text-slate-400">⬆️ 여기로 드래그하면 최상위 폴더로 이동</div>
      ${rows.map(f=>{
        const hasKids = folderChildren(folders, f.id).length>0;
        const isOpen = this.treeExpanded.has(f.id);
        const sel = this.selectedFolderIds.has(f.id)||f.id===this.curFolderId;
        const count = this.db.passages.filter(p=>folderDescendantIds(folders,f.id).includes(p.folderId)).length;
        const siblings = folderChildren(folders, f.parentId||null);
        const sibIdx = siblings.findIndex(s=>s.id===f.id);
        const canOutdent = f.parentId != null;
        const canIndent = sibIdx > 0;
        return `<div data-tree-row="${f.id}" style="padding-left:${f.depth*18}px" class="flex items-center gap-1.5 rounded-xl px-2 py-2 text-sm ${sel?'bg-brand-50':'bg-slate-50'}">
          <button data-tree-toggle="${f.id}" class="grid h-5 w-5 shrink-0 place-items-center text-slate-500 ${hasKids?'':'invisible'}">${isOpen?'▾':'▸'}</button>
          <span draggable="true" data-drag-folder="${f.id}" title="드래그해서 폴더 이동" class="shrink-0 cursor-grab select-none active:cursor-grabbing">📁</span>
          <span data-select-folder="${f.id}" class="min-w-0 flex-1 cursor-pointer truncate text-sm font-bold ${sel?'text-brand-600':'text-slate-700'}">${esc(f.name)} <span class="font-normal text-slate-400">(${count}개)</span></span>
          <div class="flex shrink-0 flex-col">
            <button data-folder-outdent="${f.id}" title="상위 폴더로 이동" ${canOutdent?'':'disabled'} class="grid h-3.5 w-5 place-items-center text-[9px] leading-none text-slate-500 hover:text-brand-500 disabled:opacity-20 disabled:hover:text-slate-500">▲</button>
            <button data-folder-indent="${f.id}" title="바로 위 폴더의 하위로 이동" ${canIndent?'':'disabled'} class="grid h-3.5 w-5 place-items-center text-[9px] leading-none text-slate-500 hover:text-brand-500 disabled:opacity-20 disabled:hover:text-slate-500">▼</button>
          </div>
          <button data-rename-folder="${f.id}" class="shrink-0 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-slate-500 shadow-sm">이름변경</button>
          <button data-del-folder="${f.id}" class="shrink-0 rounded-lg bg-white px-2 py-1 text-[11px] font-bold text-coral-500 shadow-sm">삭제</button>
        </div>`;
      }).join('')}
    `;

    wrap.querySelectorAll('[data-tree-toggle]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.stopPropagation();
        const id = btn.dataset.treeToggle;
        if(this.treeExpanded.has(id)) this.treeExpanded.delete(id); else this.treeExpanded.add(id);
        this.renderFolders();
      });
    });
    wrap.querySelectorAll('[data-select-folder]').forEach((el,index)=>{
      el.addEventListener('click', event=>{
        const id=el.dataset.selectFolder;
        if(event.shiftKey&&this.folderSelectAnchor!=null){
          const lo=Math.min(index,this.folderSelectAnchor),hi=Math.max(index,this.folderSelectAnchor);
          for(let i=lo;i<=hi;i++)this.selectedFolderIds.add(rows[i].id);
        }else if(event.ctrlKey||event.metaKey){
          if(this.selectedFolderIds.has(id))this.selectedFolderIds.delete(id);else this.selectedFolderIds.add(id);
          this.folderSelectAnchor=index;
        }else{
          this.selectedFolderIds=new Set([id]);
          this.folderSelectAnchor=index;
        }
        this.curFolderId=id;
        localStorage.setItem(LAST_PASSAGE_FOLDER_KEY,id);
        this.curPassageId=null;
        this.renderFolders();this.renderNums();this.hideForm();
      });
    });
    wrap.querySelectorAll('[data-rename-folder]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const f = this.db.folders.find(x=>x.id===btn.dataset.renameFolder);
        const name = await askPrompt('새 폴더 이름', f.name);
        if(!name) return;
        f.name = name;
        savePassageDB(this.db);
        this.renderFolders();
      });
    });
    wrap.querySelectorAll('[data-del-folder]').forEach(btn=>{
      btn.addEventListener('click', async ()=>{
        const id = btn.dataset.delFolder;
        const delIds = folderDescendantIds(this.db.folders, id);
        const passageCount = this.db.passages.filter(x=>delIds.includes(x.folderId)).length;
        const subCount = delIds.length - 1;
        const extra = subCount>0 ? `\n하위 폴더 ${subCount}개도 함께 삭제돼요.` : '';
        const ok = await askConfirm(passageCount>0 ? `이 폴더와 안에 있는 지문 ${passageCount}개를 모두 삭제할까요?${extra}` : `이 폴더를 삭제할까요?${extra}`);
        if(!ok) return;
        this.db.folders = this.db.folders.filter(x=>!delIds.includes(x.id));
        this.db.passages = this.db.passages.filter(x=>!delIds.includes(x.folderId));
        savePassageDB(this.db);
        if(delIds.includes(this.curFolderId)){ this.curFolderId=null; this.curPassageId=null; }
        this.renderFolders();
        this.renderNums();
      });
    });

    // ▲▼ 버튼으로 상위/하위(들여쓰기) 이동
    wrap.querySelectorAll('[data-folder-outdent]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.stopPropagation();
        if(btn.disabled) return;
        const id = btn.dataset.folderOutdent;
        const f = this.db.folders.find(x=>x.id===id);
        if(!f || f.parentId==null) return;
        const parent = this.db.folders.find(x=>x.id===f.parentId);
        f.parentId = parent ? (parent.parentId||null) : null;
        savePassageDB(this.db);
        this.renderFolders();
      });
    });
    wrap.querySelectorAll('[data-folder-indent]').forEach(btn=>{
      btn.addEventListener('click', e=>{
        e.stopPropagation();
        if(btn.disabled) return;
        const id = btn.dataset.folderIndent;
        const f = this.db.folders.find(x=>x.id===id);
        if(!f) return;
        const siblings = folderChildren(this.db.folders, f.parentId||null);
        const idx = siblings.findIndex(s=>s.id===f.id);
        if(idx<=0) return;
        f.parentId = siblings[idx-1].id;
        this.treeExpanded.add(siblings[idx-1].id); // 새 부모를 펼쳐서 옮긴 폴더가 바로 보이게
        savePassageDB(this.db);
        this.renderFolders();
      });
    });

    // 마우스 드래그로 폴더 위치 옮기기 -- 📁 아이콘을 다른 폴더 행에 드롭하면 그 폴더의 하위로,
    // 맨 위 "최상위로 이동" 칸에 드롭하면 최상위로 이동. 자기 자신의 하위 폴더로는 못 옮김(사이클 방지).
    const clearDropRing = el => el.classList.remove('ring-2','ring-brand-400');
    wrap.querySelectorAll('[data-tree-row]').forEach(row=>{
      const id = row.dataset.treeRow;
      const handle = row.querySelector('[data-drag-folder]');
      handle.addEventListener('dragstart', e=>{
        e.dataTransfer.setData('text/plain', id);
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragover', e=>{ e.preventDefault(); e.dataTransfer.dropEffect='move'; row.classList.add('ring-2','ring-brand-400'); });
      row.addEventListener('dragleave', ()=>clearDropRing(row));
      row.addEventListener('drop', e=>{
        e.preventDefault(); clearDropRing(row);
        const dragId = e.dataTransfer.getData('text/plain');
        if(!dragId || dragId===id) return;
        if(!canReparent(this.db.folders, dragId, id)){ toast('하위 폴더로는 옮길 수 없어요'); return; }
        const f = this.db.folders.find(x=>x.id===dragId);
        f.parentId = id;
        this.treeExpanded.add(id);
        savePassageDB(this.db);
        toast('폴더를 이동했어요 📁');
        this.renderFolders();
      });
    });
    const rootDrop = document.getElementById('fb-folder-root-drop');
    rootDrop.addEventListener('dragover', e=>{ e.preventDefault(); rootDrop.classList.add('ring-2','ring-brand-400'); });
    rootDrop.addEventListener('dragleave', ()=>clearDropRing(rootDrop));
    rootDrop.addEventListener('drop', e=>{
      e.preventDefault(); clearDropRing(rootDrop);
      const dragId = e.dataTransfer.getData('text/plain');
      const f = dragId && this.db.folders.find(x=>x.id===dragId);
      if(!f || f.parentId==null) return;
      f.parentId = null;
      savePassageDB(this.db);
      toast('최상위로 이동했어요 📁');
      this.renderFolders();
    });
  },

  selectFolder(id){
    this.curFolderId = id;
    this.selectedFolderIds = new Set(id?[id]:[]);
    if(id)localStorage.setItem(LAST_PASSAGE_FOLDER_KEY,id);
    this.curPassageId = null;
    this.renderFolders();
    this.renderNums();
    this.hideForm();
  },

  renderNums(){
    const section = document.getElementById('fb-nums-section');
    if(!this.curFolderId){ section.classList.add('hidden'); return; }
    section.classList.remove('hidden');
    const folder = this.db.folders.find(f=>f.id===this.curFolderId);
    const sentenceMode = appState.teacher.tool === 'sentence-structure';
    let classified=false;
    if(sentenceMode)this.db.passages.forEach(p=>{if(!p.type){const type=classifyQuestionTypeByNum(p.num,p.promptKo);if(type){p.type=type;classified=true}}});
    if(classified)savePassageDB(this.db);
    const filterOn = !!this.typeFilter;
    // 유형 필터도 위에서 선택한 폴더(및 하위 폴더)의 범위 안에서만 적용한다.
    const selectedFolders=this.selectedFolderIds.size?this.selectedFolderIds:new Set([this.curFolderId]),selectedFolderScope=new Set();
    selectedFolders.forEach(id=>folderDescendantIds(this.db.folders,id).forEach(child=>selectedFolderScope.add(child)));
    const sourceList = this.db.passages.filter(p=>selectedFolderScope.has(p.folderId)).sort((a,b)=>a.num-b.num);
    const fullList = sentenceMode ? sourceList.filter(p=>Number(p.num)>=18&&Number(p.num)<=45) : sourceList;
    const list = this.typeFilter === '__none' ? fullList.filter(p=>!p.type)
      : this.typeFilter ? fullList.filter(p=>p.type===this.typeFilter)
      : fullList;
    if(filterOn){
      list.sort((a,b)=>{
        const fa = this.db.folders.find(f=>f.id===a.folderId);
        const fb = this.db.folders.find(f=>f.id===b.folderId);
        const na = fa?fa.name:'', nb = fb?fb.name:'';
        return na===nb ? a.num-b.num : na.localeCompare(nb);
      });
    }
    document.getElementById('fb-nums-title').textContent = filterOn
      ? `📑 선택 폴더 내 유형 필터 결과 · 문항`
      : '📑 ' + (selectedFolders.size>1?selectedFolders.size+'개 폴더 선택':(folder?folder.name:'')) + ' · 문항';
    const wrap = document.getElementById('fb-nums');
    const emptyEl = document.getElementById('fb-nums-empty');

    const selectBar = document.getElementById('fb-select-bar');
    const selectModeBtn = document.getElementById('fb-select-mode');
    if(selectModeBtn)selectModeBtn.className = 'rounded-lg px-3 py-1.5 text-xs font-bold ' + (this.selectMode?'bg-brand-500 text-white':'bg-slate-100 text-slate-600');
    if(this.selectMode){
      selectBar.classList.remove('hidden');
      selectBar.classList.add('flex');
      document.getElementById('fb-select-count').textContent = `${this.selectedIds.size}개 선택됨`;
      const pdfButton=document.getElementById('fb-select-pdf');if(pdfButton)pdfButton.disabled=this.selectedIds.size===0;
    }else{
      selectBar.classList.add('hidden');
      selectBar.classList.remove('flex');
    }

    if(list.length===0){
      wrap.innerHTML = '';
      emptyEl.classList.remove('hidden');
      emptyEl.textContent = fullList.length===0 ? '아직 지문이 없어요.' : '이 유형에 해당하는 지문이 없어요.';
    }else{
      emptyEl.classList.add('hidden');
      let lastFolderId = null;
      wrap.innerHTML = list.map((p,idx)=>{
        const sel = this.selectMode ? this.selectedIds.has(this.selectionId(p)) : p.id===this.curPassageId;
        const ready = p.choices && p.choices.length===5 && p.answer;
        // 미완성 지문(보기 5개·정답 아직 안 끝남)은 느낌표 배지 대신 점선 테두리로만 은은하게 구분
        // (경고 아이콘이 너무 눈에 띈다는 피드백 반영 — "아직 준비 안 됨" 정도의 톤으로 낮춤).
        const cls = sel ? 'bg-brand-500 text-white border-2 border-transparent'
          : ready ? 'bg-slate-100 text-slate-600 border-2 border-transparent'
          : 'border-2 border-dashed border-slate-300 bg-white text-slate-400';
        const typeLabel = questionTypeLabel(p.type);
        let prefix = '';
        if(filterOn && p.folderId!==lastFolderId){
          lastFolderId = p.folderId;
          const f = this.db.folders.find(x=>x.id===p.folderId);
          prefix = `<span class="basis-full text-[11px] font-bold text-slate-400 ${idx>0?'mt-1.5':''}">📁 ${esc(f?f.name:'(폴더 없음)')}</span>`;
        }
        return prefix + `<button data-open-passage="${p.id}" data-question-id="${esc(this.selectionId(p))}" data-idx="${idx}" title="${typeLabel?esc(typeLabel):'유형 미지정'}" class="relative h-10 min-w-10 rounded-xl px-2 text-sm font-bold ${cls}">${esc(p.numLabel||p.num)}${(!this.selectMode && typeLabel)?'<span class="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-teal-400"></span>':''}</button>`;
      }).join('');
      const btns = Array.from(wrap.querySelectorAll('[data-open-passage]'));
      btns.forEach(btn=>{
        if(this.selectMode){
          btn.addEventListener('click', e=>{
            const id = btn.dataset.openPassage,questionId=btn.dataset.questionId;
            const idx = +btn.dataset.idx;
            if(e.shiftKey && this.selectAnchor!=null){
              const [lo,hi] = idx<this.selectAnchor ? [idx,this.selectAnchor] : [this.selectAnchor,idx];
              for(let i=lo;i<=hi;i++) this.selectedIds.add(this.selectionId(list[i]));
            }else{
              if(this.selectedIds.has(questionId)) this.selectedIds.delete(questionId); else this.selectedIds.add(questionId);
              this.selectAnchor = idx;
            }
            this.curPassageId = id;
            this.renderNums();
            this.renderPassagePreview();
          });
          return;
        }
        btn.addEventListener('click', ()=>{
          this.curFolderId = btn.dataset.openPassage ? this.db.passages.find(x=>x.id===btn.dataset.openPassage).folderId : this.curFolderId;
          this.curPassageId = btn.dataset.openPassage;
          this.hideForm();
          this.renderFolders();
          this.renderNums();
          this.renderPassagePreview();
        });
      });
    }
    this.renderPassagePreview();
  },

  renderSentenceSelectionPreview(wrap,list){
    wrap.innerHTML=list.map((p,index)=>`<article class="mb-6 rounded-2xl border border-slate-200 bg-slate-50 p-4 last:mb-0" data-sentence-card="${esc(this.selectionId(p))}">
      <div class="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-3"><h3 class="text-base font-extrabold text-slate-800">${esc(sentenceQuestionSourceLabel(p,this.db))}</h3><div class="flex gap-1.5"><button type="button" data-card-edit class="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-600">수정</button><button type="button" data-card-delete class="rounded-lg bg-coral-50 px-2.5 py-1.5 text-xs font-bold text-coral-500">삭제</button></div></div>
      <div class="mb-3 flex flex-wrap items-center gap-1.5"><select data-card-type data-learning-area class="rounded-lg border-2 border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600"><option value="">학습 영역 선택</option><option value="SENTENCE_STRUCTURE_CORE" ${p.learning_area==='SENTENCE_STRUCTURE_CORE'?'selected':''}>핵심 문장구조</option><option value="SENTENCE_STRUCTURE_CLAUSE" ${p.learning_area==='SENTENCE_STRUCTURE_CLAUSE'?'selected':''}>절 구조</option><option value="SENTENCE_STRUCTURE_RELATIVE" ${p.learning_area==='SENTENCE_STRUCTURE_RELATIVE'?'selected':''}>관계사 구조</option><option value="SENTENCE_STRUCTURE_INTEGRATED" ${p.learning_area==='SENTENCE_STRUCTURE_INTEGRATED'?'selected':''}>통합 문장구조</option></select><select data-difficulty class="rounded-lg border-2 border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600"><option value="">난이도 선택</option>${['L1','L2','L3'].map(x=>`<option value="${x}" ${p.difficulty===x?'selected':''}>${x}</option>`).join('')}</select></div>
      <div data-card-pens class="sticky top-2 z-40 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur"><span class="text-[11px] font-bold text-slate-500">정답 표시</span><button data-pen="subj" class="pen-btn rounded-xl border-2 px-3 py-1.5 text-xs font-bold">🟡 핵심 주어</button><button data-pen="verb" class="pen-btn rounded-xl border-2 px-3 py-1.5 text-xs font-bold">🟩 본동사</button><button data-pen="unknown" class="pen-btn rounded-xl border-2 px-3 py-1.5 text-xs font-bold">🔴 모르는 단어</button><button data-pen="slash" class="pen-btn rounded-xl border-2 px-3 py-1.5 text-xs font-bold">／ 끊어읽기</button><span class="w-full text-[11px] text-slate-500">명사구는 핵심어만, 병렬 주어는 and를 제외한 핵심어 모두 표시합니다. 완료·수동태는 어휘동사, be+형용사는 be동사를 본동사로 표시합니다.</span></div>
      ${p.promptKo?`<p class="mb-2 text-sm font-extrabold text-slate-700">${esc(p.promptKo)}</p>`:''}<div data-card-mark class="${p.html?'fx-passage ':''}${p.image?'':'passage-mark-view p-3'} mb-3 rounded-xl border border-slate-200 bg-white"></div>
      ${(p.choices&&p.choices.length&&!p.autoOmrChoices)?`<div class="space-y-1.5">${p.choices.map((choice,choiceIndex)=>`<button type="button" data-card-answer="${choiceIndex+1}" class="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${p.answer===choiceIndex+1?'bg-grass-50 text-grass-700 ring-2 ring-grass-400':'bg-white text-slate-600 ring-1 ring-slate-200'}">${esc(choice)}</button>`).join('')}</div>`:''}
    </article>`).join('');
    list.forEach(p=>{const card=wrap.querySelector(`[data-sentence-card="${CSS.escape(this.selectionId(p))}"]`);if(!card)return;card.querySelector('[data-card-type]').onchange=e=>{p.type=e.target.value||null;savePassageDB(this.db);this.renderNums()};card.querySelector('[data-card-edit]').onclick=()=>{this.curPassageId=p.id;this.openForm('edit')};card.querySelector('[data-card-delete]').onclick=async()=>{if(!await askConfirm('이 지문을 삭제할까요?'))return;this.db.passages=this.db.passages.filter(item=>this.selectionId(item)!==this.selectionId(p));this.selectedIds.delete(this.selectionId(p));if(this.curPassageId===p.id)this.curPassageId=null;savePassageDB(this.db);this.renderFolders();this.renderNums()};card.querySelectorAll('[data-card-answer]').forEach(button=>button.onclick=()=>{const answer=Number(button.dataset.cardAnswer);p.answer=p.answer===answer?null:answer;savePassageDB(this.db);this.renderPassagePreview();this.renderNums()});const onMarkerChange=state=>{p.chunkGaps=state.chunkGaps;p.sv=state.sv;p.annotations=state.annotations;p.updatedAt=Date.now();savePassageDB(this.db)},marker=p.image?createPdfImageMarker(p.image,p.overlayWords||[],p.chunkGaps,p.sv,p.annotations,onMarkerChange):createPassageMarker(p.text,p.html,p.promptKo,p.choices,p.chunkGaps,p.sv,onMarkerChange);marker.mount(card.querySelector('[data-card-mark]'),card.querySelector('[data-card-pens]'))});
    wrap.querySelectorAll('[data-sentence-card]').forEach(card=>{const p=list.find(item=>this.selectionId(item)===card.dataset.sentenceCard);if(!p)return;card.querySelector('[data-learning-area]').onchange=e=>{p.learning_area=e.target.value||'';savePassageDB(this.db)};card.querySelector('[data-difficulty]').onchange=e=>{p.difficulty=e.target.value||'';savePassageDB(this.db)}});
  },

  renderPassagePreview(){
    const wrap = document.getElementById('fb-passage-view');
    const sentenceMode = appState.teacher.tool === 'sentence-structure';
    if(sentenceMode&&this.selectMode){const selected=this.db.passages.filter(p=>this.selectedIds.has(this.selectionId(p)));if(!selected.length){wrap.innerHTML='';return}selected.sort((a,b)=>{const af=this.db.folders.find(folder=>folder.id===a.folderId),bf=this.db.folders.find(folder=>folder.id===b.folderId);return String(af&&af.name||'').localeCompare(String(bf&&bf.name||''),'ko',{numeric:true})||Number(a.num)-Number(b.num)});this.renderSentenceSelectionPreview(wrap,selected);return}
    const p = this.db.passages.find(x=>x.id===this.curPassageId);
    if(!p){ wrap.innerHTML = ''; return; }
    wrap.innerHTML = `
      <div class="rounded-2xl bg-slate-50 p-4">
        <div class="mb-3 flex flex-wrap items-center gap-1.5">
          <select id="fb-type-select" class="rounded-lg border-2 border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600">
            <option value="">유형 미지정</option>
            ${QUESTION_TYPE_GROUPS.map(g=>`<optgroup label="${esc(g.group)}">${g.types.map(t=>`<option value="${t.key}" ${p.type===t.key?'selected':''}>${esc(t.label)}</option>`).join('')}</optgroup>`).join('')}
          </select>
          ${sentenceMode?'':'<button id="fb-auto-classify" class="rounded-lg bg-teal-50 px-2.5 py-1.5 text-xs font-bold text-teal-600">🏷️ 자동 분류</button>'}
        </div>
        ${sentenceMode&&(p.html || p.text || p.image) ? `
        <div id="fb-pens" class="sticky top-2 z-40 mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/95 p-2 shadow-md backdrop-blur">
          <span class="text-[11px] font-bold text-slate-500">표시</span>
          <button data-pen="subj" class="pen-btn rounded-xl border-2 px-3 py-1.5 text-xs font-bold">🟡 주어</button>
          <button data-pen="verb" class="pen-btn rounded-xl border-2 px-3 py-1.5 text-xs font-bold">🟩 동사</button>
          <button data-pen="unknown" class="pen-btn rounded-xl border-2 px-3 py-1.5 text-xs font-bold">🔴 모르는 단어</button>
          <button data-pen="slash" class="pen-btn rounded-xl border-2 px-3 py-1.5 text-xs font-bold">／ 끊어읽기</button>
        </div>
        ` : ''}
        <div class="mb-2 flex items-center justify-between">
          <h3 class="text-sm font-extrabold text-slate-700">${esc(sentenceQuestionSourceLabel(p,this.db))}</h3>
          <div class="flex gap-1.5">
            <button id="fb-edit-passage" class="rounded-lg bg-slate-100 px-2.5 py-1.5 text-xs font-bold text-slate-500">✎ 수정</button>
            <button id="fb-del-passage" class="rounded-lg bg-coral-50 px-2.5 py-1.5 text-xs font-bold text-coral-500">🗑 삭제</button>
          </div>
        </div>
        ${p.promptKo ? `<p class="mb-2 text-sm font-extrabold text-slate-700">${esc(p.promptKo)}</p>` : ''}
        ${sentenceMode
          ? `${(p.html || p.text || p.image) ? `<div id="fb-mark-view" class="${p.html ? 'fx-passage ' : ''}${p.image?'':'passage-mark-view p-3'} mb-3 rounded-xl border border-slate-200 bg-white"></div>` : ''}`
          : `${p.image ? `<div id="fb-iq-viewer" class="mb-3 overflow-hidden rounded-xl border border-slate-200 bg-white"><div class="iq-toolbar"><button type="button" data-iq-fit>맞춤</button><button type="button" data-iq-out>축소 −</button><span class="iq-scale" data-iq-scale>100%</span><button type="button" data-iq-in>확대 ＋</button><button type="button" data-iq-tool="pen" aria-pressed="false">펜 쓰기</button><button type="button" data-iq-tool="eraser" aria-pressed="false">지우개</button><button type="button" data-iq-clear disabled>필기 전체 지우기</button><span class="ml-auto text-[11px] font-bold text-slate-400">Ctrl+휠 확대/축소</span></div><div class="iq-viewport" data-iq-viewport><div class="iq-document" data-iq-document><img src="${esc(p.image)}" alt="${esc(p.numLabel||p.num)}번 문제"></div></div></div>` : p.html ? `<div class="fx-passage mb-3 rounded-xl border border-slate-200 bg-white p-3">${renderFormattedPassage_(p.html,p.promptKo,p.choices)}</div>` : p.text ? `<p class="mb-3 whitespace-pre-line rounded-xl border border-slate-200 bg-white p-3 text-sm leading-relaxed text-slate-700">${numberSentencesHtml(p.text)}</p>` : ''}`}
        ${!sentenceMode?`<section class="mb-3 rounded-xl border border-brand-100 bg-brand-50 p-3"><h4 class="mb-2 text-xs font-extrabold text-brand-700">학생 풀이 화면 테스트</h4><div class="grid grid-cols-5 gap-2">${[1,2,3,4,5].map(n=>`<button type="button" data-test-answer="${n}" class="rounded-xl border-2 py-2.5 text-sm font-extrabold ${this.previewAnswers[p.id]===n?'border-brand-500 bg-brand-500 text-white':'border-white bg-white text-slate-700'}">${'①②③④⑤'[n-1]}</button>`).join('')}</div><button type="button" id="fb-test-submit" class="mt-2 w-full rounded-xl bg-slate-800 py-2.5 text-xs font-extrabold text-white disabled:opacity-40" ${this.previewAnswers[p.id]?'':'disabled'}>선택답안 제출</button></section>`:''}
        ${p.html && p.footnote ? `<p class="mb-3 text-right text-[13px] italic text-slate-500">${esc(p.footnote)}</p>` : ''}
        ${(p.choices && p.choices.length && sentenceMode && !p.autoOmrChoices) ? `
          <div class="space-y-1.5">
            ${p.choices.map((c,i)=>`
              <button data-set-answer="${i+1}" class="block w-full rounded-xl px-3 py-2 text-left text-sm font-medium ${p.answer===i+1?'bg-grass-50 text-grass-700 ring-2 ring-grass-400':'bg-white text-slate-600 ring-1 ring-slate-200'}">
                ${esc(c)}
              </button>`).join('')}
          </div>
          <p class="mt-2 text-[11px] text-slate-400">보기를 눌러 정답으로 표시해요.</p>
        ` : ''}
      </div>`;
    document.getElementById('fb-type-select').addEventListener('change', e=>{
      p.type = e.target.value || null;
      savePassageDB(this.db);
      this.renderNums();
    });
    document.getElementById('fb-auto-classify')?.addEventListener('click', ()=>{
      const t = classifyQuestionType(p.promptKo);
      if(!t){ toast('한글 지시문에서 유형을 추정하지 못했어요 — 직접 골라주세요'); return; }
      p.type = t;
      savePassageDB(this.db);
      this.renderNums();
    });
    document.getElementById('fb-edit-passage').addEventListener('click', ()=>this.openForm('edit'));
    document.getElementById('fb-del-passage').addEventListener('click', async ()=>{
      const ok = await askConfirm('이 지문을 삭제할까요?');
      if(!ok) return;
      this.db.passages = this.db.passages.filter(x=>x.id!==this.curPassageId);
      savePassageDB(this.db);
      this.curPassageId = null;
      this.renderFolders();
      this.renderNums();
    });
    if(!sentenceMode&&p.image)mountIndividualQuestionViewer(document.getElementById('fb-iq-viewer'),this.previewInk[p.id]||(this.previewInk[p.id]=[]));
    wrap.querySelectorAll('[data-test-answer]').forEach(btn=>btn.addEventListener('click',()=>{this.previewAnswers[p.id]=Number(btn.dataset.testAnswer);this.renderPassagePreview()}));
    document.getElementById('fb-test-submit')?.addEventListener('click',()=>toast(`${p.numLabel||p.num}번 · ${this.previewAnswers[p.id]}번 선택 · 제출 기능 정상`));
    wrap.querySelectorAll('[data-set-answer]').forEach(btn=>{
      btn.addEventListener('click', ()=>{
        const n = +btn.dataset.setAnswer;
        p.answer = (p.answer===n) ? null : n;
        savePassageDB(this.db);
        this.renderNums();
      });
    });
    if(sentenceMode&&(p.html || p.text || p.image)){
      const onMarkerChange=state=>{
        p.chunkGaps = state.chunkGaps;
        p.sv = state.sv;
        p.annotations = state.annotations;
        p.updatedAt = Date.now();
        savePassageDB(this.db);
      };
      const marker=p.image?createPdfImageMarker(p.image,p.overlayWords||[],p.chunkGaps,p.sv,p.annotations,onMarkerChange):createPassageMarker(p.text,p.html,p.promptKo,p.choices,p.chunkGaps,p.sv,onMarkerChange);
      marker.mount(document.getElementById('fb-mark-view'), document.getElementById('fb-pens'));
    }
  },

  openForm(mode){
    this.formMode = mode;
    if(mode==='add'){
      document.getElementById('fbf-num').value = '';
      document.getElementById('fbf-prompt').value = '';
      document.getElementById('fbf-text').value = '';
      document.getElementById('fbf-html-hint').classList.add('hidden');
      document.getElementById('fbf-choices').value = '';
      this.formImage = null;
    }else{
      const p = this.db.passages.find(x=>x.id===this.curPassageId);
      if(!p) return;
      document.getElementById('fbf-num').value = p.num;
      document.getElementById('fbf-prompt').value = p.promptKo || '';
      // 서식 지문(p.html)이 있으면 그 raw HTML을 그대로 이 칸에서 편집(태그 포함) --
      // p.html 없는 평문 전용 지문은 지금처럼 p.text만 편집.
      document.getElementById('fbf-text').value = p.html || p.text;
      document.getElementById('fbf-html-hint').classList.toggle('hidden', !p.html);
      document.getElementById('fbf-choices').value = (p.choices||[]).join('\n');
      this.formImage = p.image || null;
    }
    this.updateImagePreview();
    const form = document.getElementById('fb-form');
    form.classList.remove('hidden');
    form.scrollIntoView({ behavior:'smooth', block:'center' });
  },
  hideForm(){ document.getElementById('fb-form').classList.add('hidden'); },
  updateImagePreview(){
    const wrap = document.getElementById('fbf-image-preview');
    const clearBtn = document.getElementById('fbf-image-clear');
    if(this.formImage){
      document.getElementById('fbf-image-preview-img').src = this.formImage;
      wrap.classList.remove('hidden');
      clearBtn.classList.remove('hidden');
    }else{
      wrap.classList.add('hidden');
      clearBtn.classList.add('hidden');
    }
  },

  async savePassage(){
    const num = parseInt(document.getElementById('fbf-num').value, 10);
    const promptKo = document.getElementById('fbf-prompt').value.trim() || null;
    const text = document.getElementById('fbf-text').value;
    const choices = document.getElementById('fbf-choices').value.split('\n').map(s=>s.trim()).filter(Boolean);
    if(!num){ toast('문항 번호를 입력해주세요'); return; }
    if(!text.trim()){ toast('지문을 입력해주세요'); return; }

    if(this.formMode==='add'){
      const dup = passagesInFolder(this.db, this.curFolderId).find(p=>p.num===num);
      if(dup){
        const ok = await askConfirm(`이미 ${num}번 지문이 있어요. 덮어쓸까요?`);
        if(!ok) return;
        this.db.passages = this.db.passages.filter(p=>p.id!==dup.id);
      }
      const p = { id: uid(8), question_id:newQuestionId(), folderId: this.curFolderId, num, promptKo, text, choices: choices.length?choices:null, image: this.formImage||null, answer:null, chunkGaps:[], sv:[], updatedAt: Date.now() };
      this.db.passages.push(p);
      savePassageDB(this.db);
      this.hideForm();
      this.curPassageId = p.id;
      this.renderFolders();
      this.renderNums();
    }else{
      const p = this.db.passages.find(x=>x.id===this.curPassageId);
      if(!p) return;
      const wasHtml = !!p.html;
      const sourceChanged = wasHtml ? (p.html !== text) : (p.text !== text);
      const hasMarks = (p.chunkGaps&&p.chunkGaps.length) || (p.sv&&p.sv.some(Boolean));
      if(sourceChanged && hasMarks){
        const ok = await askConfirm('지문을 바꾸면 지금까지 표시한 끊어읽기·주어·동사·모르는 단어가 모두 사라져요. 계속할까요?');
        if(!ok) return;
      }
      p.num = num;
      p.promptKo = promptKo;
      if(wasHtml){ p.html = text; } else { p.text = text; }
      p.choices = choices.length?choices:null;
      p.image = this.formImage||null;
      if(sourceChanged){ p.chunkGaps = []; p.sv = []; }
      if(p.answer && (!p.choices || p.answer > p.choices.length)) p.answer = null;
      p.updatedAt = Date.now();
      savePassageDB(this.db);
      this.hideForm();
      this.renderNums();
    }
  },

  // 버튼 하나로 두 종류를 한꺼번에 받는다 -- PDF는 여기서 아예 안 쓴다(교사가 서식을
  // 눈으로 대조하는 건 앱 밖에서 PDF 뷰어로 직접 하는 용도라, 화면에 노출하지도 저장하지도
  // 않는다 -- 요청사항).
  // (1) exam_pdf_extractor의 format_extract.py까지 돌린 "번호.json"(problem_numbers +
  //     html: 굵게/밑줄/박스/각주까지 서식 있는 텍스트로 재구성됨) + 필요하면
  //     "번호_imgN.png"를 같이 골라서 넣는다. html이 없는(format_extract.py를 아직 안
  //     돌린) json은 건너뛰고 알려준다.
  // (2) 짝이 없는 일반 JSON은 기존처럼 {folderName,passages:[{num,text,...}]} 텍스트
  //     지문 묶음으로 처리한다.
  // source_pdf/pages는 원본 추적용이라 안 쓰고 problem_numbers만 지문 번호로 쓴다 --
  // 41~42처럼 번호가 여러 개면(지문 공유) 같은 내용을 번호별로 각각 복제해서 정답도
  // 번호마다 따로 입력할 수 있게 한다.
  async handleImportFiles(e){
    const files = Array.from(e.target.files || []);
    e.target.value = '';
    if(files.length===0) return;

    const jsonFiles = [];
    const imageFiles = new Map(); // filename -> File (format_extract.py가 만든 번호_imgN.png)
    files.forEach(f=>{
      if(/\.(png|jpe?g)$/i.test(f.name)){ imageFiles.set(f.name, f); return; }
      if(/\.json$/i.test(f.name)) jsonFiles.push(f);
      // .pdf는 그냥 무시한다 -- 화면에 안 쓰고 안 보여줌(요청사항).
    });

    let addedRich = 0, addedText = 0, skipped = 0, lastFolderId = null;

    for(const jf of jsonFiles){
      let meta;
      try{ meta = JSON.parse(await jf.text()); }
      catch(err){ skipped++; continue; }

      if(Array.isArray(meta.problem_numbers)){
        if(!meta.html){ skipped++; continue; } // format_extract.py를 아직 안 돌린 json
        if(!this.curFolderId){ toast('가져오려면 먼저 폴더를 선택하세요'); return; }
        const nums = meta.problem_numbers.map(n=>parseInt(n, 10)).filter(n=>n);
        if(nums.length===0){ skipped++; continue; }

        let html = meta.html;
        for(const imgName of (meta.images || [])){
          const imgFile = imageFiles.get(imgName);
          if(!imgFile) continue;
          const imgDataUrl = await readImageCompressed(imgFile);
          // exam_pdf_extractor가 진짜 사진/도표가 아니라 박스 테두리 장식 같은 걸 이미지로
          // 잘못 떼어내는 경우가 있다(예: 18번 -- 거의 백지에 테두리 선만 있는 파일). 이런
          // 이미지는 넣으면 깨진 빈 상자로만 보이니, 아예 안 넣고 통째로 걸러낸다.
          if(await isBlankishImage_(imgDataUrl)){
            html = html.replace(new RegExp('<img[^>]*src="'+imgName.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')+'"[^>]*/?>','g'), '');
          }else{
            html = html.split(`src="${imgName}"`).join(`src="${imgDataUrl}"`);
          }
        }
        const footnote = meta.footnote || null;

        nums.forEach(num=>{
          const dup = passagesInFolder(this.db, this.curFolderId).find(x=>x.num===num);
          const patch = { html, footnote, image: null, source:{ exam_type:'MOCK', year:meta.year||'', grade:meta.grade||'', month:meta.month||'', exam_name:meta.exam_name||'', source_file:meta.source_pdf||jf.name } };
          if(dup){
            Object.assign(dup, patch);
            if(!dup.choices || dup.choices.length!==5) dup.choices = ['①','②','③','④','⑤'];
            dup.updatedAt = Date.now();
          }else{
            this.db.passages.push(Object.assign({
              id: uid(8), question_id:newQuestionId(), folderId: this.curFolderId, num, text: '', promptKo: null,
              choices: ['①','②','③','④','⑤'], answer: null, updatedAt: Date.now()
            }, patch));
          }
          addedRich++;
        });
        lastFolderId = this.curFolderId;
      }else{
        const bundles = Array.isArray(meta) ? meta : [meta];
        let matched = false;
        for(const bundle of bundles){
          if(!bundle || !bundle.folderName || !Array.isArray(bundle.passages)) continue;
          matched = true;
          let folder = this.db.folders.find(f=>f.name===bundle.folderName);
          if(!folder){
            folder = { id: uid(8), name: bundle.folderName, createdAt: Date.now() };
            this.db.folders.push(folder);
          }
          lastFolderId = folder.id;
          for(const p of bundle.passages){
            const num = parseInt(p.num, 10);
            const text = (p.text||'').trim();
            if(!num || !text) continue;
            const promptKo = (p.promptKo||'').trim() || null;
            const choices = Array.isArray(p.choices) ? p.choices : null;
            const dup = passagesInFolder(this.db, folder.id).find(x=>x.num===num);
            if(dup){
              dup.text = text; dup.promptKo = promptKo; dup.choices = choices; dup.source = p.source||bundle.source||{exam_type:'CUSTOM',exam_name:bundle.folderName,source_file:jf.name}; dup.updatedAt = Date.now();
            }else{
              this.db.passages.push({ id: uid(8), question_id:newQuestionId(), folderId: folder.id, num, text, promptKo, choices, source:p.source||bundle.source||{exam_type:'CUSTOM',exam_name:bundle.folderName,source_file:jf.name}, answer:null, updatedAt: Date.now() });
            }
            addedText++;
          }
        }
        if(!matched) skipped++;
      }
    }

    savePassageDB(this.db);
    const parts = [];
    if(addedRich) parts.push(`서식 지문 ${addedRich}개`);
    if(addedText) parts.push(`텍스트 지문 ${addedText}개`);
    toast((parts.length ? `✅ ${parts.join(' · ')} 가져왔어요` : '가져올 게 없었어요') + (skipped ? ` (${skipped}개는 건너뜀 — format_extract.py를 먼저 돌렸는지 확인해보세요)` : ''));
    if(lastFolderId) this.selectFolder(lastFolderId);
    else { this.renderFolders(); this.renderNums(); }
  }
};
