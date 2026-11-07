(() => {
  const report = message => {
    const invoke = window.__TAURI__ && window.__TAURI__.core && window.__TAURI__.core.invoke;
    if (invoke) invoke('frontend_log', { message: String(message) }).catch(() => {});
  };

  window.addEventListener('error', event => {
    const detail = event.error && event.error.stack ? event.error.stack : event.message;
    report(`error: ${detail || 'Unable to load the application module'} at ${event.filename || 'unknown'}:${event.lineno || 0}:${event.colno || 0}`);
    if(!window.__TAURI__){document.body.dataset.startupError=String(detail||event.message||'unknown');}
  });
  window.addEventListener('unhandledrejection', event => {
    const reason = event.reason && event.reason.stack ? event.reason.stack : event.reason;
    report(`unhandled rejection: ${reason || 'unknown reason'}`);
    if(!window.__TAURI__){document.body.dataset.startupError=String(reason||'unknown rejection');}
  });
  window.setTimeout(() => {
    if (!window.__MUSIC_PLAYER_APP_READY__) report('app.js did not reach startup within 1500ms');
  }, 1500);
})();
