const fs = require('fs');
const assert = require('assert');

const grammar = fs.readFileSync('grammar/index.html', 'utf8');
const backend = fs.readFileSync('exam/sheet_backend.gs', 'utf8');

assert(grammar.includes('id="directGrammarAuthoring"'));
assert(grammar.includes("q.choices.length<2"));
assert(grammar.includes("q.choices.indexOf(q.answer)===-1"));
assert(grammar.includes("tags:{DIRECT_QUESTION:[hit]}"));
assert(grammar.includes("content_subtype='+encodeURIComponent(subtype)"));
assert(grammar.includes("explicitChoices && explicitChoices.length"));
assert(backend.includes("choices:explicitChoices||optionIds"));
assert(backend.includes("answer:explicitChoices?hit.correct_answer:tagId"));
assert(backend.includes("promptKo:hit.prompt||''"));

console.log('grammar direct authoring tests passed');
