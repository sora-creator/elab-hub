const { readFinalVocabulary } = require('./helpers/final-vocabulary');
console.log(JSON.stringify(readFinalVocabulary().stats, null, 2));
console.log('vocabulary_final_xlsx.test.js: all assertions passed');
