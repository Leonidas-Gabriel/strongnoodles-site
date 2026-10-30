# Bestellungen ins Google Sheet (Apps Script)

Jede Bestellung auf der Website geht wie bisher per Formspree als Mail an uns. Zusätzlich schickt die Website sie
an eine kleine Google-Apps-Script-Web-App, die sie als neue Zeile ins Blatt **Bestellungen** des Kundenregisters
schreibt. Einmalige Einrichtung, ca. 15 Minuten.

So läuft es ab:
1. Kunde schickt das Bestellformular ab, die Website sendet es an Formspree.
2. Erst wenn Formspree «ok» meldet, schickt die Website die Bestellung zusätzlich an die Web-App (im Hintergrund,
   der Kunde wartet nicht darauf und merkt bei einem Fehler nichts).
3. Die Web-App (`google-sheet/Code.gs`) prüft Token und Eingaben, sucht die erste Zeile mit leerer Bestell-Nr.
   und schreibt dort Datum, neue Nummer (SN-001, SN-002, ...), Kundendaten, «Nein», «Neu» und die Bemerkung.
   Spalte I (Formel), L und M werden nie angefasst.

Tipp: Alles mit dem gemeinsamen Strongnoodles-Google-Konto machen, nicht mit einem privaten. Die Web-App läuft
später unter dem Konto, das sie bereitstellt.

## 1. Excel als Google Sheet öffnen
1. Auf https://drive.google.com **Neu → Datei hochladen** und das Kundenregister (.xlsx) wählen.
2. Rechtsklick auf die Datei → **Öffnen mit → Google Tabellen**.
3. Oben steht jetzt «.XLSX». Apps Script funktioniert nur mit echten Google-Tabellen, deshalb:
   **Datei → Als Google Tabellen speichern**. Es öffnet sich eine Kopie, ab jetzt nur noch mit dieser arbeiten.
4. Prüfen:
   - Das Blatt heisst genau `Bestellungen` (Gross-/Kleinschreibung, keine Leerzeichen).
   - In Spalte I stehen die Formeln noch, und sie rechnen mit dem Preis aus dem Blatt «Einstellungen».
   - **Datei → Einstellungen → Zeitzone**: `(GMT+01:00) Zurich`, damit das Datum stimmt.

## 2. Apps Script anlegen
1. In der Google-Tabelle **Erweiterungen → Apps Script**. Es öffnet sich der Editor mit einer Datei `Code.gs`.
2. Den ganzen Inhalt dort löschen und den Inhalt von `google-sheet/Code.gs` aus diesem Repo einfügen.
3. Oben links den Projektnamen auf z. B. `Strongnoodles Bestellungen` setzen, dann speichern (Ctrl+S).
4. Oben in der Funktionsauswahl `testDoPost` wählen und **Ausführen** klicken.
   - Google fragt nach Berechtigungen: **Berechtigungen prüfen** → Konto wählen → bei «Google hat diese App nicht
     überprüft» auf **Erweitert → Zu Strongnoodles Bestellungen (unsicher) wechseln** → **Zulassen**.
     Das ist normal bei eigenen Scripts.
   - Unten im Ausführungsprotokoll sollte `{"ok":true,"orderNo":"SN-001",...}` stehen und im Sheet eine Testzeile.
   - Testzeile wieder leeren (siehe «Testzeilen entfernen» unten).

## 3. Als Web-App bereitstellen
1. Oben rechts **Bereitstellen → Neue Bereitstellung**.
2. Beim Zahnrad neben «Typ auswählen» **Web-App** wählen.
3. Beschreibung: z. B. `v1`. **Ausführen als: Ich** (dein Konto). **Zugriff: Jeder**.
4. **Bereitstellen** klicken und die **Web-App-URL** kopieren (endet auf `/exec`).
5. In `app.js` ganz oben bei `ORDER_SHEET_URL` einfügen:
   ```js
   const ORDER_SHEET_URL = 'https://script.google.com/macros/s/.../exec';
   ```
   `ORDER_SHEET_TOKEN` in `app.js` und `TOKEN` in `Code.gs` müssen gleich sein. Wenn ihr es ändert, an beiden Orten.
6. In `index.html` die Zahl bei `app.js?v=` um eins erhöhen, damit Browser die neue Datei laden.

«Zugriff: Jeder» heisst nur, dass jeder die URL aufrufen darf, nicht dass jemand das Sheet sehen kann. Das Sheet
bleibt privat, schreiben kann man nur über die Prüfungen im Script.

## 4. Nach Änderungen am Script: neue Version, gleiche URL
Wenn du `Code.gs` änderst, läuft die Web-App weiter mit der alten Version, bis du sie aktualisierst:
1. **Bereitstellen → Bereitstellungen verwalten**.
2. Die bestehende Bereitstellung auswählen und oben auf den **Stift (Bearbeiten)** klicken.
3. Bei **Version** auf **Neue Version** stellen, kurze Beschreibung, **Bereitstellen**.

Die URL bleibt gleich. **Nicht** «Neue Bereitstellung» wählen, das gibt eine neue URL, und dann müsste `app.js`
angepasst werden.

## 5. Testplan

### a) Script direkt testen
1. Im Editor `testDoPost` ausführen: Protokoll zeigt `ok:true`, im Sheet steht eine neue Zeile mit:
   - Datum, nächster SN-Nummer, Testdaten, «Nein», «Neu»
   - Spalte I rechnet den Betrag (2 × Preis)
   - Bemerkung erscheint als Text `=Test gegen Formel-Injection` (nicht als Formel-Fehler)
2. Die Web-App-URL im Browser öffnen: es kommt `{"ok":true,"info":"Strongnoodles Bestell-Web-App läuft..."}`.
3. Falsches Token, darf nichts schreiben (PowerShell, URL einsetzen):
   ```
   curl.exe -L -H "Content-Type: text/plain" -d "{\"token\":\"falsch\",\"name\":\"X\",\"email\":\"x@x.ch\",\"qty\":1}" "WEB-APP-URL"
   ```
   Antwort: `{"ok":false,"error":"Nicht erlaubt"}`, keine neue Zeile.

### b) Lokal mit der Website
Die Seite über einen kleinen lokalen Server öffnen (nicht per Doppelklick auf index.html), z. B. in VS Code mit der
Erweiterung «Live Server» oder im Projektordner `python -m http.server 8000` und dann http://localhost:8000.
1. Bestellformular ausfüllen und absenden.
2. Erwartet: Danke-Meldung sofort, Formspree-Mail kommt an, nach ein paar Sekunden neue Zeile im Sheet.
3. Entwicklertools (F12):
   - **Konsole**: keine Warnung «Bestellung konnte nicht ins Google Sheet geschrieben werden».
   - **Netzwerk**: eine Anfrage an `formspree.io` (Status 200) und danach eine an `script.google.com`. Diese zeigt
     wegen `no-cors` keinen lesbaren Status, das ist normal. Ob sie geklappt hat, sieht man nur im Sheet.

Achtung: Jeder Test schickt eine echte Formspree-Mail und zählt zum Formspree-Kontingent. Falls in Formspree
eine Domain-Einschränkung auf strongnoodles.ch aktiv ist, schlägt Formspree lokal fehl, und dann wird
(absichtlich) auch nichts ins Sheet geschrieben.

### c) Nach dem Push
1. Warten, bis GitHub Pages fertig ist (Repo → Actions bzw. 1 bis 2 Minuten).
2. strongnoodles.ch mit **Ctrl+F5** neu laden. In F12 → Netzwerk prüfen, dass `app.js?v=` die neue Nummer hat.
3. Eine Testbestellung machen und gleich prüfen wie bei b).

### Testzeilen entfernen
Zeile **nicht löschen** (sonst fehlt unten eine vorformatierte Zeile mit Formel) und nicht die ganze Zeile
markieren und Delete drücken (das löscht die Formel in I). Stattdessen mit gedrückter Ctrl-Taste die Zellen
A bis H, J bis K und N der Testzeile markieren und **Delete** drücken. Die Nummerierung geht danach bei der
höchsten noch vorhandenen SN-Nummer weiter.

## 6. Es erscheint keine Zeile im Sheet: was prüfen?
1. **Hat Formspree geklappt?** Nur dann wird ans Sheet gesendet. Kam die Mail an und zeigte die Website die Danke-Meldung?
2. **Konsole (F12)**: Steht dort die Warnung, kam die Anfrage gar nicht bei Google an (z. B. offline, URL-Tippfehler).
3. **`ORDER_SHEET_URL` in app.js**: gesetzt, endet auf `/exec` (nicht `/dev`), und die Seite lädt wirklich die neue
   app.js (Versionsnummer erhöht, Ctrl+F5)?
4. **Apps Script → links «Ausführungen»**: Gibt es einen Eintrag `doPost`?
   - Kein Eintrag: Die Anfrage kam nicht an. URL prüfen, Bereitstellung mit «Zugriff: Jeder»?
   - Eintrag mit Warnung «Bestellung abgelehnt: ...»: Der Grund steht dort (z. B. «Nicht erlaubt» = Token passt
     nicht, «Blatt "Bestellungen" nicht gefunden», «Keine freie Zeile mehr»).
   - Eintrag mit Fehler: Meldung lesen, meist fehlende Berechtigung. Dann `testDoPost` im Editor ausführen und neu zulassen.
5. **Script geändert, aber nichts passiert?** Neue Version bereitgestellt (Abschnitt 4)? Ohne das läuft die alte Version.
6. **Richtiges Sheet?** Die Web-App schreibt in die Google-Tabelle, in der das Script angelegt wurde, nicht in die
   ursprüngliche .xlsx-Datei.
