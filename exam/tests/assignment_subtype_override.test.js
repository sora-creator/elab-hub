const fs=require('fs');
const path=require('path');
const assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../../teacher/assignments.html'),'utf8');

assert(source.includes('contentSubtypeOverrides:Object.assign({},assignmentDraft&&assignmentDraft.contentSubtypeOverrides||{})'));
assert(source.includes('contentSubtypeOverrides:Object.assign({},state.contentSubtypeOverrides)'));
assert(source.includes('if(pickedSubtype)state.contentSubtypeOverrides[key]=pickedSubtype'));
const helperBody=source.match(/function assignmentSubtype_\(item\)\{([^}]+)\}/);
assert(helperBody,'assignmentSubtype_ helper must exist');
const assignmentSubtype=(state,contentKey,item)=>Function('state','contentKey','item',helperBody[1])(state,contentKey,item);
const contentKey=item=>String(item.content_type||'')+'|'+String(item.content_ref_id||'');
function compareSubtype(subtype,override,linkedPracticeAssignmentId){
  const item={content_type:'GRAMMAR',content_ref_id:'set-1',extra:{content_subtype:subtype}},state={contentSubtypeOverrides:override?{'GRAMMAR|set-1':override}:{},linkedPracticeAssignmentId:linkedPracticeAssignmentId||''};
  const oldValue=state.contentSubtypeOverrides[contentKey(item)]||item.extra&&item.extra.content_subtype||'';
  assert.strictEqual(assignmentSubtype(state,contentKey,item),oldValue);
  return oldValue;
}
['THEORY','BASIC_PRACTICE','MIXED_PRACTICE','LESSON_PRACTICE','FINAL_QUIZ','CUSTOM'].forEach(subtype=>assert.strictEqual(compareSubtype(subtype),subtype));
assert.strictEqual(compareSubtype('BASIC_PRACTICE','THEORY'),'THEORY','prefill override remains authoritative');
assert.strictEqual(compareSubtype('THEORY','', 'practice-1'),'THEORY','Theory with link keeps Theory subtype');
assert.strictEqual(compareSubtype('THEORY','', ''),'THEORY','Theory without link keeps Theory subtype');
assert(source.includes('var subtype=assignmentSubtype_(item),request='));
assert(source.includes('content_subtype:subtype'));
assert(source.includes('delete state.contentSubtypeOverrides[contentKey(item)]'));
assert(source.includes('state.assignmentCart.clear();state.contentSubtypeOverrides={}'));

console.log('assignment_subtype_override.test.js PASS');
