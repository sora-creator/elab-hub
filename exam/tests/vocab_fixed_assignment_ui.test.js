const assert=require('assert');
const progress=require('../../teacher/vocab-fixed-progress.js');

function content(count){return Array.from({length:count},(_,i)=>({content_type:'VOCAB',content_ref_id:'set-'+(i+1),title:'V3 Set '+String(i+1).padStart(2,'0'),extra:{catalog_id:'catalog-v3',set_number:i+1,source_folders_json:JSON.stringify([{folder_id:'f'+(i+1),name:'Folder '+(i+1),path:['V3','Folder '+(i+1)]}]),book_source:'V3 단어장',source_ref:'V3',set_kind:'FIXED',set_size:50,range_start:i*50+1,range_end:(i+1)*50,display_range:(i*50+1)+'~'+((i+1)*50)}}))}
function assignment(set,targets,type='VOCAB'){return{active:true,content_type:type,content_ref_id:'set-'+set,targets:targets.map(x=>({student_id:x[0],status:x[1]||'NOT_STARTED',active:x[2]!==false}))}}
const catalog=progress.fixedCatalogs(content(20))[0];
assert.strictEqual(catalog.sets.length,20);
const legacyMetadata=content(1);delete legacyMetadata[0].extra.catalog_id;delete legacyMetadata[0].extra.set_number;assert.strictEqual(progress.fixedCatalogs(legacyMetadata).length,0);

const legacyRangeCatalogs=progress.fixedCatalogs([
  {content_type:'VOCAB',content_ref_id:'legacy-18',title:'18',extra:{book_source:'모의고사',day_set:'18번',source_ref:'모의고사 › 고1 › 26년 고1 3월 모고 › 18번',set_kind:'FIXED',range_start:1,range_end:50,set_size:50}},
  {content_type:'VOCAB',content_ref_id:'legacy-19',title:'19',extra:{book_source:'모의고사',day_set:'19번 외 5개',source_ref:'모의고사 › 고1 › 26년 고1 3월 모고 › 19번 외 5개',set_kind:'FIXED',range_start:51,range_end:100,set_size:50}},
  {content_type:'VOCAB',content_ref_id:'legacy-20',title:'20',extra:{book_source:'모의고사',day_set:'20번 외 4개',source_ref:'모의고사 › 고1 › 26년 고1 3월 모고 › 20번 외 4개',set_kind:'FIXED',range_start:101,range_end:150,set_size:50}}
]);
assert.strictEqual(legacyRangeCatalogs.length,0);
assert.strictEqual(catalog.sets[0].number,1);
assert.strictEqual(catalog.sets[19].number,20);
assert.strictEqual(catalog.sets[0].sourceSummary,'Folder 1');

let rows=[];for(let i=1;i<=7;i++)rows.push(assignment(i,[['A']]));
let a=progress.summary(catalog,progress.studentStatuses(catalog,rows,'A'));
assert.strictEqual(a.continuous,7);assert.deepStrictEqual(a.missing,[]);assert.deepStrictEqual(a.extra,[]);assert.strictEqual(a.next,8);

rows=[];for(let i=1;i<=5;i++)rows.push(assignment(i,[['A']]));rows.push(assignment(7,[['A']]));
a=progress.summary(catalog,progress.studentStatuses(catalog,rows,'A'));
assert.strictEqual(a.continuous,5);assert.deepStrictEqual(a.missing.slice(0,1),[6]);assert.deepStrictEqual(a.extra,[7]);assert.strictEqual(a.next,6);

rows=[assignment(1,[['A','COMPLETED']]),assignment(2,[['A','IN_PROGRESS']]),assignment(3,[['A','NOT_STARTED']])];
a=progress.summary(catalog,progress.studentStatuses(catalog,rows,'A'));
assert.deepStrictEqual(a.statuses,{1:'COMPLETED',2:'IN_PROGRESS',3:'NOT_STARTED'});

a=progress.summary(catalog,progress.studentStatuses(catalog,rows,'B'));assert.strictEqual(a.continuous,0);assert.strictEqual(a.next,1);

rows=[];for(let i=1;i<=10;i++)rows.push(assignment(i,[['A']]));for(let i=1;i<=5;i++)rows.push(assignment(i,[['B']]));
assert.strictEqual(progress.summary(catalog,progress.studentStatuses(catalog,rows,'A')).continuous,10);
assert.strictEqual(progress.summary(catalog,progress.studentStatuses(catalog,rows,'B')).continuous,5);

let group=progress.groupSummary(catalog,rows,['A','B']);assert.strictEqual(group.common.continuous,5);assert.strictEqual(group.hasDifferences,true);

rows.push(assignment(1,[['A']], 'READING'));rows.push({active:true,content_type:'VOCAB',content_ref_id:'random',targets:[{student_id:'A',status:'COMPLETED',active:true}]});
assert.strictEqual(progress.summary(catalog,progress.studentStatuses(catalog,rows,'A')).continuous,10);

const split1327=Array.from({length:1327},(_,i)=>i+1).reduce((sets,word,i)=>{let index=Math.floor(i/50);(sets[index]||(sets[index]=[])).push(word);return sets},[]);
assert.strictEqual(split1327.length,27);assert.strictEqual(split1327[0].length,50);assert.strictEqual(split1327[26].length,27);
const split1000=Array.from({length:1000},(_,i)=>i+1).reduce((sets,word,i)=>{let index=Math.floor(i/50);(sets[index]||(sets[index]=[])).push(word);return sets},[]);
assert.strictEqual(split1000.length,20);assert.deepStrictEqual(split1000[0],[...Array(50)].map((_,i)=>i+1));assert.deepStrictEqual(split1000[19],[...Array(50)].map((_,i)=>i+951));
console.log('vocab_fixed_assignment_ui.test.js: all assertions passed');
