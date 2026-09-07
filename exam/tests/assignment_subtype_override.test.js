const fs=require('fs');
const path=require('path');
const assert=require('assert');
const source=fs.readFileSync(path.join(__dirname,'../../teacher/assignments.html'),'utf8');

assert(source.includes('contentSubtypeOverrides:Object.assign({},assignmentDraft&&assignmentDraft.contentSubtypeOverrides||{})'));
assert(source.includes('contentSubtypeOverrides:Object.assign({},state.contentSubtypeOverrides)'));
assert(source.includes('if(pickedSubtype)state.contentSubtypeOverrides[key]=pickedSubtype'));
assert(source.includes('content_subtype:state.contentSubtypeOverrides[contentKey(item)]||item.extra&&item.extra.content_subtype||\'\''));
assert(source.includes('delete state.contentSubtypeOverrides[contentKey(item)]'));
assert(source.includes('state.assignmentCart.clear();state.contentSubtypeOverrides={}'));

console.log('assignment_subtype_override.test.js PASS');
