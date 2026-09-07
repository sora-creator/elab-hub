/* =====================================================================
   PDF → 문항 자동 분리 + 이미지 크롭
===================================================================== */
pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

const HEADER_PATTERNS = [
  // A bare range such as English prose "18–29 group" is not a question header.
  // Connected-question ranges must be bracketed or explicitly followed by "번".
  /^[\[［【(]\s*(\d{1,2})\s*[~\-～∼–—−]\s*(\d{1,2})\s*(?:번)?\s*[\]］】)]/,
  /^(\d{1,2})\s*[~\-～∼–—−]\s*(\d{1,2})\s*번(?:\s|$)/,
  /^(\d{1,2})\s*(?:[~\-～∼–—−]\s*(\d{1,2}))?\s*번/,
  /^(\d{1,2})\s*(?:[~\-～∼–—−]\s*(\d{1,2}))?\s*[\.．](?!\d)/
];

// PDF 파일명에서 연도/월/학년을 자동으로 읽어서 시험 이름표를 자동으로 채우는 데 씀
// (grammar/index.html의 guessFromFilename과 같은 규칙)
const GRADE_DIGIT_RE = /([123])\s*학년/;
const GRADE_DIRECT_RE = /(고[123])/;
const YEAR_RE = /(20\d{2})\s*년/;
const MONTH_RE = /(?<!\d)(\d{1,2})\s*월/;

function guessFromFilename(filename){
  let grade = null, m;
  m = GRADE_DIGIT_RE.exec(filename);
  if(m) grade = '고'+m[1];
  else { m = GRADE_DIRECT_RE.exec(filename); if(m) grade = m[1]; }

  let year = null;
  m = YEAR_RE.exec(filename);
  if(m) year = parseInt(m[1], 10);

  let month = null;
  m = MONTH_RE.exec(filename);
  if(m) month = parseInt(m[1], 10);

  return { year, month, grade };
}

function matchHeaderNum(str){
  // 일부 PDF는 문항번호 한 자리씩을 별도 글자 객체로 저장해 "3 8."처럼 나온다.
  // 연결문제 범위는 "4 1 ~ 4 2"처럼 시작·끝 번호가 모두 쪼개질 수 있으므로
  // 헤더 앞부분의 두 자리 문항번호를 전부 복원한 뒤 범위를 판정한다.
  const t = (str||'').trim().slice(0,120).replace(/([1-4])\s+([0-9])(?=\s*(?:[\.．]|번|[~\-～∼–—−]|[\]］】)]))/g,'$1$2');
  for(const re of HEADER_PATTERNS){
    const m = re.exec(t);
    if(m){const num=parseInt(m[1],10);if(num>=1&&num<=99)return { num, endNum: m[2] ? parseInt(m[2], 10) : null }}
  }
  return null;
}

function matchQuestionRange(str){
  // PDF 글꼴에 따라 화면의 '~'가 ∼·～·–·—·− 등으로 추출되거나 숫자가
  // '3 8'처럼 분리된다. 본문의 숫자 범위를 문항 안내로 오인하지 않도록 반드시
  // 괄호로 묶였거나 뒤에 '번'이 붙은 명시적인 문항 범위만 허용한다.
  const head=String(str||'').slice(0,80).replace(/([1-4])\s+([0-9])/g,'$1$2');
  const found=head.match(/[\[［【(]\s*([1-4][0-9])\s*[~\-～∼–—−]\s*([1-4][0-9])\s*(?:번)?\s*[\]］】)]/)||head.match(/(?:^|\s)([1-4][0-9])\s*[~\-～∼–—−]\s*([1-4][0-9])\s*번(?:\s|$)/);
  if(!found)return null;
  const startNum=Number(found[1]),endNum=Number(found[2]);
  return endNum>startNum?{startNum,endNum}:null;
}

// 문항번호가 PDF 텍스트에서 빠지거나 본문의 숫자를 번호로 잘못 읽으면
// 번호순 배열과 실제 페이지 읽기 순서가 서로 역행할 수 있다. 다음 정상 문항보다
// 뒤에 놓인 마커는 같은 면의 앞쪽 실제 텍스트 시작점으로 복구한다.
// PDF 파일(ArrayBuffer) →
// { pageCanvases: [canvas...], markers: [{pageIdx,y,num}], optionFives: [{pageIdx,y}],
//   groupRanges: [{pageIdx,y,startNum,endNum}] }
async function analyzePdf(arrayBuffer, onProgress, shouldStop){
  const pdf = await pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) }).promise;
  const pageCanvases = [];
  const markers = [];
  const optionFives = []; // 각 문항의 "⑤" 보기 줄 위치 -- 문항 이미지를 여기서 끊는 데 씀
  const groupRanges = []; // "41~42번"처럼 여러 문항이 지문을 공유한다는 안내줄 위치
  const pageTextLines = [];
  const pageWordBoxes = [];
  const RENDER_SCALE = 3.0; // 작은 영문 글자와 밑줄이 선명하게 보이도록 고해상도로 렌더링
  const OPTION_END_PAD = 6; // ⑤ 줄 아래로 살짝 여유(디센더 포함)를 두고 자름

  for(let pageIdx=0; pageIdx<pdf.numPages; pageIdx++){
    if(shouldStop&&shouldStop())throw new Error('PDF 렌더링이 중단되었습니다.');
    if(onProgress) onProgress(pageIdx+1, pdf.numPages);
    const page = await pdf.getPage(pageIdx+1);
    const viewport = page.getViewport({ scale: RENDER_SCALE });
    const canvas = document.createElement('canvas');
    canvas.width = viewport.width;
    canvas.height = viewport.height;
    const ctx = canvas.getContext('2d');
    await page.render({ canvasContext: ctx, viewport }).promise;
    pageCanvases.push(canvas);

    const textContent = await page.getTextContent();
    // pdf.js가 "18번"을 "18"+"번" 등 여러 조각(run)으로 쪼갤 수 있으므로,
    // 같은 줄의 조각을 전부 x좌표 순으로 이어붙인 뒤 그 줄 전체 문자열로 헤더를 판정한다.
    const byLine = {};
    for(const item of textContent.items){
      if(!item.str || !item.str.trim()) continue;
      const [vx, vy] = viewport.convertToViewportPoint(item.transform[4], item.transform[5]);
      const column = vx < viewport.width/2 ? 0 : 1;
      const rawWords=item.str.trim().split(/\s+/).filter(Boolean),totalChars=rawWords.reduce((n,w)=>n+w.length,0)||1,itemWidth=(item.width||0)*RENDER_SCALE,itemHeight=Math.max(8,(item.height||0)*RENDER_SCALE);
      let wordX=vx;
      rawWords.forEach(word=>{const width=Math.max(4,itemWidth*(word.length/totalChars));pageWordBoxes.push({pageIdx,column,x:wordX,y:vy-itemHeight,width,height:itemHeight,text:word});wordX+=width+(rawWords.length>1?itemWidth*.02:0);});
      const lineKey = column+':'+Math.round(vy/4)*4; // 2단 시험지의 같은 높이 좌우 문장을 섞지 않음
      if(!byLine[lineKey]) byLine[lineKey] = { vy, column, parts: [], maxHeight: 0 };
      byLine[lineKey].parts.push({ vx, str:item.str });
      byLine[lineKey].maxHeight = Math.max(byLine[lineKey].maxHeight, item.height || 0);
    }
    Object.values(byLine).forEach(({vy, column, parts, maxHeight})=>{
      parts.sort((a,b)=>a.vx-b.vx);
      const lineText = parts.map(p=>p.str).join(' ').replace(/\s+/g,' ').trim();
      const lineTopY=Math.max(0,vy-maxHeight*RENDER_SCALE);
      pageTextLines.push({pageIdx,column,y:vy,topY:lineTopY,text:lineText});
      const headerMatch = matchHeaderNum(lineText);
      const rangeMatch = matchQuestionRange(lineText);
      if(rangeMatch&&!groupRanges.some(group=>group.pageIdx===pageIdx&&group.column===column&&group.startNum===rangeMatch.startNum&&group.endNum===rangeMatch.endNum)){
        groupRanges.push({pageIdx,column,y:lineTopY,startNum:rangeMatch.startNum,endNum:rangeMatch.endNum});
      }
      if(headerMatch!=null){
        // vy는 텍스트 기준선(baseline) 좌표라 그대로 쓰면 번호줄 중간~아래에서 잘림.
        // 줄 높이만큼 위로 올려서 번호줄 "앞(위)"에서 잘리게 함.
        if(headerMatch.endNum!=null && headerMatch.endNum > headerMatch.num){
          // "41~42번"처럼 범위가 있는 줄은 여러 문항이 지문을 공유한다는 안내줄이지 그 자체가
          // 문항 시작은 아님 -- 각 문항의 진짜 시작줄("41." "42.")은 지문 뒤에 따로 나온다.
          if(!groupRanges.some(group=>group.pageIdx===pageIdx&&group.column===column&&group.startNum===headerMatch.num&&group.endNum===headerMatch.endNum))groupRanges.push({ pageIdx, column, y: lineTopY, startNum: headerMatch.num, endNum: headerMatch.endNum });
        }else{
          markers.push({ pageIdx, column, y: lineTopY, num: headerMatch.num });
        }
      }
      // 보기가 한 줄에 여러 개 배치되면 마지막 줄이 ④로 시작하고 중간에 ⑤가 있어
      // '^⑤' 검사로는 끝 경계를 놓친다. 줄 안의 ⑤도 보기 끝으로 수집한다.
      if(/⑤/.test(lineText)){
        optionFives.push({ pageIdx, column, y: vy + OPTION_END_PAD });
      }
    });
  }

  // 범위 안내의 숫자·물결표·괄호가 PDF 내부에서 서로 다른 텍스트 줄로
  // 분리되는 경우를 복구한다. 같은 단의 가까운 두 줄을 합쳐 다시 검사해
  // 41~42 연결지문이 41번에서 끊기는 현상을 방지한다.
  const nearbyLines=pageTextLines.slice().sort((a,b)=>a.pageIdx-b.pageIdx||(a.column||0)-(b.column||0)||a.y-b.y);
  for(let i=0;i<nearbyLines.length-1;i++){
    const first=nearbyLines[i],second=nearbyLines[i+1];
    if(first.pageIdx!==second.pageIdx||(first.column||0)!==(second.column||0)||Math.abs(second.y-first.y)>60)continue;
    const range=matchQuestionRange(first.text+' '+second.text);
    if(range&&!groupRanges.some(group=>group.pageIdx===first.pageIdx&&group.column===(first.column||0)&&group.startNum===range.startNum&&group.endNum===range.endNum)){
      groupRanges.push({pageIdx:first.pageIdx,column:first.column||0,y:Math.min(first.topY,second.topY),startNum:range.startNum,endNum:range.endNum,recoveredFromSplitLines:true});
    }
  }

  markers.sort((a,b)=> a.pageIdx-b.pageIdx || (a.column||0)-(b.column||0) || a.y-b.y);
  optionFives.sort((a,b)=> a.pageIdx-b.pageIdx || (a.column||0)-(b.column||0) || a.y-b.y);
  groupRanges.sort((a,b)=> a.pageIdx-b.pageIdx || (a.column||0)-(b.column||0) || a.y-b.y);
  // 2단 PDF의 내부 좌표 순서가 실제 문항 순서와 다르면 41번이 40번보다 먼저 들어올 수
  // 있다. 역행 번호를 버리지 말고 문항번호별 첫 위치를 보존한 뒤 번호순으로 정렬한다.
  const markerByNum = new Map();
  markers.forEach(m=>{if(!markerByNum.has(m.num))markerByNum.set(m.num,m)});
  // 1차 정규식이 놓친 문항번호를 줄 앞 24자 안에서만 복구한다. PDF 내부의 숨은
  // 기호·배점 조각이 번호 앞에 붙거나 "3 8 ."처럼 쪼개져도 38번으로 인식한다.
  pageTextLines.forEach(line=>{
    const head=String(line.text||'').slice(0,24).replace(/([1-4])\s+([0-9])(?=\s*[\.．])/g,'$1$2');
    const found=head.match(/(?:^|[^0-9])([1-4][0-9])\s*[\.．](?!\d)/);
    if(!found)return;
    const num=Number(found[1]);
    if(num<18||num>45||markerByNum.has(num))return;
    markerByNum.set(num,{pageIdx:line.pageIdx,column:line.column||0,y:Number.isFinite(line.topY)?line.topY:Math.max(0,line.y-30),num});
  });
  // 일부 시험지는 문항번호와 마침표를 별도 도형으로 저장해 텍스트에는 숫자만 남는다.
  // 줄 전체가 두 자리 문항번호인 경우만 제한적으로 복구해 본문의 수치를 번호로 오인하지 않는다.
  pageTextLines.forEach(line=>{
    const found=String(line.text||'').trim().replace(/([1-4])\s+([0-9])/g,'$1$2').match(/^([1-4][0-9])$/);
    if(!found)return;
    const num=Number(found[1]);
    if(num>=18&&num<=45&&!markerByNum.has(num))markerByNum.set(num,{pageIdx:line.pageIdx,column:line.column||0,y:Number.isFinite(line.topY)?line.topY:Math.max(0,line.y-30),num,recoveredFromStandaloneNumber:true});
  });
  // 화면에는 38.이 보여도 PDF 내부에서 숫자가 도형으로 저장돼 텍스트 추출이 전혀
  // 안 되는 시험지가 있다. [38~39] 같은 공통 지문 범위가 검출되면 시작 번호는
  // 구조적으로 반드시 존재하므로, 누락된 시작 문항 마커를 범위 안내 위치에 복구한다.
  groupRanges.forEach(group=>{
    const startNum=Number(group.startNum),endNum=Number(group.endNum);
    // [41~42]처럼 범위 표시는 인식됐지만 뒤 문항 번호가 PDF 텍스트에서 빠진 경우에도
    // 범위 안의 모든 문항을 생성한다. 같은 연결 지문 이미지를 공유하므로 복구 마커의
    // 실제 좌표는 그룹 시작점에 두고 번호만 각각 유지한다.
    for(let num=startNum;num<=endNum;num++){
      if(num>=18&&num<=45&&!markerByNum.has(num)){
        markerByNum.set(num,{pageIdx:group.pageIdx,column:group.column||0,y:group.y+1+(num-startNum),num,recoveredFromGroup:true});
      }
    }
  });
  const filtered = Array.from(markerByNum.values()).sort((a,b)=>a.num-b.num);
  return { pageCanvases, markers: filtered, optionFives, groupRanges, pageTextLines, pageWordBoxes };
}

// start(현재 문항 시작)와 nextMarker(다음 문항 시작, 없으면 null) 사이에 있는 "⑤" 줄 중
// 가장 먼저 만나는 것을 찾는다 -- 현재 문항의 ⑤가 확인되는 즉시 끊어 다음 문항이 같은
// 이미지에 붙는 것을 막는다. 없으면(서술형/듣기 등) null을 반환해
// 기존처럼 다음 문항 시작 지점(또는 페이지 끝)까지 쓰게 한다.
function findOptionFiveEnd(start, nextMarker, optionFives){
  let found = null;
  const readingCompare=(a,b)=>{const aSlot=a.pageIdx*2+(a.column||0),bSlot=b.pageIdx*2+(b.column||0);return aSlot-bSlot||a.y-b.y};
  for(const m of optionFives){
    if((m.column||0)!==(start.column||0)) continue;
    const afterStart = readingCompare(m,start)>0;
    if(!afterStart) continue;
    if(nextMarker&&readingCompare(m,nextMarker)>=0)continue;
    if(!found||readingCompare(m,found)<0){
      found = m;
    }
  }
  return found;
}

// 밑줄·문장 삽입 유형은 지문 안에도 ①~⑤가 있으므로 첫 ⑤가 아니라 다음 문항 전
// 마지막 ⑤를 실제 선택지 끝으로 사용한다. 시험 연도와 무관하게 같은 유형 번호에 적용한다.
function findLastOptionFiveEnd(start,nextMarker,optionFives){
  let found=null;
  const readingCompare=(a,b)=>{const aSlot=a.pageIdx*2+(a.column||0),bSlot=b.pageIdx*2+(b.column||0);return aSlot-bSlot||a.y-b.y};
  for(const marker of optionFives||[]){
    if((marker.column||0)!==(start.column||0)||readingCompare(marker,start)<=0)continue;
    if(nextMarker&&readingCompare(marker,nextMarker)>=0)continue;
    if(!found||readingCompare(marker,found)>0)found=marker;
  }
  return found;
}

// 연결문제의 하위 문항번호가 PDF 텍스트에서 누락돼도 범위에 적힌 문항 수만큼
// 선택지 ⑤를 센다. 예: [41~42]는 첫 ⑤(41번)가 아니라 두 번째 ⑤(42번)를 끝으로 사용한다.
function findConnectedGroupOptionEnd(group,nextBoundary,optionFives){
  const readingCompare=(a,b)=>{const aSlot=a.pageIdx*2+(a.column||0),bSlot=b.pageIdx*2+(b.column||0);return aSlot-bSlot||a.y-b.y};
  const start={pageIdx:group.pageIdx,column:group.column||0,y:group.y},needed=Math.max(1,Number(group.endNum)-Number(group.startNum)+1);
  const candidates=(optionFives||[]).filter(marker=>readingCompare(marker,start)>0&&(!nextBoundary||readingCompare(marker,nextBoundary)<0)).sort(readingCompare);
  return candidates.length>=needed?candidates[needed-1]:null;
}

// ⑤가 있는 첫 줄 바로 아래에서 자르면 여러 줄 선택지가 끊긴다. 같은 단 안에서
// 최대 몇 줄의 안전 여유를 더 주되 다음 문항/공통지문 경계를 넘지는 않는다.
function paddedOptionFiveEnd(fiveEnd,nextBoundary,pageCanvases){
  if(!fiveEnd)return null;
  const canvas=pageCanvases[fiveEnd.pageIdx],pad=canvas?Math.max(100,Math.min(180,Math.round(canvas.height*.04))):140;
  let y=fiveEnd.y+pad;
  if(canvas)y=Math.min(y,canvas.height);
  if(nextBoundary&&nextBoundary.pageIdx===fiveEnd.pageIdx&&(nextBoundary.column||0)===(fiveEnd.column||0))y=Math.min(y,nextBoundary.y);
  return {pageIdx:fiveEnd.pageIdx,column:fiveEnd.column||0,y};
}

// 세로로 이미지 조각을 이어붙여 하나의 캔버스로 합침 (문항이 페이지 경계를 넘는 경우)
function stitchVertical(pieces){ // pieces: [{canvas, sy, sh}]  sy=자를 시작y, sh=자를 높이
  const validPieces=(pieces||[]).filter(p=>p&&p.canvas&&p.canvas.width>0&&p.canvas.height>0&&Number.isFinite(p.sy)&&Number.isFinite(p.sh)&&p.sh>0&&Number.isFinite(p.sw||p.canvas.width)&&(p.sw||p.canvas.width)>0);
  if(!validPieces.length)return null;
  const width = Math.max(...validPieces.map(p=>p.sw||p.canvas.width));
  const totalHeight = validPieces.reduce((sum,p)=>sum+p.sh, 0);
  const out = document.createElement('canvas');
  out.width = width;
  out.height = Math.max(1, totalHeight);
  const ctx = out.getContext('2d');
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0,0,width,out.height);
  let y = 0;
  for(const p of validPieces){
    const sx=p.sx||0, sw=p.sw||p.canvas.width;
    ctx.drawImage(p.canvas, sx, p.sy, sw, p.sh, 0, y, sw, p.sh);
    y += p.sh;
  }
  return out;
}

// 특정 문항 끝에 크게 남는 흰 영역만 제거한다. 마지막 글자 아래에는 여유를 남겨
// 영문 디센더나 밑줄이 잘리지 않게 한다.
function trimBottomWhitespace(canvas,padding,preserveFinalContentRun){
  if(!canvas||canvas.width<=0||canvas.height<=0)return canvas;
  const ctx=canvas.getContext('2d');
  let data;
  try{data=ctx.getImageData(0,0,canvas.width,canvas.height).data}catch(error){console.warn('빈 PDF 문항의 하단 여백 정리를 건너뜁니다.',error);return canvas}
  const meaningfulDark=Math.max(14,Math.round(canvas.width*.014));
  let last=-1,firstX=canvas.width;
  const rowDark=[],activeRows=[],colDark=new Uint32Array(Math.ceil(canvas.width/2));
  for(let y=0;y<canvas.height;y++){
    let dark=0;
    for(let x=0;x<canvas.width;x+=2){const i=(y*canvas.width+x)*4;if(data[i]<242||data[i+1]<242||data[i+2]<242){dark++;colDark[x>>1]++}}
    rowDark[y]=dark;
    if(dark>=meaningfulDark)activeRows.push(y);
  }
  if(activeRows.length){
    // 본문과 큰 공백으로 떨어진 페이지 번호·저작권 표기 같은 짧은 하단 꼬리표는
    // 문항 내용으로 보지 않는다. 특정 시험/문항번호가 아닌 모든 PDF에 같은 규칙을 쓴다.
    const runs=[];let run={start:activeRows[0],end:activeRows[0],ink:rowDark[activeRows[0]]};
    for(let i=1;i<activeRows.length;i++){
      const y=activeRows[i];
      if(y-run.end<=36){run.end=y;run.ink+=rowDark[y]}
      else{runs.push(run);run={start:y,end:y,ink:rowDark[y]}}
    }
    runs.push(run);
    let keep=runs.length-1;
    // 큰 공백만으로 자르면 다음 단/페이지로 이어지는 실제 지문(예: 29번)을 잃을 수 있다.
    // 공백 아래 내용 전체가 페이지 맨 아래의 짧은 푸터 영역에 모인 경우에만 제거한다.
    if(!preserveFinalContentRun){
      const largeGap=Math.max(80,Math.round(canvas.height*.045));
      for(let i=0;i<runs.length-1;i++){
        const body=runs[i],tail=runs[i+1],accumulatedBodyHeight=body.end-runs[0].start,tailSpan=runs[runs.length-1].end-tail.start;
        if(accumulatedBodyHeight>=100&&tail.start-body.end>=largeGap&&tail.start>canvas.height*.72&&tailSpan<canvas.height*.18){keep=i;break}
      }
      while(keep>0){
        const tail=runs[keep],previous=runs[keep-1],gap=tail.start-previous.end;
        const shortTail=tail.end-tail.start<72;
        const nearBottom=tail.start>canvas.height*.72;
        if(gap>=90&&shortTail&&nearBottom){keep--;continue}
        break;
      }
    }
    last=runs[keep].end;
  }
  const maxTextDark=Math.round(canvas.width*.18);
  const edgeGuard=Math.max(12,Math.round(canvas.width*.008));
  const verticalRuleDensity=canvas.height*.28;
  for(let y=0;y<=Math.max(0,last);y+=2){
    let dark=0,rowFirst=canvas.width;
    for(let x=edgeGuard;x<canvas.width;x+=2){const i=(y*canvas.width+x)*4;if(data[i]<242||data[i+1]<242||data[i+2]<242){if(colDark[x>>1]>=verticalRuleDensity)continue;dark++;if(rowFirst===canvas.width)rowFirst=x}}
    if(dark>=meaningfulDark&&dark<=maxTextDark)firstX=Math.min(firstX,rowFirst);
  }
  if(firstX===canvas.width)firstX=0;
  const height=Math.min(canvas.height,Math.max(1,last+(padding||36)));
  const cropLeft=firstX>0?Math.max(0,firstX-28):0,newWidth=Math.max(1,canvas.width-cropLeft);
  if(height>=canvas.height-8&&cropLeft<8)return canvas;
  const out=document.createElement('canvas');out.width=newWidth;out.height=height;out._cropLeft=cropLeft;
  const outCtx=out.getContext('2d');outCtx.fillStyle='#fff';outCtx.fillRect(0,0,out.width,out.height);outCtx.drawImage(canvas,cropLeft,0,newWidth,height,0,0,newWidth,height);
  return out;
}

// [from, to) 구간을 캔버스 조각들로 잘라 pieces 배열로 반환 (페이지 경계를 넘는 경우도 처리)
// from/to는 {pageIdx, y} 형태. to가 없으면 from이 속한 페이지의 끝까지.
function sliceRegion(pageCanvases, from, to){
  const pieces = [];
  const column=from.column||0;
  const columnPiece=(pageIdx,canvas,sy,sh)=>({pageIdx,canvas,sy,sh,sx:column?Math.floor(canvas.width/2):0,sw:Math.ceil(canvas.width/2)});
  if(!to || to.pageIdx===from.pageIdx){
    const endY = to ? to.y : pageCanvases[from.pageIdx].height;
    pieces.push(columnPiece(from.pageIdx,pageCanvases[from.pageIdx],from.y,Math.max(0,endY-from.y)));
  }else{
    // 시작 페이지: from.y ~ 페이지 끝
    pieces.push(columnPiece(from.pageIdx,pageCanvases[from.pageIdx],from.y,pageCanvases[from.pageIdx].height-from.y));
    // 중간 페이지 전체
    for(let p=from.pageIdx+1; p<to.pageIdx; p++){
      pieces.push(columnPiece(p,pageCanvases[p],0,pageCanvases[p].height));
    }
    // 마지막 페이지: 0 ~ to.y
    pieces.push(columnPiece(to.pageIdx,pageCanvases[to.pageIdx],0,to.y));
  }
  return pieces;
}

// 연결지문은 한 페이지의 오른쪽 단에서 시작해 다음 페이지 왼쪽 단으로 이어질 수 있다.
// 페이지 번호뿐 아니라 좌→우 단 순서까지 포함해 실제 읽기 순서대로 조각을 만든다.
function sliceReadingRegion(pageCanvases, from, to){
  if(!to)return sliceRegion(pageCanvases,from,to);
  const fromSlot=from.pageIdx*2+(from.column||0),toSlot=to.pageIdx*2+(to.column||0);
  // 뒤 페이지의 잘못 검출된 문항과 앞 페이지의 다음 문항을 이어 붙이면
  // 4쪽 다음에 2쪽이 붙는 역순 이미지가 생긴다. 역방향 경계는 절대 사용하지 않는다.
  if(toSlot<fromSlot||(toSlot===fromSlot&&to.y<=from.y))return sliceRegion(pageCanvases,from,null);
  const pieces=[];
  for(let slot=fromSlot;slot<=toSlot;slot++){
    const pageIdx=Math.floor(slot/2),column=slot%2,canvas=pageCanvases[pageIdx];
    if(!canvas)continue;
    const sy=slot===fromSlot?from.y:0,endY=slot===toSlot?to.y:canvas.height;
    if(endY<=sy)continue;
    pieces.push({pageIdx,canvas,sy,sh:endY-sy,sx:column?Math.floor(canvas.width/2):0,sw:Math.ceil(canvas.width/2)});
  }
  return pieces;
}

// num이 속하는 공유 지문 그룹(예: 41~42번)을 찾는다. 없으면 null.
function findGroupFor(num, groupRanges){
  if(!groupRanges) return null;
  let best = null;
  for(const g of groupRanges){
    if(num>=g.startNum && num<=g.endNum){
      if(!best || g.pageIdx>best.pageIdx || (g.pageIdx===best.pageIdx && g.y>best.y)) best = g;
    }
  }
  return best;
}

// markers 기준으로 문항별 이미지(dataURL)를 만든다
// optionFives가 있으면 각 문항의 "⑤" 보기 줄 바로 뒤에서 끊고, 없는 문항(서술형/듣기 등)은
// 기존처럼 다음 문항 시작 지점(또는 페이지 끝)까지 자른다.
// groupRanges가 있으면 41~42, 43~45처럼 지문을 공유하는 문항들은 전부 그 지문을 같이
// 보여준다(그룹의 첫 문항이 아니면, 지문 부분 + 자기 자신의 문항/보기를 이어붙임 -- 그
// 사이에 낀 앞 문항들의 문항/보기는 건너뜀).
function buildQuestionImages(pageCanvases, markers, optionFives, groupRanges, pageWordBoxes, mergeGroups){
  const questions = [];
  for(let i=0;i<markers.length;i++){
    const start = markers[i];
    const group = findGroupFor(start.num, groupRanges);
    // 31~34번처럼 '지시문만 공통'인 범위는 문항을 합치지 않는다. 공통 지시문을
    // 각 문항 이미지 상단에 붙인 채 31·32·33·34번을 각각 독립 문항으로 만든다.
    // 실제로 하나의 지문을 공유하는 연결문제(41번 이후)만 한 묶음으로 표시한다.
    const shouldMergeGroup = !!(mergeGroups && group && group.startNum >= 41);
    if(shouldMergeGroup&&start.num!==group.startNum)continue;
    let endNum=null,nextMarker,fiveEnd,end,pieces,preserveFinalContentRun=false;
    if(shouldMergeGroup){
      const groupMarkers=markers.filter(m=>m.num>=group.startNum&&m.num<=group.endNum),last=groupMarkers[groupMarkers.length-1]||start;
      nextMarker=markers.find(m=>m.pageIdx===last.pageIdx&&(m.column||0)===(last.column||0)&&m.y>last.y)||null;
      // 41~42 뒤의 "43~45번" 공통 지시문은 marker가 아니라 groupRange라서 기존
      // nextMarker 검색만으로는 경계를 놓칠 수 있다. 다음 그룹 안내줄에서 먼저 잘라
      // 43~45번 앞부분이 41~42 이미지에 붙지 않게 한다.
      const groupReadingCompare=(a,b)=>{const aSlot=a.pageIdx*2+(a.column||0),bSlot=b.pageIdx*2+(b.column||0);return aSlot-bSlot||a.y-b.y};
      const nextGroup=(groupRanges||[]).filter(g=>g.startNum>group.endNum&&groupReadingCompare(g,group)>0).sort(groupReadingCompare)[0]||null;
      const markerAfterGroup=markers.filter(m=>m.num>group.endNum&&groupReadingCompare(m,group)>0).sort(groupReadingCompare)[0]||null;
      const structuralBoundary=nextGroup||markerAfterGroup||nextMarker||null;
      fiveEnd=findConnectedGroupOptionEnd(group,structuralBoundary,optionFives);
      const safeGroupOptionEnd=paddedOptionFiveEnd(fiveEnd,structuralBoundary,pageCanvases);
      // 42번 마커가 없을 때 첫 번째 ⑤에서 자르지 않는다. 다음 그룹 경계가 있으면 그곳을,
      // 없으면 범위 문항 수만큼 센 마지막 ⑤를, 그것도 없으면 문서 끝을 사용한다.
      const lastPageIdx=Math.max(0,pageCanvases.length-1),documentEnd={pageIdx:lastPageIdx,column:1,y:pageCanvases[lastPageIdx].height};
      end=structuralBoundary||safeGroupOptionEnd||documentEnd;
      // 연결문제 사이의 비교적 큰 간격을 페이지 하단 여백으로 오인하면 42번이 사라진다.
      // 명시적인 다음 그룹 경계가 있어도 41~42 범위 안의 마지막 내용 덩어리는 보존한다.
      preserveFinalContentRun=true;
      endNum=group.endNum;
      // 연결문제를 여러 조각으로 나누면 PDF별 좌표 차이로 41번 뒤에서 끊길 수 있다.
      // [41~42] 시작부터 다음 연결그룹 시작까지 하나의 읽기 범위로 그대로 자른다.
      const groupStart={pageIdx:group.pageIdx,column:group.column||0,y:group.y};
      pieces=sliceReadingRegion(pageCanvases,groupStart,end);
    }else{
      // 다음 문항이 다음 단이나 다음 페이지에 있어도 문항번호 순서상 바로 다음 경계에서
      // 자른다. 같은 단에서만 찾으면 38번 뒤의 39·40번을 놓쳐 41~42번까지 붙을 수 있다.
      const followingMarker=markers[i+1]||null;
      const readingCompare=(a,b)=>{const aSlot=a.pageIdx*2+(a.column||0),bSlot=b.pageIdx*2+(b.column||0);return aSlot-bSlot||a.y-b.y};
      // 40번 다음의 [41~42]처럼 개별 번호보다 공통지문 안내가 먼저 시작되면 그 안내가
      // 실제 문항 경계다. 물리적으로 가장 먼저 나오는 번호/그룹 경계를 사용한다.
      const followingGroup=(groupRanges||[]).filter(g=>g.startNum>start.num&&readingCompare(g,start)>0).sort(readingCompare)[0]||null;
      nextMarker=followingMarker&&followingGroup?(readingCompare(followingMarker,followingGroup)<=0?followingMarker:followingGroup):(followingMarker||followingGroup);
      // 29·30번의 밑줄 위치와 38·39번의 문장 삽입 위치는 지문 안에 ①~⑤가 들어간다.
      // 이때 지문 속 ⑤를 보기의 끝으로 오인하면 38번 본문이 거의 전부 잘려 나간다.
      // 35번(글의 흐름과 관계없는 문장)도 ①~⑤가 선택지 목록이 아니라 지문 문장 사이에
      // 들어간다. 지문 속 ⑤를 문항 끝으로 오인하면 마지막 문장이 중간에서 잘리므로
      // 연도·시험지와 무관하게 같은 유형 번호 전체에 다음 문항 경계를 사용한다.
      const optionNumbersInsidePassage = [29,30,35,38,39].includes(start.num);
      // 이 유형의 ⑤는 선택지 끝이 아니라 지문 안 밑줄/삽입 위치다. ⑤ 뒤에도 실제
      // 문장이 이어질 수 있으므로 절대 여기서 자르지 않고 다음 문항 경계를 사용한다.
      fiveEnd = optionFives && !optionNumbersInsidePassage ? findOptionFiveEnd(start,nextMarker,optionFives) : null;
      // ⑤는 선택지의 시작 줄일 수 있으므로 몇 줄의 안전 여유를 포함하되, 다음 문항이나
      // 공통지문 경계를 넘지 않는다. 이후 공백 정리에서 남은 여백을 제거한다.
      const safeFiveEnd=paddedOptionFiveEnd(fiveEnd,nextMarker,pageCanvases);
      // 문장형 선택지가 여러 줄인 시험에서 ⑤ 감지 직후 자르면 마지막 문장이 잘릴 수 있다.
      // 다음 문항 마커가 있으면 그것을 최우선 경계로 사용하고, ⑤ 기반 경계는 마지막 문항의
      // 보조 수단으로만 쓴다. 이후 공백 정리가 불필요한 영역을 제거한다.
      end = nextMarker || safeFiveEnd;
      preserveFinalContentRun=false;
    }

    if(!pieces&&group&&group.startNum>=41){
      // 개별문제에서도 연결문제는 41·42(또는 43~45) 전체를 함께 보여준다. 문항 데이터는
      // 번호별로 유지하므로 OMR 정답은 각각 저장하되, 이미지만 같은 연결 범위를 공유한다.
      const groupStartPt={pageIdx:group.pageIdx,column:group.column||0,y:group.y};
      const connectedCompare=(a,b)=>{const aSlot=a.pageIdx*2+(a.column||0),bSlot=b.pageIdx*2+(b.column||0);return aSlot-bSlot||a.y-b.y};
      const nextConnectedGroup=(groupRanges||[]).filter(g=>g.startNum>group.endNum&&connectedCompare(g,group)>0).sort(connectedCompare)[0]||null;
      const markerAfterGroup=markers.filter(m=>m.num>group.endNum&&connectedCompare(m,group)>0).sort(connectedCompare)[0]||null;
      const structuralBoundary=nextConnectedGroup||markerAfterGroup||null;
      const groupOptionEnd=findConnectedGroupOptionEnd(group,structuralBoundary,optionFives);
      const safeGroupOptionEnd=paddedOptionFiveEnd(groupOptionEnd,structuralBoundary,pageCanvases);
      const lastPageIdx=Math.max(0,pageCanvases.length-1);
      const documentEnd={pageIdx:lastPageIdx,column:1,y:pageCanvases[lastPageIdx].height};
      pieces=sliceReadingRegion(pageCanvases,groupStartPt,structuralBoundary||safeGroupOptionEnd||documentEnd);
      endNum=group.endNum;
      preserveFinalContentRun=true;
    }else if(!pieces&&group){
      const groupStartPt = { pageIdx: group.pageIdx, column:group.column||0, y: group.y };
      if(start.num === group.startNum){
        // 그룹의 첫 문항: 지문 안내줄부터 자기 끝까지 통째로
        // 같은 PDF 페이지라도 왼쪽 단에서 시작해 오른쪽 단에서 끝날 수 있으므로
        // 단 읽기 순서를 반영하지 않는 sliceRegion을 사용하면 높이가 0이 되어 문항이 사라진다.
        pieces = sliceReadingRegion(pageCanvases, groupStartPt, end);
      }else{
        // 그룹의 이후 문항: 지문(그룹 시작~첫 문항 시작) + 자기 자신(자기 시작~자기 끝)을 이어붙임
        const firstSubMarker = markers.find(m=>m.num===group.startNum) || groupStartPt;
        pieces = [
          ...sliceReadingRegion(pageCanvases, groupStartPt, firstSubMarker),
          ...sliceReadingRegion(pageCanvases, start, end),
        ];
      }
    }else if(!pieces){
      pieces = sliceReadingRegion(pageCanvases, start, end);
    }

    pieces=(pieces||[]).filter(piece=>piece&&piece.canvas&&piece.canvas.width>0&&piece.canvas.height>0&&Number.isFinite(piece.sy)&&Number.isFinite(piece.sh)&&piece.sh>0&&Number.isFinite(piece.sw||piece.canvas.width)&&(piece.sw||piece.canvas.width)>0);
    if(!pieces.length)continue;
    let stitched = stitchVertical(pieces);
    if(!stitched||stitched.width<=0||stitched.height<=0)continue;
    // 특정 연도·특정 번호에만 예외를 두지 않고 모든 PDF 문항의 실제 마지막 내용 아래를
    // 자동 정리한다. 시험지가 바뀌어도 불필요한 하단 여백이 반복되지 않는다.
    // 구조적 다음 문항 경계가 있으면 페이지 꼬리표는 제거한다. 마지막 문항처럼 ⑤가
    // 유일한 끝 경계일 때만 마지막 보기 묶음을 보호한다.
    stitched=trimBottomWhitespace(stitched,42,preserveFinalContentRun);
    let offsetY=0,overlayWords=[];
    pieces.forEach(piece=>{
      (pageWordBoxes||[]).filter(w=>w.pageIdx===piece.pageIdx&&w.x+Math.max(1,w.width)>piece.sx&&w.x<piece.sx+piece.sw&&w.y+Math.max(1,w.height)>piece.sy&&w.y<piece.sy+piece.sh).forEach(w=>{
        overlayWords.push({text:w.text,x:(w.x-piece.sx-(stitched._cropLeft||0))/stitched.width,y:(offsetY+w.y-piece.sy)/stitched.height,width:w.width/stitched.width,height:w.height/stitched.height});
      });
      offsetY+=piece.sh;
    });
    overlayWords.sort((a,b)=>Math.round(a.y*500)-Math.round(b.y*500)||a.x-b.x);
    // IndexedDB에 저장하므로 과도한 축소 대신 읽을 수 있는 해상도를 유지한다.
    const targetW = 1800;
    let finalCanvas = stitched;
    if(stitched.width > targetW){
      const scale = targetW/stitched.width;
      const small = document.createElement('canvas');
      small.width = targetW;
      small.height = Math.round(stitched.height*scale);
      small.getContext('2d').drawImage(stitched, 0,0,small.width,small.height);
      finalCanvas = small;
    }
    questions.push({
      question_id: newQuestionId(),
      num: start.num,
      endNum,
      dataUrl: finalCanvas.toDataURL('image/webp', 0.94),
      overlayWords,
      answer: null
    });
  }
  return questions;
}

// 문장구조 연습용: 문항 시작과 다음 문항 사이의 영어 텍스트를 같은 2단 영역에서 모은다.
// 한글 지시문·배점·보기는 제외하고, 학생이 실제로 표시할 영어 문장만 남긴다.
function buildQuestionTexts(markers, pageTextLines){
  return markers.map((start,i)=>{
    const next=markers.slice(i+1).find(m=>m.pageIdx===start.pageIdx&&(m.column||0)===(start.column||0));
    const lines=pageTextLines.filter(line=>line.pageIdx===start.pageIdx&&(line.column||0)===(start.column||0)&&line.y>=start.y&&(!next||line.y<next.y));
    const text=lines.map(x=>x.text)
      .filter(x=>!/^\d{1,2}(?:[~\-]\d{1,2})?\s*(?:번|\.)/.test(x))
      .filter(x=>!/^⑤/.test(x)&&!/^[①②③④⑤]/.test(x)&&!/^\[\d+점\]$/.test(x))
      .filter(x=>/[A-Za-z]/.test(x))
      .join(' ').replace(/\s+/g,' ').trim();
    return {question_id:newQuestionId(),id:uid(10),num:start.num,text,source_question_no:start.num,category_keys:['SENTENCE_STRUCTURE_SV']};
  }).filter(x=>x.text);
}
