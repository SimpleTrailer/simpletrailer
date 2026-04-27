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

### Phase 2-Erweiterung (gleiche Nacht, nach User-Aufforderung "alles was geht")
- **Native Onboarding-Screens** in www/index.html (3 Screens: Welcome, Permissions, Done) mit LocalStorage-Tracking ("nur beim ersten Start").
- **MainActivity.java** erweitert: registriert beim App-Start zwei Notification-Channels ("bookings" mit High-Importance, "general" Default).
- **iOS LaunchScreen.storyboard** komplett ueberarbeitet — vorher leer / Light-Mode, jetzt dunkler Hintergrund + zentriertes Logo via Auto-Layout.
- **Helper-Skripte** in scripts/: doctor.sh (System-Check), build-android.sh, build-android-release.sh, dev.sh (lokaler HTTP-Server fuer www/), reset-onboarding.sh.
- **Store-Listings** in store-listings/: komplette deutsche Texte fuer Google Play und Apple App Store inkl. Daten-Sicherheits-Antworten und Notes-for-Reviewer (adressiert Apple Guideline 4.2 proaktiv).
- **DESIGNER-BRIEF.md** mit Brand-Specs, Asset-Spezifikationen pro Plattform, Tools/Empfehlungen.
- **api-client.js** in www/: SDK das die Webseiten-API 1:1 spiegelt (getTrailers, getMyBookings, getAvailability, getIdentity, login, etc.) — auth via localStorage st_session, gleicher Key wie Webseite.
- **Server-Stubs** in server-stub/: push-notification-sender.js, save-push-token.js, delete-account.js (Apple-Pflicht). NICHT live, warten auf Aktivierung.
- **Universal Links Templates** in well-known-templates/: assetlinks.json (Android) + apple-app-site-association (iOS).
- **HTML-Templates** in templates/: datenschutz.html, agb.html, impressum.html als DSGVO-/TMG-konforme Vorlagen mit Anwalts-Pruef-Hinweis.
- **GitHub Actions CI** in .github/workflows/android-build.yml: baut auf jedem Push (Cloud, ohne lokales SDK) eine Debug-APK und stellt sie als Artefakt bereit.
- **README.md** finalisiert mit komplettem Inhaltsverzeichnis, Quick-Start, Native-Feature-Mapping.
- npx cap sync nach jeder www/-Aenderung.

### Phase 2-Erweiterung Teil 2 (User-Info eingearbeitet)
- Inhaberdaten erhalten: SimpleTrailer GbR, Lion Grone und Samuel Obodoefuna, Waltjenstr. 96, 28237 Bremen.
- Templates komplett ausgefuellt:
  - impressum.html: GbR, beide Gesellschafter, Adresse, Kleinunternehmer §19 UStG default, §18 MStV-Verantwortlicher.
  - datenschutz.html: GbR-Verantwortlicher, alle Auftragsverarbeiter-Adressen.
  - agb.html: Verspaetungsgebuehr 5,00 €/h (aus supabase-schema.sql gelesen), Selbstbeteiligungen Basis 500 € / Premium 50 € (aus account.html gelesen).
- templates/README.md updated: keine "TEMPLATE — VORLAGE"-Banner mehr, ehrliche Hinweise zu optionaler Anwalts-Pruefung.
- JDK 17 via winget Installation gestartet (autonom).
- QUESTIONS.md komplett ueberarbeitet: was beantwortet, was nur User selbst tun kann (Apple/Google/Firebase-Konten), was ich autonom mache.

### Phase 2-Erweiterung Teil 3 (autonomer Android-Build)
- Versuch winget-Install gestartet -> haengt an UAC-Prompt (kein Admin-Recht) -> abgebrochen.
- Plan B: Portable JDK 17 direkt von Adoptium GitHub heruntergeladen (~190 MB ZIP).
- JDK in mobile-app/tools/jdk-17/ entpackt — `+` im Ordnernamen umbenannt zu jdk-17 (Gradle-Probleme).
- Android Command-line-Tools heruntergeladen (~65 MB) -> mobile-app/tools/android-sdk/cmdline-tools/latest/.
- Via sdkmanager installiert: SDK Platform 34, Build-Tools 34.0.0, Platform-Tools.
- mobile-app/android/local.properties geschrieben mit forward-slash-Pfaden (Java-Properties-Files interpretieren `\` als Escape — Backslash-Pfade funktionieren NICHT).
- Erste Build-Versuche schlugen fehl mit kryptischer "Die Syntax fuer den Dateinamen... ist falsch" — Ursache war flatDir auf nicht-existierende Verzeichnisse + escaped backslashes.
- Beide Probleme geloest -> Build SUCCESSFUL in 52s, 246 Tasks ausgefuehrt.
- **APK ERZEUGT:** android/app/build/outputs/apk/debug/app-debug.apk (7.2 MB).
- scripts/setup-android-tools.sh geschrieben — User kann das ganze Toolchain-Setup einmalig mit einem Befehl reproduzieren.
- scripts/env.sh: source-bare Helper, der portable Tools in PATH/JAVA_HOME/ANDROID_HOME setzt.
- scripts/doctor.sh: erkennt jetzt automatisch portable Tools und meldet OK.
- scripts/build-android.sh: nutzt env.sh -> kein manuelles Setzen mehr noetig.
- .gitignore: tools/jdk-17/, tools/android-sdk/, tools/*.zip ausgeschlossen (mehrere hundert MB).

### Phase 3 (User-Freigabe fuer Webseiten-Aenderungen — Verspaetung 15€ + AGB)
- AGB komplett rechtssicher ausgearbeitet (mobile-app/templates/agb.html):
  - Vollstaendiger SimpleTrailer-spezifischer Text mit GbR-Vertretung
  - § 5 Abs. 3: explizite Einzugsermaechtigung fuer off-session-Charges
  - § 7 Abs. 4: Verspaetungsgebuehr 15€/h
  - § 9: Versicherungs-SB (500€/50€) und Haftungsausschluss-Faelle
  - § 6 Abs. 3: Hinweis dass §312g Abs. 2 Nr. 9 BGB Widerrufsrecht ausschliesst
  - § 13: Erfuellungsort + Gerichtsstand Bremen
- agb.html, datenschutz.html, impressum.html ins Webseite-Root kopiert (statische HTML-Seiten).
- index.html Footer-Links aktiviert (vorher href="#" Platzhalter).
- booking.html erweitert (sehr vorsichtig, Buchungs-Logik unangetastet):
  - Step 5: AGB-Checkbox vor dem payBtn — Button initial disabled
  - Klick auf "AGB" oder "Datenschutzerklaerung" oeffnet Modal mit Iframe der jeweiligen Seite
  - submitPayment() prueft die Checkbox als zusaetzliche Sicherheit
  - updatePayBtnState() + payBtn.dataset.stripeReady-Marker, damit Button erst freigeschaltet wird wenn BEIDES ready (Stripe + AGB)
- supabase-schema.sql: Default 5.00 -> 15.00 (auch im Insert fuer ersten Anhaenger).
- return.html:105: "5 €" -> "15 €" Hinweistext.
- send-reminders.js sagt schon 15€ (war von Anfang an da, jetzt konsistent mit Rest).
- App-Polish im Bootstrapper (www/index.html):
  - Offline-Banner oben (orange) bei navigator.onLine=false, blendet automatisch ein/aus
  - Version-Tag "v1.0.0" im ersten Onboarding-Screen unten
- APK neu gebaut: 7s inkrementell, app-debug.apk weiterhin 7.2 MB.
- USER-AKTION offen: SQL UPDATE in Supabase Console fuer existierende Anhaenger
  (Schema-Default greift nur fuer NEUE Anhaenger, vorhandene muessen einzeln upgedatet werden).





