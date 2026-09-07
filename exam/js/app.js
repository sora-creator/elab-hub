/* =====================================================================
   앱 상태 / 라우팅
   exam/index.html 리팩터링 8단계 — TeacherApp/StudentApp/SentenceStudentApp에 의존.
   가장 마지막에 로드되어 나머지 스크립트를 엮고 boot()으로 앱을 시작한다.
===================================================================== */
const appState = {
  mode: 'loading',
  session: '',
  hook: '',
  studyKey: '',
  nums: '',
  teacher: {
    tab: 'make',
    draft: null,
    tool: ''
  },
  ui: {
    loading: false,
    error: ''
  }
};

function setAppState(patch){
  Object.assign(appState, patch);
  if(patch.teacher){ appState.teacher = { ...appState.teacher, ...patch.teacher }; }
  if(patch.ui){ appState.ui = { ...appState.ui, ...patch.ui }; }
  return appState;
}

function renderMode(){
  const { mode, session, hook, nums, studyKey } = appState;
  document.title = mode === 'teacher' ? 'ELAB · 교사용' : 'ELAB · 학생용';
  if(mode === 'student') return StudentApp.init(session, hook, nums);
  if(mode === 'sentenceStudent') return SentenceStructureTokenApp.init(studyKey, hook);
  return TeacherApp.init();
}

async function boot(){
  const params = new URLSearchParams(location.search);
  const session = params.get('session');
  const studyKey = params.get('study');
  const hook = params.get('hook') || '';
  const nums = params.get('nums') || '';

  if(session){
    setAppState({ mode:'student', session, hook, nums });
  } else if(studyKey){
    setAppState({ mode:'sentenceStudent', studyKey, hook });
  } else {
    appState.teacher.tool = params.get('tool') || '';
    setAppState({ mode:'teacher' });
    if(typeof preloadPassageDB==='function')await preloadPassageDB();
  }

  renderMode();
}

boot();
