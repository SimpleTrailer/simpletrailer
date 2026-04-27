# Fragen für dich (morgens zu beantworten)

Sortiert nach Wichtigkeit. Beantwortung kann formlos passieren — ich integriere die Antworten dann ins Projekt.

---

## ⭐ HOCH-PRIORITÄT (blockieren weitere Arbeit)

### Q1: Hauptfarbe — Webseiten-Orange `#E85D00` oder dein gewünschtes Blau `#1e40af`?
**Status:** Ich habe Orange gesetzt (Webseiten-Konsistenz). Falls du wirklich Blau willst, sag Bescheid → 5 Sekunden umgestellt in `capacitor.config.ts`, `www/index.html`, `resources/icon-foreground.svg`.

### Q2: Wann investierst du in einen Mac (oder MacInCloud)?
Ohne Mac kein iOS-Build, keine App Store Submission. Empfehlung: Erstmal Android im Play Store launchen, dann iOS angehen.

### Q3: Apple Developer + Google Play Konten — wann beantragen?
Apple-Identitätsprüfung dauert 24-48h. Wenn das Geld kein Problem ist, jetzt beantragen.

### Q4: Soll die Webseite App-Detect haben?
Wenn ich an der Webseite arbeiten dürfte (was aktuell verboten ist), könnte ich:
- "Mein Konto"-Link verstecken oder beibehalten je nach App
- Banner "Lade unsere App!" nur im Browser zeigen
- Push-Aktivierungs-Hinweis im native Build

Ist das für dich okay? (Reine Reads von `window.Capacitor?.isNativePlatform()` ändern keine Buchungs-Logik.)

---

## MITTEL-PRIORITÄT

### Q5: Push-Notifications-Strategie — was soll gepusht werden?
Vorschläge:
- **24h vor Pickup:** "Morgen holst du deinen Anhänger ab. Hier nochmal die Daten:"
- **Nach Pickup:** "Viel Spaß! Bei Problemen: 0421-…"
- **2h vor Rückgabe:** "Erinnerung: Rückgabe heute um …"
- **Nach Rückgabe:** "Danke! Deine Rückerstattung ist veranlasst." (oder die Schadens-Bestätigung)
- **Bei Verspätung:** "Du bist > 30 Min über der Buchung. Bitte zurückbringen."

Welche davon willst du? Andere?

### Q6: Account-Löschung in der App
Apple verlangt seit 2022, dass Apps mit Account-Erstellung auch In-App-Löschung anbieten.
- Hat `account.html` schon einen "Account löschen"-Button?
- Falls nein: muss vor App-Submission ergänzt werden.

### Q7: Wo soll die Datenschutzerklärung leben?
Apple und Google erwarten eine öffentliche URL. Aktuell: gibt es `simpletrailer.de/datenschutz` schon? Wenn nicht, brauchen wir die Seite (mind. Stub).

### Q8: Impressum + AGB
Im Footer von index.html:1839-1841 sind die Links Platzhalter (`href="#"`). Für deutsche Apps + Webseiten Pflicht. Vor Submission: echte Seiten verlinken.

### Q9: App-Beschreibungstext + Screenshots
Brauchst du Hilfe beim Schreiben der Store-Beschreibung? (Kann ich als Template vorbereiten, du finalisierst.)

### Q10: Bremen-only oder bundesweit?
Der Texte-Tonus + Marketing-Fokus hängt davon ab. Aktueller Stand: Bremen-fokussiert.

---

## NIEDRIG-PRIORITÄT

### Q11: App-Icon final
Mein generiertes Platzhalter-Icon ist okay aber nicht professionell. Möchtest du:
- (a) Damit erstmal in den Store?
- (b) Designer beauftragen (~50-200 €)?
- (c) Selbst in Canva/Figma machen?

### Q12: Splash-Screen-Animation
Aktuell statisch. Capacitor v6 unterstützt Animation. Möchtest du z.B. ein animiertes Logo?

### Q13: App-Sprache
Aktuell: nur Deutsch. Sollte später auch Englisch (Touristen / Studierende ausländischer Herkunft)?

### Q14: Apple Sign In
Nicht zwingend (du nutzt Email/Pass), aber Apple bevorzugt Apps mit Apple Sign In. Lohnt der zusätzliche Implementierungs-Aufwand?

### Q15: Tablet-Support / iPad-Layout
Aktuell für Phone optimiert. iPad zeigt das Phone-Layout größer. Eigenes Layout?

### Q16: Web App Manifest für PWA?
Capacitor-Assets hat PWA-Icons generiert. Ich könnte zusätzlich ein PWA-Manifest in der Webseite ergänzen, sodass simpletrailer.de auch "zum Homescreen hinzufügen" gut aussieht. Interessiert?
