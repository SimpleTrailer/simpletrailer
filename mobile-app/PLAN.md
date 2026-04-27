# SimpleTrailer Mobile App – Plan

**Erstellt:** 2026-04-27, Phase 1 (Analyse + Plan)
**Autor:** Claude (autonome Nachtarbeit)
**Status:** Plan – wird in Phase 2 umgesetzt

---

## 1. Empfohlene Technologie: Capacitor

### Warum Capacitor (statt React Native, Flutter, Cordova, oder Native)?
- **Webseite ist schon fertig.** Alle 7 HTML-Seiten + Stripe-Integration laufen LIVE. Capacitor wrappt diese 1:1 — kein Re-Build nötig.
- **Stripe.js funktioniert in WebView.** Stripe Elements, Apple Pay (via Wallet-Plugin) und Google Pay laufen damit.
- **Native Plugins on demand.** Kamera, Geolocation, Push, Splash — alle als offizielle Plugins verfügbar.
- **iOS UND Android aus einer Codebase.** Nur ein `www/`-Ordner, zwei Plattform-Targets.
- **Updates ohne Store-Review.** Wenn `server.url` auf simpletrailer.de zeigt, schlagen Webseiten-Änderungen sofort durch.

### Verworfene Alternativen
- **React Native / Flutter:** Wäre kompletter Rewrite. Stripe-Integration müsste neu. 4-8 Wochen Arbeit.
- **Cordova:** Capacitors Vorgänger, weniger gepflegt, schlechtere DX.
- **Native (Swift + Kotlin):** Doppelter Aufwand, kein Vorteil.
- **PWA only:** Kein App Store Eintrag möglich. iOS-Push begrenzt.

---

## 2. Architektur-Entscheidung: Hybrid-Loader

**Variante A (gewählt): App lädt simpletrailer.de via `server.url`**
- App ist ein dünner native Wrapper.
- Webseite wird live geladen — alle Updates ohne neuen Store-Release.
- Native Plugins über Capacitor-Bridge zugreifbar (window.Capacitor.Plugins.…).
- Start-URL kommt aus `mobile-app/www/config.js` → kann nachträglich auf Clean-URLs geändert werden ohne neuen Build.

**Variante B (nicht gewählt): App bündelt eine eigene Kopie der HTML-Dateien**
- Vorteil: Funktioniert offline, keine Webseiten-Abhängigkeit.
- Nachteil: Jeder Bugfix erfordert App-Re-Submission. Bei 1-Mann-Betrieb unrealistisch.

**Apple-Risiko:** Apple Guideline 4.2 lehnt "minimum-functionality web wrappers" ab. Mitigation:
1. Echte native Plugins, die in der WebView aufgerufen werden (Push, Kamera, Geo).
2. Native Splash Screen + App-Icon.
3. Privacy-Strings (NSCameraUsageDescription etc.) sauber gesetzt.
4. Empfehlung für Phase 3 (nicht nachts machbar): "Native Booking-Detail-Screen" als Eigenleistung neben WebView ergänzen, falls Review fehlschlägt.

---

## 3. Konkrete Umsetzungs-Schritte

### Tonight (autonome Nacht):
1. Branch `mobile-app-development` ✅
2. `mobile-app/` Ordner mit eigener `package.json` (separat von Haupt-Webseiten-package.json)
3. Capacitor + Plugins installieren:
   - `@capacitor/core`, `@capacitor/cli`
   - `@capacitor/android`, `@capacitor/ios`
   - `@capacitor/push-notifications`
   - `@capacitor/camera`
   - `@capacitor/geolocation`
   - `@capacitor/splash-screen`
   - `@capacitor/app` (Deep-Link-Handler)
   - `@capacitor/status-bar`
4. `capacitor.config.ts` mit App-ID `de.simpletrailer.app`, Name `SimpleTrailer`, Server-URL via Config.
5. `www/index.html` als Bootstrapper:
   - Lädt `config.js` → liest `START_URL`.
   - Leitet via `window.location.replace(START_URL)` weiter.
   - Capacitor `server.url` zeigt auf https://simpletrailer.de.
6. `www/native-bridge.js`: dünne JS-Schicht, die der Webseite native Features anbietet (auch wenn die Webseite sie noch nicht aufruft — Apple sieht sie aktiv).
7. Android-Plattform: `npx cap add android`. AndroidManifest mit Permissions (CAMERA, ACCESS_FINE_LOCATION, INTERNET, POST_NOTIFICATIONS).
8. iOS-Plattform: `npx cap add ios`. Info.plist mit Privacy-Strings.
9. Resources-Ordner mit Platzhalter-Icon (1024×1024) + Splash (2732×2732) — generiert via SVG, dann mit @capacitor/assets verteilt.
10. Versuche `cd android && ./gradlew assembleDebug`. Fällt voraussichtlich aus, weil **kein JDK + Android SDK** auf dem System (s. Abschnitt 5).
11. Alle Doku-Dateien (README, NEXT-STEPS, …) befüllen.
12. Final Commit auf `mobile-app-development` Branch.

### Morgen vom User zu erledigen:
- Android Studio installieren (für SDK + Emulator).
- Mac für iOS-Build organisieren (kein Workaround auf Windows).
- App-Icon final (Designer / Canva).
- Push-Notification-Server-Backend (Firebase Cloud Messaging Account).

---

## 4. Native Features für Apple-Akzeptanz

| Feature | Capacitor Plugin | Wofür in SimpleTrailer | Kritikalität |
|---|---|---|---|
| Push Notifications | `@capacitor/push-notifications` | Buchungs-Erinnerung, Rückgabe-Erinnerung | HOCH |
| Native Kamera | `@capacitor/camera` | Vor-/Nach-Fotos bei Pickup/Return (jetzt: `<input type="file">`) | HOCH |
| Geolocation | `@capacitor/geolocation` | Anhänger in der Nähe (jetzt: `navigator.geolocation`) | MITTEL |
| Splash + Icon | `@capacitor/splash-screen` + assets | Native Look | HOCH |
| Status-Bar | `@capacitor/status-bar` | Dunkle Statusleiste | NIEDRIG |
| Deep Linking | `@capacitor/app` | Stripe-Redirect, Magic-Link-Auth | MITTEL |
| Account Deletion | (in WebView vorhanden) | Apple verlangt es seit 2022 für Apps mit Registrierung | HOCH |

---

## 5. Mögliche Probleme

### Showstopper für Phase 2 (Build heute Nacht):
- **Kein JDK installiert** → `./gradlew` schlägt fehl. → Lösung dokumentiert in SETUP-NEEDED.md, App-Quellcode ist trotzdem komplett.
- **Kein Android SDK** → Plattform-Skeleton wird mit Capacitor erzeugt, aber nicht kompilierbar.
- **iOS-Build geht nicht auf Windows** → Nur `ios/`-Ordner erzeugen, Build später am Mac.

### Showstopper für Apple App Store:
- **WebView-only-Risiko (Guideline 4.2):** Hauptrisiko. Mitigation siehe oben.
- **Stripe-Konfiguration:** Apple Pay erfordert Merchant-ID-Konfig in Stripe Dashboard + iOS-Capability. Muss am Mac passieren.
- **Apple Sign In:** Bei E-Mail/Passwort-Auth nicht zwingend, wird aber von Apple geliebt. In Roadmap.
- **Privacy-Manifest (PrivacyInfo.xcprivacy):** Seit Mai 2024 Pflicht. Wird vorbereitet.
- **Account-Löschung in-App:** Webseite bietet das? Falls nicht, muss vor Submission ergänzt werden.

### Showstopper für Google Play Store:
- **Geringer.** Play Store akzeptiert WebView-Apps, solange sie funktionieren und Datenschutz/Permissions sauber sind.
- **Data-Safety-Form** muss sauber ausgefüllt werden.

### Funktionale Risiken:
- **Magic-Link-Auth** (Supabase E-Mail-Bestätigung) → öffnet Browser, nicht App. Lösung: Deep-Link-Schema `simpletrailer://auth?token=…` einrichten + Supabase Redirect-URL anpassen. → Roadmap.
- **Stripe `return_url`** verweist auf simpletrailer.de — der Browser könnte die App verlassen. Lösung: `redirect: 'if_required'` ist bereits gesetzt im booking.html → Karten brauchen keinen Redirect, nur 3DS. Niedriges Risiko.
- **Datei-Upload in WebView**: `<input type="file" accept="image/*" capture="environment">` funktioniert in Capacitor WebView mit Camera-Permissions. Sollte gehen.

---

## 6. Erfolgsquoten-Schätzung (autonome Nachtarbeit)

| Aufgabe | Wahrscheinlichkeit |
|---|---|
| Komplettes Capacitor-Projekt-Skeleton (iOS+Android) | **95 %** |
| Plugins korrekt konfiguriert | **90 %** |
| Android-Build auf Windows ohne JDK | **5 %** (erwarte Failure, dokumentiert) |
| iOS-Skeleton-Erzeugung | **80 %** (Capacitor erzeugt es auch unter Windows) |
| Webseite läuft im Capacitor-Run am nächsten Morgen out-of-the-box | **70 %** (CORS / Stripe-CSP / Sitzungs-Cookies sind Risiko) |
| App Store-fertig nach einer Nacht | **0 %** — braucht Mac, Apple Developer Account, Designs, manuelle Prüfung |
| Play Store-fertig nach einer Nacht | **0 %** — braucht Google Play Console Account, signed APK, Listing-Texte |

**Realistisch:** Morgen früh hast du ein vollständiges, dokumentiertes Capacitor-Projekt. Du kannst es mit `npx cap run android` (nach SDK-Install) testen. Für iOS brauchst du einen Mac. Für Stores brauchst du Designer + Listings + Accounts. Schätzung: 2-3 Wochen weitere Arbeit zur Submission.

---

## 7. Was ich selbst entscheide vs. was du entscheiden musst

### Selbst entschieden (in DECISIONS.md begründet):
- Capacitor statt React Native.
- `server.url` Variante (Live-Loading) statt Bundling.
- Bundle-ID `de.simpletrailer.app`.
- Mindest-Versionen iOS 15 / Android 24 (du hast es vorgegeben — passt).
- Hauptfarbe `#1e40af` (du hast es vorgegeben — passt, auch wenn Webseite Orange `#E85D00` nutzt; siehe DECISIONS.md).
- TypeScript für `capacitor.config.ts` (Standard).
- Plugin-Auswahl für Native-Features.
- Platzhalter-Icon als generiertes SVG.

### Du musst morgens entscheiden:
- **Hauptfarbe Konflikt:** App-Icon-Hintergrund `#1e40af` (dein Wunsch) ODER `#E85D00` (Webseiten-Farbe). Empfehlung: Webseiten-Orange für Konsistenz. Habe Orange gesetzt, blau als Comment.
- **Android Studio installieren?** Ja/Nein — sonst kein lokaler Build möglich.
- **Mac organisieren** (Cloud-Mac-Service wie MacStadium / MacInCloud, oder Hardware kaufen, oder Freund fragen).
- **Apple Developer Program $99/Jahr** → wann kaufen?
- **Google Play Console $25 einmalig** → wann kaufen?
- **Push-Notification-Backend:** Firebase Cloud Messaging (kostenlos) konfigurieren — das ist ein eigenes 1-Tag-Projekt.
- **Apple-Submission-Strategie:** Wenn 4.2-Reject droht — bauen wir einen nativen Detail-Screen oder versuchen wir's einfach erst?

---

## 8. Selbstkritik

> Du hattest geschrieben: "Was an meinem Wunsch ist unrealistisch?"

Drei Sachen:

1. **"Über Nacht Store-fertig" ist nicht möglich.** Auch ein perfekter Capacitor-Build braucht Designs (Icon, Screenshots), Listings (Beschreibungstext, Keywords, Datenschutz), Apple Developer Account, Mac, Test-Geräte, und Review-Cycles (Apple: 1-7 Tage, Google: oft <1 Tag). Realistisch sind 2-3 Wochen.

2. **WebView-Apps sind ein Apple-Risiko.** Es gibt einen nicht-trivialen Anteil von Apps, die wegen Guideline 4.2 abgelehnt werden. Falls das passiert, brauchen wir zwischen 1 Tag (extra Plugins) und 2 Wochen (echte native Screens) Nacharbeit. Dieses Risiko sollte dir BEWUSST sein, bevor du Zeit/Geld investierst.

3. **Du wolltest "Hauptfarbe Blau" für eine Webseite, die Orange ist.** Das ist ein Branding-Konflikt — die App sollte sich wie die Webseite anfühlen. Habe Webseiten-Orange genommen und blau im Code als Kommentar markiert, damit du es schnell ändern kannst.

> Was ich anders machen würde:

- **Lieber mit Android starten, iOS später.** Android: kein Mac nötig, billiger, schneller submittable. Apple-Risiko erst angehen, wenn Android läuft und wir wissen, dass die WebView-Strategie funktioniert.
- **Push-Notifications als ERSTES nativen Feature wirklich verdrahten** (Booking-Erinnerung 24h vor Pickup) — das gibt der App echten Mehrwert über die Webseite hinaus und reduziert Apple-Risiko massiv.
- **Pre-Check-Fotos via native Kamera** (statt `<input type="file">`) — gleicher Effekt: Mehrwert + Apple-tauglicher.

Diese drei Punkte sind nicht nachts machbar (brauchen Webseiten-Änderungen), aber in NEXT-STEPS.md dokumentiert.

---

## 9. Wo der Code landet

```
c:\Users\Lion\Desktop\Webseite\
├── (Webseiten-Dateien — UNANGETASTET)
└── mobile-app/
    ├── package.json              ← eigene, separate npm-Welt
    ├── capacitor.config.ts
    ├── www/
    │   ├── index.html            ← Bootstrapper
    │   ├── config.js             ← START_URL (hier ändern für Clean-URLs)
    │   └── native-bridge.js      ← Brücke Webseite ↔ Plugins
    ├── android/                  ← von Capacitor erzeugt
    ├── ios/                      ← von Capacitor erzeugt
    ├── resources/
    │   ├── icon.png
    │   └── splash.png
    └── *.md                      ← Dokumentation
```

Ende PLAN.md.
