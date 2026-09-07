// Optional one-time preparation for the existing non-vocabulary UI regression tests.
// Only public static scripts referenced by the application; no Google/API credentials.
const fs = require('fs'), path = require('path');
const assets = {
  'tailwind.js':'https://cdn.tailwindcss.com',
  'pdf.min.js':'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js',
  'pdf.worker.min.js':'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js',
  'tesseract.min.js':'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js'
};
async function main(){
  const dir=path.resolve(__dirname,'../../output/local-test-assets');fs.mkdirSync(dir,{recursive:true});
  for(const [name,url] of Object.entries(assets)){
    const target=path.join(dir,name);
    if(fs.existsSync(target)){console.log('Cached '+name);continue;}
    const response=await fetch(url,{signal:AbortSignal.timeout(25000)});
    if(!response.ok)throw new Error('Static asset download failed: '+name);
    fs.writeFileSync(target,Buffer.from(await response.arrayBuffer()));console.log('Saved '+name);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1});
