// i18n-shim.js — Always load our own translations from locale files
// Supports: en, fr, ht (Kreyòl Ayisyen)
// We ALWAYS override miniappI18n to ensure our translations work in preview and production

(function () {
  let catalog = {};
  let flat = {};

  const AVAILABLE = ['en', 'fr', 'ht'];

  function detectLang() {
    const saved = localStorage.getItem('gc_lang');
    if (saved && AVAILABLE.includes(saved)) return saved;
    const browserLang = navigator.language || 'en';
    if (browserLang.startsWith('fr')) return 'fr';
    if (browserLang.startsWith('ht')) return 'ht';
    return 'en';
  }

  let currentLang = detectLang();

  async function loadLocale(lang) {
    try {
      const res = await fetch('locales/' + lang + '.json');
      if (res.ok) {
        catalog = await res.json();
        flat = flatten(catalog);
        console.log('[i18n] Loaded locale:', lang, '— keys:', Object.keys(flat).length);
      } else {
        console.warn('[i18n] Failed to load locale:', lang, res.status);
      }
    } catch (e) {
      console.warn('[i18n] Error loading locale:', lang, e);
    }
  }

  function flatten(obj, prefix) {
    prefix = prefix || '';
    const result = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      const fullKey = prefix ? prefix + '.' + key : key;
      if (typeof val === 'object' && val !== null) {
        Object.assign(result, flatten(val, fullKey));
      } else {
        result[fullKey] = val;
      }
    }
    return result;
  }

  async function switchLocale(code) {
    if (!AVAILABLE.includes(code)) return;
    currentLang = code;
    localStorage.setItem('gc_lang', code);
    await loadLocale(code);
    document.documentElement.lang = code;
    window.dispatchEvent(new CustomEvent('localeChanged', { detail: { locale: code } }));
  }

  // Always create our own miniappI18n, overriding platform's if needed
  const readyPromise = loadLocale(currentLang).then(() => {
    document.documentElement.lang = currentLang;
  });

  window.miniappI18n = {
    get _flat() { return flat; },
    t: function(key, values) {
      let str = flat[key] || key;
      if (values) {
        for (const k of Object.keys(values)) {
          str = str.split('{' + k + '}').join(values[k]);
        }
      }
      return str;
    },
    getContext: function() {
      return {
        resolvedLocale: currentLang,
        dir: 'ltr',
        availableLocales: AVAILABLE,
        canChangeLocale: true,
      };
    },
    setLocale: function(code) {
      return switchLocale(code);
    },
    ready: readyPromise,
  };
})();
