(function(){
  'use strict';
  var script=document.currentScript,root=new URL('../',script.src);
  var sections=[
    {label:'수업 운영',items:[['home','홈','teacher/index.html'],['students','학생관리','teacher/students.html?v=student-server-cors-20260830-7'],['classes','Class','teacher/classes.html'],['dashboard','결과확인','teacher/dashboard.html'],['wrongnote','오답노트','wrongnote/index.html'],['lesson','수업활용','wrongnote/index.html']]},
    {label:'학습자료 만들기',items:[['pdf','PDF 자료관리','pdf/index.html?v=answer-review-status-28'],['vocab','단어암기','vocab/index.html'],['vocabulary-db','통합 어휘 DB','teacher/vocabulary-db.html'],['sentence','문장구조 연습','exam/index.html?tool=sentence-structure&v=connected-complete-24'],['grammar','문법학습','grammar/index.html'],['exam','개별문제','exam/index.html?v=connected-complete-24'],['practice','실전연습','practice/index.html'],['assignments','과제배정','teacher/assignments.html']]}
  ];
  var settings=['settings','환경설정','teacher/settings.html'];
  function item(x,active){return '<a class="eb-top-link '+(active===x[0]?'cur':'')+'" '+(active===x[0]?'aria-current="page"':'')+' href="'+new URL(x[2],root).href+'">'+x[1]+'</a>'}
  function render(host){
    var active=host.getAttribute('data-elab-nav')||'';document.body.setAttribute('data-elab-page',active);host.className='eb-nav-wrap';
    host.innerHTML='<header class="eb-topbar"><div class="eb-topbar-inner"><a class="eb-top-brand" href="'+new URL('teacher/index.html',root).href+'"><img src="'+new URL('shared/assets/ELAB_logo.svg',root).href+'" alt="ELAB"></a><nav class="eb-top-menu" aria-label="ELAB 주요 메뉴">'+sections.map(function(s){return '<span class="eb-top-group">'+s.label+'</span>'+s.items.map(function(x){return item(x,active)}).join('')}).join('')+'<span class="eb-top-separator" aria-hidden="true"></span>'+item(settings,active)+'</nav></div></header>';
    var current=host.querySelector('[aria-current="page"]');if(current)requestAnimationFrame(function(){current.scrollIntoView({block:'nearest',inline:'center'})});
  }
  function init(){if(!document.querySelector('[data-elab-nav]')&&/\/wrongnote\//.test(location.pathname)&&!(new URLSearchParams(location.search).get('student_id'))){var host=document.createElement('div');host.setAttribute('data-elab-nav','wrongnote');document.body.insertBefore(host,document.body.firstChild)}document.querySelectorAll('[data-elab-nav]').forEach(render)}
  window.ELABNav={sections:sections,render:render,init:init};if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init);else init();new MutationObserver(function(){document.querySelectorAll('[data-elab-nav]:empty').forEach(render)}).observe(document.documentElement,{childList:true,subtree:true});
})();

/* 과제배정에서 학습 메뉴로 들어온 경우, 기존 배정 링크를 같은 의미의 완료 동작으로 표시한다. */
(function(){
  if(new URLSearchParams(location.search).get('assignment_pick')!=='1')return;
  function sync(){
    document.querySelectorAll('a[href*="teacher/assignments.html"]').forEach(function(link){
      if(/content_(?:type|ref_id)=/.test(link.getAttribute('href')||''))link.textContent='과제선택 완료';
    });
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',sync);else sync();
  new MutationObserver(sync).observe(document.documentElement,{childList:true,subtree:true});
})();

/* Keep every teacher page title identical to its global menu label. */
(function(){
  'use strict';
  var titles={students:'학생관리',classes:'Class',assignments:'과제배정',dashboard:'결과확인',lesson:'수업활용',pdf:'PDF 자료관리',vocab:'단어암기','vocabulary-db':'V1~V5 통합 어휘 DB',sentence:'문장구조 연습',grammar:'문법학습',exam:'개별문제',practice:'실전연습',wrongnote:'오답노트',settings:'환경설정'};
  var lessonItem=window.ELABNav&&window.ELABNav.sections[0].items.filter(function(item){return item[0]==='lesson'})[0];
  if(lessonItem)lessonItem[2]='wrongnote/index.html?view=lesson';
  function syncPageTitle(){
    var host=document.querySelector('[data-elab-nav]');
    if(!host)return;
    var active=host.getAttribute('data-elab-nav');
    if(active==='wrongnote'&&new URLSearchParams(location.search).get('view')==='lesson'){
      host.setAttribute('data-elab-nav','lesson');
      window.ELABNav.render(host);
      return;
    }
    var title=titles[active];
    if(!title)return;
    var heading=document.querySelector('.eb-page-header h1, main.page > .head h1, main.shell > .header h1');
    if(heading&&heading.textContent.trim()!==title)heading.textContent=title;
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',syncPageTitle);else syncPageTitle();
  new MutationObserver(syncPageTitle).observe(document.documentElement,{childList:true,subtree:true});
})();
