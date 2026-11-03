/**
 * Strongnoodles: Formulare von strongnoodles.ch.
 *  - Bestellungen (type "order"): neue Zeile im Blatt "Bestellungen" + Benachrichtigungs-Mail an uns.
 *  - Kontaktnachrichten (type "contact"): nur Mail an uns, nichts im Sheet.
 *
 * Gehört ins Apps-Script-Projekt des Kundenregisters (Erweiterungen → Apps Script).
 * Einrichtung und Tests: siehe SETUP-BESTELLUNGEN-SHEET.md im Website-Repo.
 * Nach jeder Änderung hier: Bereitstellen → Bereitstellungen verwalten → Bearbeiten → "Neue Version".
 */

// Muss mit WEBAPP_TOKEN in app.js übereinstimmen.
const TOKEN = 'sn-bestellung-4q8z2m7k';

// An diese Adresse gehen die Benachrichtigungen (Absender ist das Google-Konto, das die Web-App bereitstellt).
const NOTIFY_EMAIL = 'info@strongnoodles.ch';
const MAX_CONTACT = { name: 100, email: 254, message: 5000 };

const SHEET_NAME = 'Bestellungen';
const FIRST_ROW = 2;   // Zeile 1 = Überschriften
const LAST_ROW = 501;  // bis hier sind die Zeilen vorformatiert und haben die Formel in Spalte I (Tarif-Formel)
const ORDER_PREFIX = 'SN-';

// Maximale Längen, damit niemand Romane ins Sheet schreibt.
const MAX_LEN = { name: 100, email: 254, street: 150, zip: 10, city: 80, note: 1000 };
const MAX_QTY = 999;

// Spalten (1 = A)
const COL = { date: 1, orderNo: 2, name: 3, email: 4, street: 5, zip: 6, city: 7, qty: 8, paid: 10, status: 11, note: 14, tariff: 15 };

// Tarife: Jede Bestellung bekommt in Spalte O den Tarif, der beim Bestellen aktiv war. Spalte I rechnet
// Anzahl × Preis dieses Tarifs (Tabelle in "Einstellungen" E3:F12). So ändern sich alte Bestellungen nicht,
// wenn ein neuer Tarif aktiv wird. Welcher Tarif aktiv ist, steht in "Einstellungen" H3.
const SETTINGS_SHEET = 'Einstellungen';
const ACTIVE_TARIFF_CELL = 'H3';

function doPost(e) {
  let data;
  try {
    // Die Website schickt JSON als text/plain. Fallback: URL-encoded Formularfelder.
    data = (e.postData && e.postData.contents && e.postData.type !== 'application/x-www-form-urlencoded')
      ? JSON.parse(e.postData.contents)
      : e.parameter;
  } catch (err) {
    return json_({ ok: false, error: 'Ungültige Daten' });
  }
  data = data || {};

  if (data.token !== TOKEN) {
    return json_({ ok: false, error: 'Nicht erlaubt' });
  }

  if (data.type === 'contact') {
    return handleContact_(data);
  }
  // Alles andere (auch ohne type, wie bei älteren Versionen der Website) ist eine Bestellung.
  return handleOrder_(data);
}

function handleOrder_(data) {
  const order = {
    name: clean_(data.name, MAX_LEN.name),
    email: clean_(data.email, MAX_LEN.email),
    street: clean_(data.street, MAX_LEN.street),
    zip: clean_(data.zip, MAX_LEN.zip),
    city: clean_(data.city, MAX_LEN.city),
    note: clean_(data.note, MAX_LEN.note)
  };
  const qtyText = String(data.qty == null ? '' : data.qty).trim();

  const errors = [];
  if (!order.name) { errors.push('Name fehlt'); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(order.email)) { errors.push('E-Mail fehlt oder ungültig'); }
  if (!/^\d+$/.test(qtyText) || Number(qtyText) < 1 || Number(qtyText) > MAX_QTY) {
    errors.push('Anzahl muss eine ganze Zahl zwischen 1 und ' + MAX_QTY + ' sein');
  }
  if (errors.length) {
    return json_({ ok: false, error: errors.join(', ') });
  }
  const qty = Number(qtyText);

  // Lock: zwei gleichzeitige Bestellungen dürfen nicht dieselbe Zeile oder Nummer bekommen.
  let row = 0;
  let orderNo = '';
  let tariff = '';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(20000)) {
    return json_({ ok: false, error: 'Sheet ist gerade beschäftigt, bitte nochmals versuchen' });
  }
  try {
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);
    if (!sheet) {
      return json_({ ok: false, error: 'Blatt "' + SHEET_NAME + '" nicht gefunden' });
    }

    // Spalte B lesen: erste leere Zeile finden und höchste vorhandene Bestell-Nr. bestimmen.
    const numbers = sheet.getRange(FIRST_ROW, COL.orderNo, LAST_ROW - FIRST_ROW + 1, 1).getDisplayValues();
    let maxNo = 0;
    numbers.forEach(function (r, i) {
      const value = String(r[0]).trim();
      if (!value && !row) { row = FIRST_ROW + i; }
      const m = value.match(/^SN-(\d+)$/i);
      if (m) { maxNo = Math.max(maxNo, parseInt(m[1], 10)); }
    });
    if (!row) {
      return json_({ ok: false, error: 'Keine freie Zeile mehr (Zeilen ' + FIRST_ROW + ' bis ' + LAST_ROW + ' voll)' });
    }
    orderNo = ORDER_PREFIX + String(maxNo + 1).padStart(3, '0');

    // Aktiven Tarif lesen. Fehlt er, bleibt O leer und Spalte I zeigt "Tarif?", die Bestellung geht trotzdem durch.
    const settings = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SETTINGS_SHEET);
    tariff = settings ? clean_(settings.getRange(ACTIVE_TARIFF_CELL).getDisplayValue(), 50) : '';

    // Gezielt schreiben: A bis H, J bis K, N und O. Spalte I (Formel), L und M bleiben unangetastet.
    sheet.getRange(row, COL.date, 1, 8).setValues([[
      new Date(), orderNo, order.name, order.email, order.street, order.zip, order.city, qty
    ]]);
    sheet.getRange(row, COL.paid, 1, 2).setValues([['Nein', 'Neu']]);
    sheet.getRange(row, COL.note).setValue(order.note);
    sheet.getRange(row, COL.tariff).setValue(tariff);
    SpreadsheetApp.flush();
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Interner Fehler' });
  } finally {
    lock.releaseLock();
  }

  // Die Bestellung steht im Sheet. Klappt die Mail nicht, ist sie trotzdem angekommen (nur protokollieren).
  try {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      replyTo: order.email,
      subject: oneLine_('Neue Bestellung ' + orderNo + ': ' + order.name + ' (' + qty + ' Packung' + (qty === 1 ? '' : 'en') + ')'),
      body: 'Neue Bestellung über strongnoodles.ch, Zeile ' + row + ' im Blatt "' + SHEET_NAME + '".\n\n'
        + 'Bestell-Nr.: ' + orderNo + '\n'
        + 'Name: ' + order.name + '\n'
        + 'E-Mail: ' + order.email + '\n'
        + 'Adresse: ' + order.street + ', ' + order.zip + ' ' + order.city + '\n'
        + 'Anzahl: ' + qty + '\n'
        + 'Tarif: ' + (tariff || '(keiner aktiv, bitte in "Einstellungen" H3 setzen)') + '\n'
        + (order.note ? 'Bemerkung: ' + order.note + '\n' : '')
        + '\n---\nWie auf der Website abgeschickt:\n' + clip_(data.summary, 3000)
    });
  } catch (err) {
    console.error('Bestell-Mail fehlgeschlagen: ' + err);
  }

  return json_({ ok: true, orderNo: orderNo, row: row });
}

function handleContact_(data) {
  const name = clip_(data.name, MAX_CONTACT.name);
  const email = clip_(data.email, MAX_CONTACT.email);
  const message = clip_(data.message, MAX_CONTACT.message);

  const errors = [];
  if (!name) { errors.push('Name fehlt'); }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) { errors.push('E-Mail fehlt oder ungültig'); }
  if (!message) { errors.push('Nachricht fehlt'); }
  if (errors.length) {
    return json_({ ok: false, error: errors.join(', ') });
  }

  // Hier ist die Mail der einzige Weg zu uns: schlägt sie fehl, bekommt die Website einen Fehler zurück.
  try {
    MailApp.sendEmail({
      to: NOTIFY_EMAIL,
      replyTo: email,
      subject: oneLine_('Nachricht von ' + name + ' über die Strongnoodles-Website'),
      body: 'Name: ' + name + '\nE-Mail: ' + email + '\n\n' + message
    });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Mail konnte nicht gesendet werden' });
  }
  return json_({ ok: true });
}

// Für Mails: nur trimmen und kürzen (kein ' davor wie bei clean_, das ist nur fürs Sheet nötig).
function clip_(value, maxLen) {
  return String(value == null ? '' : value).trim().slice(0, maxLen);
}

// Betreffzeilen ohne Zeilenumbrüche.
function oneLine_(s) {
  return String(s).replace(/[\r\n]+/g, ' ').slice(0, 200);
}

// Aufruf der URL im Browser: zeigt, ob die Web-App erreichbar ist (schreibt nichts).
function doGet() {
  return json_({ ok: true, info: 'Strongnoodles Bestell-Web-App läuft. Bestellungen nur per POST.' });
}

// Text trimmen, kürzen und Formel-Injection verhindern: Werte, die mit = + - @ (oder Tab/CR) anfangen,
// würde Sheets als Formel deuten. Ein vorangestelltes ' macht daraus reinen Text.
function clean_(value, maxLen) {
  let s = String(value == null ? '' : value).trim().slice(0, maxLen);
  if (/^[=+\-@\t\r]/.test(s)) { s = "'" + s; }
  return s;
}

// Fehler zusätzlich protokollieren, damit sie unter "Ausführungen" im Apps-Script-Editor sichtbar sind.
function json_(obj) {
  if (!obj.ok) { console.warn('Bestellung abgelehnt: ' + obj.error); }
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

// Zum Testen im Editor (Funktion auswählen → Ausführen). Schreibt eine echte Testzeile, danach von Hand löschen.
function testDoPost() {
  const res = doPost({
    postData: {
      type: 'text/plain',
      contents: JSON.stringify({
        token: TOKEN, name: 'Test Person', email: 'test@example.com', street: 'Teststrasse 1',
        zip: '6300', city: 'Zug', qty: 2, note: '=Test gegen Formel-Injection'
      })
    }
  });
  console.log(res.getContent());
}

// Zum Testen im Editor. Schickt eine Test-Kontaktmail an NOTIFY_EMAIL (schreibt nichts ins Sheet).
// Beim ersten Ausführen fragt Google nach der Berechtigung "E-Mails in Ihrem Namen senden": zulassen.
function testContact() {
  const res = doPost({
    postData: {
      type: 'text/plain',
      contents: JSON.stringify({
        token: TOKEN, type: 'contact', name: 'Test Person', email: 'test@example.com',
        message: 'Testnachricht aus dem Apps-Script-Editor.'
      })
    }
  });
  console.log(res.getContent());
}
