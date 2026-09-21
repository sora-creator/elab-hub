(function(root,factory){
  const api=factory();
  if(typeof module==='object'&&module.exports)module.exports=api;
  else root.PdfSourceMapping=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const MANUAL_KEY='elab.sentence-review.pdf-source-overrides.v1';
  function basename(value){return String(value||'').replace(/\\/g,'/').split('/').pop();}
  function normalizedBasename(value){
    const name=basename(value).normalize('NFC').trim(),dot=name.lastIndexOf('.');
    const stem=dot<0?name:name.slice(0,dot),ext=dot<0?'':name.slice(dot).toLowerCase();
    return stem.replace(/[\s_]+/g,' ').trim()+ext;
  }
  function pathToLocalhost(absolutePath,programRoot,origin){
    const path=String(absolutePath||'').replace(/\\/g,'/'),base=String(programRoot||'').replace(/\\/g,'/').replace(/\/$/,'');
    if(!path.toLowerCase().startsWith((base+'/').toLowerCase()))return {url:null,error:`PDF 경로가 localhost 서버 루트(${programRoot}) 아래에 있지 않습니다.`};
    const relative=path.slice(base.length+1),parts=relative.split('/');
    if(!relative||parts.some(x=>!x||x==='.'||x==='..'))return {url:null,error:'PDF 상대경로를 안전하게 변환할 수 없습니다.'};
    return {url:String(origin||'http://localhost:8010').replace(/\/$/,'')+'/'+parts.map(encodeURIComponent).join('/'),error:null};
  }
  function loadManual(storage){
    try{return JSON.parse(storage?.getItem(MANUAL_KEY)||'{}')||{};}catch{return {};}
  }
  function saveManual(storage,sourceFile,entry){const all=loadManual(storage);all[sourceFile]=entry;storage.setItem(MANUAL_KEY,JSON.stringify(all));return all;}
  function teacherReference(row){
    const p=row?.teacher?.teacher_source_pdf;
    if(!p)return null;
    const path=p.pdf_path||(/^([A-Za-z]:[\\/])/.test(p.pdf_reference||'')?p.pdf_reference:null);
    return path?{absolute_path:path,page:p.page??null,origin:'TEACHER_SOURCE_OVERRIDE'}:null;
  }
  function autoReference(row){
    const e=(row?.auto?.source_evidence||row?.auto?.source?.source_evidence||[]).find(x=>x.pdf_path);
    return e?{absolute_path:e.pdf_path,page:Number.isInteger(e.page)&&e.page>0?e.page:null,origin:'VERIFIED_AUTO_SOURCE_PATH'}:null;
  }
  function manifestReference(row,manifest,manual){
    const source=row?.auto?.source?.source_file||row?.source?.source_file,entry=manifest?.sources?.[source];
    if(entry?.status==='MATCHED'&&entry.absolute_path)return {absolute_path:entry.absolute_path,page:entry.sentences?.[row.sentence_id]?.page??entry.questions?.[row?.auto?.source?.question_no||row?.source?.question_no]?.page??null,origin:'GENERATED_MANIFEST',manifest_entry:entry};
    const chosen=manual?.[source];
    if(chosen?.absolute_path)return {...chosen,origin:'TEACHER_SOURCE_FILE_OVERRIDE'};
    return null;
  }
  function resolve(row,{manifest,manualMappings={},programRoot,origin}={}){
    const teacher=teacherReference(row),auto=autoReference(row),generated=manifestReference(row,manifest,manualMappings),ref=teacher||(generated?.manifest_entry?.source_format==='ORIGINAL_EXAM'&&generated.page?generated:auto||generated);
    const source=row?.auto?.source?.source_file||row?.source?.source_file,entry=manifest?.sources?.[source]||null;
    if(!ref)return {reference:null,url:null,page:null,status:entry?.status||'NOT_FOUND',candidates:entry?.candidates||[],mapping_error:entry?.status==='REVIEW_REQUIRED'?'후보 PDF는 있지만 교사 선택이 필요합니다.':'로컬 PDF를 자동으로 찾지 못했습니다.'};
    const mapped=pathToLocalhost(ref.absolute_path,programRoot||manifest?.http_server_root||manifest?.program_root,origin);
    return {reference:ref.absolute_path,url:mapped.url,page:ref.page??null,status:'MATCHED',origin:ref.origin,source_format:ref.manifest_entry?.source_format||entry?.source_format||'UNKNOWN',mapping_error:mapped.error,candidates:entry?.candidates||[]};
  }
  function fileStore(){return new Promise((resolve,reject)=>{const request=indexedDB.open('elab.pdf-source-files.v1',1);request.onupgradeneeded=()=>request.result.createObjectStore('files',{keyPath:'source_file'});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
  async function saveManualFile(sourceFile,file){const db=await fileStore();await new Promise((resolve,reject)=>{const tx=db.transaction('files','readwrite');tx.objectStore('files').put({source_file:sourceFile,file,name:file.name,size:file.size,last_modified:file.lastModified});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();}
  async function loadManualFiles(){const db=await fileStore(),rows=await new Promise((resolve,reject)=>{const request=db.transaction('files','readonly').objectStore('files').getAll();request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});db.close();return rows;}
  return {MANUAL_KEY,basename,normalizedBasename,pathToLocalhost,loadManual,saveManual,saveManualFile,loadManualFiles,resolve};
});
