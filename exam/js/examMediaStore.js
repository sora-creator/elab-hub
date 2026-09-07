(function(global){
  'use strict';
  var DB_NAME='elab_exam_media',STORE='images';
  function openDb(){return new Promise(function(resolve,reject){var req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=function(){if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'key'})};req.onsuccess=function(){resolve(req.result)};req.onerror=function(){reject(req.error)}})}
  async function put(key,dataUrl){if(!key||!dataUrl)return;var db=await openDb();return new Promise(function(resolve,reject){var tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({key:key,dataUrl:dataUrl,updatedAt:Date.now()});tx.oncomplete=function(){db.close();resolve()};tx.onerror=function(){db.close();reject(tx.error)}})}
  async function getMany(keys){var wanted=[...new Set((keys||[]).filter(Boolean))];if(!wanted.length)return{};var db=await openDb();return new Promise(function(resolve){var out={},tx=db.transaction(STORE,'readonly'),store=tx.objectStore(STORE);wanted.forEach(function(key){var req=store.get(key);req.onsuccess=function(){if(req.result)out[key]=req.result.dataUrl}});tx.oncomplete=function(){db.close();resolve(out)};tx.onerror=function(){db.close();resolve(out)}})}
  async function hydrate(db){var passages=db&&db.passages||[],map=await getMany(passages.filter(function(p){return !p.image&&p.imageKey}).map(function(p){return p.imageKey})),count=0;passages.forEach(function(p){if(!p.image&&p.imageKey&&map[p.imageKey]){p.image=map[p.imageKey];count++}});return count}
  global.ElabExamMedia={put:put,getMany:getMany,hydrate:hydrate};
})(window);
