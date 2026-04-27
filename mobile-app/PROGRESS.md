# Fortschritt – Chronologisch

Alle Zeiten sind lokale Zeit (Bremen).

## 2026-04-27 (Nacht)

### Phase 1 – Analyse & Plan
- **Start:** Voraussetzungen geprüft. Node v24.15, npm 11.12, git 2.53 OK. Java + Android SDK FEHLEN.
- Webseite analysiert: 7 HTML-Seiten (6.827 Zeilen), Stripe.js, Supabase, Leaflet/OSM, localStorage-basierte Auth.
- Externe APIs: Supabase (`zcjlfatuelhkghtdyrqh.supabase.co`), Stripe (`js.stripe.com`), Nominatim (OSM-Geocoding), OSRM (Routing).
- Browser-Features: localStorage (`st_session`, `st_booking_pending`), sessionStorage (`st_pi_id`, `st_client_secret`, `st_pending_mode`), `navigator.geolocation`, Hash-Routing für Auth-Callback.
- Branch `mobile-app-development` erstellt.
- `mobile-app/` Ordner angelegt.
- PLAN.md geschrieben.

### Phase 2 – Umsetzung
- `mobile-app/package.json` mit Capacitor 6 + 6 Plugins erstellt.
- `npm install` → 441 Pakete, ohne Fehler.
- `capacitor.config.ts` geschrieben (Bundle-ID `de.simpletrailer.app`, server.url=simpletrailer.de, Splash + StatusBar konfiguriert).
- `www/index.html` (Bootstrapper mit Splash + Reachability + Retry).
- `www/config.js` (zentrale START_URL).
- `www/native-bridge.js` (JS-Brücke zu Plugins).
- `npx cap add android` ✅ (75ms).
- `npx cap add ios` ✅ (Cocoapods/xcodebuild übersprungen — Windows).
- AndroidManifest komplett ersetzt: alle Permissions (Camera, Location, Push, Badge), Deep-Link-Intents, network_security_config (HTTPS-only).
- iOS Info.plist komplett ersetzt: alle Privacy-Strings auf Deutsch, UIBackgroundModes für Push, URL-Scheme `simpletrailer://`, ATS strict.
- iOS PrivacyInfo.xcprivacy erstellt (Pflicht seit Mai 2024).
- iOS AppDelegate.swift erweitert um Push-Notification-Handler + Badge-Reset.
- iOS Podfile auf platform :ios, '15.0'.
- Android variables.gradle: minSdkVersion 24.
- Resources/icon-foreground.svg, icon-background.svg, splash.svg, splash-dark.svg generiert.
- `npx capacitor-assets generate` → 74 Android-Icons/-Splashs + 7 iOS + 7 PWA Icons.
- `npx cap sync` ✅.
- `cd android && ./gradlew assembleDebug` → erwarteter Fehler "JAVA_HOME not set" — dokumentiert in SETUP-NEEDED.md.
- Komplette Doku geschrieben: README, PLAN, DECISIONS, NEXT-STEPS, SETUP-NEEDED, QUESTIONS, SUMMARY.
- .gitignore mit Capacitor-/iOS-/Android-Standards angelegt.

