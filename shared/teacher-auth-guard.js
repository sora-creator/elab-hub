(function () {
  'use strict';
  var config = Object.assign({ endpoint: '', login: '../login/index.html' }, window.ELAB_AUTH_CONFIG || {});
  var key = 'elab.teacher.credential';
  var credential = localStorage.getItem(key) || '';
  document.documentElement.style.visibility = 'hidden';

  function leave() {
    localStorage.removeItem(key);
    location.replace(config.login || '../login/index.html');
  }
  window.ELABTeacherAuth = { logout: leave, getCredential: function () { return localStorage.getItem(key) || ''; } };
  if (!credential || !config.endpoint) { leave(); return; }

  fetch(config.endpoint, {
    method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, credentials: 'omit',
    body: JSON.stringify({ action: 'validateTeacherCredential', credential: credential })
  }).then(function (response) { return response.json(); }).then(function (result) {
    if (!result.ok) { leave(); return; }
    document.documentElement.style.visibility = '';
  }).catch(leave);

  document.addEventListener('click', function (event) {
    if (event.target.closest('[data-teacher-logout]')) leave();
  });
})();
