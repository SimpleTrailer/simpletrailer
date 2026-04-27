# Apple App Store Listing — SimpleTrailer

> Sprache: Deutsch (Primary), Englisch (sekundär empfohlen)
> Stand: 2026-04-27 — Entwurf, vom User noch zu finalisieren.

---

## App-Name (max 30 Zeichen)
```
SimpleTrailer
```

## Untertitel (max 30 Zeichen)
```
Anhänger mieten in Bremen
```
(25 Zeichen)

## Promo-Text (max 170 Zeichen, jederzeit ohne Review änderbar)
```
Neu: Push-Benachrichtigungen, native Foto-Aufnahme bei Übergabe und schnellere Buchung. Anhänger ab 5,90 €/Stunde – jetzt mit dem Handy mieten.
```

## Beschreibung (max 4000 Zeichen)

```
SimpleTrailer ist die einfachste Art, einen PKW-Anhänger in Bremen zu mieten.

Online buchen, mit dem iPhone entsperren, losfahren – ohne Schalter, ohne Wartezeit.

SO FUNKTIONIERT'S

• Anhänger in deiner Nähe finden – mit Karte und Standortzugriff
• Wunsch-Zeitraum auswählen – stundenweise, tageweise oder am Wochenende
• Sicher bezahlen mit Karte, Apple Pay oder PayPal
• Mit dem Code aus der App den Anhänger holen
• Bei Rückgabe einfach Foto aufnehmen – fertig

DEINE VORTEILE

• Verfügbar 24/7 – auch nachts und am Wochenende
• Stundenweise ab 5,90 €, faire Tagestarife
• Optionaler Basis- oder Premium-Schutz
• Keine versteckten Gebühren
• Echtzeit-Verfügbarkeit – du siehst direkt, was frei ist
• Sofortige Buchungs-Bestätigung per E-Mail und Push

PERFEKT FÜR

• Möbel-Transport beim Umzug
• Gartenabfälle zum Wertstoffhof
• Sperrige Einkäufe aus dem Möbelhaus
• Baustoff-Lieferungen für Heimwerker-Projekte

APP-EXKLUSIVE FEATURES

• Push-Benachrichtigungen für Erinnerungen vor Pickup und Rückgabe
• Native iPhone-Kamera für Vor-/Nach-Fotos
• "Anhänger in meiner Nähe" mit präziser Standort-Anzeige
• Buchungs-Historie immer dabei

LOKAL IN BREMEN

SimpleTrailer ist ein lokales Unternehmen aus Bremen. Persönlicher Service, schnelle Hilfe per E-Mail.

DATENSCHUTZ

• Alle Daten verschlüsselt übertragen (HTTPS)
• Zahlungsabwicklung über Stripe (PCI-konform)
• Kein Tracking, kein Verkauf deiner Daten
• Konto-Löschung jederzeit in der App möglich

DSGVO-konform und auf einem deutschen Server gehostet.

KONTAKT

E-Mail: info@simpletrailer.de
Web: simpletrailer.de
```

(~1700 Zeichen)

---

## Keywords (max 100 Zeichen, kommagetrennt, kein Leerzeichen nach Komma)

```
anhänger,mieten,trailer,transport,umzug,bremen,pkw,sharing,carsharing,möbel,plane
```
(86 Zeichen)

---

## Kategorie
**Primär:** Reisen
**Sekundär:** Wirtschaft

## Altersfreigabe
**4+** (keine bedenklichen Inhalte)

---

## App Privacy ("Privacy Nutrition Label")

Aus `ios/App/App/PrivacyInfo.xcprivacy` zusammengefasst — in App Store Connect manuell auswählen:

### Data Linked to You
- **Contact Info:** Email, Name, Phone, Physical Address (für Konto + Mietvertrag)
- **User Content:** Photos (Schadens-Dokumentation)
- **Purchases:** Purchase History (deine Buchungen)
- **Identifiers:** User ID (zur Konto-Verwaltung)
- **Financial Info:** Payment Info (verarbeitet durch Stripe)

### Data Not Linked to You
- **Location:** Coarse Location (für "Anhänger in der Nähe" — wir speichern es nicht)

### Data Used to Track You
- Keine.

---

## In-App-Purchases / Abos
Keine. Bezahlung pro Miete via Stripe (eine Webview-Transaktion). Apple's IAP gilt für digitale Güter — physische Anhänger-Miete ist davon ausgenommen (App Store Review Guideline 3.1.5(a)).

> Wichtiger Hinweis bei der Submission: in App Store Connect ankreuzen **"Goods or services consumed outside the app"** und **"Booking or rental of physical goods"**. Sonst Reject wegen IAP-Pflicht.

---

## Screenshots

### iPhone 6.7" (1290×2796) — REQUIRED, mind. 3
1. Karte mit Anhänger-Standorten (Hero)
2. Buchungs-Formular
3. Bezahlung mit Apple Pay
4. Buchungs-Bestätigung
5. (optional) Onboarding "Berechtigungen"

### iPhone 6.1" (1170×2532) — REQUIRED, mind. 3
Gleiche Inhalte, anderes Format.

### iPhone 5.5" (1242×2208) — Optional, aber empfohlen für ältere Geräte
Gleiche Inhalte.

### iPad 12.9" (2048×2732) — REQUIRED falls iPad-Support, mind. 3
Falls du iPad-Support nicht willst: in Xcode "iPhone" als einziges Target setzen, dann braucht es keine iPad-Screenshots.

> Wer macht's? Auf dem Mac via iOS-Simulator (Cmd+S für Screenshot) — Anleitung in DESIGNER-BRIEF.md.

---

## App-Icon
**1024×1024 px** PNG, kein Alpha-Kanal, keine abgerundeten Ecken (Apple rundet automatisch).
> Aktuell vorhanden als Platzhalter, generiert aus `resources/icon-only.svg`. Final-Version siehe DESIGNER-BRIEF.md.

---

## App-Review-Information

### Demo-Account (für Apple Reviewer)
> Apple braucht zum Testen einen funktionierenden Account ohne dass sie selbst registrieren müssen.
> Lege EINEN Test-Account in Supabase an mit:
- E-Mail: `apple.review@simpletrailer.de`
- Passwort: (sicher generieren, in App Store Connect eintragen)
- Im Account: 1-2 Beispiel-Buchungen, Identitäts-Verifikation simuliert ok.

### Kontakt
- Vorname: (dein Name)
- Nachname: (dein Name)
- Telefonnummer: (Bremen-Festnetz oder Mobil)
- E-Mail: info@simpletrailer.de

### Notes (sehr wichtig — adressiert Guideline 4.2 proaktiv)
```
SimpleTrailer is a real-world trailer rental service operating in Bremen, Germany.
The app provides:
- Native push notifications for booking reminders (pickup, return, late warnings)
- Native iPhone camera integration for required pre-/post-rental damage documentation
- Native CoreLocation for finding the nearest trailer station
- Native deep-link routing for booking confirmations from email

The booking and payment flows leverage our existing PCI-compliant web infrastructure
through a secure WebView, but app-exclusive native features (push, camera, location)
provide significant value beyond the website experience.

We rent physical trailers (cars/PKW Anhänger) — IAP does not apply per Guideline 3.1.5(a).

Test account credentials are provided above. The Stripe payment in test mode uses
the standard test card 4242 4242 4242 4242 with any future expiry and any CVC.
```

---

## Datenschutzerklärung-URL
`https://simpletrailer.de/datenschutz` (TODO: Seite muss existieren)

## Support-URL
`https://simpletrailer.de/support` ODER `mailto:info@simpletrailer.de`

## Marketing-URL (optional)
`https://simpletrailer.de`

---

## Pricing
**Preisstufe:** Kostenlos (App-Download).
**In-App-Purchases:** Keine.

---

## Verfügbarkeit
**Märkte:** Deutschland (DE), evtl. Österreich (AT), Schweiz (CH), Niederlande (NL).
> Tipp: Erstmal NUR DE — du sparst dir die Übersetzungen für Listings in andere Sprachen, und du bedienst eh nur Bremen.

---

## Versions-Notes (für jede neue Version, max 4000 Zeichen)
Beispiel für Version 1.0:
```
Erste Version von SimpleTrailer für iPhone!

Das ist neu:
• Anhänger online mieten – jederzeit, überall in Bremen
• Push-Benachrichtigungen vor Pickup und Rückgabe
• Native Kamera für Schadens-Fotos
• "Anhänger in meiner Nähe" mit Standortzugriff
• Sichere Zahlung via Apple Pay, Karte, PayPal

Fragen oder Feedback? Schreib uns: info@simpletrailer.de
```
