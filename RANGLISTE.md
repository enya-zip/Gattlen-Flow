# Rangliste einrichten (Supabase)

Gattlen Flow nutzt dasselbe Supabase-Projekt wie Iischi Party («Ranglisten der Spiele»), aber eigene Tabellen (`gattlen_flow_…`).
Die Rangliste speichert Name, E-Mail-Adresse und Punkte. Andere Spieler sehen nur **Platz, Name und Punkte**.
E-Mail-Adressen sind nur im Supabase-Dashboard sichtbar.

## Was gezählt wird
Gewertet wird **die Reise**: die Summe der besten Punkte aus allen 12 Levels (pro Level 100 bis 1000 Punkte, höchstens 12'000).
Nach jedem geschafften Level kann man sich über «Zur Rangliste» eintragen. Wer später mehr Punkte hat, trägt sich einfach nochmals ein.
Die Tageschallenge zählt nicht für die Rangliste. Die Rangliste ist auch oben rechts über das Pokal-Symbol erreichbar.

## 1. Datenbank vorbereiten (einmalig)
1. Auf https://supabase.com das Projekt **Ranglisten der Spiele** öffnen.
2. Links **SQL Editor** öffnen.
3. Den ganzen Inhalt von [`supabase/rangliste.sql`](supabase/rangliste.sql) einfügen und auf **Run** klicken.

## 2. Spiel verbinden
Ist schon erledigt: In [`app/public/leaderboard-config.js`](app/public/leaderboard-config.js) stehen dieselbe Projekt-Adresse
und derselbe **Publishable key** wie bei Iischi Party. Der Publishable key darf öffentlich im Spiel stehen.
Den **Secret key** (`sb_secret_…`) niemals eintragen.

Die Supabase-Adresse ist ausserdem in [`app/public/_headers`](app/public/_headers) unter `connect-src` erlaubt,
sonst würde der Browser die Verbindung blockieren.

## Einträge ansehen
Supabase → **Table Editor**:
- `gattlen_flow_rangliste`: bestes Ergebnis pro Spieler mit Platz, Name, E-Mail, Punkten, geschafften Levels, Sternen, Anzahl Einträge und Datum.
- `gattlen_flow_alle_spiele`: alle einzelnen Einträge. Hier lassen sich Einträge löschen
  (z. B. bei Auskunfts- oder Löschanfragen nach Datenschutzgesetz oder bei verdächtigen Punktzahlen).

## Gut zu wissen
- Pro E-Mail-Adresse zählt nur das beste Ergebnis.
- Pro E-Mail-Adresse sind höchstens 20 Einträge pro Stunde möglich (Spam-Schutz).
- Die Datenbank lehnt unmögliche Werte ab (z. B. mehr als 1000 Punkte oder mehr als 3 Sterne pro Level).
- Die Punkte stammen aus dem Browser. Wer sich mit Technik auskennt, könnte trotzdem eine falsche Punktzahl einsenden.
  Verdächtige Einträge vor einer Gewinnerauswahl prüfen.
