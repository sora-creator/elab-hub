document.addEventListener('DOMContentLoaded',function(){
  var key='elab.classes.view.cache.v1',classList=document.getElementById('classList'),individualList=document.getElementById('individualList'),scheduleBody=document.getElementById('scheduleBody');
  try{
    var cached=JSON.parse(localStorage.getItem(key)||'null');
    if(cached){classList.innerHTML=cached.classes||'';individualList.innerHTML=cached.individuals||'';scheduleBody.innerHTML=cached.schedule||'';}
  }catch(e){}
  var timer;
  function save(){clearTimeout(timer);timer=setTimeout(function(){if(!classList.innerHTML||/불러오지 못했습니다/.test(classList.textContent))return;try{localStorage.setItem(key,JSON.stringify({classes:classList.innerHTML,individuals:individualList.innerHTML,schedule:scheduleBody.innerHTML,at:Date.now()}))}catch(e){}},100)}
  new MutationObserver(save).observe(classList,{childList:true,subtree:true});
  new MutationObserver(save).observe(individualList,{childList:true,subtree:true});
  new MutationObserver(save).observe(scheduleBody,{childList:true,subtree:true});
});
