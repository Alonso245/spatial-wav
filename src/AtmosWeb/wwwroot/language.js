(() => {
  const key = 'spatial-language';
  let preferred;
  try { preferred = localStorage.getItem(key); } catch {}
  let language = (preferred || navigator.language || 'es').toLowerCase().startsWith('en') ? 'en' : 'es';
  function apply(value) {
    language = value === 'en' ? 'en' : 'es';
    document.documentElement.lang = language;
    document.title = language === 'en' ? 'spatial / wav · More room for your audio' : 'spatial / wav · Un poco más de espacio';
    const description = document.querySelector('meta[name="description"]');
    if (description) description.content = language === 'en'
      ? 'Convert E-AC-3/JOC to 9.1.6 WAV in your browser. Free, local processing without uploading your audio.'
      : 'Convierte E-AC-3/JOC a WAV 9.1.6 en tu navegador. Procesamiento local, gratuito y sin subir tu audio.';
    document.querySelectorAll('[data-es][data-en]').forEach(element => { element.textContent = element.dataset[language]; });
    document.querySelectorAll('[data-language]').forEach(button => { button.setAttribute('aria-pressed', String(button.dataset.language === language)); });
    dispatchEvent(new Event('spatial-language-change'));
  }
  window.spatialI18n = {
    get: () => language,
    set(value) { apply(value); try { localStorage.setItem(key, language); } catch {} }
  };
  apply(language);
})();
