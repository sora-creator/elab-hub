'use strict';
const crypto=require('crypto');
const {createFirstImportMock}=require('./vocabulary-first-import-mock.cjs');
function createSubmitMock(){
  const e=createFirstImportMock(),{ctx,ss}=e;
  Object.assign(e.properties,{TOKEN:'teacher',STUDENT_CAPABILITY_SECRET:'local-only-student-secret',DEFAULT_TEACHER_ID:'local-teacher'});
  Object.assign(ctx.Utilities,{getUuid:()=>crypto.randomUUID(),formatDate:()=>'',base64EncodeWebSafe:v=>Buffer.from(v).toString('base64url'),base64DecodeWebSafe:v=>Buffer.from(v,'base64url'),computeHmacSha256Signature:(v,s)=>crypto.createHmac('sha256',s).update(v).digest(),newBlob:v=>({getDataAsString:()=>Buffer.from(v).toString('utf8')})});
  ctx.CacheService={getScriptCache:()=>({get:()=>null,put(){},remove(){}})};
  ctx.Session={getEffectiveUser:()=>({getEmail:()=>''}),getScriptTimeZone:()=>''};
  ctx.console.warn=ctx.console.log;ctx.console.error=ctx.console.log;
  const getLock=ctx.LockService.getScriptLock;
  ctx.LockService.getScriptLock=()=>{const lock=getLock();lock.waitLock=()=>{if(!lock.tryLock())throw Error('mock lock contention');};return lock;};
  const add=e.addSheet;
  e.addSheet=(name,headers)=>{const sh=add(name,headers),range=sh.getRange;
    sh.getRange=function(...args){const r=range.apply(this,args);r.getValue=()=>r.getValues()[0][0];r.setValue=v=>r.setValues([[v]]);return r;};return sh;};
  // Provision fixtures administratively before exercising the student handler.
  for(const [key,headers] of Object.entries(ctx))if(key.endsWith('_HEADERS')&&Array.isArray(headers)){
    const name=ctx[key.slice(0,-8)+'_SHEET'];if(typeof name==='string'&&!e.sheets[name])e.addSheet(name,headers);
  }
  ss.getSheets=()=>Object.values(e.sheets);ss.getName=()=> 'local fixture';
  ss.insertSheet=()=>{throw Error('student path must not create sheets');};
  const now=new Date('2026-09-11T00:00:00Z');
  e.sheets.TeachersV2.rows.push(['local-teacher','local fixture','',true,now,now]);
  return e;
}
module.exports={createSubmitMock};
