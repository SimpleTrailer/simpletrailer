# SimpleTrailer Mobile App

Native iOS- und Android-App, die simpletrailer.de in einer Capacitor-WebView lädt und um native Features erweitert (Push, Kamera, Geolocation). Die App nutzt 1:1 dieselben APIs wie die Webseite (`../api/*`).

> **Wichtig:** Die Webseite (`../*.html`, `../api/*`, `../netlify/functions/*`, `../supabase-schema.sql`) wird von dieser App **nicht verändert**, nur erweitert.

---

## Übersicht

| Item | Wert |
|---|---|
| Framework | Capacitor 6 |
| App-Name | SimpleTrailer |
| Bundle-ID | `de.simpletrailer.app` |
| Mindest-iOS | 15.0 |
| Mindest-Android | API 24 (Android 7.0) |
| Lade-Strategie | `server.url` → simpletrailer.de live |
| API-Layer | `www/api-client.js` (1:1 Mapping zu /api/*) |
| Konfig zentral in | `www/config.js` |

---

## Verzeichnis-Struktur

```
mobile-app/
├── www/                       # was Capacitor in die WebView lädt (Bootstrapper)
│   ├── index.html             # Splash → Onboarding → Redirect zu simpletrailer.de
│   ├── config.js              # ← Start-URL hier ändern (kein Rebuild nötig)
│   ├── api-client.js          # SDK für /api/* der Webseite
│   ├── native-bridge.js       # Capacitor-Plugin-Brücke
│   └── manifest.json          # PWA-Manifest (autogen)
│
├── android/                   # Android-Studio-Projekt (74 Asset-Varianten)
├── ios/                       # Xcode-Projekt (auf Windows nicht baubar)
├── resources/                 # Master-Assets (SVG)
│
├── server-stub/               # API-Endpoint-VORLAGEN (NICHT live)
│   ├── push-notification-sender.js
│   ├── save-push-token.js
│   ├── delete-account.js      # Apple-Pflicht
│   └── README.md
│
├── store-listings/            # App-Store-Listing-Texte (DE)
│   ├── google-play.md
│   └── apple-app-store.md
│
├── templates/                 # HTML-Vorlagen für simpletrailer.de
│   ├── datenschutz.html       # DSGVO-konform, Anwalt prüfen lassen
│   ├── agb.html               # Mietvertrag-AGB
│   └── impressum.html         # §5 TMG
│
├── well-known-templates/      # Universal/App Links für simpletrailer.de
│   ├── apple-app-site-association
│   └── assetlinks.json
│
├── scripts/                   # Helper-Skripte
│   ├── doctor.sh              # System-Check (was fehlt?)
│   ├── build-android.sh       # Debug-APK
│   ├── build-android-release.sh  # Signed AAB für Play Store
│   ├── dev.sh                 # Lokaler Dev-Server für www/
│   └── reset-onboarding.sh    # Onboarding zum Re-Test zurücksetzen
│
├── .github/workflows/         # CI: Android-Build in der GitHub Cloud
│   └── android-build.yml
│
├── capacitor.config.ts        # zentrale Capacitor-Konfig
├── package.json               # eigene npm-Welt (separat von Webseite)
└── *.md                       # Dokumentation (siehe unten)
```

---

## Doku-Übersicht

| Datei | Inhalt |
|---|---|
| [PLAN.md](./PLAN.md) | Strategie, Architektur, Erfolgsquoten-Schätzung |
| [DECISIONS.md](./DECISIONS.md) | 17 Entscheidungen mit Begründung (Capacitor warum, Server-URL warum, etc.) |
| [PROGRESS.md](./PROGRESS.md) | Chronologie der gemachten Arbeit |
| [SETUP-NEEDED.md](./SETUP-NEEDED.md) | Tools die du installieren musst (JDK, Android Studio, etc.) |
| [NEXT-STEPS.md](./NEXT-STEPS.md) | Phasen 1-5 für die kommenden Wochen |
| [QUESTIONS.md](./QUESTIONS.md) | Was du morgens entscheiden musst |
| [DESIGNER-BRIEF.md](./DESIGNER-BRIEF.md) | Asset-Specs für Designer / DIY in Canva |
| [SUMMARY.md](./SUMMARY.md) | Zusammenfassung der Nachtarbeit |

---

## Quick-Start

### A) Doctor — was brauchst du noch?
```bash
cd mobile-app
bash scripts/doctor.sh
```
Sagt dir, was fehlt (JDK, Android Studio, Xcode etc.).

### B) Lokaler Test im Browser (kein Build nötig)
```bash
cd mobile-app
bash scripts/dev.sh
# → http://localhost:5173 öffnen
```
Zeigt den Bootstrapper (Splash + Onboarding + Redirect).

### C) Android-Build (sobald JDK + Android Studio installiert)
```bash
cd mobile-app
bash scripts/build-android.sh
# → erzeugt android/app/build/outputs/apk/debug/app-debug.apk
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### D) Android-Build in der Cloud (ohne lokales SDK)
1. Branch nach GitHub pushen.
2. GitHub → Actions → "Android Build" → läuft automatisch.
3. APK aus den "Artifacts" downloaden.

### E) iOS-Build (nur auf Mac)
```bash
cd mobile-app
sudo gem install cocoapods   # einmalig
cd ios/App && pod install
cd ../..
npx cap open ios            # → Xcode → Build & Run
```

---

## Was die App macht (User-Sicht)

1. **Splash-Screen** mit SimpleTrailer-Logo (~600ms).
2. **Onboarding** beim ersten Start (3 Screens):
   - Welcome
   - "Was die App kann" + Permissions-Anfragen (Push, Standort, Kamera)
   - "Du bist startklar"
3. **WebView lädt simpletrailer.de** — die normale Webseite läuft 1:1.
4. **Native Features** im Hintergrund verfügbar:
   - Push-Notifications (Buchungs-Erinnerungen)
   - Native Kamera (für Schadensfotos via `<input capture>`)
   - Geolocation (für "Anhänger in der Nähe")
   - Deep-Links (`simpletrailer://...` öffnet App statt Browser)
5. **Onboarding wird beim 2. Start übersprungen** (LocalStorage merkt sich das).

---

## Was die App _nicht_ ist

- ❌ Kein Re-Build der Webseite. Buchung, Login, Bezahlung kommen alle aus simpletrailer.de.
- ❌ Keine eigene Stripe-Integration. Stripe.js läuft in der WebView.
- ❌ Kein Offline-Modus. App braucht Internet (zeigt sonst Retry-Button).

---

## Native Features → Webseiten-API-Mapping

| Native Capacitor-Plugin | Wird genutzt für | Webseiten-API |
|---|---|---|
| Geolocation | Anhänger in der Nähe | Direkt OSM Nominatim/OSRM (kein eigener Endpoint) |
| Camera | Pre-Check + Return Fotos | Supabase Storage `precheck-photos` / `return-photos` |
| Push Notifications | Buchungs-Erinnerungen | TODO: `/api/save-push-token` (Stub in `server-stub/`) |
| App Deep-Linking | Bestätigungs-Mails | (Webseite muss URL-Schema unterstützen — siehe NEXT-STEPS) |
| Status Bar | Dunkles UI-Theme | n/a |
| Splash Screen | App-Start | n/a |

---

## Veröffentlichung in den Stores

### Vorher zu erledigen
1. ✅ App-Skeleton fertig (siehe SUMMARY.md)
2. ⏳ JDK + Android Studio installieren (siehe SETUP-NEEDED.md)
3. ⏳ Apple Developer + Google Play Console Konten anlegen
4. ⏳ Templates aus `templates/` mit echten Daten füllen + auf simpletrailer.de hochladen
5. ⏳ Anwalt liest AGB + Datenschutz
6. ⏳ Designer macht finales Icon + Screenshots (oder du in Canva)
7. ⏳ App lokal testen
8. ⏳ Mac für iOS-Build organisieren (Hardware oder MacInCloud)

### Submission
- **Google Play:** [scripts/build-android-release.sh](./scripts/build-android-release.sh) → AAB → Play Console (siehe `store-listings/google-play.md`)
- **Apple App Store:** Xcode → Archive → Upload (siehe `store-listings/apple-app-store.md`)

---

## Aktivierung von Push, Account-Delete usw.

Diese Server-Endpoints sind als VORLAGEN in `server-stub/` vorbereitet aber NICHT live. Aktivierung benötigt User-Zustimmung (würde die Webseite ändern).

Schritte siehe [server-stub/README.md](./server-stub/README.md).

---

Letzte Aktualisierung: 2026-04-27 (Phase 1 + 2 + Phase-3-Vorbereitung abgeschlossen).
