(function(root){
  const generated_at='2026-09-22T00:00:00.000Z',model='GPT-5',source='AI_BATCH_PREGENERATION_V1';
  const chunk=(id,granularity,boundaries,confidence)=>({proposal_id:id,granularity,boundaries,model,source,confidence,generated_at,status:'AI_PROPOSED'});
  const expression=(id,canonical_expression,display_meaning,selected_source_span,source_token_indexes,confidence)=>({proposal_id:id,canonical_expression,display_meaning,selected_source_span,source_token_indexes,model,source,confidence,generated_at,status:'AI_PROPOSED'});
  const data={version:'1',dataset_id:'chunking-pilot12',records:{
    'corpus:2970':{ai_chunk_variants:[chunk('c2970-m','MEDIUM',[1],'MEDIUM'),chunk('c2970-l','LARGE',[],'HIGH')],ai_expression_candidates:[]},
    'corpus:25018':{ai_chunk_variants:[chunk('c25018-m','MEDIUM',[1],'HIGH'),chunk('c25018-l','LARGE',[],'HIGH')],ai_expression_candidates:[]},
    'corpus:2449':{ai_chunk_variants:[chunk('c2449-s','SMALL',[5,9,12],'MEDIUM'),chunk('c2449-m','MEDIUM',[5,9],'HIGH'),chunk('c2449-l','LARGE',[],'MEDIUM')],ai_expression_candidates:[expression('e2449-1','be excited about ~','~에 대해 기대하거나 신이 나다','are excited about',[11,12,13],'MEDIUM')]},
    'corpus:2590':{ai_chunk_variants:[chunk('c2590-m','MEDIUM',[5,10],'HIGH'),chunk('c2590-l','LARGE',[],'MEDIUM')],ai_expression_candidates:[expression('e2590-1','blow money on ~','~에 돈을 흥청망청 쓰다','blow their money on',[7,8,9,10],'HIGH')]},
    'corpus:2479':{ai_chunk_variants:[chunk('c2479-s','SMALL',[3,8],'MEDIUM'),chunk('c2479-m','MEDIUM',[3],'HIGH')],ai_expression_candidates:[]},
    'corpus:58378':{ai_chunk_variants:[chunk('c58378-m','MEDIUM',[4],'HIGH'),chunk('c58378-l','LARGE',[],'MEDIUM')],ai_expression_candidates:[]},
    'corpus:26237':{ai_chunk_variants:[chunk('c26237-m','MEDIUM',[5],'HIGH'),chunk('c26237-l','LARGE',[],'MEDIUM')],ai_expression_candidates:[expression('e26237-1','consist of','~로 구성되다','consists of',[2,3],'HIGH')]},
    'corpus:2501':{ai_chunk_variants:[chunk('c2501-s','SMALL',[2,8,17,20,25],'MEDIUM'),chunk('c2501-m','MEDIUM',[2,17,25],'HIGH'),chunk('c2501-l','LARGE',[17],'MEDIUM')],ai_expression_candidates:[expression('e2501-1','be based on','~에 근거하다','was based on',[4,5,6],'HIGH')]},
    'corpus:23568':{ai_chunk_variants:[chunk('c23568-s','SMALL',[6,14],'MEDIUM'),chunk('c23568-m','MEDIUM',[6],'HIGH')],ai_expression_candidates:[expression('e23568-1','mislead A into V-ing','A가 V하도록 잘못 이끌다','misleading a consumer into thinking',[2,3,4,5,6],'HIGH')]},
    'corpus:2581':{ai_chunk_variants:[chunk('c2581-s','SMALL',[5,9,14,17],'MEDIUM'),chunk('c2581-m','MEDIUM',[5,14],'HIGH'),chunk('c2581-l','LARGE',[14],'MEDIUM')],ai_expression_candidates:[expression('e2581-1','pull apart','분리하다','pull apart',[4,5],'HIGH')]},
    'corpus:2480':{ai_chunk_variants:[chunk('c2480-s','SMALL',[1,4,11,15,20,24,33,35],'MEDIUM'),chunk('c2480-m','MEDIUM',[1,15,20,33,35],'HIGH'),chunk('c2480-l','LARGE',[15,20,35],'MEDIUM')],ai_expression_candidates:[expression('e2480-1','from the perspective of ~','~의 관점에서','from the perspective of others',[26,27,28,29,30],'HIGH')]},
    'corpus:59087':{ai_chunk_variants:[chunk('c59087-s','SMALL',[6,12,15,20],'MEDIUM'),chunk('c59087-m','MEDIUM',[12,15,20],'HIGH'),chunk('c59087-l','LARGE',[12],'MEDIUM')],ai_expression_candidates:[]}
  }};root.ELAB_CHUNKING_AI_PROPOSALS=data;if(typeof module==='object'&&module.exports)module.exports=data;
})(globalThis);
