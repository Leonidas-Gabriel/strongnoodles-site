/**
 * Strongnoodles: Bestellungen von strongnoodles.ch ins Google Sheet schreiben.
 *
 * Gehört ins Apps-Script-Projekt des Kundenregisters (Erweiterungen → Apps Script).
 * Einrichtung und Tests: siehe SETUP-BESTELLUNGEN-SHEET.md im Website-Repo.
 * Nach jeder Änderung hier: Bereitstellen → Bereitstellungen verwalten → Bearbeiten → "Neue Version".
 */

// Muss mit ORDER_SHEET_TOKEN in app.js übereinstimmen.
const TOKEN = 'sn-bestellung-4q8z2m7k';

const SHEET_NAME = 'Bestellungen';
const FIRST_ROW = 2;   // Zeile 1 = Überschriften
const LAST_ROW = 501;  // bis hier sind die Zeilen vorformatiert und haben die Formel in Spalte I
const ORDER_PREFIX = 'SN-';

// Maximale Längen, damit niemand Romane ins Sheet schreibt.
const MAX_LEN = { name: 100, email: 254, street: 150, zip: 10, city: 80, note: 1000 };
const MAX_QTY = 999;

// Spalten (1 = A)
const COL = { date: 1, orderNo: 2, name: 3, email: 4, street: 5, zip: 6, city: 7, qty: 8, paid: 10, status: 11, note: 14 };

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
    let row = 0;
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
    const orderNo = ORDER_PREFIX + String(maxNo + 1).padStart(3, '0');

    // Gezielt schreiben: A bis H, J bis K, N. Spalte I (Formel), L und M bleiben unangetastet.
    sheet.getRange(row, COL.date, 1, 8).setValues([[
      new Date(), orderNo, order.name, order.email, order.street, order.zip, order.city, qty
    ]]);
    sheet.getRange(row, COL.paid, 1, 2).setValues([['Nein', 'Neu']]);
    sheet.getRange(row, COL.note).setValue(order.note);
    SpreadsheetApp.flush();

    return json_({ ok: true, orderNo: orderNo, row: row });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'Interner Fehler' });
  } finally {
    lock.releaseLock();
  }
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
