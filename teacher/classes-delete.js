document.addEventListener('DOMContentLoaded',function(){
  function syncDeleteButtons(){
    document.querySelectorAll('#classList [data-toggle]').forEach(function(button){
      var card=button.closest('.card');
      if(!card)return;
      if(Number(card.style.opacity)<1){card.style.display='none';return;}
      if(button.textContent!=='삭제')button.textContent='삭제';
      button.setAttribute('aria-label','Class 삭제');
      if(!button.dataset.deleteBound){button.dataset.deleteBound='true';button.addEventListener('click',function(){setTimeout(function(){var status=document.getElementById('classStatus');if(status)status.textContent='Class를 삭제했습니다.'},0)})}
    });
  }
  syncDeleteButtons();
  new MutationObserver(syncDeleteButtons).observe(document.getElementById('classList'),{childList:true,subtree:true});
});
