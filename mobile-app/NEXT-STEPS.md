# Nächste Schritte

Geordnet nach Priorität. ✅ = erledigt.

---

## ⚡ JETZT (User-Aktion ~5 Min) — Native-Bridge live aktivieren

**Status:** Native-Bridge wurde am 2026-04-28 in die Webseite integriert (siehe [`/native-bridge.js`](../native-bridge.js)). Webseite-Verhalten unverändert im Browser. In der App: native Kamera, Geolocation, Push, Status-Bar, Deep-Links, Haptik aktiv.

Damit das in der App ankommt, muss die App neu gebaut werden:

```bash
cd mobile-app
npm install               # neue Plugins: haptics, share, network
npx cap sync android      # syncs Plugins + Web-Assets
cd android
./gradlew assembleDebug
adb install -r app/build/outputs/apk/debug/app-debug.apk
```

Danach in der App testen:
- Karte → "Mein Standort" → native iOS/Android-Berechtigungs-Dialog erscheint
- Buchung machen → Push-Berechtigung wird abgefragt (kommt in der ersten Session)
- Account-Seite → ~1.5s nach Login wird Push-Token an `/api/save-push-token` gesendet
- Rückgabe-Seite → "Foto aufnehmen" → native Kamera/Galerie-Picker (statt WebView-File-Input)
- Pre-Check-Seite → ebenso native Kamera

---

## ✅ Phase 0–2: ERLEDIGT

- ✅ Capacitor 6 Skeleton (iOS + Android), Bundle-ID `de.simpletrailer.app`
- ✅ Native Plugins: App, Camera, Geolocation, Push, Splash, Status-Bar, **Haptics**, **Share**, **Network**
- ✅ AndroidManifest + Info.plist mit allen Permissions + Privacy-Strings
- ✅ PrivacyInfo.xcprivacy (Apple-Pflicht 2024)
- ✅ Deep-Link-Konfig (`simpletrailer://` + Universal Links für simpletrailer.de)
- ✅ FCM HTTP V1 API Backend ([`api/_push-sender.js`](../api/_push-sender.js))
- ✅ Push-Token-Endpoint ([`api/save-push-token.js`](../api/save-push-token.js))
- ✅ Account-Löschen-Endpoint ([`api/delete-account.js`](../api/delete-account.js)) — Apple-Pflicht
- ✅ Native-Bridge ([`native-bridge.js`](../native-bridge.js)) — defensives Progressive Enhancement
- ✅ Webseite-Hooks: index.html (Geo), return.html + precheck.html (Camera), account.html (Push-Token-Save)

---

## 🎯 Phase 3: Stores vorbereiten

### Wartet auf D-U-N-S-Nummer (5–14 Werktage seit 2026-04-27)

Sobald D-U-N-S kommt:

#### Apple App Store (99 USD/Jahr)
1. Apple Developer Program als **Organization** beantragen (mit D-U-N-S → SimpleTrailer GbR)
2. App in App Store Connect erstellen mit Bundle-ID `de.simpletrailer.app`
3. App-Listing aus [`store-listings/apple.md`](store-listings/apple.md)
4. Mind. 3 Screenshots (6.7", 6.1", 5.5")
5. Privacy-Details (basiert auf PrivacyInfo.xcprivacy)
6. Build via Codemagic Cloud-CI (kein Mac nötig, ~30 EUR/Monat) → Archive → Distribute
7. Submit for Review

#### Google Play Store (25 USD einmalig)
1. Play Console als **Organization** anlegen
2. Listing aus [`store-listings/google-play.md`](store-listings/google-play.md)
3. Data-Safety-Form ausfüllen
4. Signed AAB:
   ```bash
   cd android
   keytool -genkey -v -keystore release.keystore -alias simpletrailer -keyalg RSA -keysize 2048 -validity 10000
   ./gradlew bundleRelease
   ```
5. Closed Testing → Production

---

## Phase 4: Falls Apple wegen 4.2 ablehnt

Aktueller Stand der Native-Features (pro Apple-Akzeptanz):

| Feature | Status | Apple-Wert |
|---|---|---|
| Push-Notifications | ✅ Live (Backend + Bridge registriert Token) | 🟢 Stark |
| Native Kamera (Rückgabe + Pre-Check) | ✅ Live über native-bridge.js | 🟢 Stark |
| Native Geolocation | ✅ Live (Karte → "Mein Standort") | 🟢 Stark |
| Status-Bar nativ konfiguriert | ✅ | 🟡 OK |
| Splash-Screen nativ | ✅ | 🟡 OK |
| Haptik bei Foto/Standort-Erfolg | ✅ | 🟡 OK |
| Deep-Links (`simpletrailer://`) | ✅ Bridge handled appUrlOpen | 🟡 OK |
| Account-Löschen in der App | ✅ ([account.html](../account.html) Modal) | 🟢 Apple-Pflicht erfüllt |

**Geschätzte Akzeptanz-Wahrscheinlichkeit:** 80–90% beim ersten Versuch.

Falls trotzdem 4.2-Ablehnung:
1. Native Onboarding-Screens (3x) vor WebView
2. Native Favoriten-/Historie-Tab als zweiter Tab
3. Native Share von Buchungen (Plugin schon installiert)
4. Notfall: nur Android launchen — iPhone-User bekommen PWA

---

## Was nicht zu tun ist

- ❌ Buchungs-Logik in der App nachbauen (Supabase-Calls aus nativem Code)
- ❌ Eigene Stripe-Integration (Stripe iOS/Android SDK) — Web-Stripe-Elements reichen
- ❌ Webseite-Layout umbauen, "damit Apple sie akzeptiert" — Native-Bridge ist progressive enhancement, ändert keinen sichtbaren Web-Code
- ❌ Auf React Native / Flutter springen
