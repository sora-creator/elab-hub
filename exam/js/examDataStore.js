(function(global){
  'use strict';
  var DB_NAME='elab_exam_data',STORE='records',KEY='passage-db';
  function openDb(){return new Promise(function(resolve,reject){var req=indexedDB.open(DB_NAME,1);req.onupgradeneeded=function(){if(!req.result.objectStoreNames.contains(STORE))req.result.createObjectStore(STORE,{keyPath:'key'})};req.onsuccess=function(){resolve(req.result)};req.onerror=function(){reject(req.error)}})}
  async function put(value){var db=await openDb();return new Promise(function(resolve,reject){var tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({key:KEY,value:value,updatedAt:Date.now()});tx.oncomplete=function(){db.close();resolve()};tx.onerror=function(){db.close();reject(tx.error)}})}
  async function get(){var db=await openDb();return new Promise(function(resolve){var req=db.transaction(STORE,'readonly').objectStore(STORE).get(KEY);req.onsuccess=function(){db.close();resolve(req.result&&req.result.value||null)};req.onerror=function(){db.close();resolve(null)}})}
  global.ElabExamData={put:put,get:get};
})(window);
