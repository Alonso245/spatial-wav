(() => {
  const key = 'spatial-theme';
  let chosen;
  try { chosen = localStorage.getItem(key); } catch {}
  if (!['light', 'dark'].includes(chosen)) chosen = null;
  let button, chooser;
  function apply(theme) {
    document.documentElement.dataset.theme = theme;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.content = theme === 'dark' ? '#151c18' : '#f7f8f4';
    updateButton();
  }
  function updateButton() {
    if (!button) return;
    const dark = document.documentElement.dataset.theme === 'dark';
    const english = document.documentElement.lang === 'en';
    const label = dark ? (english ? 'Day mode' : 'Modo día') : (english ? 'Night mode' : 'Modo noche');
    button.querySelector('span').textContent = label;
    button.setAttribute('aria-label', label);
    button.setAttribute('aria-pressed', String(dark));
    button.title = label;
  }
  // Run in the document head, before styling or the WASM engine can paint.
  document.documentElement.toggleAttribute('data-theme-pending', !chosen);
  apply(chosen || 'dark');
  addEventListener('spatial-language-change', () => { updateButton(); updateChooser(); });
  addEventListener('storage', event => {
    if (event.key !== key) return;
    chosen = ['light', 'dark'].includes(event.newValue) ? event.newValue : null;
    if (chosen) select(chosen);
  });
  function select(theme) {
    chosen = theme;
    try { localStorage.setItem(key, chosen); } catch {}
    apply(chosen);
    document.documentElement.removeAttribute('data-theme-pending');
    const app = document.getElementById('app');
    if (app) app.inert = false;
    if (chooser) { chooser.close(); chooser.remove(); chooser = null; }
    button?.focus();
  }
  function updateChooser() {
    if (!chooser) return;
    const en = document.documentElement.lang === 'en';
    chooser.querySelectorAll('[data-choice-es]').forEach(element => {
      element.textContent = element.dataset[en ? 'choiceEn' : 'choiceEs'];
    });
  }
  function showChooser() {
    chooser = document.createElement('dialog');
    chooser.className = 'theme-choice';
    chooser.setAttribute('aria-labelledby', 'theme-choice-title');
    chooser.setAttribute('aria-describedby', 'theme-choice-description');
    chooser.innerHTML = '<p class="choice-brand">spatial / wav</p><h2 id="theme-choice-title" data-choice-es="Elige tu ambiente" data-choice-en="Choose your space"></h2><p id="theme-choice-description" class="choice-intro" data-choice-es="Un aspecto suave, de día o de noche." data-choice-en="A softer space, by day or by night."></p><div class="theme-options"><button type="button" class="theme-option" data-choice="light"><span class="theme-preview preview-day" aria-hidden="true"><i></i><b></b><i></i></span><strong data-choice-es="Modo claro" data-choice-en="Light mode"></strong><small data-choice-es="Cálido y natural" data-choice-en="Warm and natural"></small></button><button type="button" class="theme-option" data-choice="dark"><span class="theme-preview preview-night" aria-hidden="true"><i></i><b></b><i></i></span><strong data-choice-es="Modo noche" data-choice-en="Night mode"></strong><small data-choice-es="Tenue y tranquilo" data-choice-en="Soft and quiet"></small></button></div><p class="choice-note" data-choice-es="Puedes cambiarlo en cualquier momento." data-choice-en="You can change it at any time."></p>';
    chooser.querySelectorAll('[data-choice]').forEach(option => option.addEventListener('click', () => select(option.dataset.choice)));
    chooser.addEventListener('cancel', event => event.preventDefault());
    document.body.append(chooser);
    const app = document.getElementById('app');
    if (app) app.inert = true;
    updateChooser(); chooser.showModal();
    chooser.querySelector('[data-choice="dark"]').focus();
  }
  function mount() {
    button = document.createElement('button');
    button.type = 'button';
    button.className = 'theme-toggle';
    button.innerHTML = '<svg class="moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><path d="M20 14.2A8.2 8.2 0 0 1 9.8 4a8.2 8.2 0 1 0 10.2 10.2Z"/></svg><svg class="sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5"/></svg><span></span>';
    button.addEventListener('click', () => {
      select(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark');
    });
    // Outside the Blazor root: remains usable while the audio engine loads.
    document.body.append(button);
    updateButton();
    if (!chosen) showChooser();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', mount, { once: true });
  else mount();
})();
