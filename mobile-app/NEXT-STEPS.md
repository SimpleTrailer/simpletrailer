# Nächste Schritte

Geordnet nach Priorität. ✅ = vom Nacht-Lauf bereits erledigt.

---

## Phase 0: ERLEDIGT (Nachtarbeit)

- ✅ Capacitor-Projekt-Skeleton (iOS + Android)
- ✅ AndroidManifest mit allen Permissions
- ✅ Info.plist mit Privacy-Strings
- ✅ PrivacyInfo.xcprivacy (Apple-Pflicht seit 2024)
- ✅ Native Plugins installiert: App, Camera, Geolocation, Push, Splash, Status-Bar
- ✅ JS-Bridge (`www/native-bridge.js`) für später
- ✅ Bootstrapper-HTML mit Reachability-Check
- ✅ Splash + Icon (Platzhalter, generierte SVGs)
- ✅ Deep-Link-Konfig (simpletrailer:// + Universal Links)
- ✅ Komplette Doku

---

## Phase 1: Erstmal lokal testen können (du, diese Woche)

1. **JDK 17 installieren** → `java -version` sollte 17 zeigen.
2. **Android Studio installieren** → SDK + Emulator-Image.
3. **Android-Build laufen lassen:**
   ```bash
   cd mobile-app
   npx cap sync android
   cd android
   ./gradlew assembleDebug
   ```
4. **APK auf Emulator oder Handy installieren:**
   ```bash
   adb install android/app/build/outputs/apk/debug/app-debug.apk
   ```
5. **Testen:**
   - Splash-Screen erscheint.
   - WebView lädt simpletrailer.de.
   - Login funktioniert.
   - Buchung funktioniert.
   - Stripe-Checkout funktioniert.
6. **Wenn etwas hakt:** Logs via `adb logcat | grep -i capacitor` anschauen.

---

## Phase 2: Echte native Features verdrahten (1-2 Wochen)

> **WICHTIG:** Diese Schritte erfordern Änderungen an der Webseite. Sie wurden in der Nacht NICHT gemacht (User-Verbot). Müssen mit Bedacht in einem separaten Branch entwickelt und LIVE getestet werden.

### 2.1 Push-Token an Supabase senden

In `account.html` o.ä., wenn `window.Capacitor?.isNativePlatform()`:
```js
const token = localStorage.getItem('st_push_token');
if (token) {
  await fetch('/api/save-push-token', {
    method: 'POST',
    headers: { Authorization: `Bearer ${authToken}` },
    body: JSON.stringify({ token, platform: window.Capacitor.getPlatform() })
  });
}
```

Backend (`api/save-push-token.js`) und neue Supabase-Tabelle `push_tokens (user_id, token, platform, created_at)` anlegen.

### 2.2 Booking-Erinnerung als Push (24h vor Pickup)

Cron-Job (Vercel Scheduled Function) oder Supabase Edge Function. Lest pending Bookings, sendet Push via FCM HTTP API.

### 2.3 Native Kamera für Pre-Check / Return

In `precheck.html` und `return.html`, statt `<input type="file">` → bei native:
```js
if (window.Capacitor?.isNativePlatform() && window.SimpleTrailerBridge) {
  const photo = await window.SimpleTrailerBridge.takePhoto();
  // photo.base64, photo.format
}
```

### 2.4 Geolocation: native nutzen wenn verfügbar

In `index.html` (Trailer-finden), statt `navigator.geolocation`:
```js
const pos = window.SimpleTrailerBridge?.getCurrentLocation
  ? await window.SimpleTrailerBridge.getCurrentLocation()
  : await new Promise(...); // fallback
```

### 2.5 Magic-Link-Auth Deep-Linking

Supabase Email-Template anpassen → Redirect auf `simpletrailer://auth?token=…`. Bridge (`registerAppListeners`) fängt das ab, leitet auf `account.html#access_token=…` weiter — der bestehende Webseiten-Code (booking.html:1503-1511) ließt es schon.

---

## Phase 3: Stores vorbereiten (1-2 Wochen)

### Google Play Store

1. App-Listing schreiben:
   - Kurzbeschreibung (80 Zeichen)
   - Vollbeschreibung (4000 Zeichen)
   - 2-8 Screenshots (mind. 1080×1920) — am besten von Emulator
   - Feature-Grafik (1024×500)
   - App-Icon (512×512) — schon da
2. Datenschutzerklärung muss online erreichbar sein (z.B. simpletrailer.de/datenschutz).
3. **Data-Safety-Form** in der Play Console:
   - "Data Collected": Email, Name, Phone, Address, Photos, Location, Payment Info
   - "Data Encrypted in Transit": Ja (HTTPS überall)
   - "Data Deleted on Request": Ja (Konto-Löschung in der App)
4. Signed AAB bauen:
   ```bash
   cd android
   keytool -genkey -v -keystore release.keystore -alias simpletrailer -keyalg RSA -keysize 2048 -validity 10000
   # Passwort sicher speichern (z.B. in Bitwarden)
   ./gradlew bundleRelease
   ```
5. AAB in Play Console hochladen → Internal Testing → Closed Testing → Production.

### Apple App Store

1. App in App Store Connect erstellen mit Bundle-ID `de.simpletrailer.app`.
2. App-Listing schreiben (analog Google).
3. Mind. 3 Screenshots (verschiedene Geräte-Größen 6.7", 6.1", 5.5").
4. Privacy-Details ausfüllen (basiert auf PrivacyInfo.xcprivacy).
5. Build via Xcode → Archive → Distribute → App Store Connect.
6. Submit for Review.

---

## Phase 4: Wenn Apple wegen 4.2 ablehnt (NICHT die Webseite umbauen!)

Mögliche Lösungen, in Reihenfolge der Aggressivität:

1. **Ergänze Native Splash-Animationen + native Onboarding-Screens** (3 Screens vor WebView): "Willkommen" → "Berechtigungen" → "Los geht's". Dann WebView. Apple sieht das als "App-like".
2. **Native Favoriten / Buchungs-Historie** als zweiter Tab in der App. WebView ist Tab 1, native Liste der eigenen Buchungen Tab 2 (zeigt Daten von `/api/get-user-bookings`).
3. **Push-Notifications WIRKLICH versenden** (nicht nur registrieren) und Backend zeigen.
4. Letzter Ausweg: **Nur Android veröffentlichen** und auf iOS verzichten. Bremen ist klein — Android-Marktanteil dort ~70%.

---

## Phase 5: Marketing & Akquise

- App-Link auf simpletrailer.de prominent einbauen.
- QR-Code-Aufkleber an den Anhänger-Standorten.
- Google-Analytics-Funnel "App-Installation".
- App-Reviews aktiv einsammeln.

---

## Was definitiv NICHT zu tun ist

- ❌ Buchungs-Logik in der App neu bauen (Supabase-Calls direkt aus nativem Code).
- ❌ Eigene Stripe-Integration (Stripe iOS SDK / Android SDK) – die Web-Stripe-Elements reichen.
- ❌ Webseite umbauen, "damit Apple sie akzeptiert" — die Webseite ist gut wie sie ist.
- ❌ Auf andere App-Frameworks (React Native, Flutter) springen, wenn etwas hakt — erstmal Capacitor-Lösungen suchen.
