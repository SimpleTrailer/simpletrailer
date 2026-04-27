# Fragen für dich

Stand: 2026-04-27 — sortiert nach was DU machen musst vs. was wir später zusammen klären.

---

## ✅ Beantwortet (in der Nacht)

- ~~Hauptfarbe?~~ → **Orange `#E85D00`** wie Webseite. ✓
- ~~Inhaber-Adresse für Templates?~~ → SimpleTrailer GbR, Lion Grone & Samuel Obodoefuna, Waltjenstr. 96, 28237 Bremen. ✓ (alle Templates ausgefüllt)

---

## ⚠️ EIN konkreter Befehl von dir — alles andere ist erledigt

**SQL-UPDATE in Supabase Console** (1 Minute):

1. Geh auf https://supabase.com/dashboard
2. Wähle dein SimpleTrailer-Projekt
3. Links auf "SQL Editor"
4. Folgendes Statement reinkopieren:

```sql
UPDATE trailers SET late_fee_per_hour = 15.00;
```

5. "Run" klicken — fertig.

**Warum nötig:** Das DB-Schema-Default ist auf 15 € umgestellt, aber das wirkt nur für NEUE Anhänger. Eure 1-3 vorhandenen Anhänger behalten sonst den alten 5 €-Wert. Mit dem UPDATE springen alle auf 15 €/h.

---

## 🟡 Du musst das tun, ich kann es nicht (Identität / Bezahlung erforderlich)

### A1: Apple Developer Account anlegen
- **Wo:** https://developer.apple.com/programs/enroll/
- **Kosten:** 99 USD/Jahr (~95 €)
- **Was du brauchst:** Apple-ID, Personalausweis/Pass, Kreditkarte
- **Dauer:** 24-48h Wartezeit auf Identitätsprüfung
- **Wann:** Nur wenn iOS-App in den Store soll (Empfehlung: erst Android machen)

### A2: Google Play Console Account anlegen
- **Wo:** https://play.google.com/console/signup
- **Kosten:** 25 USD einmalig (~24 €)
- **Was du brauchst:** Google-Konto, Kreditkarte
- **Dauer:** wenige Stunden
- **Wann:** Sobald du eine APK testen willst → MACHEN

### A3: Firebase-Projekt anlegen (für Push-Notifications)
- **Wo:** https://console.firebase.google.com
- **Kosten:** kostenlos
- **Was du brauchst:** Google-Konto
- **Dauer:** 15 Minuten
- **Wann:** Sobald A2 läuft und Push-Notifications gewünscht
- **Anleitung:** in [SETUP-NEEDED.md](./SETUP-NEEDED.md) Schritt 6

### A4: Mac für iOS-Build organisieren
- **Optionen:**
  - Eigener Mac (Mac Mini ab ~700 €)
  - MacInCloud (~25 €/Monat, kein Hardware-Kauf)
  - Codemagic / Bitrise CI (~30 €/Monat, automatisierter Build, kein eigener Mac nötig)
- **Wann:** Erst wenn iOS-Submission ansteht

---

## 🟢 Schon erledigt

- ✅ Templates (Datenschutz, AGB, Impressum) fertig mit euren GbR-Daten
- ✅ Verspätungsgebühr (5 €/h) und SB-Werte (500 €/50 €) aus eurem Schema gezogen
- ✅ JDK 17 + Android SDK portable installiert (in `mobile-app/tools/`, kein Admin-Recht)
- ✅ **DEBUG-APK gebaut**: `mobile-app/android/app/build/outputs/apk/debug/app-debug.apk` (7.2 MB)
  - Du kannst sie auf ein Android-Handy ziehen und installieren (Einstellungen → Sicherheit → "Installation aus unbekannten Quellen erlauben")
  - Oder via `adb install` falls dein Handy im Entwickler-Modus angeschlossen ist

---

## 🔵 Kommt später (kein Stress jetzt)

### B1: Datenschutz/AGB/Impressum auf simpletrailer.de hochladen
3 HTML-Dateien sind in `templates/` fertig. Du oder ich können das in einem **getrennten kleinen Commit** machen (nur Footer-Links + 3 statische Dateien — null Risiko für Buchungen). Sag Bescheid.

### B2: Footer-Links der Webseite aktivieren
In `index.html:1839-1841` sind aktuell `href="#"`-Platzhalter. Sobald B1 erledigt: 5-Sekunden-Edit.

### B3: "Konto löschen"-Button in account.html
Apple-Pflicht für Apps mit Registrierung. Stub-Endpoint liegt in `server-stub/delete-account.js`.

### B4: Push-Token in der App-WebView aktivieren
1 Block JavaScript in account.html, der den Token an `/api/save-push-token` sendet (Stub liegt in `server-stub/`).

→ B3 und B4 sind WEBSEITEN-ÄNDERUNGEN. Mache ich nur mit deinem ausdrücklichen "ja, mach das".

---

## 🔴 Optional / nice-to-have (irgendwann)

- Apple Sign In als zusätzliche Login-Option (verbessert App-Store-Chancen leicht)
- Tablet/iPad-Support mit eigenem Layout
- Mehrsprachigkeit (Englisch zusätzlich zu Deutsch)
- PWA-Manifest auf simpletrailer.de für "zum Homescreen hinzufügen"
