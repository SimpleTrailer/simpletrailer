# SimpleTrailer Mobile App

Native iOS- und Android-App, die simpletrailer.de in einer Capacitor-WebView lädt und um native Features erweitert (Push, Kamera, Geolocation).

> **Wichtig:** Die Webseite (`../*.html`, `../api/*`) wird von dieser App **nicht** verändert. Nur erweitert.

---

## Schnellüberblick

| Item | Wert |
|---|---|
| Framework | Capacitor 6 |
| App-Name | SimpleTrailer |
| Bundle-ID | `de.simpletrailer.app` |
| Mindest-iOS | 15.0 |
| Mindest-Android | API 24 (Android 7.0) |
| Lade-Strategie | `server.url` → simpletrailer.de live |
| Konfig zentral in | `www/config.js` |

---

## Was du brauchst, BEVOR du die App testen kannst

Siehe [SETUP-NEEDED.md](./SETUP-NEEDED.md) für Detail-Anleitung.

**Kurzfassung:**
1. **Java Development Kit (JDK 17)** – für Android-Builds
2. **Android Studio** – für SDK + Emulator
3. (Optional) **Xcode auf einem Mac** – für iOS-Builds und -Veröffentlichung

---

## Lokales Testen

### Android (sobald Java + Android Studio installiert)

```bash
cd mobile-app
npm install                # falls noch nicht geschehen
npx cap sync android       # syncs www/ + Plugins
npx cap open android       # öffnet Android Studio → dort "Run"
# ODER direkt aus dem Terminal:
cd android
./gradlew assembleDebug    # erzeugt app/build/outputs/apk/debug/app-debug.apk
```

APK auf das Handy ziehen oder `adb install app-debug.apk`.

### iOS (nur auf Mac)

```bash
cd mobile-app
npm install
sudo gem install cocoapods   # einmalig
cd ios/App && pod install
cd ../..
npx cap open ios            # öffnet Xcode → dort Build & Run
```

---

## Was die App macht

1. Beim Start zeigt sie einen Splash-Screen.
2. `www/index.html` (Bootstrapper) prüft die Verbindung zu simpletrailer.de.
3. Bei Erfolg: WebView leitet auf simpletrailer.de weiter (eingestellt via `server.url`).
4. Die WebView verhält sich wie ein Browser → die normale Webseite läuft 1:1.
5. Capacitor injiziert `window.Capacitor` in JEDE WebView-Seite. Die Webseite kann dann optional native Plugins nutzen, wenn sie das möchte (siehe NEXT-STEPS).

---

## Native Features (eingebaut, aber noch nicht von der Webseite genutzt)

| Plugin | iOS-Permission-Eintrag | Android-Permission |
|---|---|---|
| Push Notifications | UIBackgroundModes:remote-notification | POST_NOTIFICATIONS, WAKE_LOCK |
| Geolocation | NSLocationWhenInUseUsageDescription | ACCESS_FINE_LOCATION |
| Camera | NSCameraUsageDescription | CAMERA |
| Photo Library | NSPhotoLibraryUsageDescription | READ_MEDIA_IMAGES |
| Status Bar | – | – |
| Splash Screen | – | – |

Wie diese Plugins in der Webseite ansprechbar sind: siehe [www/native-bridge.js](./www/native-bridge.js).

---

## Veröffentlichung in den Stores

### Google Play Store

1. **Google Play Console-Konto** (einmalig 25 USD).
2. Signed Release-APK / AAB bauen:
   ```bash
   cd android
   ./gradlew bundleRelease
   ```
   Erfordert einen Keystore – Anleitung in [NEXT-STEPS.md](./NEXT-STEPS.md).
3. App-Listing ausfüllen (Name, Beschreibung, Screenshots, Datenschutz-URL).
4. **Data-Safety-Form** vollständig ausfüllen (Standort, Kamera, etc.).
5. Submit → Review meist <24h.

### Apple App Store

1. **Apple Developer Program** (99 USD/Jahr).
2. Mac mit Xcode 15+.
3. Signing-Zertifikat + Provisioning-Profil in Xcode.
4. Archive bauen → Upload zu App Store Connect.
5. App-Listing in App Store Connect.
6. **Privacy-Manifest** ist bereits in `ios/App/App/PrivacyInfo.xcprivacy` vorbereitet.
7. Submit → Review meist 1–7 Tage.
8. **WICHTIG:** Apple lehnt evtl. wegen Guideline 4.2 (WebView-only) ab. Wenn das passiert: nicht die Webseite umbauen, stattdessen native Features stärker einbinden (Push-Token an Backend, native Foto-Capture in Pre-Check). Details in [QUESTIONS.md](./QUESTIONS.md).

---

## Doku-Übersicht

- [PLAN.md](./PLAN.md) – Komplette Strategie und Architektur-Entscheidungen
- [DECISIONS.md](./DECISIONS.md) – Alle einzelnen Entscheidungen mit Begründung
- [PROGRESS.md](./PROGRESS.md) – Was wann gemacht wurde
- [SETUP-NEEDED.md](./SETUP-NEEDED.md) – Tools die du noch installieren musst
- [NEXT-STEPS.md](./NEXT-STEPS.md) – Was als Nächstes ansteht
- [QUESTIONS.md](./QUESTIONS.md) – Was du morgens entscheiden musst
- [SUMMARY.md](./SUMMARY.md) – Zusammenfassung der Nachtarbeit

---

## Wo Sachen liegen

```
mobile-app/
├── www/                       # was der Bootstrapper lädt
│   ├── index.html             # zeigt Splash → leitet zu simpletrailer.de
│   ├── config.js              # ← Start-URL hier ändern
│   └── native-bridge.js       # JS-Brücke zu Capacitor-Plugins
├── android/                   # Android-Studio-Projekt
│   └── app/src/main/AndroidManifest.xml  # Permissions
├── ios/                       # Xcode-Projekt (auf Windows nicht baubar)
│   └── App/App/Info.plist     # Privacy-Strings
├── resources/                 # Master-Assets (SVG)
├── capacitor.config.ts        # zentrale Capacitor-Konfig
└── package.json               # eigene npm-Welt (separat von Webseite)
```

---

Letzte Aktualisierung: 2026-04-27 (Nachtarbeit Phase 1 + 2 abgeschlossen).
