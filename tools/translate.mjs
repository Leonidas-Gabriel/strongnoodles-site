// Übersetzt i18n/source.json mit DeepL in alle Zielsprachen. Bereits übersetzte Texte werden
// wiederverwendet, es gehen also nur neue oder geänderte Texte an DeepL.
//
// Ablauf nach Textänderungen auf der Website:
//   1. Seite lokal öffnen, in der Browser-Konsole:  copy(JSON.stringify(await __i18nSource(), null, 1))
//      und das Ergebnis als i18n/source.json speichern.
//   2. PowerShell:  $env:DEEPL_KEY = "dein-key";  node tools/translate.mjs
//   3. In app.js I18N_VERSION erhöhen, damit Browser die neuen Dateien laden.
//
// Von Hand verbesserte Übersetzungen direkt in i18n/<code>.json ändern: vorhandene Einträge
// überschreibt das Skript nie (nur wenn sich der deutsche Text ändert, wird neu übersetzt).
//
// Den DeepL-Key NIE in eine Datei im Repository schreiben.
import { readFile, writeFile } from 'node:fs/promises';

const KEY = process.env.DEEPL_KEY;
if (!KEY) { console.error('Umgebungsvariable DEEPL_KEY fehlt.'); process.exit(1); }
const API = KEY.endsWith(':fx') ? 'https://api-free.deepl.com/v2/translate' : 'https://api.deepl.com/v2/translate';

// Dateiname -> DeepL-Zielsprache
const TARGETS = { en: 'EN-GB', fr: 'FR', it: 'IT', nl: 'NL', sv: 'SV', tr: 'TR' };

const dir = new URL('../i18n/', import.meta.url);
const source = JSON.parse(await readFile(new URL('source.json', dir), 'utf8'));

async function deepl(texts, target, html) {
  const out = [];
  for (let i = 0; i < texts.length; i += 50) {
    const res = await fetch(API, {
      method: 'POST',
      headers: { Authorization: `DeepL-Auth-Key ${KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: texts.slice(i, i + 50),
        source_lang: 'DE',
        target_lang: target,
        formality: 'prefer_less', // die Website duzt
        ...(html ? { tag_handling: 'html' } : {})
      })
    });
    if (!res.ok) { throw new Error(`DeepL ${res.status}: ${await res.text()}`); }
    out.push(...(await res.json()).translations.map((t) => t.text));
  }
  return out;
}

const keep = new Set([...source.html, ...source.text]);
for (const [lang, target] of Object.entries(TARGETS)) {
  const file = new URL(`${lang}.json`, dir);
  let dict = {};
  try { dict = JSON.parse(await readFile(file, 'utf8')); } catch { /* neue Sprache */ }
  let added = 0;
  for (const kind of ['html', 'text']) {
    const missing = source[kind].filter((s) => !(s in dict));
    if (!missing.length) { continue; }
    const translated = await deepl(missing, target, kind === 'html');
    missing.forEach((s, i) => { dict[s] = translated[i]; });
    added += missing.length;
  }
  const clean = Object.fromEntries(Object.entries(dict).filter(([k]) => keep.has(k)));
  await writeFile(file, JSON.stringify(clean, null, 1) + '\n');
  console.log(`${lang}: ${Object.keys(clean).length} Einträge (${added} neu übersetzt)`);
}
