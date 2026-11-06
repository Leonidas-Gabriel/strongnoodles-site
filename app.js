  // ---------- Formulare über Google Apps Script ----------
  // Bestell- und Kontaktformular gehen an eine Google-Apps-Script-Web-App (google-sheet/Code.gs).
  // Bestellungen schreibt sie als neue Zeile ins Blatt "Bestellungen" und schickt uns eine Mail,
  // Kontaktnachrichten leitet sie nur per Mail weiter. Einrichtung: siehe SETUP-BESTELLUNGEN-SHEET.md.
  // WEBAPP_URL: die Web-App-URL (endet auf /exec). Leer = Fallback über das E-Mail-Programm (mailto:).
  const WEBAPP_URL = 'https://script.google.com/macros/s/AKfycbwnWYxK_p-tEKcEaOKLwix0lJc8AL16naMJxosZNiLLNbNK1GeBojMgnUJ_vhbiOBVZ/exec';
  // WEBAPP_TOKEN: muss mit TOKEN in google-sheet/Code.gs übereinstimmen. Kein echtes Geheimnis
  // (steht öffentlich hier), hält aber Bots ab, die die URL zufällig finden.
  const WEBAPP_TOKEN = 'sn-bestellung-4q8z2m7k';

  // ---------- Sprachen ----------
  // Der deutsche Text im HTML ist die Quelle. Übersetzungen liegen in i18n/<code>.js als
  // { "deutscher Text": "Übersetzung" } und werden mit tools/translate.mjs über DeepL erzeugt.
  // Fehlt ein Eintrag, bleibt einfach der deutsche Text stehen.
  // Nie übersetzen: translate="no". Von JS selbst gepflegte Texte: data-i18n-skip.
  const LANGS = {
    de: { locale: 'de-CH' },
    en: { locale: 'en-GB' },
    fr: { locale: 'fr-CH' },
    it: { locale: 'it-CH' },
    nl: { locale: 'nl-NL' },
    sv: { locale: 'sv-SE' },
    tr: { locale: 'tr-TR' }
  };
  const LANG_KEY = 'snLang';
  const I18N_VERSION = '6';
  const I18N_ATTRS = ['aria-label', 'placeholder', 'title', 'alt', 'data-mail-text'];
  const LETTER = /\p{L}/u;
  let currentLang = 'de';
  let dict = {};
  const t = (s) => dict[s] || s;
  const loc = () => LANGS[currentLang].locale;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  // Deutschen Originalinhalt merken, bevor der restliche Code die Seite verändert
  const i18nEls = new Map();
  const i18nAttrs = new Map();
  document.body.querySelectorAll('*').forEach((el) => {
    if (el.closest('[data-i18n-skip], script, style, noscript, svg')) { return; }
    const attrs = {};
    I18N_ATTRS.forEach((a) => { const v = el.getAttribute(a); if (v && LETTER.test(v)) { attrs[a] = v; } });
    if (Object.keys(attrs).length) { i18nAttrs.set(el, attrs); }
    if (el.closest('[translate="no"]')) { return; }
    const ownText = [...el.childNodes].some((n) => n.nodeType === 3 && LETTER.test(n.nodeValue));
    if (!ownText) { return; }
    for (let p = el.parentElement; p; p = p.parentElement) { if (i18nEls.has(p)) { return; } }
    i18nEls.set(el, el.innerHTML.trim());
  });

  const langSelect = document.getElementById('langSelect');
  const langCode = document.getElementById('langCode');

  // Als <script> laden statt per fetch: funktioniert so auch, wenn index.html direkt aus dem Ordner geöffnet wird
  function loadDict(lang) {
    return new Promise((resolve, reject) => {
      const ready = () => window.SN_I18N && window.SN_I18N[lang];
      if (ready()) { resolve(ready()); return; }
      const s = document.createElement('script');
      s.src = `i18n/${lang}.js?v=${I18N_VERSION}`;
      s.onload = () => (ready() ? resolve(ready()) : reject(new Error('leer')));
      s.onerror = () => reject(new Error('nicht gefunden'));
      document.head.appendChild(s);
    });
  }

  async function setLanguage(lang, save) {
    if (!LANGS[lang]) { lang = 'de'; }
    dict = {};
    if (lang !== 'de') {
      try { dict = await loadDict(lang); } catch (err) { lang = 'de'; }
    }
    currentLang = lang;
    if (save) { try { localStorage.setItem(LANG_KEY, lang); } catch (err) { /* ignorieren */ } }
    i18nEls.forEach((src, el) => { el.innerHTML = t(src); });
    i18nAttrs.forEach((attrs, el) => { Object.entries(attrs).forEach(([a, src]) => el.setAttribute(a, t(src))); });
    document.documentElement.lang = lang === 'de' ? 'de-CH' : lang;
    langSelect.value = lang;
    langCode.textContent = lang.toUpperCase();
    langSelect.setAttribute('aria-label', t('Sprache wählen'));
    document.dispatchEvent(new CustomEvent('langchange'));
    document.documentElement.classList.remove('i18n-pending');
  }
  langSelect.addEventListener('change', () => setLanguage(langSelect.value, true));

  // Für tools/translate.mjs: alle deutschen Quelltexte sammeln (Aufruf über die Browser-Konsole,
  // Seite dafür über einen lokalen Server öffnen, nicht direkt aus dem Ordner)
  window.__i18nSource = async () => {
    const js = await fetch('app.js', { cache: 'no-store' }).then((r) => r.text());
    const text = new Set(Object.values(pageTitles));
    for (const m of js.matchAll(/\bt\('((?:[^'\\]|\\.)*)'\)/g)) { text.add(m[1].replace(/\\'/g, "'")); }
    i18nAttrs.forEach((attrs) => Object.values(attrs).forEach((v) => text.add(v)));
    const html = [...new Set(i18nEls.values())];
    return { html, text: [...text].filter((s) => !html.includes(s)) };
  };

  // ---------- Dunkelmodus ----------
  // Startet immer im Hellmodus, ausser die Person hat den Umschalter selbst schon einmal benutzt
  // (die Wahl wird in localStorage gemerkt; das kleine Inline-Skript im <head> wendet sie sofort an,
  // damit die Seite nicht erst hell aufblitzt).
  const themeToggle = document.getElementById('themeToggle');
  const THEME_KEY = 'snTheme';
  function syncThemeButton() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    themeToggle.setAttribute('aria-pressed', String(isDark));
    themeToggle.setAttribute('aria-label', isDark ? t('Hellmodus aktivieren') : t('Dunkelmodus aktivieren'));
  }
  syncThemeButton();
  document.addEventListener('langchange', syncThemeButton);
  themeToggle.addEventListener('click', () => {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    if (isDark) { document.documentElement.removeAttribute('data-theme'); }
    else { document.documentElement.setAttribute('data-theme', 'dark'); }
    try { localStorage.setItem(THEME_KEY, isDark ? 'light' : 'dark'); } catch (err) { /* ignorieren */ }
    syncThemeButton();
  });

  const buttons = document.querySelectorAll('[data-page]');
  const pages = document.querySelectorAll('.page');
  const navLinks = document.getElementById('navLinks');
  const navToggle = document.getElementById('navToggle');
  const mainEl = document.getElementById('main');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const validPages = ['home', 'team', 'idea', 'order', 'reviews', 'contact', 'impressum', 'privacy', 'accessibility'];
  const pageTitles = {
    home: 'Strongnoodles – High-Protein Pasta aus Zug',
    team: 'Unser Team – Strongnoodles',
    idea: 'Proteinrechner – Strongnoodles',
    order: 'Bestellen – Strongnoodles',
    reviews: 'Bewertungen – Strongnoodles',
    contact: 'Kontakt – Strongnoodles',
    impressum: 'Impressum – Strongnoodles',
    privacy: 'Datenschutzerklärung – Strongnoodles',
    accessibility: 'Barrierefreiheit – Strongnoodles'
  };

  function runCounters() {
    if (reduceMotion.matches) { return; }
    document.querySelectorAll('[data-count]').forEach((el) => {
      if (el.dataset.done) { return; }
      el.dataset.done = '1';
      const target = parseInt(el.dataset.count, 10);
      const start = performance.now();
      (function tick(now) {
        const t = Math.min(1, (now - start) / 1100);
        el.textContent = Math.round(target * (1 - Math.pow(1 - t, 3)));
        if (t < 1) { requestAnimationFrame(tick); }
      })(start);
    });
  }

  let currentPage = 'home';
  document.addEventListener('langchange', () => { document.title = t(pageTitles[currentPage]); });

  function showPage(id, moveFocus) {
    currentPage = id;
    pages.forEach(p => p.classList.toggle('active', p.id === id));

    document.querySelectorAll('.nav-links button').forEach(b => {
      const isActive = b.dataset.page === id;
      b.classList.toggle('active', isActive);
      if (isActive) { b.setAttribute('aria-current', 'page'); }
      else { b.removeAttribute('aria-current'); }
    });

    navLinks.classList.remove('open');
    navToggle.classList.remove('open');
    navToggle.setAttribute('aria-expanded', 'false');

    document.title = t(pageTitles[id]);
    if (id === 'home') { runCounters(); }
    document.dispatchEvent(new CustomEvent('pageshown', { detail: id }));
    window.scrollTo({ top: 0, behavior: reduceMotion.matches ? 'auto' : 'smooth' });

    if (moveFocus) {
      document.getElementById(id).focus({ preventScroll: true });
    }
  }

  buttons.forEach(btn => {
    btn.addEventListener('click', () => {
      const pageId = btn.dataset.page;
      if (window.location.hash === '#' + pageId) {
        // Hash doesn't change, so hashchange won't fire
        showPage(pageId, true);
      } else {
        // hashchange triggers handleRoute, which shows the page
        window.location.hash = pageId;
      }
    });
  });

  navToggle.addEventListener('click', () => {
    const isOpen = navLinks.classList.toggle('open');
    navToggle.classList.toggle('open', isOpen);
    navToggle.setAttribute('aria-expanded', String(isOpen));
  });

  // Burger-Menü auch auf breiten Bildschirmen, sobald die Menüpunkte (je nach Sprache) nicht in eine Zeile passen
  const headerEl = document.querySelector('header');
  const brandEl = document.querySelector('.brand');
  const navRight = document.querySelector('.nav-right');
  const narrowScreen = window.matchMedia('(max-width: 860px)');
  function fitNav() {
    const wasCompact = headerEl.classList.contains('nav-compact');
    headerEl.classList.remove('nav-compact');
    let compact = false;
    if (!narrowScreen.matches) {
      const nav = navLinks.parentElement.parentElement;
      const tooTall = [...navLinks.querySelectorAll('button')].some((b) => b.offsetHeight > 40);
      compact = tooTall || nav.scrollWidth > nav.clientWidth
        || navRight.getBoundingClientRect().left < brandEl.getBoundingClientRect().right + 24;
    }
    headerEl.classList.toggle('nav-compact', compact);
    if (wasCompact && !compact) {
      navLinks.classList.remove('open');
      navToggle.classList.remove('open');
      navToggle.setAttribute('aria-expanded', 'false');
    }
  }
  let fitNavQueued = false;
  window.addEventListener('resize', () => {
    if (fitNavQueued) { return; }
    fitNavQueued = true;
    requestAnimationFrame(() => { fitNavQueued = false; fitNav(); });
  });
  document.addEventListener('langchange', fitNav);
  fitNav();
  if (document.fonts) { document.fonts.ready.then(fitNav); }

  document.getElementById('skipLink').addEventListener('click', (e) => {
    e.preventDefault();
    mainEl.focus({ preventScroll: false });
  });

  function handleRoute(event) {
    const hash = window.location.hash.replace('#', '');
    const id = validPages.includes(hash) ? hash : 'home';
    showPage(id, Boolean(event));
  }

  window.addEventListener('hashchange', handleRoute);
  handleRoute();

  // ---------- Formulare ----------
  const CONTACT_EMAIL = 'info@strongnoodles.ch';

  function showAlert(el, text, isError) {
    el.textContent = text;
    el.classList.toggle('is-error', Boolean(isError));
    el.style.display = 'block';
  }

  function showMailAlert(el) {
    el.textContent = el.dataset.mailText + ' ';
    const a = document.createElement('a');
    a.href = 'mailto:' + CONTACT_EMAIL;
    a.textContent = CONTACT_EMAIL;
    el.append(a, '.');
    el.classList.remove('is-error');
    el.style.display = 'block';
  }

  // fields: { Label: value } für die Mail. data: was die Web-App bekommt (type 'order' oder 'contact').
  // Sendet an die Web-App und wartet auf deren Antwort { ok: true }. Ohne WEBAPP_URL: mailto:.
  async function submitForm({ form, alertEl, subject, fields, data, okText }) {
    const submitBtn = form.querySelector('button[type=submit]');
    const text = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');

    if (!WEBAPP_URL) {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      showMailAlert(alertEl);
      return true;
    }

    submitBtn.disabled = true;
    try {
      // text/plain = "einfache" Anfrage ohne CORS-Preflight, die Apps Script annimmt. Die Antwort
      // (JSON) ist lesbar, so wissen wir, ob die Bestellung wirklich im Sheet bzw. die Mail raus ist.
      const res = await fetch(WEBAPP_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ token: WEBAPP_TOKEN, subject, summary: text, ...data })
      });
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      const result = await res.json();
      if (!result.ok) { throw new Error(result.error || 'Web-App meldet Fehler'); }
      showAlert(alertEl, okText, false);
      form.reset();
      return true;
    } catch (err) {
      console.warn('Formular konnte nicht gesendet werden:', err);
      showAlert(alertEl, t('Das Senden hat leider nicht geklappt. Bitte versuch es nochmals oder schreib uns direkt an {email}.').replace('{email}', CONTACT_EMAIL), true);
      return false;
    } finally {
      submitBtn.disabled = false;
    }
  }

  const contactForm = document.getElementById('contactForm');
  const formAlert = document.getElementById('formAlert');

  contactForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('name').value.trim();
    const email = document.getElementById('email').value.trim();
    const message = document.getElementById('message').value.trim();
    submitForm({
      form: contactForm,
      alertEl: formAlert,
      subject: `Nachricht von ${name} über die Strongnoodles-Website`,
      fields: { Name: name, 'E-Mail': email, Nachricht: message },
      data: { type: 'contact', name, email, message },
      okText: t('Danke für deine Nachricht! Wir melden uns so bald wie möglich.')
    });
  });

  // ---------- Proteinrechner ----------
  const PROTEIN_PER_100G_PASTA = 33; // g Protein pro 100 g Strongnoodles (laut Nährwerttabelle)

  const calcAgeInput = document.getElementById('calcAge');
  const calcGenderInput = document.getElementById('calcGender');
  const calcHeightInput = document.getElementById('calcHeight');
  const calcWeightInput = document.getElementById('calcWeight');
  const calcActivityInput = document.getElementById('calcActivity');
  const calcBtn = document.getElementById('calcBtn');
  const calcResult = document.getElementById('calcResult');

  // Beschriftung der gewählten Option (ist bereits übersetzt); Klammerzusatz weglassen
  const optionLabel = (select) => select.options[select.selectedIndex].text.replace(/\s*\(.*\)\s*$/, '');

  function runCalc() {
    const age = parseFloat(calcAgeInput.value);
    const gender = calcGenderInput.value;
    const height = parseFloat(calcHeightInput.value);
    const weight = parseFloat(calcWeightInput.value);
    const activityFactor = parseFloat(calcActivityInput.value);

    const valid = age && height && weight
      && age >= 10 && age <= 100
      && height >= 120 && height <= 230
      && weight >= 20 && weight <= 250;

    if (!valid) {
      calcResult.innerHTML = `<p class="calc-error">${esc(t('Bitte gib ein gültiges Alter (10–100), eine gültige Grösse (120–230 cm) und ein gültiges Gewicht (20–250 kg) ein.'))}</p>`;
      return;
    }

    // Fettfreie Körpermasse (Boer-Formel)
    let leanMass;
    if (gender === 'male') {
      leanMass = 0.407 * weight + 0.267 * height - 19.2;
    } else {
      leanMass = 0.252 * weight + 0.473 * height - 48.3;
    }
    leanMass = Math.max(leanMass, weight * 0.5); // Sicherheitsnetz gegen unrealistische Werte

    // Alters-Zuschlag: Wachstum bei Jugendlichen, Muskelerhalt im Alter
    let ageAdjust = 0;
    if (age < 18) { ageAdjust = 0.2; }
    else if (age >= 65) { ageAdjust = 0.2; }

    const proteinPerKgLeanMass = activityFactor + ageAdjust;
    const dailyProteinNeed = leanMass * proteinPerKgLeanMass;
    const pastaGrams = (dailyProteinNeed / PROTEIN_PER_100G_PASTA) * 100;

    calcResult.innerHTML = `
      <div class="calc-result-content">
        <div class="calc-big">${pastaGrams.toFixed(0)}&nbsp;g</div>
        <p class="calc-sub">${esc(t('Strongnoodles (trocken) pro Tag, um deinen Proteinbedarf mit der Pasta zu decken.'))}</p>
        <div class="calc-detail"><span>${esc(t('Alter'))}</span><span>${esc(t('{n} Jahre').replace('{n}', age))}</span></div>
        <div class="calc-detail"><span>${esc(t('Geschlecht'))}</span><span>${esc(optionLabel(calcGenderInput))}</span></div>
        <div class="calc-detail"><span>${esc(t('Grösse / Gewicht'))}</span><span>${height} cm / ${weight} kg</span></div>
        <div class="calc-detail"><span>${esc(t('Aktivitätslevel'))}</span><span>${esc(optionLabel(calcActivityInput))}</span></div>
        <div class="calc-detail"><span>${esc(t('Fettfreie Körpermasse (geschätzt)'))}</span><span>${leanMass.toFixed(1)} kg</span></div>
        <div class="calc-detail"><span>${esc(t('Täglicher Proteinbedarf'))}</span><span>${dailyProteinNeed.toFixed(0)} g</span></div>
        <div class="calc-detail"><span>${esc(t('Protein in Strongnoodles'))}</span><span>${PROTEIN_PER_100G_PASTA} g / 100 g</span></div>
      </div>
    `;
  }

  calcBtn.addEventListener('click', () => { runCalc(); const r = calcBtn.getBoundingClientRect(); burst(r.left + r.width / 2, r.top); });
  document.addEventListener('langchange', () => { if (calcResult.querySelector('.calc-result-content, .calc-error')) { runCalc(); } });
  [calcAgeInput, calcHeightInput, calcWeightInput].forEach((input) => {
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { runCalc(); }
    });
  });

  // ---------- Bestellformular ----------
  const orderForm = document.getElementById('orderForm');
  const orderAlert = document.getElementById('orderAlert');
  const orderQty = document.getElementById('orderQty');

  // Einzige Quelle für Preise: alle Stellen mit data-price / data-shipping / data-payment werden daraus befüllt.
  const PRICE_CENTS = 900; // CHF 9.00 pro Packung
  const SHIPPING_TEXT = 'werden später festgelegt'; // Lieferkosten (Plural) stehen noch nicht fest
  const PAYMENT_METHOD = 'TWINT';
  const orderTotal = document.getElementById('orderTotal');
  const formatChf = (cents) => 'CHF ' + (cents / 100).toFixed(2);

  document.querySelectorAll('[data-price]').forEach((el) => { el.textContent = formatChf(PRICE_CENTS).replace(' ', ' '); });
  document.querySelectorAll('[data-shipping]').forEach((el) => { el.textContent = SHIPPING_TEXT; });
  document.querySelectorAll('[data-payment]').forEach((el) => { el.textContent = PAYMENT_METHOD; });
  orderTotal.textContent = formatChf(PRICE_CENTS);

  function currentQty() {
    return Math.min(99, Math.max(1, parseInt(orderQty.value, 10) || 1));
  }
  function updateTotal() {
    const subtotal = currentQty() * PRICE_CENTS;
    orderTotal.textContent = formatChf(subtotal);
    orderTotal.classList.remove('bump'); void orderTotal.offsetWidth; orderTotal.classList.add('bump');
  }
  function changeQty(delta) {
    orderQty.value = Math.min(99, Math.max(1, currentQty() + delta));
    updateTotal();
  }
  orderQty.addEventListener('input', updateTotal);
  document.getElementById('qtyMinus').addEventListener('click', () => changeQty(-1));
  document.getElementById('qtyPlus').addEventListener('click', () => changeQty(1));

  orderForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const val = (id) => document.getElementById(id).value.trim();
    const qty = currentQty();
    const note = val('orderNote');
    const sheetOrder = {
      type: 'order', name: val('orderName'), email: val('orderEmail'), street: val('orderStreet'),
      zip: val('orderZip'), city: val('orderCity'), qty, note
    };

    const packs = `${qty} Packung${qty === 1 ? '' : 'en'}`;
    const sb = orderForm.querySelector('button[type=submit]').getBoundingClientRect();
    burst(sb.left + sb.width / 2, sb.top);

    submitForm({
      form: orderForm,
      alertEl: orderAlert,
      subject: `Bestellung von ${val('orderName')} (${packs})`,
      fields: {
        Menge: packs,
        Preis: `${formatChf(PRICE_CENTS)} pro Packung, Zwischensumme ${formatChf(qty * PRICE_CENTS)} (ohne Lieferkosten)`,
        Lieferkosten: SHIPPING_TEXT,
        Zahlungsmethode: PAYMENT_METHOD,
        Lieferadresse: `${val('orderName')}, ${val('orderStreet')}, ${val('orderZip')} ${val('orderCity')}`,
        'E-Mail': val('orderEmail'),
        ...(note ? { Bemerkung: note } : {})
      },
      data: sheetOrder,
      okText: t('Danke für deine Bestellung! Wir melden uns mit den Lieferdetails und den TWINT-Infos.')
    }).then(() => { updateTotal(); });
  });

  // ---------- Bewertungen (Supabase) ----------
  // Einrichtung: siehe SETUP-BEWERTUNGEN.md. Der anon-Key ist öffentlich gedacht, den Schutz übernehmen die
  // Zeilen-Regeln (RLS) in der Datenbank. Den "service_role"-Key NIEMALS hier eintragen.
  const SUPABASE_URL = 'https://kvtiggpqamlwiylfnhag.supabase.co';
  const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imt2dGlnZ3BxYW1sd2l5bGZuaGFnIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTA3NTQzMTYsImV4cCI6MjEwNjMzMDMxNn0.-452RJEbb_Jpf2HBEbdj7HbR3DsICpEi6q4JhKDfFxU';  // "anon public" Key
  const REVIEWS_PAGE_SIZE = 10;

  const revSummary = document.getElementById('revSummary');
  const revList = document.getElementById('revList');
  const revMore = document.getElementById('revMore');
  const revForm = document.getElementById('reviewForm');
  const revAlert = document.getElementById('revAlert');
  const revComment = document.getElementById('revComment');
  const revCounter = document.getElementById('revCounter');
  const revAdminToggle = document.getElementById('revAdminToggle');
  const revAdminBox = document.getElementById('revAdminBox');
  const revLoginForm = document.getElementById('revLoginForm');
  const revAdminOn = document.getElementById('revAdminOn');
  const revAdminAlert = document.getElementById('revAdminAlert');

  const reviewsConfigured = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
  let allReviews = [];
  let shownCount = REVIEWS_PAGE_SIZE;
  let reviewsLoaded = false;
  let adminToken = null;

  try {
    const saved = JSON.parse(sessionStorage.getItem('revAdmin') || 'null');
    if (saved && saved.token && saved.exp > Date.now()) { adminToken = saved.token; }
  } catch (err) { adminToken = null; }

  function sbHeaders(extra) {
    return Object.assign({
      apikey: SUPABASE_ANON_KEY,
      Authorization: 'Bearer ' + (adminToken || SUPABASE_ANON_KEY),
      'Content-Type': 'application/json'
    }, extra || {});
  }

  function starsEl(n) {
    const s = document.createElement('span');
    s.className = 'rev-stars';
    s.setAttribute('role', 'img');
    s.setAttribute('aria-label', t('{n} von 5 Sternen').replace('{n}', n));
    for (let i = 1; i <= 5; i++) {
      const star = document.createElement('span');
      star.textContent = '★';
      if (i > n) { star.className = 'off'; }
      s.appendChild(star);
    }
    return s;
  }

  function renderSummary() {
    revSummary.replaceChildren();
    if (!allReviews.length) { revSummary.style.display = 'none'; return; }
    revSummary.style.display = '';
    const avg = allReviews.reduce((sum, r) => sum + r.stars, 0) / allReviews.length;
    const big = document.createElement('div');
    big.className = 'rev-avg';
    big.textContent = avg.toLocaleString(loc(), { minimumFractionDigits: 1, maximumFractionDigits: 1 });
    const text = document.createElement('div');
    text.className = 'rev-summary-text';
    text.textContent = `${t('von 5')} · ${(allReviews.length === 1 ? t('{n} Bewertung') : t('{n} Bewertungen')).replace('{n}', allReviews.length)}`;
    revSummary.append(big, starsEl(Math.round(avg)), text);
  }

  function renderReviews() {
    revList.replaceChildren();
    if (!allReviews.length) {
      const p = document.createElement('p');
      p.className = 'rev-empty';
      p.textContent = t('Noch keine Bewertungen. Sei die erste Person!');
      revList.appendChild(p);
      revMore.hidden = true;
      return;
    }
    allReviews.slice(0, shownCount).forEach((r) => {
      const item = document.createElement('article');
      item.className = 'rev-item';
      const head = document.createElement('div');
      head.className = 'rev-head';
      const name = document.createElement('span');
      name.className = 'rev-name';
      name.textContent = r.name || t('Anonym');
      const date = document.createElement('span');
      date.className = 'rev-date';
      date.textContent = new Date(r.created_at).toLocaleDateString(loc());
      head.append(name, starsEl(r.stars), date);
      const comment = document.createElement('p');
      comment.className = 'rev-comment';
      comment.textContent = r.comment;
      item.append(head, comment);
      if (adminToken) {
        const del = document.createElement('button');
        del.type = 'button';
        del.className = 'rev-delete';
        del.textContent = t('Löschen');
        del.addEventListener('click', () => deleteReview(r.id));
        item.appendChild(del);
      }
      revList.appendChild(item);
    });
    revMore.hidden = allReviews.length <= shownCount;
  }

  function renderAdminState() {
    revLoginForm.hidden = Boolean(adminToken);
    revAdminOn.hidden = !adminToken;
    revAdminToggle.textContent = adminToken ? t('Admin (angemeldet)') : t('Admin');
  }

  async function loadReviews() {
    if (!reviewsConfigured) {
      revSummary.style.display = 'none';
      const p = document.createElement('p');
      p.className = 'rev-note';
      p.textContent = t('Die Bewertungen sind bald verfügbar.');
      revList.replaceChildren(p);
      revForm.querySelectorAll('input, textarea, button').forEach((el) => { el.disabled = true; });
      return;
    }
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?select=id,created_at,name,stars,comment&order=created_at.desc&limit=200`, { headers: sbHeaders() });
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      allReviews = await res.json();
      reviewsLoaded = true;
      renderSummary();
      renderReviews();
    } catch (err) {
      const p = document.createElement('p');
      p.className = 'rev-note';
      p.textContent = t('Die Bewertungen konnten gerade nicht geladen werden. Bitte versuch es später nochmals.');
      revList.replaceChildren(p);
    }
  }

  async function deleteReview(id) {
    if (!window.confirm(t('Diese Bewertung wirklich löschen?'))) { return; }
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews?id=eq.${encodeURIComponent(id)}`, {
        method: 'DELETE',
        headers: sbHeaders({ Prefer: 'return=representation' })
      });
      if (res.status === 401 || res.status === 403) { adminLogout(); showAlert(revAdminAlert, t('Deine Anmeldung ist abgelaufen. Bitte melde dich erneut an.'), true); return; }
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      const deleted = await res.json();
      if (!deleted.length) { throw new Error('nichts gelöscht'); }
      allReviews = allReviews.filter((r) => r.id !== id);
      renderSummary();
      renderReviews();
    } catch (err) {
      window.alert(t('Das Löschen hat nicht geklappt.'));
    }
  }

  function adminLogout() {
    adminToken = null;
    try { sessionStorage.removeItem('revAdmin'); } catch (err) { /* ignorieren */ }
    renderAdminState();
    if (reviewsLoaded) { renderReviews(); }
  }

  revAdminToggle.addEventListener('click', () => {
    const open = revAdminBox.hidden;
    revAdminBox.hidden = !open;
    revAdminToggle.setAttribute('aria-expanded', String(open));
    if (open && !adminToken) { document.getElementById('revAdminEmail').focus(); }
  });

  revLoginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!reviewsConfigured) { showAlert(revAdminAlert, t('Die Bewertungen sind noch nicht eingerichtet.'), true); return; }
    const email = document.getElementById('revAdminEmail').value.trim();
    const password = document.getElementById('revAdminPass').value;
    try {
      const res = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=password`, {
        method: 'POST',
        headers: { apikey: SUPABASE_ANON_KEY, 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      if (!res.ok) { throw new Error('login'); }
      const data = await res.json();
      adminToken = data.access_token;
      try { sessionStorage.setItem('revAdmin', JSON.stringify({ token: adminToken, exp: Date.now() + (data.expires_in - 60) * 1000 })); } catch (err) { /* ignorieren */ }
      document.getElementById('revAdminPass').value = '';
      revAdminAlert.style.display = 'none';
      renderAdminState();
      renderReviews();
    } catch (err) {
      showAlert(revAdminAlert, t('Anmeldung fehlgeschlagen. Prüfe E-Mail und Passwort.'), true);
    }
  });

  document.getElementById('revLogout').addEventListener('click', adminLogout);
  revMore.addEventListener('click', () => { shownCount += REVIEWS_PAGE_SIZE; renderReviews(); });

  revComment.addEventListener('input', () => { revCounter.textContent = `${revComment.value.length} / 500`; });

  revForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (document.getElementById('revWebsite').value) { return; } // Honeypot: Bots füllen das Feld aus
    const starsInput = revForm.querySelector('input[name=revStars]:checked');
    const comment = revComment.value.trim();
    const name = document.getElementById('revName').value.trim();
    if (!starsInput) { showAlert(revAlert, t('Bitte wähle zuerst Sterne aus.'), true); return; }
    if (!comment) { showAlert(revAlert, t('Bitte schreib einen kurzen Kommentar.'), true); revComment.focus(); return; }

    // einfache Bremse gegen Mehrfach-Klicks (kein echter Spam-Schutz, der liegt in der Datenbank)
    try {
      const last = parseInt(localStorage.getItem('revLastSent'), 10) || 0;
      if (Date.now() - last < 60000) { showAlert(revAlert, t('Bitte warte kurz, bevor du eine weitere Bewertung abschickst.'), true); return; }
    } catch (err) { /* ignorieren */ }

    const btn = revForm.querySelector('button[type=submit]');
    btn.disabled = true;
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/reviews`, {
        method: 'POST',
        headers: sbHeaders({ Prefer: 'return=minimal' }),
        body: JSON.stringify({ stars: parseInt(starsInput.value, 10), name: name || null, comment })
      });
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      try { localStorage.setItem('revLastSent', String(Date.now())); } catch (err) { /* ignorieren */ }
      revForm.reset();
      revCounter.textContent = '0 / 500';
      showAlert(revAlert, t('Danke für deine Bewertung!'), false);
      const r = btn.getBoundingClientRect();
      burst(r.left + r.width / 2, r.top);
      await loadReviews();
    } catch (err) {
      showAlert(revAlert, t('Das Senden hat leider nicht geklappt. Bitte versuch es später nochmals.'), true);
    } finally {
      btn.disabled = false;
    }
  });

  document.addEventListener('pageshown', (e) => {
    if (e.detail === 'reviews' && !reviewsLoaded) { loadReviews(); }
  });
  renderAdminState();
  if (window.location.hash === '#reviews') { loadReviews(); }
  document.addEventListener('langchange', () => { renderAdminState(); if (reviewsLoaded) { renderSummary(); renderReviews(); } });

  // ---------- Pasta-Clicker ----------
  const clickerBtn = document.getElementById('clickerBtn');
  const clickerCount = document.getElementById('clickerCount');
  let clickerPoints = 0;

  try {
    // frühere Version hat den Stand unter 'adhsPoints' gespeichert
    clickerPoints = parseInt(localStorage.getItem('clickerPoints') || localStorage.getItem('adhsPoints'), 10) || 0;
  } catch (err) { clickerPoints = 0; }

  function renderClicker() {
    clickerCount.textContent = clickerPoints.toLocaleString(loc());
    clickerBtn.setAttribute('aria-label', t('Pasta-Clicker, Punkte: {n}').replace('{n}', clickerPoints));
  }
  renderClicker();
  document.addEventListener('langchange', renderClicker);

  clickerBtn.addEventListener('click', () => {
    clickerPoints += 1;
    renderClicker();
    try { localStorage.setItem('clickerPoints', String(clickerPoints)); } catch (err) { /* ignorieren */ }
    if (!reduceMotion.matches) {
      clickerBtn.classList.add('pop');
      setTimeout(() => clickerBtn.classList.remove('pop'), 90);
      const plus = document.createElement('span');
      plus.className = 'clicker-plus';
      plus.setAttribute('aria-hidden', 'true');
      plus.textContent = clickerPoints % 10 === 0 ? t('Weiter so!') : '+1';
      plus.style.left = (15 + Math.random() * 55) + '%';
      plus.addEventListener('animationend', () => plus.remove());
      clickerBtn.appendChild(plus);
      if (clickerPoints % 10 === 0) { const r = clickerBtn.getBoundingClientRect(); burst(r.left + r.width / 2, r.top); }
    }
  });

  // ---------- Mega-Pepp ----------
  function burst(x, y) {
    if (reduceMotion.matches) { return; }
    const colors = ['#F4BF1F', '#CC2427', '#141414', '#FFFFFF'];
    for (let i = 0; i < 24; i++) {
      const c = document.createElement('i');
      const a = Math.random() * Math.PI * 2;
      const d = 60 + Math.random() * 110;
      c.className = 'confetti';
      c.style.cssText = `left:${x}px;top:${y}px;background:${colors[i % 4]};--dx:${Math.cos(a) * d}px;--dy:${Math.sin(a) * d - 40}px;--r:${Math.random() * 720 - 360}deg`;
      c.addEventListener('animationend', () => c.remove());
      document.body.appendChild(c);
    }
  }

  const progressEl = document.getElementById('progress');
  window.addEventListener('scroll', () => {
    const h = document.documentElement.scrollHeight - window.innerHeight;
    progressEl.style.transform = `scaleX(${h > 0 ? window.scrollY / h : 0})`;
  }, { passive: true });

  const heroArt = document.querySelector('.hero .art');
  if (heroArt && !reduceMotion.matches && window.matchMedia('(hover: hover)').matches) {
    const heroEl = document.querySelector('.hero');
    document.getElementById('home').addEventListener('mousemove', (e) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      heroArt.style.transform = `perspective(700px) rotateY(${x * 10}deg) rotateX(${-y * 8}deg)`;
      // Blitze und Sticker bewegen sich unterschiedlich stark mit (Tiefe steht im CSS bei --depth)
      heroEl.style.setProperty('--px', x.toFixed(3));
      heroEl.style.setProperty('--py', y.toFixed(3));
    });
  }

  // ---------- Hero-Titel Wort für Wort ----------
  // Läuft nach jeder Übersetzung neu, weil der Sprachwechsel den Titel ersetzt.
  // Das Einfliegen selbst passiert nur beim ersten Laden (Klasse "intro" auf <html>, gesetzt im <head>).
  const heroTitle = document.querySelector('.hero h1');
  function splitHeroTitle() {
    if (!heroTitle) { return; }
    const words = heroTitle.textContent.trim().split(/\s+/);
    heroTitle.textContent = '';
    words.forEach((word, i) => {
      const w = document.createElement('span');
      w.className = 'w' + (i === words.length - 1 ? ' w-last' : '');
      w.style.setProperty('--i', i);
      w.textContent = word;
      heroTitle.appendChild(w);
      if (i < words.length - 1) { heroTitle.appendChild(document.createTextNode(' ')); }
    });
    heroTitle.classList.add('split');
  }
  splitHeroTitle();
  document.addEventListener('langchange', splitHeroTitle);
  setTimeout(() => document.documentElement.classList.remove('intro'), 2600);

  // ---------- Scroll-Story: die Packung füllt sich ----------
  const story = document.getElementById('story');
  if (story && 'IntersectionObserver' in window && !reduceMotion.matches) {
    document.documentElement.classList.add('story-anim');
    const steps = [...story.querySelectorAll('.story-step')];
    const layers = [...story.querySelectorAll('.layer')];
    const labels = [...story.querySelectorAll('.pack-labels li')];
    const energy = story.querySelector('.pack-energy');
    const energyNum = story.querySelector('[data-energy]');
    const stamp = story.querySelector('.pack-stamp');
    const steam = story.querySelector('.pack-steam');
    const packWrap = story.querySelector('.pack-wrap');
    const drops = story.querySelector('.pack-drops');
    const ENERGY_KCAL = 351;
    const ENERGY_STEP = 5;
    const COOK_STEP = 6;
    let active = 0;

    const countEnergy = () => {
      const start = performance.now();
      (function tick(now) {
        const p = Math.min(1, (now - start) / 900);
        energyNum.textContent = Math.round(ENERGY_KCAL * (1 - Math.pow(1 - p, 3)));
        if (p < 1 && active >= ENERGY_STEP) { requestAnimationFrame(tick); }
      })(start);
    };

    // Ein paar Rigatoni fallen oben in die Packung, die Packung federt kurz
    const dropPasta = (count) => {
      const fall = packWrap.offsetHeight * 0.3;
      for (let i = 0; i < count; i++) {
        const d = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        d.setAttribute('class', 'drop');
        d.setAttribute('viewBox', '0 0 62 28');
        d.innerHTML = '<use href="#rig"/>';
        d.style.cssText = `--x:${22 + Math.random() * 40}%;--delay:${i * 0.09}s;--t:${0.7 + Math.random() * 0.3}s;--r0:${Math.random() * 360}deg;--r1:${Math.random() * 360}deg;--fall:${fall}px`;
        d.addEventListener('animationend', () => d.remove());
        drops.appendChild(d);
      }
      packWrap.classList.remove('bump');
      void packWrap.offsetWidth;
      packWrap.classList.add('bump');
    };

    const setActive = (n) => {
      if (n === active) { return; }
      const prev = active;
      active = n;
      steps.forEach((s, i) => s.classList.toggle('active', i + 1 === n));
      layers.forEach((l) => l.classList.toggle('on', Number(l.dataset.layer) <= n));
      labels.forEach((l) => l.classList.toggle('on', Number(l.dataset.label) <= n));
      energy.classList.toggle('on', n >= ENERGY_STEP);
      stamp.classList.toggle('on', n >= COOK_STEP);
      steam.classList.toggle('on', n >= COOK_STEP);
      if (n > prev && n <= layers.length) { dropPasta(n === 1 ? 7 : 5); }
      if (n >= ENERGY_STEP && prev < ENERGY_STEP) { countEnergy(); }
      if (n >= COOK_STEP && prev < COOK_STEP) { packWrap.classList.remove('bump'); void packWrap.offsetWidth; packWrap.classList.add('bump'); }
    };

    // Aktiv ist der Schritt, der gerade die Bildschirmmitte kreuzt (Handy: weiter unten, weil oben die Packung klebt)
    const stepObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => { if (en.isIntersecting) { setActive(Number(en.target.dataset.step)); } });
    }, { rootMargin: window.matchMedia('(max-width: 860px)').matches ? '-72% 0px -24% 0px' : '-45% 0px -45% 0px' });
    steps.forEach((s) => stepObserver.observe(s));

    // Ganz nach oben gescrollt: Packung wieder leeren, damit sie beim nächsten Mal neu füllt
    const resetObserver = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting && en.boundingClientRect.top > 0) { setActive(0); }
      });
    }, { threshold: 0.9 });
    resetObserver.observe(story.querySelector('.story-intro'));
  }

  // ---------- Bewegung beim Scrollen ----------
  // Ein einziger rAF-Loop: Rigatoni-Parallax im Hero, Laufband nach Scroll-Tempo,
  // Statement-Zeilen driften auseinander, das Video zoomt beim Reinscrollen auf.
  if (!reduceMotion.matches) {
    const heroPasta = document.querySelector('.hero-pasta');
    const marqueeAnims = () => [...document.querySelectorAll('.marquee-track')].flatMap((el) => el.getAnimations());
    const promoFig = document.querySelector('.promo-video');
    let lastY = window.scrollY;
    let speed = 0;
    let ticking = false;

    const frame = () => {
      const y = window.scrollY;
      const vh = window.innerHeight;
      speed = speed * 0.88 + Math.abs(y - lastY) * 0.12;
      lastY = y;

      if (heroPasta) { heroPasta.style.setProperty('--scroll', Math.min(y, 1400).toFixed(0)); }
      marqueeAnims().forEach((a) => { a.playbackRate = 1 + Math.min(speed * 0.35, 6); });

      document.querySelectorAll('.page.active .statement').forEach((st) => {
        const r = st.getBoundingClientRect();
        if (r.bottom < 0 || r.top > vh) { return; }
        const p = (r.top + r.height / 2 - vh / 2) / vh;
        const [a, b] = st.children;
        if (a) { a.style.translate = `${(p * -46).toFixed(1)}px 0`; }
        if (b) { b.style.translate = `${(p * 46).toFixed(1)}px 0`; }
      });

      if (promoFig && promoFig.offsetParent) {
        const r = promoFig.getBoundingClientRect();
        const t = Math.max(0, Math.min(1, (vh - r.top) / (vh * 0.75)));
        promoFig.style.scale = (0.84 + 0.16 * t).toFixed(3);
        promoFig.style.rotate = `${((1 - t) * -3).toFixed(2)}deg`;
      }

      if (speed > 0.05) { requestAnimationFrame(frame); } else { ticking = false; }
    };
    const kick = () => { if (!ticking) { ticking = true; requestAnimationFrame(frame); } };
    window.addEventListener('scroll', kick, { passive: true });
    window.addEventListener('resize', kick);
    document.addEventListener('pageshown', () => setTimeout(kick, 60));
    kick();
  }

  // ---------- Karten kippen mit der Maus ----------
  if (!reduceMotion.matches && window.matchMedia('(hover: hover)').matches) {
    document.querySelectorAll('.feature, .member, .stat').forEach((card) => {
      card.classList.add('tilt');
      card.addEventListener('mousemove', (e) => {
        const r = card.getBoundingClientRect();
        const x = (e.clientX - r.left) / r.width - 0.5;
        const y = (e.clientY - r.top) / r.height - 0.5;
        card.style.transform = `perspective(800px) rotateY(${(x * 10).toFixed(2)}deg) rotateX(${(-y * 10).toFixed(2)}deg) translateY(-4px)`;
      });
      card.addEventListener('mouseleave', () => { card.style.transform = ''; });
    });
  }

  // ---------- Vorhang beim Seitenwechsel ----------
  // Der erste Seitenaufruf beim Laden passiert, bevor dieser Listener existiert: hier kommen nur echte Wechsel an
  const pageWipe = document.querySelector('.page-wipe');
  document.addEventListener('pageshown', () => {
    if (!pageWipe || reduceMotion.matches) { return; }
    pageWipe.classList.remove('run');
    void pageWipe.offsetWidth;
    pageWipe.classList.add('run');
  });
  if (pageWipe) { pageWipe.addEventListener('animationend', (e) => { if (e.target === pageWipe) { pageWipe.classList.remove('run'); } }); }

  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.feature, .member, .nutrition-card, .tl-item, .legal-content, .calc-form, .calc-result, .contact-grid > div, .section-head, .statement, .stat, .promo-video, .story-hint, .faq-item, .info-block, .group-photo').forEach((el, i) => {
      el.classList.add('reveal');
      el.style.setProperty('--d', (i % 3) * 90 + 'ms');
      io.observe(el);
    });
  }

  // Gespeicherte Sprache erst ganz am Schluss anwenden, wenn alles andere eingerichtet ist
  let savedLang = 'de';
  try { savedLang = localStorage.getItem(LANG_KEY) || 'de'; } catch (err) { savedLang = 'de'; }
  if (savedLang !== 'de') { setLanguage(savedLang, false); }
  else { document.documentElement.classList.remove('i18n-pending'); }
