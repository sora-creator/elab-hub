const fs = require('fs'), path = require('path'), {spawnSync} = require('child_process');
const root = path.resolve(__dirname, '../..');
const out = path.join(root, 'output/vocabulary-local-tests');
fs.mkdirSync(out, {recursive:true});
const requested = process.argv.slice(2);
const files = requested.length ? requested : fs.readdirSync(__dirname).filter(f => /\.(js|ps1)$/.test(f)).sort();
const results = [];
for (const file of files) {
  const args = file.endsWith('.ps1') ? ['-NoProfile','-ExecutionPolicy','Bypass','-File',path.join(__dirname,file)] : ['--require',path.join(__dirname,'helpers/local-only-browser.cjs'),path.join(__dirname,file)];
  const command = file.endsWith('.ps1') ? 'powershell.exe' : process.execPath;
  const result = spawnSync(command,args,{cwd:root,encoding:'utf8',timeout:180000,maxBuffer:8*1024*1024,windowsHide:true,env:{...process.env,ELAB_VOCAB_XLSX:'',PLAYWRIGHT_BROWSERS_PATH:path.join(root,'.pw-browsers')}});
  fs.writeFileSync(path.join(out,file+'.log'), (result.stdout||'')+(result.stderr||'')+(result.error?String(result.error):''));
  results.push({file,passed:result.status===0,status:result.status,error:result.error?.code||null});
  console.log(`${result.status===0?'PASS':'FAIL'} ${file}`);
}
fs.writeFileSync(path.join(out,requested.length?'results-selected.json':'results.json'),JSON.stringify(results,null,2));
console.log(JSON.stringify({passed:results.filter(x=>x.passed).length,failed:results.filter(x=>!x.passed).length,total:results.length}));
process.exitCode=results.some(x=>!x.passed)?1:0;
