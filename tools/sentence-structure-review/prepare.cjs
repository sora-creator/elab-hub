// Generate a local, file://-readable input snapshot. Never overwrite teacher exports.
const fs=require('fs'),path=require('path'),crypto=require('crypto'),C=require('./core.js');
const root=path.resolve(__dirname,'../..'),source=path.join(root,'output/sentence-structure-pilot/PILOT_50_ANNOTATIONS.json');
const text=fs.readFileSync(source,'utf8'),pilot=JSON.parse(text),fingerprint=crypto.createHash('sha256').update(text).digest('hex');
const output=path.join(root,'output/sentence-structure-review');fs.mkdirSync(output,{recursive:true});
fs.writeFileSync(path.join(output,'pilot-data.js'),'window.ELAB_PILOT_INPUT = '+JSON.stringify({fingerprint,pilot}).replace(/</g,'\u003c')+';\n');
const draft=C.fromPilot(pilot,fingerprint);
const json=path.join(output,'sentence-structure-pilot50-review.json'),summary=path.join(output,'sentence-structure-pilot50-summary.md');
if(!fs.existsSync(json))fs.writeFileSync(json,JSON.stringify(C.exportDoc(draft),null,2)+'\n');
if(!fs.existsSync(summary))fs.writeFileSync(summary,C.summary(draft));
console.log(JSON.stringify({sentences:draft.records.length,progress:C.progress(draft),input_sha256:fingerprint,existing_teacher_exports_overwritten:false}));
