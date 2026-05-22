# 🚀 SimpleTrailer App-Launch Checkliste

**Stand:** D-U-N-S erhalten — bereit für Apple/Google Enrollment + Build.

---

## Phase 1: Du machst (Apple + Google parallel) — ~45 Min Klick-Arbeit

### 🍎 Apple Developer Program (99 $/Jahr)

- [ ] https://developer.apple.com/enroll → "Start your enrollment"
- [ ] Apple-ID mit `info@simpletrailer.de` (2FA-Handy bereithalten)
- [ ] **"Company / Organization"** wählen (NICHT Individual!)
- [ ] D-U-N-S eintragen + Legal Entity: `SimpleTrailer GbR`
- [ ] Adresse: Waltjenstr. 96, 28237 Bremen, Germany
- [ ] Authorized Person: Lion Grone
- [ ] Membership Agreement akzeptieren
- [ ] 99 $/Jahr zahlen
- [ ] Warten: 1-7 Werktage (Apple ruft evtl. an)

### 🤖 Google Play Console (25 $ einmalig)

- [ ] https://play.google.com/console → "Sign up"
- [ ] Google-Account `info@simpletrailer.de`
- [ ] **"Organization"** wählen
- [ ] D-U-N-S eintragen + Adresse
- [ ] 25 $ einmalig zahlen
- [ ] Warten: 1-3 Werktage

### Während Apple/Google verifizieren: Codemagic einrichten

- [ ] https://codemagic.io → Sign up mit GitHub-Account
- [ ] Plan: **Free Tier reicht für die ersten Tests** (500 Minuten/Monat gratis)
- [ ] GitHub-Repo verbinden: SimpleTrailer/simpletrailer
- [ ] Im Codemagic-Dashboard: App-Workflow `simpletrailer-ios` aus `mobile-app/codemagic.yaml` wird automatisch erkannt
- [ ] **Setup macht Lion mit Claude zusammen** sobald Apple Developer Account freigeschaltet ist (App Store Connect API Key brauchst du dafür)

---

## Phase 2: Android-Keystore generieren (einmalig, dann nie wieder)

**Wichtig:** Den Keystore SAFE aufbewahren — verlierst du den, kannst du nie wieder App-Updates ins gleiche Play-Store-Listing pushen!

```bash
cd c:/Users/Lion/Desktop/Webseite/mobile-app/android/app
keytool -genkey -v -keystore release.keystore -alias simpletrailer -keyalg RSA -keysize 2048 -validity 10000
```

Du wirst gefragt nach:
- **Keystore-Passwort** (merken!) → z.B. starkes Passwort generieren
- **Vorname/Nachname** → "Lion Grone"
- **Org. Unit** → "Development"
- **Organization** → "SimpleTrailer GbR"
- **Stadt** → "Bremen"
- **Bundesland** → "Bremen"
- **Ländercode** → "DE"
- **Key-Passwort** → same as Keystore-Passwort

Danach:
- [ ] `release.keystore` in `mobile-app/android/app/` (wird automatisch von `.gitignore` ignoriert)
- [ ] Passwörter in deinem **Passwort-Manager** speichern (Bitwarden / 1Password)
- [ ] **Backup** vom Keystore in einer Cloud (verschlüsselt) — verlierst du den, ist deine App "tot"

---

## Phase 3: Android Release-AAB bauen — 2 Wege

### Weg A: GitHub Actions (empfohlen, keine lokale Installation nötig)

1. **Keystore als GitHub Secret hinzufügen:**
   ```bash
   # Convert keystore to base64 für GitHub Secret
   base64 -w 0 mobile-app/android/app/release.keystore > keystore-base64.txt
   ```
2. Im GitHub-Repo → Settings → Secrets and variables → Actions → New repository secret:
   - `ANDROID_KEYSTORE_BASE64` → Inhalt von `keystore-base64.txt`
   - `ANDROID_KEYSTORE_PASSWORD` → dein Keystore-Passwort
   - `ANDROID_KEY_ALIAS` → `simpletrailer`
   - `ANDROID_KEY_PASSWORD` → dein Key-Passwort
3. GitHub Actions Tab → "Android Build" → Run workflow → **build_type: release-aab**
4. Nach 5-10 Min: AAB-Datei kannst du als Artifact runterladen
5. Lokal `keystore-base64.txt` LÖSCHEN

### Weg B: Lokal mit Android Studio

1. Android Studio installieren (https://developer.android.com/studio)
2. Im Terminal:
   ```bash
   cd mobile-app
   bash scripts/build-android-release.sh
   ```
3. AAB liegt in `mobile-app/android/app/build/outputs/bundle/release/app-release.aab`

---

## Phase 4: iOS-IPA via Codemagic bauen

**Nach Apple Approval:**

1. Apple Developer Portal → Certificates, Identifiers & Profiles → **App Store Connect API Key** erstellen
2. In Codemagic → Team Settings → Integrations → **App Store Connect** verbinden
3. Codemagic-Build starten (manuell oder per Git-Push)
4. IPA wird automatisch zu TestFlight hochgeladen

---

## Phase 5: Stores Listings ausfüllen

### Google Play Console

- [ ] App erstellen mit Bundle-ID `de.simpletrailer.app`
- [ ] **Listing-Text** aus `mobile-app/store-listings/google-play.md`
- [ ] **Screenshots** (min. 2, max. 8) — werden später aus Mobile-Browser-View gemacht
- [ ] **App-Icon** aus `mobile-app/icons/icon-512.webp` (umwandeln zu PNG falls nötig)
- [ ] **Feature-Graphic** 1024x500 — ich kann generieren lassen via Canva
- [ ] **Data-Safety-Form** ausfüllen (was wird gesammelt: Email, GPS, Foto bei Buchung)
- [ ] **Inhaltsfreigabe** (Privacy URL: https://simpletrailer.de/datenschutz)
- [ ] AAB hochladen (Closed Testing zuerst!)

### App Store Connect (Apple)

- [ ] App erstellen mit Bundle-ID `de.simpletrailer.app`
- [ ] **Listing** aus `mobile-app/store-listings/apple-app-store.md`
- [ ] **Screenshots** für 3 Größen: 6.7" (iPhone 15 Pro Max), 6.1" (iPhone 15), 5.5" (iPhone 8 Plus)
- [ ] **App-Icon** 1024x1024 PNG
- [ ] **Privacy-Details** (basiert auf `mobile-app/ios/App/App/PrivacyInfo.xcprivacy`)
- [ ] IPA via Codemagic hochgeladen → TestFlight → später Submit for Review

---

## Phase 6: Test (vor Production-Submit)

- [ ] Android: Closed Testing-Group mit eigenem + Samuels Handy
- [ ] iOS: TestFlight-Family-Test (ihr beide)
- [ ] Buchungs-Flow durchspielen (Stripe-Testkarte `4242 4242 4242 4242`)
- [ ] Push-Notification empfangen (z.B. nach Buchung)
- [ ] Geo-Location-Permission auf Karte testen
- [ ] Foto bei Vorab-Check + Rückgabe testen
- [ ] App im Hintergrund + Vordergrund (Stripe-Session-Restore)
- [ ] Beide Stores: Production-Submit → 1-3 Tage Review

---

## ⚠️ KRITISCHE Punkte zum Beachten

1. **`release.keystore` darf NIE verloren gehen** — sonst nie wieder Update auf gleichen Play-Store-Eintrag möglich. → 2 verschiedene Cloud-Backups + Passwort-Manager.

2. **Apple D-U-N-S = nur GbR gültig** — bei späterem GmbH-Wechsel neue D-U-N-S + Account-Transfer (siehe Plan in `mobile-app/NEXT-STEPS.md`).

3. **TestFlight + Google Closed Testing IMMER ZUERST** — direkter Production-Submit ohne Test = hohes Risiko, dass Apple/Google ablehnen wegen Crash/UX-Problem.

4. **Screenshots erst NACH Anhänger-Foto-Shooting (27.05+)** — sonst sehen die Stores leere/Stock-Bilder, was Conversion + Review-Quote massiv drückt.
