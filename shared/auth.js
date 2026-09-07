(function () {
  'use strict';
  var config = Object.assign({ endpoint: '', teacherHome: '../teacher/index.html' }, window.ELAB_AUTH_CONFIG || {});
  var credentialKey = 'elab.teacher.credential';
  var form = document.querySelector('[data-auth-form="invite"]');
  if (!form) return;
  var submit = form.querySelector('[type="submit"]');
  var message = form.querySelector('[data-form-message]');

  function request(body) {
    return fetch(config.endpoint, { method: 'POST', headers: { 'Content-Type': 'text/plain;charset=UTF-8' }, body: JSON.stringify(body), credentials: 'omit' })
      .then(function (response) { return response.json(); });
  }
  function setLoading(loading, label) {
    submit.disabled = loading;
    submit.textContent = loading ? label : submit.dataset.idleLabel;
    form.setAttribute('aria-busy', String(loading));
  }
  function showError(code) {
    var messages = { INVITE_USED: '이미 사용된 초대코드입니다.', INVITE_EXPIRED: '만료된 초대코드입니다.', INVITE_REVOKED: '회수된 초대코드입니다.', INVITE_INVALID: '초대코드를 다시 확인해주세요.', INVITE_REQUIRED: '초대코드를 입력해주세요.', SERVER_NOT_CONFIGURED: '인증 서버 설정이 필요합니다. ELAB 관리자에게 문의해주세요.' };
    message.textContent = messages[code] || '인증 중 문제가 발생했습니다. 잠시 후 다시 시도해주세요.';
  }
  function clearCredential() { localStorage.removeItem(credentialKey); }

  window.ELABTeacherAuth = {
    logout: function () { clearCredential(); location.assign('../login/index.html'); },
    getCredential: function () { return localStorage.getItem(credentialKey) || ''; }
  };

  if (!config.endpoint) {
    showError('SERVER_NOT_CONFIGURED');
  } else {
    var saved = localStorage.getItem(credentialKey);
    if (saved) {
      setLoading(true, '접속 확인 중...');
      request({ action: 'validateTeacherCredential', credential: saved }).then(function (result) {
        if (!result.ok) { clearCredential(); setLoading(false, ''); return; }
        location.replace(config.teacherHome);
      }).catch(function () { setLoading(false, ''); });
    }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    message.textContent = '';
    var input = form.elements.inviteCode;
    var code = input.value.trim();
    if (!code) { showError('INVITE_REQUIRED'); input.focus(); return; }
    if (!config.endpoint) { showError('SERVER_NOT_CONFIGURED'); return; }
    setLoading(true, submit.dataset.loadingLabel);
    request({ action: 'redeemInviteCode', inviteCode: code }).then(function (result) {
      if (!result.ok || !result.credential) throw new Error(result.errorCode || 'AUTH_FAILED');
      localStorage.setItem(credentialKey, result.credential);
      location.assign(config.teacherHome);
    }).catch(function (error) { showError(error.message); setLoading(false, ''); });
  });
})();
