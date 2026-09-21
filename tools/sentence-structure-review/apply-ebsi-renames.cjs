'use strict';
const fs=require('fs'),path=require('path'),crypto=require('crypto');
const appRoot=path.resolve(__dirname,'../..'),reportPath=path.join(appRoot,'output','sentence-structure-review','ebsi-normalization','rename-plan.json'),outPath=path.join(appRoot,'output','sentence-structure-review','ebsi-normalization','rename-execution.json'),report=require(reportPath),root=path.resolve(report.summary.library_root);
if(!process.argv.includes('--apply')){console.log(JSON.stringify({dry_run:true,message:'변경하지 않았습니다. 실제 SAFE_RENAME 적용에는 --apply가 필요합니다.',safe_rename:report.plan.filter(x=>x.action==='SAFE_RENAME').length},null,2));process.exit(0);}
const inside=p=>{const v=path.resolve(p);return v===root||v.startsWith(root+path.sep);},hash=file=>crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function walk(dir,kind,out=[]){for(const x of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,x.name);if(x.isDirectory()){if(kind==='dir')out.push(p);walk(p,kind,out);}else if(kind==='pdf'&&/\.pdf$/i.test(x.name))out.push(p);}return out;}
const files=report.plan.filter(x=>x.action==='SAFE_RENAME'&&x.kind==='PDF'),folders=report.plan.filter(x=>x.action==='SAFE_RENAME'&&x.kind==='FOLDER');
if(files.length!==folders.length)throw Error('SAFE file/folder count mismatch');
for(const row of [...files,...folders]){if(!inside(row.old_path)||!inside(row.proposed_new_path))throw Error('Unsafe path outside library: '+row.old_path);if(!fs.existsSync(row.old_path))throw Error('Missing old path: '+row.old_path);if(fs.existsSync(row.proposed_new_path))throw Error('Target already exists: '+row.proposed_new_path);}
const before={directories:walk(root,'dir').length,pdfs:walk(root,'pdf').length,bytes:walk(root,'pdf').reduce((n,x)=>n+fs.statSync(x).size,0)},doneFiles=[],doneFolders=[];
try{
  for(const row of files){const interim=path.join(path.dirname(row.old_path),path.basename(row.proposed_new_path));if(fs.existsSync(interim))throw Error('Interim target exists: '+interim);const stat=fs.statSync(row.old_path),digest=hash(row.old_path);fs.renameSync(row.old_path,interim);doneFiles.push({row,interim,size:stat.size,sha256:digest});}
  for(const row of folders){fs.renameSync(row.old_path,row.proposed_new_path);doneFolders.push(row);}
}catch(error){
  for(const row of doneFolders.reverse())if(fs.existsSync(row.proposed_new_path)&&!fs.existsSync(row.old_path))fs.renameSync(row.proposed_new_path,row.old_path);
  for(const item of doneFiles.reverse())if(fs.existsSync(item.interim)&&!fs.existsSync(item.row.old_path))fs.renameSync(item.interim,item.row.old_path);
  throw error;
}
const afterFiles=walk(root,'pdf'),after={directories:walk(root,'dir').length,pdfs:afterFiles.length,bytes:afterFiles.reduce((n,x)=>n+fs.statSync(x).size,0)},verification=doneFiles.map(item=>{const final=item.row.proposed_new_path,stat=fs.statSync(final),digest=hash(final);return {old_path:item.row.old_path,new_path:final,old_absent:!fs.existsSync(item.row.old_path),new_exists:fs.existsSync(final),size_before:item.size,size_after:stat.size,sha256_before:item.sha256,sha256_after:digest,pass:item.size===stat.size&&item.sha256===digest&&!fs.existsSync(item.row.old_path)};});
const result={executed_at:new Date().toISOString(),root,before,after,renamed_folders:doneFolders.length,renamed_pdfs:doneFiles.length,counts_preserved:before.directories===after.directories&&before.pdfs===after.pdfs&&before.bytes===after.bytes,all_paths_verified:verification.every(x=>x.pass),verification};fs.writeFileSync(outPath,JSON.stringify(result,null,2)+'\n');if(!result.counts_preserved||!result.all_paths_verified)throw Error('Post-rename verification failed');console.log(JSON.stringify({...result,verification:undefined},null,2));
