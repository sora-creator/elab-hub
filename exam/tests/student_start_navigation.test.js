const assert=require('assert'),fs=require('fs'),vm=require('vm');
const student=fs.readFileSync('student/index.html','utf8');
const startFlow=student.match(/function post\(body\)[\s\S]*?(?=function filteredItems)/)[0];

assert(!/async function startAssignment/.test(startFlow));
assert(!/await post\(/.test(startFlow));

function runStartFlow(sendBeaconResult,contentLink,pageHref){
  const location=new URL(pageHref||'http://localhost:8000/student/index.html');
  const context={URL,Blob,console,hook:'https://example.test/exec',location,navigator:{sendBeacon:()=>sendBeaconResult},fetch:()=>new Promise(()=>{})};
  context.contentLink=contentLink||'../vocab/index.html?session=set';
  vm.runInNewContext(startFlow+';startAssignment({assignment_id:"a",assignment_target_id:"t",student_id:"s",student_name:"Student",launch_capability:"cap",content_link:contentLink},{disabled:false,textContent:""});',context);
  return new URL(location.href);
}

[true,false].forEach(sendBeaconResult=>{
  const destination=runStartFlow(sendBeaconResult);
  assert.strictEqual(destination.pathname,'/vocab/index.html');
  assert.strictEqual(destination.searchParams.get('session'),'set');
  assert.strictEqual(destination.searchParams.get('assignment_id'),'a');
  assert.strictEqual(destination.searchParams.get('assignment_target_id'),'t');
  assert.strictEqual(destination.searchParams.get('student_id'),'s');
  assert.strictEqual(destination.searchParams.get('student_name'),'Student');
  assert.strictEqual(destination.searchParams.get('assignmentCapability'),'cap');
});

['vocab','grammar','exam','practice'].forEach(module=>{
  const destination=runStartFlow(false,'file:///C:/Users/Test/ELAB/'+module+'/index.html?study=abc#part');
  assert.strictEqual(destination.href.startsWith('http://localhost:8000/'+module+'/index.html?'),true);
  assert.strictEqual(destination.searchParams.get('study'),'abc');
  assert.strictEqual(destination.hash,'#part');
});

assert.strictEqual(runStartFlow(false,'http://localhost:8000/exam/index.html?session=x').origin,'http://localhost:8000');
assert.strictEqual(runStartFlow(false,'https://learning.example.com/exam/index.html?session=x').origin,'https://learning.example.com');
assert.strictEqual(runStartFlow(false,'file:///C:/Other/tool/index.html?session=x').protocol,'file:');

console.log('student_start_navigation.test.js: all assertions passed');
