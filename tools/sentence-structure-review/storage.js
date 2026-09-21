(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.ReviewStorage=factory();})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const DB_PREFIX='elab.teacher-review.indexeddb.v1.';
  const DB_VERSION=1;
  const RECORDS='sentence_reviews';
  const META='meta';
  const MANIFEST_KEY='current_review_set';
  const request=req=>new Promise((resolve,reject)=>{req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error||Error('IndexedDB 요청에 실패했습니다.'));});
  const transactionDone=tx=>new Promise((resolve,reject)=>{tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error||Error('IndexedDB transaction이 중단되었습니다.'));tx.onerror=()=>reject(tx.error||Error('IndexedDB transaction에 실패했습니다.'));});
  const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.keys(value).sort().reduce((out,key)=>(out[key]=stable(value[key]),out),{}):value;
  const equal=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
  function create(datasetIdOrFingerprint,maybeFingerprint){
    const datasetId=maybeFingerprint?datasetIdOrFingerprint:'pilot50',fingerprint=maybeFingerprint||datasetIdOrFingerprint;
    const normalizedDatasetId=String(datasetId).trim();
    if(!fingerprint)throw Error('IndexedDB 원본 fingerprint가 없습니다.');
    if(!/^[a-z0-9-]+$/i.test(normalizedDatasetId))throw Error('IndexedDB dataset_id가 잘못되었습니다.');
    const dbName=DB_PREFIX+(normalizedDatasetId==='pilot50'?'':normalizedDatasetId+'.')+fingerprint;
    let connection=null,completeSet=false;
    async function open(){
      if(connection)return connection;
      if(!globalThis.indexedDB)throw Error('이 브라우저는 IndexedDB를 지원하지 않습니다.');
      const req=indexedDB.open(dbName,DB_VERSION);
      req.onupgradeneeded=()=>{const db=req.result;if(!db.objectStoreNames.contains(RECORDS))db.createObjectStore(RECORDS,{keyPath:'sentence_id'});if(!db.objectStoreNames.contains(META))db.createObjectStore(META,{keyPath:'key'});};
      connection=await request(req);
      connection.onversionchange=()=>{connection.close();connection=null;};
      return connection;
    }
    async function loadSnapshot(){
      const db=await open(),tx=db.transaction([RECORDS,META],'readonly'),recordsStore=tx.objectStore(RECORDS),metaStore=tx.objectStore(META);
      const manifest=await request(metaStore.get(MANIFEST_KEY));
      if(!manifest){await transactionDone(tx);completeSet=false;return null;}
      const legacyPilot=!manifest.dataset_id&&normalizedDatasetId==='pilot50';
      if((!legacyPilot&&manifest.dataset_id!==normalizedDatasetId)||manifest.input_fingerprint!==fingerprint||!Array.isArray(manifest.sentence_ids))throw Error('IndexedDB manifest의 dataset 또는 원본 fingerprint가 맞지 않습니다.');
      const rows=await Promise.all(manifest.sentence_ids.map(id=>request(recordsStore.get(id))));
      await transactionDone(tx);
      if(rows.some((row,i)=>!row||row.sentence_id!==manifest.sentence_ids[i]||row.input_fingerprint!==fingerprint||row.dataset_id&&row.dataset_id!==normalizedDatasetId))throw Error('IndexedDB 교사 검수 레코드가 누락되거나 dataset 원본과 맞지 않습니다.');
      completeSet=true;return {format:manifest.format,review_version:manifest.review_version,dataset_id:manifest.dataset_id||'pilot50',dataset_version:manifest.dataset_version||'1',dataset_fingerprint:manifest.dataset_fingerprint||fingerprint,expected_record_count:manifest.expected_record_count||rows.length,input_fingerprint:fingerprint,saved_at:manifest.saved_at,records:rows.map(({sentence_id,teacher,history})=>({sentence_id,teacher,history}))};
    }
    async function saveSnapshot(snapshot,changedIds){
      if(!snapshot||snapshot.input_fingerprint!==fingerprint||snapshot.dataset_id!==normalizedDatasetId||!Array.isArray(snapshot.records)||!snapshot.records.length)throw Error('저장할 교사 검수 snapshot의 dataset이 잘못되었습니다.');
      const ids=snapshot.records.map(r=>r.sentence_id);
      if(new Set(ids).size!==ids.length)throw Error('저장할 문장 ID가 중복됩니다.');
      const changed=new Set(Array.isArray(changedIds)?changedIds:ids),rowsToWrite=completeSet?snapshot.records.filter(r=>changed.has(r.sentence_id)):snapshot.records;
      if(!rowsToWrite.length)throw Error('변경된 교사 검수 문장을 찾지 못했습니다.');
      const db=await open(),tx=db.transaction([RECORDS,META],'readwrite'),recordsStore=tx.objectStore(RECORDS),metaStore=tx.objectStore(META);
      for(const row of rowsToWrite)recordsStore.put({sentence_id:row.sentence_id,dataset_id:normalizedDatasetId,input_fingerprint:fingerprint,teacher:row.teacher,history:row.history});
      metaStore.put({key:MANIFEST_KEY,format:snapshot.format,review_version:snapshot.review_version,dataset_id:normalizedDatasetId,dataset_version:snapshot.dataset_version,dataset_fingerprint:snapshot.dataset_fingerprint,expected_record_count:snapshot.expected_record_count,input_fingerprint:fingerprint,saved_at:snapshot.saved_at,sentence_ids:ids});
      await transactionDone(tx);
      const readback=await loadSnapshot();
      if(!readback||!equal(snapshot.records,readback.records))throw Error('IndexedDB 저장 직후 teacher state 확인값이 일치하지 않습니다.');
      return {record_count:readback.records.length,written_record_count:rowsToWrite.length,saved_at:readback.saved_at,verified:true};
    }
    async function inspect(){const snapshot=await loadSnapshot();return {db_name:dbName,db_version:DB_VERSION,record_count:snapshot?.records.length||0,has_manifest:!!snapshot,saved_at:snapshot?.saved_at||null};}
    return {dbName,datasetId:normalizedDatasetId,loadSnapshot,saveSnapshot,inspect,equal};
  }
  return {DB_PREFIX,DB_VERSION,create,equal};
});
