# Umstellung Stripe → Mollie + neuer Führerschein-Check

Stand: 30.07.2026. Diese Datei ist die Schritt-für-Schritt-Anleitung für alles, was **du**
im Browser machen musst. Der Code ist fertig.

---

## Was sich geändert hat

**Zahlung**
Statt eines Bezahlformulars auf der Seite wirst du zu Mollie weitergeleitet und wählst dort
Karte, PayPal, Apple Pay oder Google Pay. Danach geht es automatisch zurück auf die
Bestätigungsseite. Alles andere bleibt gleich: gleiche Preise, gleiche Rabattcodes,
gleiche Mails, gleiche PDFs, gleicher Doppelbuchungs-Schutz.

**Verspätungsgebühr, Rückgabe-Aufpreis, Verlängerung**
Läuft weiter automatisch — über ein Mandat, das der Kunde bei der ersten Zahlung erteilt.
Klappt die Abbuchung nicht, bekommst du wie bisher sofort eine Alarm-Mail.

**Führerschein**
Stripe Identity ist mit dem Konto weggefallen. Ersatz: Der Kunde macht drei Fotos
(Vorderseite, Rückseite, Selfie). Eine KI liest den Führerschein aus, vergleicht das Selfie
mit dem Lichtbild und gibt eindeutige Fälle sofort frei. Alles Unklare landet in deinem
Admin unter „⏳ Zu prüfen" — du siehst die Bilder und entscheidest. **Die KI lehnt niemals
selbst ab** (das schreibt die DSGVO so vor). Nach jeder Entscheidung werden die Bilder
automatisch gelöscht.

---

## Schritt 1 — Mollie einrichten (du, im Browser)

### 1.1 Zahlungsmethoden aktivieren
1. Öffne https://my.mollie.com/dashboard/settings/profiles
2. Klick auf dein Profil → **Zahlungsmethoden**
3. Aktiviere: **Kreditkarte**, **PayPal**, **Apple Pay**, **Google Pay**
4. **Überweisung (Banktransfer) NICHT aktivieren** — dauert 1–2 Bankarbeitstage, der
   Anhänger soll aber sofort abholbar sein. (Der Code schließt sie zusätzlich aus.)

### 1.2 Wiederkehrende Zahlungen freischalten — **wichtig**
Ohne das kann die Verspätungsgebühr später nicht automatisch abgebucht werden.
1. Im Dashboard unter **Einstellungen → Website-Profil** nach „Recurring" / „Wiederkehrende
   Zahlungen" suchen und aktivieren.
2. Findest du den Punkt nicht: schreib den Mollie-Support an mit dem Satz
   *„Bitte Recurring Payments (sequenceType first/recurring) für unser Profil freischalten —
   wir belasten Verspätungsgebühren nach der Miete nach."*

### 1.3 API-Schlüssel holen
1. Öffne https://my.mollie.com/dashboard/developers/api-keys
2. Kopiere zuerst den **Test-API-Key** (beginnt mit `test_`)

---

## Schritt 2 — Schlüssel bei Vercel eintragen (du)

1. Öffne https://vercel.com/dashboard → Projekt **simpletrailer** → **Settings** →
   **Environment Variables**
2. Neue Variable anlegen:
   - **Name:** `MOLLIE_API_KEY`
   - **Value:** dein Test-Key (`test_...`)
   - **Environments:** alle drei ankreuzen (Production, Preview, Development)
3. Speichern.
4. Prüfen, dass `ANTHROPIC_API_KEY` schon existiert (für die Führerschein-Prüfung nötig) —
   das ist derselbe Schlüssel, den der Simply-Chat nutzt, sollte also da sein.

Diese beiden dürfen **bleiben**, solange noch alte Buchungen im System sind:
`STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`. Sie werden nicht mehr benutzt und können
später gelöscht werden.

---

## Schritt 3 — Deploy

Sag mir Bescheid, dann committe und pushe ich. Vercel baut dann automatisch.

### Bereits erledigt (30.07.2026)

- ✅ `MOLLIE_API_KEY` (Test) in Production + Development gesetzt; Preview fehlt noch,
  ist aber unkritisch, weil über `main` deployt wird.
- ✅ Zahlungsmethoden aktiv: Apple Pay, Google Pay, PayPal, Karte — genau die vier aus
  AGB § 5. Klarna und Sofortüberweisung fallen weg, weil sie kein Mandat für die
  automatische Verspätungsgebühr erzeugen können.
- ✅ Mollie-Konto-Status: **verified**.
- ✅ Führerschein-Daten aller 15 Bestandskunden von `user_metadata` nach `app_metadata`
  migriert (12 davon verifiziert). Skript: `scripts/migrate-dl-to-app-metadata.js`.
- ✅ SQL-Migration `supabase-migration-mollie-umstellung.sql` in Supabase ausgeführt
  (6 neue Spalten in `bookings`).

---

## Schritt 4 — Testlauf mit dem Test-Key

Solange der Test-Key drin ist, fließt **kein echtes Geld**.

**Zwei Schutzmechanismen greifen dabei automatisch:**

1. Das Notfall-Banner („Online-Zahlung gerade nicht verfügbar") steht weiter auf der
   Buchungsseite.
2. **Wichtiger:** Solange `MOLLIE_API_KEY` mit `test_` beginnt, weist der Server jede
   Buchung ab, die nicht von einem der Test-Konten kommt (`lion.grone@hotmail.com`,
   `info@simpletrailer.de`, `byfusionlion@gmail.com`). Ohne diese Sperre könnte ein echter
   Kunde auf der Mollie-Testseite „Paid" klicken und bekäme eine gültige Buchung samt
   Schloss-Code, ohne einen Cent bezahlt zu haben.

Beide Sperren verschwinden von selbst, sobald der Live-Key drin ist — es ist nichts
zurückzubauen. Die Test-Konten stehen oben in `api/create-mollie-payment.js` (`TESTERS`).

Diese Reihenfolge durchspielen:

1. **Führerschein:** Mit einem Testkonto einloggen → Buchung starten → Schritt 3 →
   drei Fotos machen → prüfen lassen.
   - Erwartung: entweder sofort „Führerschein bestätigt", oder „wir schauen persönlich drauf".
   - Beim zweiten Fall: Admin öffnen → Tab **Kunden** → oben der gelbe Kasten
     „⏳ 1 Führerschein wartet auf deine Prüfung" → Kunde öffnen →
     **🪪 Führerschein-Bilder anzeigen** → **✓ Freigeben**.
   - Der Kunde bekommt automatisch eine Mail.
2. **Buchung + Zahlung:** Weiter bis Schritt 5 → „Jetzt buchen & bezahlen" →
   du landest auf der Mollie-Testseite → dort **„Paid"** auswählen.
   - Erwartung: zurück auf der Bestätigungsseite, Buchungsnummer + Schloss-Code-Hinweis,
     Bestätigungsmail mit Mietvertrag und Rechnung im Anhang.
3. **Abbruch testen:** Nochmal buchen, auf der Mollie-Seite **„Canceled"** wählen.
   - Erwartung: „Die Zahlung wurde abgebrochen. Es wurde nichts abgebucht."
4. **Rückgabe mit Verspätung:** Im Admin die Buchung auf `active` setzen, `end_time` in der
   Vergangenheit → Rückgabe durchspielen.
   - Erwartung: Verspätungsgebühr wird angestoßen. Im Test-Modus schlägt die Abbuchung ggf.
     fehl → dann kommt die Alarm-Mail „OFFENE FORDERUNG". Beides ist ein gültiges Ergebnis;
     wichtig ist, dass du eine Mail bekommst und nichts stillschweigend verschwindet.
5. **Storno:** Im Kundenkonto stornieren → Erstattung muss im Mollie-Dashboard auftauchen.
6. **Admin-Zahlungsinfo:** Buchung im Admin öffnen → bei „Zahlung" muss die Methode stehen
   (z. B. „PayPal" oder „Karte ···· 1234") plus ein Link ins Mollie-Dashboard.

---

## Schritt 5 — Live schalten

Wenn Schritt 4 durchläuft:

1. Bei Mollie den **Live-API-Key** holen (`live_...`) — gleiche Seite wie in Schritt 1.3.
   Der Live-Key erscheint erst, wenn Mollie dein Konto freigegeben hat.
2. Bei Vercel `MOLLIE_API_KEY` auf den Live-Key ändern → **Redeploy** auslösen.
3. Sag mir Bescheid — dann entferne ich das Notfall-Banner aus der Buchungsseite.
4. Erste echte Buchung selbst durchspielen (kleiner Betrag, z. B. Kurztrip 9 €) und danach
   im Mollie-Dashboard erstatten.

---

## Wichtig zu wissen

**Mollie prüft dein Konto nach der ersten echten Transaktion.**
Das steht so in deinem Onboarding. Halte bereit: Gewerbeanmeldung, GbR-Vertrag,
Ausweise beider Gesellschafter, Kontoauszug/IBAN-Nachweis. Antworte sofort, wenn Mollie
etwas anfordert — genau das Nicht-Antworten hat bei Stripe zur Schließung geführt.

**Rückbuchungen niemals einfach akzeptieren.**
Bei Stripe war das der Auslöser: zwei akzeptierte Rückbuchungen = zwei verlorene Fälle =
18 % Quote. Kommt eine Rückbuchung, bekommst du jetzt sofort eine Mail mit dem Hinweis.
Richtig ist: entweder **selbst erstatten** (zählt nicht gegen die Quote) oder **mit Beweisen
bestreiten** (Mietvertrag-PDF, Precheck-Fotos, Rückgabe-Fotos, GPS-Protokoll).

**Alte Stripe-Buchungen.**
Buchungen mit `pi_...`-Zahlung können nicht mehr automatisch erstattet oder nachbelastet
werden — das Konto ist zu. Der Code sagt in dem Fall klar „Alt-Buchung über Stripe" statt
stillschweigend zu scheitern. Solche Fälle musst du per Überweisung regeln.

**Kosten der Führerschein-Prüfung.**
Jede Prüfung kostet ein paar Cent Anthropic-Gebühr und fällt nur einmal pro Kunde an.
Pro Kunde sind maximal 6 Versuche pro Stunde erlaubt, danach wird auf dich verwiesen.

**Rechtstexte.**
AGB, Datenschutz und die App-Vorlagen sind angepasst (Mollie statt Stripe, neuer
Führerschein-Check, Art. 22 DSGVO). Lass den `legal-checker` einmal drüberschauen, bevor
das live geht — besonders über den neuen Absatz zum biometrischen Abgleich.

---

## Was Claude gebaut hat (zum Nachschlagen)

| Datei | Zweck |
|---|---|
| `api/_mollie.js` | Mollie-Anbindung: Zahlung, Erstattung, Mandat, Nachbelastung |
| `api/_charge.js` | Anbieter-neutrale Nachbelastung + Erstattung (erkennt Mollie vs. alte Stripe-IDs) |
| `api/create-mollie-payment.js` | Zahlung starten (Ersatz für `create-payment-intent.js`) |
| `api/mollie-webhook.js` | Verbindlicher Zahlungsstatus + Rückbuchungs-Alarm |
| `api/verify-license.js` | Führerschein-Prüfung mit KI |
| `api/_license-store.js` | Privater Bilderspeicher + automatisches Löschen |
| `license-check.js` | Foto-Oberfläche (Buchung + Kundenkonto teilen sie sich) |

Gelöscht: `api/create-payment-intent.js`, `api/stripe-webhook.js`, `api/identity.js`.
