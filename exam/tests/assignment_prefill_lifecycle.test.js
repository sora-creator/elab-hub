const fs=require('fs');
const assert=require('assert');
const source=fs.readFileSync(require('path').join(__dirname,'../../teacher/assignments.html'),'utf8');

assert(source.includes("type&&ref?indexByKey.get(key):undefined"));
assert(source.includes("state.assignmentCart.add(String(index));state.prefillApplied=true"));
assert(source.includes("ci=state.assignmentCart.size"));
assert(!source.includes("assignmentStatusEl.textContent='학습 메뉴에서 선택한 자료를 이번 수업 과제목록에 추가했습니다.'}state.prefillApplied=true"));
assert(source.includes("pendingItems.forEach(function(item){byKey.set(contentKey(item),item)});serverItems.forEach"));
assert(source.includes("function contentKey(item){return String(item&&item.content_type||'')+'|'+String(item&&item.content_ref_id||'')"));

console.log('assignment_prefill_lifecycle.test.js PASS');
