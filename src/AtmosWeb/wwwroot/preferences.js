(() => {
  const exportKey = 'spatial-export-settings-v1', noticeKey = 'spatial-notify-v1';
  let bridge, requesting = false, problem = '', persistent = true;
  const activity = new Set();
  function read(key) { try { return localStorage.getItem(key); } catch { persistent = false; return null; } }
  function save(key, value) { try { localStorage.setItem(key, value); return true; } catch { persistent = false; return false; } }
  let enabled = read(noticeKey) === '1';
  function status() {
    let supported = false, permission = 'unsupported';
    try {
      supported = isSecureContext && typeof Notification === 'function' && typeof Notification.requestPermission === 'function';
      if (supported) permission = Notification.permission;
    } catch { supported = false; permission = 'unsupported'; }
    if (permission !== 'granted') enabled = false;
    return { supported, enabled, requesting, permission, problem };
  }
  function emit() { if (bridge) void bridge.invokeMethodAsync('NoticeChanged', status()).catch(error => console.log(error)); }
  function leaveWarning(event) { event.preventDefault(); event.returnValue = ''; }
  async function toggleNotice() {
    const current = status();
    if (requesting || !current.supported || current.permission === 'denied') return;
    problem = '';
    if (enabled) { enabled = false; save(noticeKey, '0'); emit(); return; }
    requesting = true; emit();
    try {
      // This runs directly in the native click handler, preserving user activation.
      const permission = current.permission === 'default' ? await Notification.requestPermission() : current.permission;
      enabled = permission === 'granted'; save(noticeKey, enabled ? '1' : '0');
    } catch { enabled = false; problem = 'failed'; save(noticeKey, '0'); }
    finally { requesting = false; emit(); }
  }
  document.addEventListener('click', event => {
    const button = event.target.closest?.('[data-notification-toggle]');
    if (button && !button.disabled) void toggleNotice();
  });
  addEventListener('focus', () => { if (bridge) emit(); });
  window.spatialPreferences = {
    load(reference) {
      bridge = reference;
      let settings;
      try { settings = JSON.parse(read(exportKey) || 'null'); } catch {}
      const bitDepth = [16, 32].includes(settings?.bitDepth) ? settings.bitDepth : 32;
      const sampleRate = [44100, 48000, 96000].includes(settings?.sampleRate) ? settings.sampleRate : 48000;
      return { bitDepth, sampleRate, persistent, notice: status() };
    },
    saveExport(bitDepth, sampleRate) {
      if (![16, 32].includes(bitDepth) || ![44100, 48000, 96000].includes(sampleRate)) return false;
      return save(exportKey, JSON.stringify({ bitDepth, sampleRate }));
    },
    setActivity(kind, active) {
      const wasActive = activity.size > 0;
      if (active) activity.add(kind); else activity.delete(kind);
      if (!wasActive && activity.size) addEventListener('beforeunload', leaveWarning);
      if (wasActive && !activity.size) removeEventListener('beforeunload', leaveWarning);
    },
    complete(language, ready, failed) {
      if (!status().enabled) return false;
      const english = language === 'en';
      try {
        const title = english ? 'Conversion finished ✧' : 'Conversión terminada ✧';
        const body = english
          ? `${ready} ready${failed ? ` · ${failed} failed` : ''}. Return to the tab to review your files.`
          : `${ready} listos${failed ? ` · ${failed} con error` : ''}. Vuelve a la pestaña para revisar tus archivos.`;
        const notice = new Notification(title, { body, tag: 'spatial-conversion', icon: new URL('icon.svg', document.baseURI).href });
        notice.onclick = () => { window.focus(); notice.close(); };
        return true;
      } catch { enabled = false; problem = 'failed'; save(noticeKey, '0'); emit(); return false; }
    }
  };
})();
