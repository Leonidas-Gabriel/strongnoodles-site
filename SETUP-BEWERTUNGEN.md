# Bewertungen einrichten (Supabase)

Die Bewertungen werden in einer kostenlosen Supabase-Datenbank gespeichert. Die Website spricht direkt mit ihr.
Einmalige Einrichtung, ca. 10 Minuten.

## 1. Projekt erstellen
1. Auf https://supabase.com ein Konto erstellen und **New project** klicken.
2. Name z. B. `strongnoodles`, ein starkes Datenbank-Passwort setzen (gut aufbewahren, brauchst du später nicht auf der Website).
3. Region: **Europe (Zurich)** oder **Frankfurt** (näher bei den Besuchern, gut für den Datenschutz).

## 2. Tabelle und Schutzregeln anlegen
Im Projekt links **SQL Editor** → **New query**, den folgenden Code einfügen und **Run** klicken:

```sql
create table public.reviews (
  id         bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  name       text check (name is null or char_length(name) <= 40),
  stars      smallint not null check (stars between 1 and 5),
  comment    text not null check (char_length(comment) between 1 and 500)
);

alter table public.reviews enable row level security;

-- alle dürfen Bewertungen lesen und neue schreiben
create policy "Alle duerfen lesen"
  on public.reviews for select
  using (true);

create policy "Alle duerfen bewerten"
  on public.reviews for insert
  with check (true);

-- NUR der Admin darf löschen (angemeldet mit dieser E-Mail)
create policy "Nur Admin darf loeschen"
  on public.reviews for delete
  to authenticated
  using ((auth.jwt() ->> 'email') = 'strongnoodles.yes@gmail.com');
```

Es gibt absichtlich keine Regel zum Ändern: bestehende Bewertungen kann niemand bearbeiten.

## 3. Admin-Zugang erstellen
1. Links **Authentication** → **Users** → **Add user** → **Create new user**.
2. E-Mail: `strongnoodles.yes@gmail.com`, ein Passwort wählen, **Auto Confirm User** anhaken.
3. Danach unter **Authentication** → **Sign In / Providers** (bzw. *Settings*) die Option **Allow new users to sign up** ausschalten.

Mit dieser E-Mail und dem Passwort meldest du dich auf der Bewertungsseite unten über «Admin» an und siehst bei jeder Bewertung einen «Löschen»-Knopf.

## 4. Zugangsdaten in die Website eintragen
1. **Project Settings** (Zahnrad) → **API** (bzw. *API Keys*).
2. **Project URL** und den **anon public** Key kopieren.
3. In `app.js` eintragen:
   ```js
   const SUPABASE_URL = 'https://DEIN-PROJEKT.supabase.co';
   const SUPABASE_ANON_KEY = 'eyJ...';
   ```
4. In `index.html` die Versionsnummer bei `styles.css?v=` und `app.js?v=` erhöhen, damit Browser die neue Datei laden.

> Der **anon**-Key darf öffentlich sein, er ist nur so mächtig, wie es die Regeln oben erlauben.
> Den **service_role**-Key darfst du NIE in die Website eintragen.

## Hinweise
- Neue Bewertungen erscheinen sofort. Unpassende löschst du als Admin.
- Die kostenlose Supabase-Version pausiert Projekte nach ca. 1 Woche ohne Aktivität. Dann im Dashboard auf **Restore** klicken.
- Spam-Schutz: Feld-Längen und Sterne-Bereich werden in der Datenbank geprüft, dazu gibt es ein Honeypot-Feld und eine
  1-Minuten-Bremse im Browser. Wer gezielt Spam schickt, kann das aber umgehen. Dann einfach löschen oder melde dich bei mir.
