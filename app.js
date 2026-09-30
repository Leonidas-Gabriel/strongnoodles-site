  const buttons = document.querySelectorAll('[data-page]');
  const pages = document.querySelectorAll('.page');
  const navLinks = document.getElementById('navLinks');
  const navToggle = document.getElementById('navToggle');
  const mainEl = document.getElementById('main');
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  const validPages = ['home', 'team', 'idea', 'order', 'contact', 'impressum', 'privacy', 'accessibility'];
  const pageTitles = {
    home: 'Strongnoodles – High-Protein Pasta aus Zug',
    team: 'Unser Team – Strongnoodles',
    idea: 'Proteinrechner – Strongnoodles',
    order: 'Bestellen – Strongnoodles',
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

  function showPage(id, moveFocus) {
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

    document.title = pageTitles[id];
    if (id === 'home') { runCounters(); }
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
  const CONTACT_EMAIL = 'strongnoodles.yes@gmail.com';
  // Sobald hier die URL eines Formular-Dienstes steht (z. B. Formspree oder Web3Forms),
  // werden Bestellungen und Nachrichten direkt versendet. Leer = Fallback über das E-Mail-Programm.
  const FORM_ENDPOINT = 'https://formspree.io/f/xkjgyyen';

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

  // fields: { Label: value }. Sendet per Endpoint, sonst per mailto:.
  async function submitForm({ form, alertEl, subject, fields, okText }) {
    const submitBtn = form.querySelector('button[type=submit]');
    const text = Object.entries(fields).map(([k, v]) => `${k}: ${v}`).join('\n');

    if (!FORM_ENDPOINT) {
      window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(text)}`;
      showMailAlert(alertEl);
      return true;
    }

    submitBtn.disabled = true;
    try {
      const res = await fetch(FORM_ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        // _gotcha = Honeypot gegen Spam-Bots (Formspree verwirft Einsendungen, bei denen das Feld gefüllt ist)
        body: JSON.stringify({ _subject: subject, _gotcha: '', ...fields })
      });
      if (!res.ok) { throw new Error('HTTP ' + res.status); }
      showAlert(alertEl, okText, false);
      form.reset();
      return true;
    } catch (err) {
      showAlert(alertEl, `Das Senden hat leider nicht geklappt. Bitte versuch es nochmals oder schreib uns direkt an ${CONTACT_EMAIL}.`, true);
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
      okText: 'Danke für deine Nachricht! Wir melden uns so bald wie möglich.'
    });
  });

  // ---------- Proteinrechner ----------
  const PROTEIN_PER_100G_PASTA = 37; // g Protein pro 100 g Strongnoodles (laut Nährwerttabelle)

  const calcAgeInput = document.getElementById('calcAge');
  const calcGenderInput = document.getElementById('calcGender');
  const calcHeightInput = document.getElementById('calcHeight');
  const calcWeightInput = document.getElementById('calcWeight');
  const calcActivityInput = document.getElementById('calcActivity');
  const calcBtn = document.getElementById('calcBtn');
  const calcResult = document.getElementById('calcResult');

  const activityLabels = {
    '0.9': 'Kaum aktiv',
    '1.2': 'Leicht aktiv',
    '1.5': 'Mässig aktiv',
    '1.8': 'Sehr aktiv',
    '2.2': 'Extrem aktiv'
  };

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
      calcResult.innerHTML = '<p class="calc-error">Bitte gib ein gültiges Alter (10–100), eine gültige Grösse (120–230 cm) und ein gültiges Gewicht (20–250 kg) ein.</p>';
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
        <p class="calc-sub">Strongnoodles (trocken) pro Tag, um deinen Proteinbedarf über die Pasta zu decken.</p>
        <div class="calc-detail"><span>Alter</span><span>${age} Jahre</span></div>
        <div class="calc-detail"><span>Geschlecht</span><span>${gender === 'male' ? 'Männlich' : 'Weiblich'}</span></div>
        <div class="calc-detail"><span>Grösse / Gewicht</span><span>${height} cm / ${weight} kg</span></div>
        <div class="calc-detail"><span>Aktivitätslevel</span><span>${activityLabels[calcActivityInput.value]}</span></div>
        <div class="calc-detail"><span>Fettfreie Körpermasse (geschätzt)</span><span>${leanMass.toFixed(1)} kg</span></div>
        <div class="calc-detail"><span>Täglicher Proteinbedarf</span><span>${dailyProteinNeed.toFixed(0)} g</span></div>
        <div class="calc-detail"><span>Protein in Strongnoodles</span><span>${PROTEIN_PER_100G_PASTA} g / 100 g</span></div>
      </div>
    `;
  }

  calcBtn.addEventListener('click', () => { runCalc(); const r = calcBtn.getBoundingClientRect(); burst(r.left + r.width / 2, r.top); });
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
  const PRICE_CENTS = 795; // CHF 7.95 pro Packung
  const SHIPPING_CENTS = 900; // CHF 9.00 Lieferkosten pro Bestellung
  const PAYMENT_METHOD = 'TWINT';
  const orderTotal = document.getElementById('orderTotal');
  const orderSubtotal = document.getElementById('orderSubtotal');
  const formatChf = (cents) => 'CHF ' + (cents / 100).toFixed(2);

  document.querySelectorAll('[data-price]').forEach((el) => { el.textContent = formatChf(PRICE_CENTS).replace(' ', ' '); });
  document.querySelectorAll('[data-shipping]').forEach((el) => { el.textContent = formatChf(SHIPPING_CENTS).replace(' ', ' '); });
  document.querySelectorAll('[data-payment]').forEach((el) => { el.textContent = PAYMENT_METHOD; });
  orderSubtotal.textContent = formatChf(PRICE_CENTS);
  orderTotal.textContent = formatChf(PRICE_CENTS + SHIPPING_CENTS);

  function currentQty() {
    return Math.min(99, Math.max(1, parseInt(orderQty.value, 10) || 1));
  }
  function updateTotal() {
    const subtotal = currentQty() * PRICE_CENTS;
    orderSubtotal.textContent = formatChf(subtotal);
    orderTotal.textContent = formatChf(subtotal + SHIPPING_CENTS);
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

    const packs = `${qty} Packung${qty === 1 ? '' : 'en'}`;
    const sb = orderForm.querySelector('button[type=submit]').getBoundingClientRect();
    burst(sb.left + sb.width / 2, sb.top);

    submitForm({
      form: orderForm,
      alertEl: orderAlert,
      subject: `Bestellung von ${val('orderName')} (${packs})`,
      fields: {
        Menge: packs,
        Preis: `${formatChf(PRICE_CENTS)} pro Packung, Zwischensumme ${formatChf(qty * PRICE_CENTS)}`,
        Lieferkosten: formatChf(SHIPPING_CENTS),
        Total: formatChf(qty * PRICE_CENTS + SHIPPING_CENTS),
        Zahlungsmethode: PAYMENT_METHOD,
        Lieferadresse: `${val('orderName')}, ${val('orderStreet')}, ${val('orderZip')} ${val('orderCity')}`,
        'E-Mail': val('orderEmail'),
        ...(note ? { Bemerkung: note } : {})
      },
      okText: 'Danke für deine Bestellung! Wir melden uns mit den Lieferdetails und den TWINT-Infos.'
    }).then(() => { updateTotal(); });
  });

  // ---------- Pasta-Clicker ----------
  const clickerBtn = document.getElementById('clickerBtn');
  const clickerCount = document.getElementById('clickerCount');
  let clickerPoints = 0;

  try {
    // frühere Version hat den Stand unter 'adhsPoints' gespeichert
    clickerPoints = parseInt(localStorage.getItem('clickerPoints') || localStorage.getItem('adhsPoints'), 10) || 0;
  } catch (err) { clickerPoints = 0; }

  function renderClicker() {
    clickerCount.textContent = clickerPoints.toLocaleString('de-CH');
    clickerBtn.setAttribute('aria-label', `Pasta-Clicker, Punkte: ${clickerPoints}`);
  }
  renderClicker();

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
      plus.textContent = clickerPoints % 10 === 0 ? 'Weiter so!' : '+1';
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
    document.getElementById('home').addEventListener('mousemove', (e) => {
      const x = e.clientX / window.innerWidth - 0.5;
      const y = e.clientY / window.innerHeight - 0.5;
      heroArt.style.transform = `perspective(700px) rotateY(${x * 10}deg) rotateX(${-y * 8}deg)`;
    });
  }

  // Werbevideo: lädt nur Metadaten, läuft nur solange es sichtbar ist (und nicht bei "weniger Bewegung")
  const promoVideo = document.getElementById('promoVideo');
  if (promoVideo && 'IntersectionObserver' in window && !reduceMotion.matches) {
    new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { promoVideo.play().catch(() => {}); }
        else { promoVideo.pause(); }
      });
    }, { threshold: 0.4 }).observe(promoVideo);
  }

  if ('IntersectionObserver' in window && !reduceMotion.matches) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) { en.target.classList.add('in'); io.unobserve(en.target); }
      });
    }, { threshold: 0.12 });
    document.querySelectorAll('.feature, .member, .nutrition-card, .tl-item, .legal-content, .calc-form, .calc-result, .contact-grid > div').forEach((el, i) => {
      el.classList.add('reveal');
      el.style.setProperty('--d', (i % 3) * 90 + 'ms');
      io.observe(el);
    });
  }
