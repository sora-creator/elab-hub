'use strict';
const assert=require('assert'),fs=require('fs'),vm=require('vm'),{execFileSync}=require('child_process');
// Reuse 7G's local fixture: actual 972 Items/Words evidence, reconstructed Sets metadata.
// It deliberately does not run migration or create a set.
const source=fs.readFileSync('exam/tests/vocab_schema_upgrade.test.js','utf8'),marker='\nlet count=0;';
assert(source.includes(marker));
const fixture=vm.runInThisContext('(function(require,__filename){'+source.slice(0,source.indexOf(marker))+'return {make,state,legacyItems,legacyWords};})',{filename:__filename})(require,__filename);
const items='VocabSetItemsV2',sets='VocabSetsV2';
const json=x=>JSON.stringify(x);
function make(){
  const e=fixture.make();
  for(const [n,h] of [['AttemptsV2',e.ctx.ATTEMPTS_V2_HEADERS],['WordAttemptItemsV2',e.ctx.WORD_ATTEMPT_ITEMS_V2_HEADERS]])e.addSheet(n,h);
  e.sheets.AttemptsV2.rows.push(['local-existing-attempt','local-target']);
  e.sheets.AssignmentTargetsV2.rows.push(['local-target','local-assignment','local-student']);
  e.forbiddenCalls=[];
  for(const name of Object.keys(e.ctx))if(typeof e.ctx[name]==='function'&&(/^(setup|getOrCreate|create|startAttempt|handleStartAttempt|handleCreate|handleFetchVocabularySet|handleUpgradeVocabularySet)/.test(name))){
    e.ctx[name]=()=>{e.forbiddenCalls.push(name);throw Error('forbidden diagnostic call: '+name);};
  }
  e.ctx.Utilities.getUuid=()=>{e.forbiddenCalls.push('UUID');throw Error('no identity creation');};
  return e;
}
function inspect(e,extra={}){
  const before=fixture.state(e),properties=structuredClone(e.properties);
  const out=e.ctx.handleInspectVocabularySetSchemasV1_({parameter:{token:'local-test-token',...extra}});
  assert.deepStrictEqual(fixture.state(e),before);assert.deepStrictEqual(e.properties,properties);
  assert.equal(e.writes.length,0);assert.equal(e.propertyWrites.length,0);assert.deepStrictEqual(e.forbiddenCalls,[]);
  assert(!e.operations.some(o=>['VocabularyDB','AssignmentsV2','AssignmentTargetsV2','AttemptsV2','TeachersV2'].includes(o.sheet)));
  assert(!json(out).includes('local-test-token'));assert(!json(e.logs).includes('local-test-token'));
  return out;
}
const report=(out,name)=>out.sheets.find(s=>s.sheet_name===name);
let count=0;
function test(name,fn){fn();count++;console.log('PASS '+name);}
test('actual legacy Items: 972 rows, 5-column header; Sets 19-column prefix and exact 8-cell plan',()=>{
  const e=make(),out=inspect(e),i=report(out,items),s=report(out,sets);assert(out.ok&&out.upgrade_eligible);
  assert.equal(i.last_row,973);assert.equal(i.last_column,5);assert.equal(i.data_row_count,972);assert(i.canonical_prefix_match);assert.equal(i.extension_header_state,'BLANK');assert(i.extension_data.all_blank);assert.equal(i.extension_data.nonblank_count,0);
  assert.equal(s.last_column,19);assert.equal(s.data_row_count,32);assert(s.canonical_prefix_match&&s.extension_data.all_blank);assert.equal(s.extension_header_state,'BLANK');
  assert.equal(json(out.planned_writes.map(w=>[w.sheet,w.range,w.values])),json([[items,'F1:I1',[Array.from(e.ctx.VOCAB_SET_ITEMS_V2_HEADERS).slice(5)]],[sets,'T1:W1',[Array.from(e.ctx.VOCAB_SETS_V2_HEADERS).slice(19)]]]));
  assert.equal(out.planned_header_cells,8);assert.equal(out.planned_data_writes,0);
  assert.equal(json(s.missing_headers),json(['level','selection_type','item_count','created_by'].map((header,i)=>({column:String.fromCharCode(84+i),header}))));
});
test('972 exact Words resolutions, bounded samples, one read per Sheet',()=>{
  const e=make(),out=inspect(e),r=out.legacy_resolution;assert.equal(r.legacy_item_count,972);assert.equal(r.resolved_count,972);
  for(const k of ['metadata_missing_count','metadata_conflict_count','empty_word_count','empty_meaning_count','invalid_item_count'])assert.equal(r[k],0);
  assert.equal(r.samples.length,5);for(const sample of r.samples){const row=fixture.legacyWords.find(w=>w[0]===sample.word_id);assert(row);assert.equal(sample.resolved_word,row[2]);assert.equal(sample.resolved_meaning,row[3]);assert(!sample.truncated);}
  for(const n of [items,sets,'WordsV2'])assert.equal(e.operations.filter(o=>o.sheet===n&&o.method==='getValues').length,1);
  for(const n of [items,sets])assert.equal(e.operations.filter(o=>o.sheet===n&&o.method==='getFormulas').length,1);
  assert(Buffer.byteLength(json(out),'utf8')<25000);assert(!json(out).includes('local-student'));assert(!json(out).includes('local-existing-attempt'));
});
test('future canonical 9/23 headers, blank legacy data: already upgraded, no planned writes',()=>{const e=make();e.sheets[items].rows[0]=Array.from(e.ctx.VOCAB_SET_ITEMS_V2_HEADERS);e.sheets[sets].rows[0]=Array.from(e.ctx.VOCAB_SETS_V2_HEADERS);const out=inspect(e);assert(out.upgrade_eligible);assert.equal(out.planned_header_cells,0);assert.equal(out.legacy_resolution.resolved_count,972);assert(out.sheets.every(s=>s.extension_header_state==='CANONICAL'&&s.planner_status==='ALREADY_UPGRADED'));});
test('canonical snapshot row reports populated extension and never reads Words when no legacy',()=>{const e=make();e.sheets[items].rows=[Array.from(e.ctx.VOCAB_SET_ITEMS_V2_HEADERS),['item','set','original-id',1,new Date(0),'sense','encompass','include','V3']];const out=inspect(e),i=report(out,items);assert(out.ok&&!out.upgrade_eligible);assert.equal(i.extension_header_state,'CANONICAL');assert.equal(i.extension_data.nonblank_count,4);assert.equal(out.legacy_resolution.snapshot_item_count,1);assert.equal(out.legacy_resolution.legacy_item_count,0);assert(!e.operations.some(o=>o.sheet==='WordsV2'));});
for(const name of [items,sets]){
  const start=name===items?5:19;
  test(name+' partial canonical header reports PARTIAL, no combined plan',()=>{const e=make(),h=name===items?e.ctx.VOCAB_SET_ITEMS_V2_HEADERS:e.ctx.VOCAB_SETS_V2_HEADERS;e.sheets[name].rows[0][start]=h[start];const out=inspect(e);assert(out.ok);assert.equal(report(out,name).extension_header_state,'PARTIAL');assert(!out.upgrade_eligible);assert.equal(out.planned_header_cells,0);assert.equal(out.planned_writes.length,0);});
  test(name+' wrong header or prefix reports conflict',()=>{const e=make();e.sheets[name].rows[0][start]='wrong';e.sheets[name].rows[0][0]='wrong';const out=inspect(e),r=report(out,name);assert.equal(r.extension_header_state,'CONFLICT');assert(!r.canonical_prefix_match&&!r.upgrade_eligible);});
  test(name+' unexpected extension values counted per column',()=>{const e=make();e.sheets[name].rows[1][start]='unexpected';e.sheets[name].rows[2][start+1]=false;const r=report(inspect(e),name);assert(!r.extension_data.all_blank&&!r.upgrade_eligible);assert.equal(r.extension_data.nonblank_count,2);assert.equal(r.extension_data.nonblank_by_column[String.fromCharCode(65+start)],1);assert.equal(r.extension_data.nonblank_by_column[String.fromCharCode(66+start)],1);});
  test(name+' formula counts and blank-looking formula protection',()=>{const e=make();e.sheets[name].formulas['2,4']='=1';e.sheets[name].formulas['2,'+(start+1)]='=""';const r=report(inspect(e),name);assert.equal(r.formula_counts.existing_data,1);assert.equal(r.formula_counts.extension_data,1);assert.equal(r.extension_data.nonblank_count,0);assert(!r.extension_data.all_blank&&!r.upgrade_eligible);});
  test(name+' header formulas returned and invalidate eligibility',()=>{const e=make();e.sheets[name].formulas['1,'+(start+1)]='=""';const r=report(inspect(e),name);assert.equal(r.header_formulas[start],'=""');assert.equal(r.extension_header_state,'CONFLICT');assert(!r.upgrade_eligible);});
  test(name+' runtime Date/number/string/boolean/blank counts',()=>{const e=make();e.sheets[name].rows[1][4]=new Date(0);e.sheets[name].rows[2][4]=7;e.sheets[name].rows[3][4]='0007';e.sheets[name].rows[4][4]=false;e.sheets[name].rows[5][4]='';const types=report(inspect(e),name).runtime_type_counts[4];assert(types.date>=1&&types.number>=1&&types.string>=1&&types.boolean>=1&&types.blank>=1);});
  test(name+' fingerprints deterministic and identical to migration planner',()=>{const e=make(),a=report(inspect(e),name),b=report(inspect(e),name);assert.equal(json(a),json(b));const actual=e.ctx.vocabularySetSchemaReadV1_(name);assert.equal(a.planner_pre_fingerprint,actual.plan.pre_fingerprint);const old=a.existing_data_state_fingerprint;e.sheets[name].rows[1][4]=new Date(0);const date=report(inspect(e),name);e.sheets[name].rows[1][4]=new Date(0).toISOString();const string=report(inspect(e),name);assert.notEqual(date.existing_data_state_fingerprint,string.existing_data_state_fingerprint);assert.notEqual(old,string.existing_data_state_fingerprint);});
  test(name+' formula text fingerprint changes even when value is unchanged',()=>{const e=make();e.sheets[name].formulas['2,4']='=1';const a=report(inspect(e),name);e.sheets[name].formulas['2,4']='=2-1';const b=report(inspect(e),name);assert.equal(a.existing_data_values_fingerprint,b.existing_data_values_fingerprint);assert.notEqual(a.existing_data_formulas_fingerprint,b.existing_data_formulas_fingerprint);assert.notEqual(a.existing_data_state_fingerprint,b.existing_data_state_fingerprint);});
  test(name+' missing Sheet returns SCHEMA_NOT_FOUND without setup',()=>{const e=make();delete e.sheets[name];const out=inspect(e);assert(!out.ok&&!out.upgrade_eligible);assert.equal(out.error,'SCHEMA_NOT_FOUND');assert.equal(report(out,name).error,'SCHEMA_NOT_FOUND');});
  test(name+' capacity and merge restrictions match migration',()=>{for(const mode of ['capacity','merged']){const e=make();if(mode==='capacity')e.sheets[name].maxColumns=start;else e.sheets[name].merged=[{}];const out=inspect(e);assert(!report(out,name).upgrade_eligible);assert.equal(out.planned_header_cells,0);}});
}
test('unexpected data beyond canonical width affects planner eligibility and fingerprint',()=>{const e=make(),before=report(inspect(e),items);e.sheets[items].maxColumns=26;e.sheets[items].rows[1][10]='extra';const after=report(inspect(e),items);assert(!after.upgrade_eligible);assert.notEqual(before.planner_pre_fingerprint,after.planner_pre_fingerprint);assert.equal(after.header_values.length,9);});
test('partial item snapshot counted, never hidden by legacy fallback',()=>{const e=make();e.sheets[items].rows[1][5]='sense';const r=inspect(e).legacy_resolution;assert.equal(r.invalid_item_count,1);assert.equal(r.legacy_item_count,971);});
for(const mode of ['missing','duplicate','conflicting duplicate','empty word','empty meaning','wrong Words header','missing Words sheet'])test('legacy metadata '+mode,()=>{
  const e=make(),id=fixture.legacyItems[0][2],affected=fixture.legacyItems.filter(r=>r[2]===id).length,rows=e.sheets.WordsV2.rows,index=rows.findIndex(r=>r[0]===id);
  if(mode==='missing')rows.splice(index,1);
  if(mode.includes('duplicate')){const row=rows[index].slice();if(mode==='conflicting duplicate')row[3]='other';rows.push(row);}
  if(mode==='empty word')rows[index][2]='';if(mode==='empty meaning')rows[index][3]='';
  if(mode==='wrong Words header')rows[0][0]='wrong';if(mode==='missing Words sheet')delete e.sheets.WordsV2;
  const r=inspect(e).legacy_resolution,n=mode==='wrong Words header'||mode==='missing Words sheet'?972:affected;
  assert.equal(r.resolved_count,972-n);assert.equal(r[mode.startsWith('missing')?'metadata_missing_count':'metadata_conflict_count'],n);
  if(mode==='empty word')assert.equal(r.empty_word_count,n);if(mode==='empty meaning')assert.equal(r.empty_meaning_count,n);
});
test('response samples bounded by count and field length, marked when truncated',()=>{const e=make(),word=e.sheets.WordsV2.rows.find(w=>w[0]===fixture.legacyItems[0][2]);word[2]='x'.repeat(5000);word[3]='y'.repeat(5000);const r=inspect(e).legacy_resolution;assert.equal(r.samples.length,5);assert(r.samples[0].truncated);assert.equal(r.samples[0].resolved_word.length,512);assert.equal(r.samples[0].resolved_meaning.length,512);});
for(const token of ['',undefined,'student-capability','wrong'])test('unauthorized token '+String(token)+' never reads Sheets',()=>{const e=make(),out=inspect(e,{token});assert.equal(out.error,'UNAUTHORIZED');assert.equal(e.operations.length,0);});
test('GET JSONP route uses teacher diagnostic without normal fetch/attempt',()=>{const e=make(),before=fixture.state(e);const response=e.ctx.doGet({parameter:{action:'inspectVocabularySetSchemasV1',token:'local-test-token',callback:'diagnostic'}});assert(response.body.startsWith('diagnostic('));const out=JSON.parse(response.body.slice(11,-1));assert(out.ok);assert.equal(out.legacy_resolution.resolved_count,972);assert.deepStrictEqual(fixture.state(e),before);assert.equal(e.writes.length,0);assert.equal(e.propertyWrites.length,0);assert.deepStrictEqual(e.forbiddenCalls,[]);});
test('migration implementation remains byte-for-byte unchanged from committed baseline',()=>{const old=execFileSync('git',['show','HEAD:exam/sheet_backend.gs'],{encoding:'utf8'}),now=fs.readFileSync('exam/sheet_backend.gs','utf8');const section=s=>s.slice(s.indexOf('function vocabularySetSchemaSpecV1_('),s.indexOf('function handleCreateVocabularySetV1_('));assert.equal(section(now),section(old));});
console.log(JSON.stringify({tests:count,passed:count,operating_requests:0,spreadsheet_writes:0,property_writes:0,attempt_calls:0,setup_calls:0}));
