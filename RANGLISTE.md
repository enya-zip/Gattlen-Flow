# Rangliste einrichten (Supabase)

Gattlen Flow nutzt dasselbe Supabase-Projekt wie Iischi Party («Ranglisten der Spiele»), aber eigene Tabellen (`gattlen_flow_…`).
Die Rangliste speichert Name, E-Mail-Adresse und Punkte. Andere Spieler sehen nur **Platz, Name und Punkte**.
E-Mail-Adressen sind nur im Supabase-Dashboard sichtbar.

## Was gezählt wird
Gewertet wird **die Zeit**: Wer ein Level am schnellsten schafft, steht zuoberst. Jedes der 12 Levels hat eine eigene Rangliste.
- Die Uhr läuft ab dem Start des Levels und ist im Spiel oben bei «ZEIT» sichtbar.
- Jeder Tipp zählt 10 Sekunden zur Zeit dazu (sonst wäre man mit Tipps am schnellsten).
- Bei gleicher Zeit gewinnt, wer weniger Züge brauchte.
- Pro E-Mail-Adresse und Level zählt nur die beste Zeit.
- Wer die Seite mitten im Level neu lädt, bekommt für diesen Versuch keine Zeit (sonst könnte man die Uhr zurücksetzen).

Nach jedem geschafften Level gibt es den Knopf «Zeit in die Rangliste eintragen». Die Ranglisten aller Levels sind
auch oben rechts über das Pokal-Symbol erreichbar. Die Tageschallenge gibt es nicht mehr.

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
- `gattlen_flow_rangliste`: beste Zeit pro Spieler und Level mit Level, Platz, Name, E-Mail, Sekunden, Zügen, Tipps, Anzahl Einträge und Datum.
- `gattlen_flow_alle_spiele`: alle einzelnen Einträge. Hier lassen sich Einträge löschen
  (z. B. bei Auskunfts- oder Löschanfragen nach Datenschutzgesetz oder bei verdächtigen Punktzahlen).

## Gut zu wissen
- Pro E-Mail-Adresse sind höchstens 30 Einträge pro Stunde möglich (Spam-Schutz).
- Die Datenbank lehnt unmögliche Werte ab (z. B. weniger als 1 Sekunde oder eine Zeit ohne die Strafzeit für Tipps).
- Das SQL-Skript ersetzt frühere Entwürfe der Rangliste automatisch.
- Die Zeit wird im Browser gemessen. Wer sich mit Technik auskennt, könnte trotzdem eine falsche Zeit einsenden.
  Verdächtige Einträge (z. B. unrealistisch kurze Zeiten) vor einer Gewinnerauswahl prüfen.
